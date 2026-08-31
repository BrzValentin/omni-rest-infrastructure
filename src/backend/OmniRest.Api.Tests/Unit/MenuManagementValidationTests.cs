using OmniRest.Api.Menus;

namespace OmniRest.Api.Tests.Unit;

public sealed class MenuManagementValidationTests
{
    [Theory]
    [InlineData("Starters")]
    [InlineData(" Starters ")]
    [InlineData("Déjeuner")]
    public void CreateCategoryAcceptsValidNames(string name)
    {
        Assert.Empty(MenuManagementValidation.ValidateCreateCategory(new CreateMenuCategoryRequest(name, null)));
    }

    [Fact]
    public void CreateCategoryAcceptsDescriptionAtTheLimit()
    {
        var request = new CreateMenuCategoryRequest("Mains", new string('d', MenuManagementValidation.CategoryDescriptionMaxLength));
        Assert.Empty(MenuManagementValidation.ValidateCreateCategory(request));
    }

    [Fact]
    public void CreateCategoryRequiresTheRequestBody()
    {
        var errors = MenuManagementValidation.ValidateCreateCategory(null);
        Assert.Equal(["request_required"], errors["request"]);
    }

    [Theory]
    [InlineData(null, "field_required")]
    [InlineData("", "field_length_invalid")]
    [InlineData("   ", "field_length_invalid")]
    [InlineData("\t\n", "field_length_invalid")]
    [InlineData("Bad\u0007Name", "field_length_invalid")]
    public void CreateCategoryRejectsInvalidNames(string? name, string expected)
    {
        var errors = MenuManagementValidation.ValidateCreateCategory(new CreateMenuCategoryRequest(name!, null));
        Assert.Equal([expected], errors["name"]);
    }

    [Fact]
    public void CreateCategoryRejectsNamesOverOneHundredCharacters()
    {
        var name = new string('x', MenuManagementValidation.CategoryNameMaxLength + 1);
        var errors = MenuManagementValidation.ValidateCreateCategory(new CreateMenuCategoryRequest(name, null));
        Assert.Equal(["field_length_invalid"], errors["name"]);
    }

    [Fact]
    public void CreateCategoryRejectsOversizedDescriptions()
    {
        var description = new string('d', MenuManagementValidation.CategoryDescriptionMaxLength + 1);
        var errors = MenuManagementValidation.ValidateCreateCategory(new CreateMenuCategoryRequest("Mains", description));
        Assert.Equal(["field_length_invalid"], errors["description"]);
    }

    [Fact]
    public void UpdateCategoryAppliesTheSameNameRules()
    {
        Assert.Empty(MenuManagementValidation.ValidateUpdateCategory(new UpdateMenuCategoryRequest("Mains", null)));
        var errors = MenuManagementValidation.ValidateUpdateCategory(new UpdateMenuCategoryRequest("  ", null));
        Assert.Equal(["field_length_invalid"], errors["name"]);
        Assert.Equal(["request_required"], MenuManagementValidation.ValidateUpdateCategory(null)["request"]);
    }

    [Fact]
    public void ReorderAcceptsADistinctIdList()
    {
        var request = new ReorderMenuCategoriesRequest([Guid.NewGuid(), Guid.NewGuid()]);
        Assert.Empty(MenuManagementValidation.ValidateReorderCategories(request));
    }

    [Fact]
    public void ReorderRequiresANonEmptyList()
    {
        Assert.Equal(["field_required"], MenuManagementValidation.ValidateReorderCategories(null)["categoryIds"]);
        Assert.Equal(["field_required"],
            MenuManagementValidation.ValidateReorderCategories(new ReorderMenuCategoriesRequest([]))["categoryIds"]);
    }

    [Fact]
    public void ReorderRejectsDuplicatesEmptyIdsAndOversizedLists()
    {
        var duplicate = Guid.NewGuid();
        Assert.Equal(["category_reorder_duplicate"],
            MenuManagementValidation.ValidateReorderCategories(new ReorderMenuCategoriesRequest([duplicate, duplicate]))["categoryIds"]);
        Assert.Equal(["category_id_invalid"],
            MenuManagementValidation.ValidateReorderCategories(new ReorderMenuCategoriesRequest([Guid.Empty]))["categoryIds"]);

        var oversized = Enumerable.Range(0, MenuManagementValidation.CategoryReorderMaxCount + 1)
            .Select(_ => Guid.NewGuid()).ToArray();
        Assert.Equal(["category_reorder_limit"],
            MenuManagementValidation.ValidateReorderCategories(new ReorderMenuCategoriesRequest(oversized))["categoryIds"]);
    }
}

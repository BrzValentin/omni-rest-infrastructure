using OmniRest.Api.Menus;

namespace OmniRest.Api.Tests.Unit;

public sealed class DishValidationTests
{
    private static CreateDishRequest Valid(
        decimal price = 12.50m,
        string name = "Prairie Poutine",
        string? description = null,
        string? availability = null,
        string[]? badges = null) =>
        new(Guid.NewGuid(), name, price, description, null, availability, badges);

    [Fact]
    public void CreateDishAcceptsAMinimalValidRequest()
    {
        Assert.Empty(MenuManagementValidation.ValidateCreateDish(Valid()));
    }

    [Theory]
    [InlineData(0)]
    [InlineData(0.01)]
    [InlineData(9.99)]
    [InlineData(1234.50)]
    public void PriceAcceptsNonnegativeTwoDecimalAmounts(decimal price)
    {
        Assert.Empty(MenuManagementValidation.ValidateCreateDish(Valid(price)));
    }

    [Theory]
    [InlineData(-0.01, "price_negative")]
    [InlineData(-5, "price_negative")]
    [InlineData(1.005, "price_scale_invalid")]
    [InlineData(0.001, "price_scale_invalid")]
    public void PriceRejectsNegativeAndOverPreciseAmounts(decimal price, string expected)
    {
        Assert.Equal([expected], MenuManagementValidation.ValidateCreateDish(Valid(price))["price"]);
    }

    [Fact]
    public void PriceRejectsAmountsBeyondTheStoredPrecision()
    {
        var errors = MenuManagementValidation.ValidateCreateDish(Valid(MenuManagementValidation.PriceMaximum + 1m));
        Assert.Equal(["price_too_large"], errors["price"]);
        Assert.Empty(MenuManagementValidation.ValidateCreateDish(Valid(MenuManagementValidation.PriceMaximum)));
    }

    [Fact]
    public void DishRequiresACategoryAndAName()
    {
        var errors = MenuManagementValidation.ValidateCreateDish(
            new CreateDishRequest(Guid.Empty, "  ", 5m, null, null, null, null));
        Assert.Equal(["field_required"], errors["categoryId"]);
        Assert.Equal(["field_length_invalid"], errors["name"]);
        Assert.Equal(["request_required"], MenuManagementValidation.ValidateCreateDish(null)["request"]);
    }

    [Fact]
    public void DishRejectsOversizedNamesAndDescriptions()
    {
        var longName = MenuManagementValidation.ValidateCreateDish(
            Valid(name: new string('n', MenuManagementValidation.DishNameMaxLength + 1)));
        Assert.Equal(["field_length_invalid"], longName["name"]);

        var longDescription = MenuManagementValidation.ValidateCreateDish(
            Valid(description: new string('d', MenuManagementValidation.DishDescriptionMaxLength + 1)));
        Assert.Equal(["field_length_invalid"], longDescription["description"]);

        Assert.Empty(MenuManagementValidation.ValidateCreateDish(
            Valid(description: new string('d', MenuManagementValidation.DishDescriptionMaxLength))));
    }

    [Fact]
    public void DishAcceptsEveryCatalogBadgeAndRejectsUnknownOrRepeatedOnes()
    {
        var all = BadgeCatalog.Codes.ToArray();
        Assert.Empty(MenuManagementValidation.ValidateCreateDish(Valid(badges: all)));
        Assert.Equal([], MenuManagementValidation.ValidateCreateDish(Valid(badges: [])).Keys);
        Assert.Equal(["badge_unknown"], MenuManagementValidation.ValidateCreateDish(Valid(badges: ["nope"]))["badges"]);
        Assert.Equal(["badge_duplicate"],
            MenuManagementValidation.ValidateCreateDish(Valid(badges: ["vegan", "vegan"]))["badges"]);
        Assert.Equal(["badge_limit"],
            MenuManagementValidation.ValidateCreateDish(Valid(badges: [.. all, "vegan"]))["badges"]);
    }

    [Theory]
    [InlineData("available")]
    [InlineData("unavailable")]
    public void AvailabilityAcceptsTheTwoSupportedStatuses(string status)
    {
        Assert.Empty(MenuManagementValidation.ValidateCreateDish(Valid(availability: status)));
        Assert.Empty(MenuManagementValidation.ValidateDishAvailability(new UpdateDishAvailabilityRequest(status)));
    }

    [Theory]
    [InlineData("sold_out")]
    [InlineData("Available")]
    [InlineData("")]
    public void AvailabilityRejectsEverythingElse(string status)
    {
        Assert.Equal(["availability_invalid"],
            MenuManagementValidation.ValidateCreateDish(Valid(availability: status))["availability"]);
        Assert.Equal(["availability_invalid"],
            MenuManagementValidation.ValidateDishAvailability(new UpdateDishAvailabilityRequest(status))["status"]);
    }

    [Fact]
    public void AvailabilityRequiresAStatus()
    {
        Assert.Equal(["field_required"], MenuManagementValidation.ValidateDishAvailability(null)["status"]);
        Assert.Equal(["field_required"],
            MenuManagementValidation.ValidateDishAvailability(new UpdateDishAvailabilityRequest(null!))["status"]);
    }

    [Fact]
    public void PriceOnlyUpdatesShareTheDishPriceRule()
    {
        Assert.Empty(MenuManagementValidation.ValidateDishPrice(new UpdateDishPriceRequest(19.99m)));
        Assert.Equal(["price_negative"],
            MenuManagementValidation.ValidateDishPrice(new UpdateDishPriceRequest(-1m))["price"]);
        Assert.Equal(["price_scale_invalid"],
            MenuManagementValidation.ValidateDishPrice(new UpdateDishPriceRequest(1.001m))["price"]);
        Assert.Equal(["request_required"], MenuManagementValidation.ValidateDishPrice(null)["request"]);
    }

    [Fact]
    public void ReorderRequiresACategoryAndDistinctDishIds()
    {
        Assert.Empty(MenuManagementValidation.ValidateReorderDishes(
            new ReorderDishesRequest(Guid.NewGuid(), [Guid.NewGuid(), Guid.NewGuid()])));

        var duplicate = Guid.NewGuid();
        Assert.Equal(["dish_reorder_duplicate"], MenuManagementValidation.ValidateReorderDishes(
            new ReorderDishesRequest(Guid.NewGuid(), [duplicate, duplicate]))["dishIds"]);
        Assert.Equal(["field_required"], MenuManagementValidation.ValidateReorderDishes(
            new ReorderDishesRequest(Guid.Empty, [Guid.NewGuid()]))["categoryId"]);
        Assert.Equal(["field_required"], MenuManagementValidation.ValidateReorderDishes(
            new ReorderDishesRequest(Guid.NewGuid(), []))["dishIds"]);
        Assert.Equal(["dish_id_invalid"], MenuManagementValidation.ValidateReorderDishes(
            new ReorderDishesRequest(Guid.NewGuid(), [Guid.Empty]))["dishIds"]);
    }
}

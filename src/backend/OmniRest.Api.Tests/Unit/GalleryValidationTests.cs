using OmniRest.Api.Menus;

namespace OmniRest.Api.Tests.Unit;

public sealed class GalleryValidationTests
{
    [Fact]
    public void UploadRequiresAFileAndAltText()
    {
        var errors = GalleryValidation.ValidateUpload(altText: null, caption: null, hasFile: false);

        Assert.Equal(["field_required"], errors["file"]);
        Assert.Equal(["field_required"], errors["altText"]);
        Assert.DoesNotContain("caption", errors.Keys);
    }

    [Theory]
    [InlineData("")]
    [InlineData("   ")]
    public void WhitespaceAltTextIsMissing(string altText)
    {
        var errors = GalleryValidation.ValidateUpload(altText, caption: null, hasFile: true);

        Assert.Equal(["field_required"], errors["altText"]);
    }

    [Fact]
    public void AltTextIsTrimmedBeforeTheThreeHundredCharacterLimitIsApplied()
    {
        var atLimit = "  " + new string('a', GalleryValidation.AltTextMaxLength) + "  ";
        Assert.Empty(GalleryValidation.ValidateUpload(atLimit, caption: null, hasFile: true));

        var overLimit = new string('a', GalleryValidation.AltTextMaxLength + 1);
        var errors = GalleryValidation.ValidateUpload(overLimit, caption: null, hasFile: true);
        Assert.Equal(["value_too_long"], errors["altText"]);
    }

    [Fact]
    public void CaptionIsOptionalButBoundedAtThreeHundredCharacters()
    {
        Assert.Empty(GalleryValidation.ValidateUpload("Dining room", caption: null, hasFile: true));
        Assert.Empty(GalleryValidation.ValidateUpload("Dining room", caption: "   ", hasFile: true));

        var errors = GalleryValidation.ValidateUpload(
            "Dining room", new string('c', GalleryValidation.CaptionMaxLength + 1), hasFile: true);
        Assert.Equal(["value_too_long"], errors["caption"]);
    }

    [Fact]
    public void BlankCaptionNormalizesToNullAndAValueIsTrimmed()
    {
        Assert.Null(GalleryValidation.NormalizeCaption(null));
        Assert.Null(GalleryValidation.NormalizeCaption("   "));
        Assert.Equal("Golden hour", GalleryValidation.NormalizeCaption("  Golden hour  "));
    }

    [Fact]
    public void UpdateAppliesTheSameAltTextAndCaptionRules()
    {
        Assert.Equal(["field_required"], GalleryValidation.ValidateUpdate(null)["request"]);
        Assert.Equal(
            ["field_required"],
            GalleryValidation.ValidateUpdate(new UpdateGalleryImageRequest(" ", null, true))["altText"]);
        Assert.Empty(GalleryValidation.ValidateUpdate(new UpdateGalleryImageRequest("Patio", "Sunny", false)));
    }

    [Fact]
    public void ReorderRejectsNullEmptyAndDuplicateLists()
    {
        Assert.Equal(["field_required"], GalleryValidation.ValidateReorder(null)["imageIds"]);
        Assert.Equal(
            ["field_required"],
            GalleryValidation.ValidateReorder(new ReorderGalleryImagesRequest([]))["imageIds"]);

        var duplicate = Guid.NewGuid();
        Assert.Equal(
            ["gallery_reorder_incomplete"],
            GalleryValidation.ValidateReorder(new ReorderGalleryImagesRequest([duplicate, duplicate]))["imageIds"]);
    }

    [Fact]
    public void ReorderMustBeACompletePermutationOfTheCurrentGallery()
    {
        var first = Guid.NewGuid();
        var second = Guid.NewGuid();
        var third = Guid.NewGuid();
        Guid[] current = [first, second, third];

        Assert.True(GalleryValidation.IsCompletePermutation([third, first, second], current));
        Assert.False(GalleryValidation.IsCompletePermutation([first, second], current));
        Assert.False(GalleryValidation.IsCompletePermutation([first, second, first], current));
        Assert.False(GalleryValidation.IsCompletePermutation([first, second, Guid.NewGuid()], current));
        Assert.False(GalleryValidation.IsCompletePermutation([first, second, third, Guid.NewGuid()], current));
    }

    [Fact]
    public void InsertTakesTheNextOrderAndAnEmptyGalleryStartsAtOne()
    {
        Assert.Equal(1, GalleryOrdering.NextDisplayOrder([]));
        Assert.Equal(4, GalleryOrdering.NextDisplayOrder([1, 2, 3]));
        Assert.Equal(8, GalleryOrdering.NextDisplayOrder([3, 7, 1]));
    }

    [Fact]
    public void DeleteFromTheMiddleRenumbersSurvivorsToAContiguousOneToN()
    {
        var first = Guid.NewGuid();
        var third = Guid.NewGuid();
        var fourth = Guid.NewGuid();

        var renumbered = GalleryOrdering.Renumber([(first, 1), (third, 3), (fourth, 4)]);

        Assert.Equal([first, third, fourth], renumbered.Select(item => item.Key));
        Assert.Equal([1, 2, 3], renumbered.Select(item => item.Value));
    }

    [Fact]
    public void ReorderWritesExactlyOneToNInTheSubmittedOrder()
    {
        var first = Guid.NewGuid();
        var second = Guid.NewGuid();
        var third = Guid.NewGuid();

        var reversed = GalleryOrdering.Assign([third, second, first]);

        Assert.Equal([third, second, first], reversed.Select(item => item.Key));
        Assert.Equal([1, 2, 3], reversed.Select(item => item.Value));
    }

    [Fact]
    public void StagingOffsetSitsAboveEveryCurrentOrderSoTheUniqueIndexNeverCollides()
    {
        int[] current = [1, 2, 3, 4];
        var ids = Enumerable.Range(0, current.Length).Select(_ => Guid.NewGuid()).ToArray();
        var offset = GalleryOrdering.StagingOffset(current);
        Assert.Equal(5, offset);

        // The staged pass the production restack runs, asserted on the helper rather than recomputed here.
        var staged = GalleryOrdering.Stage(ids, offset);

        Assert.Equal(ids, staged.Select(item => item.Key));
        Assert.All(staged, item => Assert.True(item.Value > current.Max()));
        Assert.Equal(staged.Count, staged.Select(item => item.Value).Distinct().Count());

        // No staged slot can collide with the final 1..N that the flush pass writes afterwards.
        var final = GalleryOrdering.Assign(ids);
        Assert.Equal(ids, final.Select(item => item.Key));
        Assert.Empty(staged.Select(item => item.Value).Intersect(final.Select(item => item.Value)));
    }

    [Fact]
    public void StagingPreservesTheSubmittedOrderSoTheFlushWritesTheSameSequence()
    {
        var first = Guid.NewGuid();
        var second = Guid.NewGuid();
        var third = Guid.NewGuid();
        Guid[] submitted = [third, first, second];

        var staged = GalleryOrdering.Stage(submitted, GalleryOrdering.StagingOffset([1, 2, 3]));
        var final = GalleryOrdering.Assign(submitted);

        Assert.Equal([4, 5, 6], staged.Select(item => item.Value));
        Assert.Equal(
            staged.OrderBy(item => item.Value).Select(item => item.Key),
            final.OrderBy(item => item.Value).Select(item => item.Key));
    }
}

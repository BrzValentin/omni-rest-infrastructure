using OmniRest.Api.Restaurants;

namespace OmniRest.Api.Tests.Unit;

public sealed class PublicationOrderingTests
{
    [Theory]
    [InlineData(4L, 5L, null)]
    [InlineData(4L, 4L, 5L)]
    [InlineData(4L, 5L, 5L)]
    public void NewerDraftOrPublicationSupersedesOperation(
        long operationVersion,
        long restaurantVersion,
        long? publicationVersion)
    {
        Assert.True(PublicationOrdering.IsSuperseded(
            operationVersion, restaurantVersion, publicationVersion));
    }

    [Theory]
    [InlineData(4L, 4L, null)]
    [InlineData(4L, 4L, 4L)]
    [InlineData(5L, 5L, 4L)]
    public void LatestOperationRemainsEligibleForIdempotentDispatch(
        long operationVersion,
        long restaurantVersion,
        long? publicationVersion)
    {
        Assert.False(PublicationOrdering.IsSuperseded(
            operationVersion, restaurantVersion, publicationVersion));
    }
}

using OmniRest.Api.Restaurants;

namespace OmniRest.Api.Tests.Unit;

public sealed class WebsiteDesignCatalogTests
{
    [Fact]
    public void CatalogHasFourSelectableVersionedDesignsAndOneGrandfatheredLegacyDesign()
    {
        Assert.Equal(5, WebsiteDesignCatalog.All.Count);
        Assert.Equal(
            [
                WebsiteDesignIds.QuietElegance,
                WebsiteDesignIds.Nightfall,
                WebsiteDesignIds.Broadsheet,
                WebsiteDesignIds.Sunroom
            ],
            WebsiteDesignCatalog.Selectable.Select(design => design.Id));
        Assert.False(WebsiteDesignCatalog.IsSelectable(WebsiteDesignIds.LegacyCurrent));
        Assert.All(WebsiteDesignCatalog.All, design =>
        {
            Assert.EndsWith("-v1", design.Id, StringComparison.Ordinal);
            Assert.Equal(WebsiteDesignCatalog.CurrentContractVersion, design.ContractVersion);
        });
    }

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("future-unavailable-v2")]
    public void MissingOrUnknownPublishedDesignUsesLegacyFallback(string? storedDesignId)
    {
        Assert.Equal(WebsiteDesignIds.LegacyCurrent, WebsiteDesignCatalog.ResolvePublished(storedDesignId));
    }
}

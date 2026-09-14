using System.Text.Json.Nodes;
using OmniRest.Api.Menus;
using OmniRest.Api.Restaurants;

namespace OmniRest.Api.Tests.Unit;

/// <summary>
/// BUG-001: publication snapshots are immutable JSON written at publish time, so every row stored before the
/// About field existed lacks the property. Those rows must keep deserializing — the public site reads them
/// until the tenant's next publish — and must surface as "no About section", not as a failure.
/// </summary>
public sealed class PublicMenuSnapshotCompatibilityTests
{
    private readonly PublicMenuSnapshotSerializer serializer = new();

    [Fact]
    public void SnapshotSerializedBeforeAboutExistedStillDeserializesWithNoAboutAndEveryOtherFieldIntact()
    {
        var json = JsonNode.Parse(serializer.Serialize(CreateSnapshot("Our story.\n\nOur farms.")))!.AsObject();
        var restaurant = json["restaurant"]!.AsObject();
        Assert.True(restaurant.Remove("about"), "The snapshot must carry the field as camelCase \"about\".");

        var legacy = serializer.Deserialize(json.ToJsonString());

        Assert.NotNull(legacy.Restaurant);
        Assert.Null(legacy.Restaurant.About);
        Assert.Equal("Prairie Table", legacy.Restaurant.Name);
        Assert.Equal("Seasonal local food", legacy.Restaurant.ShortDescription);
        Assert.Equal("https://prairie-table.example.test", legacy.Restaurant.WebsiteUrl);
        Assert.Equal("Restaurant", legacy.Restaurant.RestaurantType);
        Assert.Equal("+12045550123", legacy.Restaurant.Phone?.E164);
        Assert.Equal("7", legacy.PublicationVersion);
    }

    [Fact]
    public void CurrentSnapshotRoundTripsAboutWithItsParagraphBreaksIntact()
    {
        const string about = "Our story.\n\nOur farms.";

        var roundTripped = serializer.Deserialize(serializer.Serialize(CreateSnapshot(about)));

        Assert.Equal(about, roundTripped.Restaurant?.About);
    }

    private static PublicMenuResponse CreateSnapshot(string? about)
    {
        var restaurant = new PublicRestaurantResponse(
            "11111111-1111-1111-1111-111111111111",
            "Prairie Table",
            "Seasonal local food",
            new PublicPhone("+12045550123", "(204) 555-0123"),
            "hello@example.test",
            "America/Winnipeg",
            null,
            [],
            [],
            new PublicRestaurantStatus("closed", "Closed", null, "regularHours"),
            [new PublicSocialLink("instagram", "https://www.instagram.com/prairietable")],
            null,
            "7",
            [],
            "legacy-current-v1",
            RestaurantType: "Restaurant",
            PriceRange: "$$",
            WebsiteUrl: "https://prairie-table.example.test",
            About: about);
        return new PublicMenuResponse(
            restaurant.Id, restaurant.Name, "en-CA", "CAD", "exclusive", null, "7", null, restaurant, "legacy-current-v1");
    }
}

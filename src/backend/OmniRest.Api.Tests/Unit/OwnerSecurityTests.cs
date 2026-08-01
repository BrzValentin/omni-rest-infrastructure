using Microsoft.AspNetCore.Identity;
using OmniRest.Api.Data;
using OmniRest.Api.Security;

namespace OmniRest.Api.Tests.Unit;

public sealed class OwnerSecurityTests
{
    [Theory]
    [InlineData(null, "/admin")]
    [InlineData("", "/admin")]
    [InlineData("/admin", "/admin")]
    [InlineData("/admin/restaurant?tab=hours", "/admin/restaurant?tab=hours")]
    [InlineData("/administrator", "/admin")]
    [InlineData("//evil.example/admin", "/admin")]
    [InlineData("https://evil.example/admin", "/admin")]
    [InlineData("/admin\\evil", "/admin")]
    [InlineData("/%2f%2fevil.example/admin", "/admin")]
    [InlineData("/admin%5cevil", "/admin")]
    public void AdminReturnPathRejectsAuthorityAndEncodingBypasses(string? value, string expected) =>
        Assert.Equal(expected, SafeAdminReturnPath.Normalize(value));

    [Fact]
    public void LoginPasswordWorkPerformsOneIdentityVerificationForUnknownAndKnownAccounts()
    {
        var hasher = new RecordingPasswordHasher();
        var work = new LoginPasswordWork(hasher);
        var known = new OwnerUser { Id = Guid.NewGuid(), PasswordHash = "known-hash", IsActive = false };

        Assert.False(work.Verify(null, "supplied").Succeeded);
        Assert.False(work.Verify(known, "supplied").Succeeded);
        Assert.False(work.Verify(known, "supplied").Succeeded);

        Assert.Equal(3, hasher.Verifications.Count);
        Assert.Equal("dummy-hash", hasher.Verifications[0].Hash);
        Assert.Equal(["known-hash", "known-hash"], hasher.Verifications.Skip(1).Select(item => item.Hash));
    }

    [Fact]
    public void ProductionLoginLimiterRequiresStrongSecretAndSensibleCircuitCapacity()
    {
        Assert.Throws<InvalidOperationException>(() => LoginRateLimitSettings.Create(
            new LoginRateLimitOptions(), isProduction: true));
        Assert.Throws<InvalidOperationException>(() => LoginRateLimitSettings.Create(
            new LoginRateLimitOptions
            {
                PartitionKey = Convert.ToBase64String(new byte[32]),
                GlobalPermitLimit = 10
            }, isProduction: true));

        var settings = LoginRateLimitSettings.Create(new LoginRateLimitOptions
        {
            PartitionKey = Convert.ToBase64String(new byte[32])
        }, isProduction: true);

        Assert.Equal(32, settings.PartitionKey.Length);
        Assert.True(settings.GlobalPermitLimit >= settings.AccountPermitLimit * 20);
    }

    private sealed class RecordingPasswordHasher : IPasswordHasher<OwnerUser>
    {
        public List<(OwnerUser User, string Hash, string Supplied)> Verifications { get; } = [];
        public string HashPassword(OwnerUser user, string password) => "dummy-hash";
        public PasswordVerificationResult VerifyHashedPassword(OwnerUser user, string hashedPassword, string providedPassword)
        {
            Verifications.Add((user, hashedPassword, providedPassword));
            return PasswordVerificationResult.Failed;
        }
    }
}

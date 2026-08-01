using System.Security.Cryptography;
using System.Text;
using System.Threading.RateLimiting;

namespace OmniRest.Api.Security;

public sealed class LoginRateLimitOptions
{
    public const string SectionName = "LoginRateLimit";
    public int AccountPermitLimit { get; init; } = 5;
    public TimeSpan AccountWindow { get; init; } = TimeSpan.FromMinutes(15);
    public int GlobalPermitLimit { get; init; } = 500;
    public TimeSpan GlobalWindow { get; init; } = TimeSpan.FromMinutes(15);
    public string? PartitionKey { get; init; }
}

public sealed record LoginRateLimitSettings(
    int AccountPermitLimit,
    TimeSpan AccountWindow,
    int GlobalPermitLimit,
    TimeSpan GlobalWindow,
    byte[] PartitionKey)
{
    public static LoginRateLimitSettings Create(LoginRateLimitOptions options, bool isProduction)
    {
        if (options.AccountPermitLimit is < 3 or > 20 ||
            options.AccountWindow < TimeSpan.FromMinutes(1) || options.AccountWindow > TimeSpan.FromHours(24) ||
            options.GlobalPermitLimit < options.AccountPermitLimit * 20 || options.GlobalPermitLimit > 100_000 ||
            options.GlobalWindow < TimeSpan.FromSeconds(10) || options.GlobalWindow > TimeSpan.FromHours(24))
        {
            throw new InvalidOperationException("LoginRateLimit configuration is outside the supported safe range.");
        }

        byte[] partitionKey;
        if (string.IsNullOrWhiteSpace(options.PartitionKey))
        {
            if (isProduction)
            {
                throw new InvalidOperationException("Production requires a base64 LoginRateLimit:PartitionKey of at least 32 random bytes.");
            }
            partitionKey = RandomNumberGenerator.GetBytes(32);
        }
        else
        {
            try
            {
                partitionKey = Convert.FromBase64String(options.PartitionKey);
            }
            catch (FormatException exception)
            {
                throw new InvalidOperationException("LoginRateLimit:PartitionKey must be valid base64.", exception);
            }
            if (partitionKey.Length < 32)
            {
                throw new InvalidOperationException("LoginRateLimit:PartitionKey must contain at least 32 random bytes.");
            }
        }

        return new LoginRateLimitSettings(
            options.AccountPermitLimit, options.AccountWindow,
            options.GlobalPermitLimit, options.GlobalWindow, partitionKey);
    }
}

public interface ILoginAttemptLimiter
{
    ValueTask<LoginAttemptLease> AcquireAsync(string normalizedIdentity, CancellationToken cancellationToken);
}

public sealed record LoginAttemptLease(bool IsAcquired, TimeSpan? RetryAfter);

/// <summary>Partitions login attempts by a non-reversible HMAC of Identity's normalized email.</summary>
public sealed class LoginAttemptLimiter : ILoginAttemptLimiter, IAsyncDisposable
{
    private readonly byte[] partitionKey;
    private readonly PartitionedRateLimiter<string> limiter;

    public LoginAttemptLimiter(LoginRateLimitSettings settings)
    {
        partitionKey = settings.PartitionKey.ToArray();
        limiter = PartitionedRateLimiter.Create<string, string>(identityHash =>
            RateLimitPartition.GetFixedWindowLimiter(identityHash, _ => new FixedWindowRateLimiterOptions
            {
                PermitLimit = settings.AccountPermitLimit,
                Window = settings.AccountWindow,
                QueueLimit = 0,
                AutoReplenishment = true
            }));
    }

    public async ValueTask<LoginAttemptLease> AcquireAsync(string normalizedIdentity, CancellationToken cancellationToken)
    {
        var bytes = Encoding.UTF8.GetBytes(normalizedIdentity);
        var identityHash = Convert.ToHexString(HMACSHA256.HashData(partitionKey, bytes));
        using var lease = await limiter.AcquireAsync(identityHash, permitCount: 1, cancellationToken);
        return new LoginAttemptLease(
            lease.IsAcquired,
            lease.TryGetMetadata(MetadataName.RetryAfter, out var retryAfter) ? retryAfter : null);
    }

    public ValueTask DisposeAsync()
    {
        CryptographicOperations.ZeroMemory(partitionKey);
        return limiter.DisposeAsync();
    }
}

using System.Net;
using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Identity;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.FileProviders;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using OmniRest.Api.Data;
using OmniRest.Api.Infrastructure;
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

    /// <summary>
    /// Walks the restaurant-owner policy end to end (PR-21 Tasks 2, 3 and 10): an unidentified caller, a
    /// legitimate owner, an authenticated caller whose membership is gone, and a platform administrator
    /// taking the bypass — checking at each step what the policy decided, what the audit log recorded,
    /// and what the current-user context then reports.
    /// </summary>
    [Fact]
    public async Task RestaurantOwnerPolicyGrantsOwnersLogsDenialsAndHonoursTheAdminBypass()
    {
        // 1. Both policy names must exist and must be the same rule, because endpoints written against
        //    either spelling have to get identical enforcement.
        var policies = BuildPolicyProvider();
        var legacy = await policies.GetPolicyAsync(SecurityRegistration.OwnerPolicy);
        var current = await policies.GetPolicyAsync(SecurityRegistration.RestaurantOwnerPolicy);
        Assert.NotNull(legacy);
        Assert.NotNull(current);
        Assert.Equal(
            legacy.Requirements.Select(item => item.GetType().Name).OrderBy(name => name),
            current.Requirements.Select(item => item.GetType().Name).OrderBy(name => name));
        Assert.Contains(current.Requirements, item => item is ActiveOwnerRequirement);

        // 2. A request that carries no usable identity is denied, and the denial is logged with the
        //    endpoint and the connection address rather than being swallowed the way it was before.
        var restaurantId = Guid.NewGuid();
        var ownerId = Guid.NewGuid();
        var accessor = new HttpContextAccessor { HttpContext = CreateHttpContext() };
        var logger = new RecordingLogger<SecurityAuditLog>();
        var auditLog = new SecurityAuditLog(accessor, TimeProvider.System, logger);

        var anonymous = new ClaimsPrincipal(new ClaimsIdentity());
        var anonymousAuthorization = await AuthorizeAsync(
            new StubOwnerRestaurantContext(null), auditLog, anonymous, accessor.HttpContext!);
        Assert.False(anonymousAuthorization.HasSucceeded);

        var denial = Assert.Single(logger.Entries);
        Assert.Equal(LogLevel.Warning, denial.Level);
        Assert.Equal("unidentified_principal", denial.Values["Reason"]);
        Assert.Equal("PUT /api/v1/admin/restaurant/profile", denial.Values["Endpoint"]);
        Assert.Equal("203.0.113.9", denial.Values["RemoteIpAddress"]);
        Assert.True(denial.Values.ContainsKey("OccurredAt"));
        // The response is a bare 403, so nothing in the denial may identify a restaurant that exists.
        Assert.Equal("(unavailable)", denial.Values["RequestedRestaurantId"]);
        Assert.Equal("(unavailable)", denial.Values["ActualRestaurantId"]);

        // 3. Anonymous callers get nulls from the user context rather than an exception, including when
        //    there is no HttpContext at all (a background worker, a unit test, a queued continuation).
        var anonymousAccessor = new HttpContextAccessor { HttpContext = CreateHttpContext(anonymous) };
        var anonymousUser = new CurrentUserContext(anonymousAccessor, new StubOwnerRestaurantContext(null));
        Assert.Null(anonymousUser.GetUserId());
        Assert.Null(anonymousUser.GetRole());
        Assert.Null(anonymousUser.GetRestaurantId());

        var detached = new CurrentUserContext(new HttpContextAccessor(), new StubOwnerRestaurantContext(null));
        Assert.Null(detached.GetUserId());
        Assert.Null(detached.GetRole());
        Assert.Null(detached.GetRestaurantId());

        // 4. A genuine owner is granted, resolution runs exactly once, and the user context then answers
        //    all three questions from that single resolution instead of querying again.
        logger.Entries.Clear();
        var ownerPrincipal = CreatePrincipal(ownerId);
        var ownerContext = new StubOwnerRestaurantContext(
            new OwnerRestaurantAccess(ownerId, restaurantId, MembershipRoles.Owner));
        var ownerAuthorization = await AuthorizeAsync(
            ownerContext, auditLog, ownerPrincipal, CreateHttpContext(ownerPrincipal));
        Assert.True(ownerAuthorization.HasSucceeded);
        Assert.Equal(1, ownerContext.ResolveCalls);
        Assert.Empty(logger.Entries);

        var ownerAccessor = new HttpContextAccessor { HttpContext = CreateHttpContext(ownerPrincipal) };
        var ownerUser = new CurrentUserContext(ownerAccessor, ownerContext);
        Assert.Equal(ownerId, ownerUser.GetUserId());
        Assert.Equal(PlatformRoles.RestaurantOwner, ownerUser.GetRole());
        Assert.Equal(restaurantId, ownerUser.GetRestaurantId());
        Assert.Equal(1, ownerContext.ResolveCalls);

        // 5. An authenticated caller whose owner membership was revoked is denied, and the log names the
        //    user so the attempt can be investigated.
        logger.Entries.Clear();
        var revokedAuthorization = await AuthorizeAsync(
            new StubOwnerRestaurantContext(null), auditLog, ownerPrincipal, accessor.HttpContext!);
        Assert.False(revokedAuthorization.HasSucceeded);
        var revokedDenial = Assert.Single(logger.Entries);
        Assert.Equal("no_active_owner_membership", revokedDenial.Values["Reason"]);
        Assert.Equal(ownerId.ToString(), revokedDenial.Values["UserId"]);

        // 6. The admin bypass: a platform administrator is granted without any membership lookup, and
        //    every use is recorded because it is the only path to owner data without an ownership check.
        logger.Entries.Clear();
        var adminId = Guid.NewGuid();
        var adminPrincipal = CreatePrincipal(adminId, PlatformRoles.PlatformAdmin);
        var bypassedContext = new StubOwnerRestaurantContext(null);
        var adminAuthorization = await AuthorizeAsync(
            bypassedContext, auditLog, adminPrincipal, accessor.HttpContext!);
        Assert.True(adminAuthorization.HasSucceeded);
        Assert.Equal(0, bypassedContext.ResolveCalls);

        var bypass = Assert.Single(logger.Entries);
        Assert.Equal(LogLevel.Information, bypass.Level);
        Assert.Equal(adminId.ToString(), bypass.Values["UserId"]);

        var adminAccessor = new HttpContextAccessor { HttpContext = CreateHttpContext(adminPrincipal) };
        var adminUser = new CurrentUserContext(adminAccessor, bypassedContext);
        Assert.Equal(adminId, adminUser.GetUserId());
        Assert.Equal(PlatformRoles.PlatformAdmin, adminUser.GetRole());
        // No portal binds a restaurant for an administrator, so there is none to report.
        Assert.Null(adminUser.GetRestaurantId());
    }

    /// <summary>
    /// The access guard has to answer about a restaurant other than the one the request is bound to
    /// (PR-21 Task 4), which only works while the tenant query filter is suppressed — and every refusal
    /// has to reach the audit log with both the requested and the actual restaurant (PR-21 Task 10).
    /// </summary>
    [Fact]
    public async Task AccessGuardSuppressesTheTenantFilterAndLogsCrossTenantAttempts()
    {
        // 1. A request already acting for its own restaurant: this is the state in which the membership
        //    query filter is live and would otherwise hide the row the guard needs to read.
        var ownedRestaurantId = Guid.NewGuid();
        var otherRestaurantId = Guid.NewGuid();
        var userId = Guid.NewGuid();
        var tenantScope = new TenantScope();
        tenantScope.Bind(ownedRestaurantId);

        var accessor = new HttpContextAccessor { HttpContext = CreateHttpContext() };
        var logger = new RecordingLogger<SecurityAuditLog>();
        var lookup = new StubOwnerMembershipLookup(tenantScope, ownedRestaurantId, userId);
        var guard = new RestaurantAccessGuard(
            lookup, tenantScope, new SecurityAuditLog(accessor, TimeProvider.System, logger));

        // 2. Asking about someone else's restaurant. The lookup records what the tenant scope looked
        //    like at query time: if it were still bound, the query filter would answer "no" for every
        //    restaurant but the bound one and the guard would be a very convincing no-op.
        Assert.False(await guard.CanAccessRestaurantAsync(userId, otherRestaurantId, CancellationToken.None));
        Assert.Equal(new Guid?[] { null }, lookup.ObservedTenantIds);
        Assert.Equal(ownedRestaurantId, tenantScope.RestaurantId);

        // 3. The refusal is logged with everything an investigation needs, and the caller is expected to
        //    turn it into a bare 403 — the log, not the response, carries the detail.
        var violation = Assert.Single(logger.Entries);
        Assert.Equal(LogLevel.Warning, violation.Level);
        Assert.Equal("restaurant_not_owned", violation.Values["Reason"]);
        Assert.Equal(userId.ToString(), violation.Values["UserId"]);
        Assert.Equal(otherRestaurantId.ToString(), violation.Values["RequestedRestaurantId"]);
        Assert.Equal(ownedRestaurantId.ToString(), violation.Values["ActualRestaurantId"]);
        Assert.Equal("PUT /api/v1/admin/restaurant/profile", violation.Values["Endpoint"]);
        Assert.Equal("203.0.113.9", violation.Values["RemoteIpAddress"]);
        Assert.True(violation.Values.ContainsKey("OccurredAt"));

        // 4. The owner's own restaurant is permitted, still with the filter suppressed, and a permitted
        //    check writes nothing to the security log.
        logger.Entries.Clear();
        Assert.True(await guard.CanAccessRestaurantAsync(userId, ownedRestaurantId, CancellationToken.None));
        Assert.Equal(new Guid?[] { null, null }, lookup.ObservedTenantIds);
        Assert.Equal(ownedRestaurantId, tenantScope.RestaurantId);
        Assert.Empty(logger.Entries);

        // 5. A different user holding no membership is refused for the same restaurant.
        logger.Entries.Clear();
        Assert.False(await guard.CanAccessRestaurantAsync(Guid.NewGuid(), ownedRestaurantId, CancellationToken.None));
        Assert.Single(logger.Entries);

        // 6. Empty identifiers are rejected without a database round trip at all.
        logger.Entries.Clear();
        Assert.False(await guard.CanAccessRestaurantAsync(Guid.Empty, ownedRestaurantId, CancellationToken.None));
        Assert.False(await guard.CanAccessRestaurantAsync(userId, Guid.Empty, CancellationToken.None));
        Assert.Equal(3, lookup.ObservedTenantIds.Count);
        Assert.Empty(logger.Entries);

        // 7. An unbound request — nothing to suppress — still works, and reports no actual restaurant.
        var unbound = new TenantScope();
        var unboundLookup = new StubOwnerMembershipLookup(unbound, ownedRestaurantId, userId);
        var unboundGuard = new RestaurantAccessGuard(
            unboundLookup, unbound, new SecurityAuditLog(accessor, TimeProvider.System, logger));
        Assert.False(await unboundGuard.CanAccessRestaurantAsync(userId, otherRestaurantId, CancellationToken.None));
        Assert.Equal("(unavailable)", Assert.Single(logger.Entries).Values["ActualRestaurantId"]);
    }

    private static async Task<AuthorizationHandlerContext> AuthorizeAsync(
        IOwnerRestaurantContext ownerContext,
        ISecurityAuditLog auditLog,
        ClaimsPrincipal principal,
        HttpContext resource)
    {
        var requirement = new ActiveOwnerRequirement();
        var context = new AuthorizationHandlerContext([requirement], principal, resource);
        await new ActiveOwnerHandler(ownerContext, auditLog).HandleAsync(context);
        return context;
    }

    private static IAuthorizationPolicyProvider BuildPolicyProvider()
    {
        var services = new ServiceCollection();
        services.AddLogging();
        services.AddSingleton(TimeProvider.System);
        services.AddOwnerSecurity(new ConfigurationBuilder().Build(), new StubHostEnvironment());
        return services.BuildServiceProvider().GetRequiredService<IAuthorizationPolicyProvider>();
    }

    private static ClaimsPrincipal CreatePrincipal(Guid userId, string? role = null)
    {
        List<Claim> claims = [new(ClaimTypes.NameIdentifier, userId.ToString())];
        if (role is not null)
        {
            claims.Add(new Claim(ClaimTypes.Role, role));
        }

        return new ClaimsPrincipal(new ClaimsIdentity(claims, "TestCookie"));
    }

    private static DefaultHttpContext CreateHttpContext(ClaimsPrincipal? principal = null)
    {
        var context = new DefaultHttpContext();
        context.Request.Method = HttpMethods.Put;
        context.Request.Path = "/api/v1/admin/restaurant/profile";
        context.Connection.RemoteIpAddress = IPAddress.Parse("203.0.113.9");
        if (principal is not null)
        {
            context.User = principal;
        }

        return context;
    }

    private sealed class StubOwnerRestaurantContext(OwnerRestaurantAccess? access) : IOwnerRestaurantContext
    {
        public int ResolveCalls { get; private set; }

        public OwnerRestaurantAccess? Resolved { get; private set; }

        public Task<OwnerRestaurantAccess?> ResolveAsync(ClaimsPrincipal principal, CancellationToken cancellationToken)
        {
            ResolveCalls++;
            Resolved = principal.Identity?.IsAuthenticated == true ? access : null;
            return Task.FromResult(Resolved);
        }
    }

    private sealed class StubOwnerMembershipLookup(
        ITenantScope tenantScope,
        Guid ownedRestaurantId,
        Guid ownerUserId) : IOwnerMembershipLookup
    {
        public List<Guid?> ObservedTenantIds { get; } = [];

        public Task<bool> HasActiveOwnerMembershipAsync(Guid userId, Guid restaurantId, CancellationToken cancellationToken)
        {
            ObservedTenantIds.Add(tenantScope.RestaurantId);
            return Task.FromResult(userId == ownerUserId && restaurantId == ownedRestaurantId);
        }
    }

    private sealed class StubHostEnvironment : IHostEnvironment
    {
        public string EnvironmentName { get; set; } = Environments.Development;
        public string ApplicationName { get; set; } = "OmniRest.Api.Tests";
        public string ContentRootPath { get; set; } = AppContext.BaseDirectory;
        public IFileProvider ContentRootFileProvider { get; set; } = new NullFileProvider();
    }

    private sealed record RecordedLogEntry(LogLevel Level, string Message, IReadOnlyDictionary<string, object?> Values);

    private sealed class RecordingLogger<T> : ILogger<T>
    {
        public List<RecordedLogEntry> Entries { get; } = [];

        public IDisposable? BeginScope<TState>(TState state) where TState : notnull => null;

        public bool IsEnabled(LogLevel logLevel) => true;

        public void Log<TState>(
            LogLevel logLevel,
            EventId eventId,
            TState state,
            Exception? exception,
            Func<TState, Exception?, string> formatter)
        {
            var values = state as IReadOnlyList<KeyValuePair<string, object?>> ?? [];
            Entries.Add(new RecordedLogEntry(
                logLevel,
                formatter(state, exception),
                values.ToDictionary(item => item.Key, item => item.Value)));
        }
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

using System.Globalization;
using System.Net;
using System.Security.Claims;
using System.Security.Cryptography.X509Certificates;
using Microsoft.AspNetCore.Antiforgery;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Authentication.Cookies;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.DataProtection;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using OmniRest.Api.Data;

namespace OmniRest.Api.Security;

public sealed class AuthenticationLifecycleOptions
{
    public const string SectionName = "Authentication";
    public TimeSpan IdleTimeout { get; init; } = TimeSpan.FromMinutes(30);
    public TimeSpan AbsoluteLifetime { get; init; } = TimeSpan.FromHours(12);
}

public sealed class DataProtectionDeploymentOptions
{
    public const string SectionName = "DataProtection";
    public string? KeyRingPath { get; init; }
    public string? CertificateThumbprint { get; init; }
}

public sealed class ReverseProxyDeploymentOptions
{
    public const string SectionName = "ReverseProxy";
    public string[] KnownProxies { get; init; } = [];
    public string[] KnownNetworks { get; init; } = [];
}

/// <summary>
/// The role names the restaurant-owner policy understands (PR-21 Task 3).
/// </summary>
public static class PlatformRoles
{
    /// <summary>
    /// The role a restaurant owner acts with. Its value is <see cref="MembershipRoles.Owner"/> on
    /// purpose: the policy and the membership row must never be able to disagree about what "owner"
    /// spells.
    /// </summary>
    public const string RestaurantOwner = MembershipRoles.Owner;

    /// <summary>
    /// A platform-wide administrator, exempt from the ownership check. One admin portal serves exactly
    /// one restaurant, so this role is deliberately representable and enforced but never issued: there
    /// is no platform-admin portal, endpoint, or provisioning flow anywhere in the product. It exists so
    /// that if a principal ever does carry this Identity role — a future operations tool, a support
    /// escalation — the bypass is already defined, audited, and in one place, rather than being invented
    /// under pressure. <see cref="ISecurityAuditLog.AdminBypass"/> records every use.
    /// </summary>
    public const string PlatformAdmin = "platform-admin";
}

public static class SecurityRegistration
{
    /// <summary>The original policy name. Kept because existing endpoints and tests reference it.</summary>
    public const string OwnerPolicy = "RequireOwner";

    /// <summary>
    /// PR-21 Task 3's name for the same policy, registered alongside <see cref="OwnerPolicy"/> so both
    /// spellings resolve to one set of requirements. Two names, one rule — never two rules.
    /// </summary>
    public const string RestaurantOwnerPolicy = "RestaurantOwner";

    public static IServiceCollection AddOwnerSecurity(
        this IServiceCollection services,
        IConfiguration configuration,
        IHostEnvironment environment)
    {
        var lifecycle = configuration.GetSection(AuthenticationLifecycleOptions.SectionName)
            .Get<AuthenticationLifecycleOptions>() ?? new AuthenticationLifecycleOptions();
        if (lifecycle.IdleTimeout <= TimeSpan.Zero || lifecycle.IdleTimeout > TimeSpan.FromHours(1) ||
            lifecycle.AbsoluteLifetime < lifecycle.IdleTimeout || lifecycle.AbsoluteLifetime > TimeSpan.FromHours(12))
        {
            throw new InvalidOperationException("Authentication lifecycle configuration is outside the secure supported range.");
        }

        services.AddOptions<AuthenticationLifecycleOptions>()
            .Bind(configuration.GetSection(AuthenticationLifecycleOptions.SectionName));

        var dataProtection = services.AddDataProtection().SetApplicationName("OmniRest.OwnerSessions.v1");
        if (environment.IsProduction())
        {
            var deployment = configuration.GetSection(DataProtectionDeploymentOptions.SectionName)
                .Get<DataProtectionDeploymentOptions>() ?? new DataProtectionDeploymentOptions();
            if (string.IsNullOrWhiteSpace(deployment.KeyRingPath) ||
                string.IsNullOrWhiteSpace(deployment.CertificateThumbprint))
            {
                throw new InvalidOperationException(
                    "Production requires a durable DataProtection:KeyRingPath and protected DataProtection:CertificateThumbprint.");
            }

            dataProtection.PersistKeysToFileSystem(new DirectoryInfo(deployment.KeyRingPath));
            dataProtection.ProtectKeysWithCertificate(LoadCertificate(deployment.CertificateThumbprint));
        }

        services.AddIdentity<OwnerUser, IdentityRole<Guid>>(options =>
            {
                options.SignIn.RequireConfirmedAccount = false;
                options.User.RequireUniqueEmail = true;
                options.Lockout.AllowedForNewUsers = true;
                options.Lockout.MaxFailedAccessAttempts = 5;
                options.Lockout.DefaultLockoutTimeSpan = TimeSpan.FromMinutes(15);
                options.Password.RequiredLength = 12;
                options.Password.RequireDigit = true;
                options.Password.RequireLowercase = true;
                options.Password.RequireUppercase = true;
                options.Password.RequireNonAlphanumeric = true;
            })
            .AddEntityFrameworkStores<MenuDbContext>()
            .AddDefaultTokenProviders();

        services.AddScoped<OwnerCookieEvents>();
        services.AddScoped<ILoginPasswordWork, LoginPasswordWork>();
        services.ConfigureApplicationCookie(options =>
        {
            options.Cookie.Name = environment.IsProduction() ? "__Host-omni.owner" : ".OmniRest.Owner";
            options.Cookie.HttpOnly = true;
            options.Cookie.SecurePolicy = CookieSecurePolicy.Always;
            options.Cookie.SameSite = SameSiteMode.Lax;
            options.Cookie.Path = "/";
            options.Cookie.Domain = null;
            options.ExpireTimeSpan = lifecycle.IdleTimeout;
            options.SlidingExpiration = true;
            options.EventsType = typeof(OwnerCookieEvents);
        });

        services.AddAntiforgery(options =>
        {
            options.HeaderName = "X-CSRF-TOKEN";
            options.Cookie.Name = environment.IsProduction() ? "__Host-omni.csrf" : ".OmniRest.Csrf";
            options.Cookie.HttpOnly = true;
            options.Cookie.SecurePolicy = CookieSecurePolicy.Always;
            options.Cookie.SameSite = SameSiteMode.Strict;
            options.Cookie.Path = "/";
        });

        services.AddAuthorizationBuilder()
            .AddPolicy(OwnerPolicy, ConfigureRestaurantOwnerPolicy)
            .AddPolicy(RestaurantOwnerPolicy, ConfigureRestaurantOwnerPolicy);
        services.AddScoped<IAuthorizationHandler, ActiveOwnerHandler>();
        services.AddScoped<IOwnerRestaurantContext, OwnerRestaurantContext>();
        services.AddScoped<AntiforgeryEndpointFilter>();

        // PR-21 Tasks 2, 4 and 10. All three are scoped: they answer questions about the request in
        // flight, and the audit log reads that request's endpoint and remote address.
        services.AddHttpContextAccessor();
        services.AddScoped<ISecurityAuditLog, SecurityAuditLog>();
        services.AddScoped<ICurrentUserContext, CurrentUserContext>();
        services.AddScoped<IOwnerMembershipLookup, OwnerMembershipLookup>();
        services.AddScoped<IRestaurantAccessGuard, RestaurantAccessGuard>();
        return services;
    }

    /// <summary>
    /// The restaurant-owner policy: an authenticated caller who is either an active owner of a
    /// restaurant or a platform administrator (PR-21 Task 3). Both requirements are checked by
    /// <see cref="ActiveOwnerHandler"/> so the ownership rule stays in one place.
    /// </summary>
    private static void ConfigureRestaurantOwnerPolicy(AuthorizationPolicyBuilder policy) =>
        policy.RequireAuthenticatedUser().AddRequirements(new ActiveOwnerRequirement());

    private static X509Certificate2 LoadCertificate(string thumbprint)
    {
        using var store = new X509Store(StoreName.My, StoreLocation.CurrentUser);
        store.Open(OpenFlags.ReadOnly);
        var certificates = store.Certificates.Find(X509FindType.FindByThumbprint, thumbprint, validOnly: true);
        return certificates.Count == 1
            ? certificates[0]
            : throw new InvalidOperationException("The configured production data-protection certificate was not found or was ambiguous.");
    }
}

public sealed class OwnerCookieEvents(
    UserManager<OwnerUser> userManager,
    MenuDbContext dbContext,
    Microsoft.Extensions.Options.IOptions<AuthenticationLifecycleOptions> options,
    TimeProvider timeProvider) : CookieAuthenticationEvents
{
    public override async Task ValidatePrincipal(CookieValidatePrincipalContext context)
    {
        var user = await userManager.GetUserAsync(context.Principal!);
        var now = timeProvider.GetUtcNow();
        var stampClaim = context.Principal?.FindFirstValue(
            userManager.Options.ClaimsIdentity.SecurityStampClaimType);
        var stamp = user is null ? null : await userManager.GetSecurityStampAsync(user);
        var hasMembership = user is not null && await dbContext.RestaurantMemberships.AsNoTracking().AnyAsync(
            item => item.UserId == user.Id && item.Status == MembershipStatuses.Active && item.Role == MembershipRoles.Owner,
            context.HttpContext.RequestAborted);

        if (user is null || !user.IsActive || user.CurrentSessionStartedAt is null ||
            now - user.CurrentSessionStartedAt.Value >= options.Value.AbsoluteLifetime ||
            !string.Equals(stampClaim, stamp, StringComparison.Ordinal) || !hasMembership)
        {
            context.RejectPrincipal();
            await context.HttpContext.SignOutAsync(IdentityConstants.ApplicationScheme);
        }
    }

    public override Task RedirectToLogin(RedirectContext<CookieAuthenticationOptions> context)
    {
        context.Response.StatusCode = StatusCodes.Status401Unauthorized;
        return Task.CompletedTask;
    }

    public override Task RedirectToAccessDenied(RedirectContext<CookieAuthenticationOptions> context)
    {
        context.Response.StatusCode = StatusCodes.Status403Forbidden;
        return Task.CompletedTask;
    }
}

public sealed class ActiveOwnerRequirement : IAuthorizationRequirement;

/// <summary>
/// Decides the restaurant-owner policy (PR-21 Task 3) and is the point where an authenticated caller is
/// turned away with a 403 rather than a 404.
/// </summary>
/// <remarks>
/// Succeeding here also establishes the request's tenant: resolution runs through
/// <see cref="IOwnerRestaurantContext"/>, which binds the tenant scope, so every query after the policy
/// is already filtered to the caller's own restaurant and <see cref="ICurrentUserContext"/> can answer
/// synchronously. Cross-tenant <em>resource</em> lookups are a different question and stay on the 404
/// path: an owner who guesses another tenant's dish id must not learn from the status code whether that
/// id exists, so those endpoints keep returning their existing <c>*_not_found</c> problem codes. This
/// handler answers only "may this caller act as an owner at all", and that answer is a 403.
/// </remarks>
public sealed class ActiveOwnerHandler(
    IOwnerRestaurantContext ownerContext,
    ISecurityAuditLog auditLog) : AuthorizationHandler<ActiveOwnerRequirement>
{
    protected override async Task HandleRequirementAsync(
        AuthorizationHandlerContext context,
        ActiveOwnerRequirement requirement)
    {
        // Under endpoint routing the resource is the HttpContext; the null-safe read keeps the handler
        // usable from a bare AuthorizeAsync call, which is how the unit tests drive it.
        var cancellationToken = (context.Resource as HttpContext)?.RequestAborted ?? CancellationToken.None;
        var userId = Guid.TryParse(context.User.FindFirstValue(ClaimTypes.NameIdentifier), out var parsed) && parsed != Guid.Empty
            ? parsed
            : (Guid?)null;

        // Admin bypass. Checked before resolution because a platform administrator has no membership to
        // resolve — that is the whole point of the exemption — and because binding the tenant scope to a
        // restaurant they do not own would be wrong.
        if (context.User.IsInRole(PlatformRoles.PlatformAdmin))
        {
            auditLog.AdminBypass(userId);
            context.Succeed(requirement);
            return;
        }

        var access = await ownerContext.ResolveAsync(context.User, cancellationToken);
        if (access is not null)
        {
            context.Succeed(requirement);
            return;
        }

        // Not succeeding leaves the requirement unmet, which the cookie handler turns into a bare 403:
        // no body, no problem code, nothing that tells the caller which restaurants exist. The detail
        // lives in the log instead (PR-21 Task 10).
        auditLog.OwnershipViolation(
            userId,
            requestedRestaurantId: null,
            actualRestaurantId: null,
            reason: userId is null ? "unidentified_principal" : "no_active_owner_membership");
    }
}

public sealed record OwnerRestaurantAccess(Guid UserId, Guid RestaurantId, string Role);

public interface IOwnerRestaurantContext
{
    /// <summary>
    /// The access resolved earlier in this request, without querying. Null before
    /// <see cref="ResolveAsync"/> has succeeded. <see cref="ICurrentUserContext"/> reads this so it can
    /// answer synchronously and without a second query (PR-21 Task 2, PR-20 Task 3).
    /// </summary>
    OwnerRestaurantAccess? Resolved { get; }

    Task<OwnerRestaurantAccess?> ResolveAsync(ClaimsPrincipal principal, CancellationToken cancellationToken);
}

public sealed class OwnerRestaurantContext(
    MenuDbContext dbContext,
    OmniRest.Api.Infrastructure.IRestaurantContext restaurantContext) : IOwnerRestaurantContext
{
    private OwnerRestaurantAccess? resolved;
    private bool attempted;

    public OwnerRestaurantAccess? Resolved => resolved;

    public async Task<OwnerRestaurantAccess?> ResolveAsync(ClaimsPrincipal principal, CancellationToken cancellationToken)
    {
        // Memoized because several handlers resolve access more than once per request, and PR-20 Task 3
        // requires the restaurant be established exactly once.
        if (attempted)
        {
            return resolved;
        }

        attempted = true;
        if (!Guid.TryParse(principal.FindFirstValue(ClaimTypes.NameIdentifier), out var userId))
        {
            return null;
        }

        // Runs before the tenant scope is bound, so the membership lookup deliberately sees every
        // restaurant: this query is what decides which one the caller may act for.
        resolved = await dbContext.RestaurantMemberships.AsNoTracking()
            .Where(item => item.UserId == userId && item.Status == MembershipStatuses.Active && item.Role == MembershipRoles.Owner)
            .OrderBy(item => item.CreatedAt).ThenBy(item => item.Id)
            .Select(item => new OwnerRestaurantAccess(item.UserId, item.RestaurantId, item.Role))
            .FirstOrDefaultAsync(cancellationToken);

        if (resolved is not null)
        {
            // From here on every query in this request is filtered to the owner's restaurant, so a
            // handler that forgets its own predicate still cannot read another tenant's rows.
            restaurantContext.BindResolved(resolved.RestaurantId);
        }

        return resolved;
    }
}

public sealed class AntiforgeryEndpointFilter(IAntiforgery antiforgery) : IEndpointFilter
{
    public async ValueTask<object?> InvokeAsync(EndpointFilterInvocationContext context, EndpointFilterDelegate next)
    {
        try
        {
            await antiforgery.ValidateRequestAsync(context.HttpContext);
        }
        catch (AntiforgeryValidationException)
        {
            return ApiProblems.Problem(
                StatusCodes.Status400BadRequest,
                "csrf_invalid",
                "Request verification failed",
                "Refresh the page and try again.");
        }

        return await next(context);
    }
}

public static class SafeAdminReturnPath
{
    public static string Normalize(string? value)
    {
        if (string.IsNullOrWhiteSpace(value))
        {
            return "/admin";
        }

        string decoded;
        try
        {
            decoded = Uri.UnescapeDataString(value);
        }
        catch (UriFormatException)
        {
            return "/admin";
        }

        if (!value.StartsWith("/admin", StringComparison.Ordinal) ||
            !decoded.StartsWith("/admin", StringComparison.Ordinal) ||
            value.StartsWith("//", StringComparison.Ordinal) ||
            decoded.StartsWith("//", StringComparison.Ordinal) ||
            value.Contains('\\') || decoded.Contains('\\') ||
            value.Any(char.IsControl) || decoded.Any(char.IsControl) ||
            (value.Length > "/admin".Length && value["/admin".Length] is not ('/' or '?' or '#')) ||
            (decoded.Length > "/admin".Length && decoded["/admin".Length] is not ('/' or '?' or '#')))
        {
            return "/admin";
        }

        return value;
    }
}

public static class ApiProblems
{
    public static IResult Problem(int status, string code, string title, string? detail = null, object? currentVersion = null)
    {
        var problem = new ProblemDetails
        {
            Status = status,
            Title = title,
            Detail = detail,
            Type = $"https://omni-rest.example/problems/{code}"
        };
        problem.Extensions["code"] = code;
        if (currentVersion is not null)
        {
            problem.Extensions["currentVersion"] = currentVersion;
        }

        return Results.Problem(problem);
    }

    public static IResult Validation(IReadOnlyDictionary<string, string[]> errors)
    {
        var problem = new HttpValidationProblemDetails(errors)
        {
            Status = StatusCodes.Status400BadRequest,
            Title = "Validation failed",
            Type = "https://omni-rest.example/problems/admin_validation"
        };
        problem.Extensions["code"] = "admin_validation";
        return Results.ValidationProblem(problem.Errors, title: problem.Title, type: problem.Type,
            extensions: problem.Extensions);
    }
}

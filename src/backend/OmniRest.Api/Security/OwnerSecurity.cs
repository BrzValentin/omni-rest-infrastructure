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

public static class SecurityRegistration
{
    public const string OwnerPolicy = "RequireOwner";

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
            .AddPolicy(OwnerPolicy, policy => policy.RequireAuthenticatedUser().AddRequirements(new ActiveOwnerRequirement()));
        services.AddScoped<IAuthorizationHandler, ActiveOwnerHandler>();
        services.AddScoped<IOwnerRestaurantContext, OwnerRestaurantContext>();
        services.AddScoped<AntiforgeryEndpointFilter>();
        return services;
    }

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

public sealed class ActiveOwnerHandler(MenuDbContext dbContext) : AuthorizationHandler<ActiveOwnerRequirement>
{
    protected override async Task HandleRequirementAsync(
        AuthorizationHandlerContext context,
        ActiveOwnerRequirement requirement)
    {
        if (!Guid.TryParse(context.User.FindFirstValue(ClaimTypes.NameIdentifier), out var userId))
        {
            return;
        }

        var active = await dbContext.RestaurantMemberships.AsNoTracking().AnyAsync(item =>
            item.UserId == userId && item.Status == MembershipStatuses.Active && item.Role == MembershipRoles.Owner);
        if (active)
        {
            context.Succeed(requirement);
        }
    }
}

public sealed record OwnerRestaurantAccess(Guid UserId, Guid RestaurantId, string Role);

public interface IOwnerRestaurantContext
{
    Task<OwnerRestaurantAccess?> ResolveAsync(ClaimsPrincipal principal, CancellationToken cancellationToken);
}

public sealed class OwnerRestaurantContext(MenuDbContext dbContext) : IOwnerRestaurantContext
{
    public async Task<OwnerRestaurantAccess?> ResolveAsync(ClaimsPrincipal principal, CancellationToken cancellationToken)
    {
        if (!Guid.TryParse(principal.FindFirstValue(ClaimTypes.NameIdentifier), out var userId))
        {
            return null;
        }

        return await dbContext.RestaurantMemberships.AsNoTracking()
            .Where(item => item.UserId == userId && item.Status == MembershipStatuses.Active && item.Role == MembershipRoles.Owner)
            .OrderBy(item => item.CreatedAt).ThenBy(item => item.Id)
            .Select(item => new OwnerRestaurantAccess(item.UserId, item.RestaurantId, item.Role))
            .FirstOrDefaultAsync(cancellationToken);
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

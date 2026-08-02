using System.ComponentModel.DataAnnotations;
using System.Net.Mail;
using System.Security.Claims;
using Microsoft.AspNetCore.Antiforgery;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using OmniRest.Api.Data;

namespace OmniRest.Api.Security;

public sealed record LoginRequest(
    [property: Required, EmailAddress, StringLength(320)] string Email,
    [property: Required, StringLength(1024, MinimumLength = 1)] string Password,
    [property: StringLength(2048)] string? ReturnPath);

public sealed record AuthMembershipResponse(string RestaurantId, string Role);

public sealed record SessionResponse(
    string UserId,
    string DisplayName,
    IReadOnlyList<AuthMembershipResponse> Memberships,
    DateTimeOffset IdleExpiresAt,
    DateTimeOffset AbsoluteExpiresAt,
    string ReturnPath);

public sealed record AntiforgeryResponse(string Token, string HeaderName);

internal static class AuthEndpoints
{
    internal static RouteGroupBuilder MapAuthEndpoints(this RouteGroupBuilder auth)
    {
        auth.MapGet("/antiforgery", GetAntiforgeryToken)
            .AllowAnonymous()
            .WithName("GetAntiforgeryToken");

        auth.MapPost("/login", LoginAsync)
            .AllowAnonymous()
            .WithMetadata(new RequestSizeLimitAttribute(4096))
            .AddEndpointFilter<AntiforgeryEndpointFilter>()
            .RequireRateLimiting("owner-login-global")
            .WithName("OwnerLogin")
            .Produces<SessionResponse>()
            .ProducesProblem(StatusCodes.Status400BadRequest)
            .ProducesProblem(StatusCodes.Status401Unauthorized)
            .ProducesProblem(StatusCodes.Status429TooManyRequests);

        auth.MapGet("/session", GetSessionAsync)
            .RequireAuthorization()
            .WithName("GetOwnerSession")
            .Produces<SessionResponse>()
            .Produces(StatusCodes.Status401Unauthorized);

        auth.MapPost("/logout", LogoutAsync)
            .RequireAuthorization()
            .AddEndpointFilter<AntiforgeryEndpointFilter>()
            .WithName("OwnerLogout")
            .Produces(StatusCodes.Status204NoContent);

        return auth;
    }

    private static IResult GetAntiforgeryToken(HttpContext context, IAntiforgery antiforgery)
    {
        var tokens = antiforgery.GetAndStoreTokens(context);
        context.Response.Headers.CacheControl = "no-store";
        return TypedResults.Ok(new AntiforgeryResponse(
            tokens.RequestToken ?? throw new InvalidOperationException("Antiforgery did not issue a request token."),
            tokens.HeaderName ?? "X-CSRF-TOKEN"));
    }

    private static async Task<IResult> LoginAsync(
        LoginRequest? request,
        UserManager<OwnerUser> userManager,
        SignInManager<OwnerUser> signInManager,
        ILoginPasswordWork passwordWork,
        ILoginAttemptLimiter attemptLimiter,
        MenuDbContext dbContext,
        IOptions<AuthenticationLifecycleOptions> lifecycle,
        TimeProvider timeProvider,
        HttpContext httpContext,
        CancellationToken cancellationToken)
    {
        var email = request?.Email?.Trim();
        if (string.IsNullOrWhiteSpace(email) || email.Length > 320 || !MailAddress.TryCreate(email, out _) ||
            string.IsNullOrEmpty(request?.Password) || request.Password.Length > 1024)
        {
            return ApiProblems.Problem(
                StatusCodes.Status400BadRequest,
                "auth_validation",
                "Sign-in request is invalid",
                "Enter a valid email and password.");
        }
        var validatedRequest = request!;
        var normalizedIdentity = userManager.NormalizeEmail(email) ?? email.ToUpperInvariant();
        var attemptLease = await attemptLimiter.AcquireAsync(normalizedIdentity, cancellationToken);
        if (!attemptLease.IsAcquired)
        {
            httpContext.Response.Headers.RetryAfter = Math.Max(1, (int)Math.Ceiling((attemptLease.RetryAfter ?? TimeSpan.FromMinutes(15)).TotalSeconds)).ToString();
            return RateLimited();
        }

        var user = await userManager.FindByEmailAsync(email);
        var hasMembership = user is not null && await dbContext.RestaurantMemberships.AsNoTracking().AnyAsync(
            item => item.UserId == user.Id && item.Status == MembershipStatuses.Active && item.Role == MembershipRoles.Owner,
            cancellationToken);
        var password = passwordWork.Verify(user, validatedRequest.Password);
        if (user is null || !user.IsActive || !hasMembership || await userManager.IsLockedOutAsync(user))
        {
            return InvalidCredentials();
        }

        if (!password.Succeeded)
        {
            await userManager.AccessFailedAsync(user);
            return InvalidCredentials();
        }
        await userManager.ResetAccessFailedCountAsync(user);
        if (password.RehashNeeded)
        {
            user.PasswordHash = userManager.PasswordHasher.HashPassword(user, validatedRequest.Password);
            var rehashed = await userManager.UpdateAsync(user);
            if (!rehashed.Succeeded)
            {
                return ApiProblems.Problem(503, "auth_unavailable", "Sign-in is temporarily unavailable");
            }
        }

        var now = timeProvider.GetUtcNow();
        await signInManager.SignOutAsync();
        user.CurrentSessionStartedAt = now;
        var stampResult = await userManager.UpdateSecurityStampAsync(user);
        if (!stampResult.Succeeded)
        {
            return ApiProblems.Problem(503, "auth_unavailable", "Sign-in is temporarily unavailable");
        }

        await signInManager.SignInAsync(user, isPersistent: false);
        return TypedResults.Ok(await BuildSessionAsync(
            user,
            dbContext,
            lifecycle.Value,
            now,
            SafeAdminReturnPath.Normalize(validatedRequest.ReturnPath),
            cancellationToken));
    }

    private static async Task<IResult> GetSessionAsync(
        ClaimsPrincipal principal,
        UserManager<OwnerUser> userManager,
        MenuDbContext dbContext,
        IOptions<AuthenticationLifecycleOptions> lifecycle,
        TimeProvider timeProvider,
        CancellationToken cancellationToken)
    {
        var user = await userManager.GetUserAsync(principal);
        if (user?.CurrentSessionStartedAt is null || !user.IsActive)
        {
            return TypedResults.Unauthorized();
        }

        return TypedResults.Ok(await BuildSessionAsync(
            user, dbContext, lifecycle.Value, timeProvider.GetUtcNow(), "/admin", cancellationToken));
    }

    private static async Task<IResult> LogoutAsync(
        ClaimsPrincipal principal,
        UserManager<OwnerUser> userManager,
        SignInManager<OwnerUser> signInManager)
    {
        var user = await userManager.GetUserAsync(principal);
        if (user is not null)
        {
            user.CurrentSessionStartedAt = null;
            var rotated = await userManager.UpdateSecurityStampAsync(user);
            if (!rotated.Succeeded)
            {
                return ApiProblems.Problem(503, "auth_unavailable", "Logout is temporarily unavailable");
            }
        }
        await signInManager.SignOutAsync();
        return TypedResults.NoContent();
    }

    private static async Task<SessionResponse> BuildSessionAsync(
        OwnerUser user,
        MenuDbContext dbContext,
        AuthenticationLifecycleOptions lifecycle,
        DateTimeOffset now,
        string returnPath,
        CancellationToken cancellationToken)
    {
        var memberships = await dbContext.RestaurantMemberships.AsNoTracking()
            .Where(item => item.UserId == user.Id && item.Status == MembershipStatuses.Active)
            .OrderBy(item => item.CreatedAt).ThenBy(item => item.Id)
            .Select(item => new AuthMembershipResponse(item.RestaurantId.ToString(), item.Role))
            .ToArrayAsync(cancellationToken);
        var absolute = user.CurrentSessionStartedAt!.Value + lifecycle.AbsoluteLifetime;
        var idle = now + lifecycle.IdleTimeout;
        return new SessionResponse(
            user.Id.ToString(), user.DisplayName, memberships,
            idle < absolute ? idle : absolute, absolute, returnPath);
    }

    private static IResult InvalidCredentials() => ApiProblems.Problem(
        StatusCodes.Status401Unauthorized,
        "auth_invalid_credentials",
        "Sign-in failed",
        "The email or password is invalid.");

    private static IResult RateLimited() => ApiProblems.Problem(
        StatusCodes.Status429TooManyRequests,
        "auth_rate_limited",
        "Too many sign-in attempts",
        "Wait before trying again.");
}

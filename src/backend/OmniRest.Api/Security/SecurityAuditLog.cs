namespace OmniRest.Api.Security;

/// <summary>
/// The one place authorization denials are written to the log (PR-21 Task 10).
/// </summary>
/// <remarks>
/// Every denial the platform makes is a security event someone may later have to investigate, and an
/// investigation needs the same six facts every time: who asked, what they asked for, what they were
/// actually entitled to, which endpoint, when, and from where. Routing all of them through one service
/// is what stops each call site from logging its own partial subset — or, as before this PR, nothing at
/// all. The caller still decides what to <em>return</em>; this type only records what happened, and it
/// deliberately never influences the response, so the body stays a generic 403 with no hint about which
/// restaurants or resources exist.
/// </remarks>
public interface ISecurityAuditLog
{
    /// <summary>
    /// Records a denied ownership check. <paramref name="requestedRestaurantId"/> is the restaurant the
    /// caller tried to act for (null when the caller named none and the denial was "you own nothing"),
    /// and <paramref name="actualRestaurantId"/> is the restaurant the request was really entitled to.
    /// <paramref name="reason"/> is a short stable token — not a sentence — so the lines can be grouped.
    /// </summary>
    void OwnershipViolation(
        Guid? userId,
        Guid? requestedRestaurantId,
        Guid? actualRestaurantId,
        string reason);

    /// <summary>
    /// Records a platform-administrator bypass of the restaurant-owner policy (PR-21 Task 3). This is
    /// not a violation, but it is the one path that reaches owner data without an ownership check, so it
    /// is logged at every use rather than sampled.
    /// </summary>
    void AdminBypass(Guid? userId);
}

/// <inheritdoc cref="ISecurityAuditLog"/>
public sealed class SecurityAuditLog(
    IHttpContextAccessor httpContextAccessor,
    TimeProvider timeProvider,
    ILogger<SecurityAuditLog> logger) : ISecurityAuditLog
{
    private const string Unavailable = "(unavailable)";

    public void OwnershipViolation(
        Guid? userId,
        Guid? requestedRestaurantId,
        Guid? actualRestaurantId,
        string reason)
    {
        var context = httpContextAccessor.HttpContext;
        logger.LogWarning(
            "Ownership violation denied ({Reason}) for user {UserId}: requested restaurant {RequestedRestaurantId}, actual restaurant {ActualRestaurantId}, endpoint {Endpoint}, remote address {RemoteIpAddress}, at {OccurredAt}.",
            reason,
            Describe(userId),
            Describe(requestedRestaurantId),
            Describe(actualRestaurantId),
            DescribeEndpoint(context),
            DescribeRemoteAddress(context),
            timeProvider.GetUtcNow());
    }

    public void AdminBypass(Guid? userId)
    {
        var context = httpContextAccessor.HttpContext;
        logger.LogInformation(
            "Platform administrator {UserId} bypassed the restaurant-owner policy: endpoint {Endpoint}, remote address {RemoteIpAddress}, at {OccurredAt}.",
            Describe(userId),
            DescribeEndpoint(context),
            DescribeRemoteAddress(context),
            timeProvider.GetUtcNow());
    }

    private static string Describe(Guid? value) => value?.ToString() ?? Unavailable;

    private static string DescribeEndpoint(HttpContext? context) =>
        context is null ? Unavailable : $"{context.Request.Method} {context.Request.Path}";

    // Program.cs strips every forwarding header arriving from an untrusted peer before the pipeline
    // reads it, so the connection address is the only value here a caller cannot forge. Reading
    // X-Forwarded-For instead would let an attacker choose what the audit trail says about them.
    private static string DescribeRemoteAddress(HttpContext? context) =>
        context?.Connection.RemoteIpAddress?.ToString() ?? Unavailable;
}

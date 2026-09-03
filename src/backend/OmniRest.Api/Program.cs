using System.Net;
using System.Threading.RateLimiting;
using Microsoft.AspNetCore.HttpOverrides;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.AspNetCore.ResponseCompression;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.FileProviders;
using Microsoft.Extensions.Options;
using OmniRest.Api.Data;
using OmniRest.Api.Infrastructure;
using OmniRest.Api.Menus;
using OmniRest.Api.Modules;
using OmniRest.Api.Restaurants;
using OmniRest.Api.Security;

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddProblemDetails(options => options.CustomizeProblemDetails = context =>
{
    if (!context.ProblemDetails.Extensions.ContainsKey("code"))
    {
        context.ProblemDetails.Extensions["code"] = context.ProblemDetails.Status >= 500
            ? "unexpected_error"
            : "http_error";
    }
    context.ProblemDetails.Extensions["correlationId"] = context.HttpContext.TraceIdentifier;

    // Every unexpected failure passes through here exactly once, whichever component produced it, so
    // this is the one place that can guarantee a 5xx is never silently swallowed. The body stays
    // deliberately generic; the correlation id is what ties it to this log line (PR-22).
    if (context.ProblemDetails.Status >= StatusCodes.Status500InternalServerError)
    {
        context.HttpContext.RequestServices.GetRequiredService<ILoggerFactory>()
            .CreateLogger("OmniRest.Api.ProblemDetails")
            .LogError(
                "Request {Method} {Path} failed with status {StatusCode} and code {Code} (correlationId {CorrelationId}).",
                context.HttpContext.Request.Method,
                context.HttpContext.Request.Path.Value,
                context.ProblemDetails.Status,
                context.ProblemDetails.Extensions["code"],
                context.HttpContext.TraceIdentifier);
    }
});
builder.Services.AddOpenApi();

// Brotli first, gzip as the fallback: the 1000-dish public snapshot is highly compressible JSON and is
// the single largest byte cost this API pays. Only the two JSON media types are compressed — already
// compressed image bytes gain nothing and cost CPU.
builder.Services.Configure<PerformanceLoggingOptions>(
    builder.Configuration.GetSection(PerformanceLoggingOptions.SectionName));
builder.Services.AddSingleton<SlowQueryInterceptor>();
builder.Services.AddResponseCompression(options =>
{
    // The deployment terminates TLS at the reverse proxy, so leaving this off would disable compression
    // for every real request. Responses here carry no attacker-reflected content next to a secret, which
    // is the precondition a BREACH-style oracle needs.
    options.EnableForHttps = true;
    options.Providers.Add<BrotliCompressionProvider>();
    options.Providers.Add<GzipCompressionProvider>();
    options.MimeTypes = ["application/json", "application/problem+json"];
});
builder.Services.AddMemoryCache(options => options.SizeLimit = 64);
builder.Services.AddSingleton(TimeProvider.System);
builder.Services.Configure<PublicMenuOptions>(builder.Configuration.GetSection(PublicMenuOptions.SectionName));
builder.Services.AddDbContext<MenuDbContext>((serviceProvider, options) =>
    options.UseNpgsql(builder.Configuration.GetConnectionString("MenuDatabase"))
        .AddInterceptors(serviceProvider.GetRequiredService<SlowQueryInterceptor>()));
// Scoped per request: the tenant scope drives MenuDbContext's global query filters, and the restaurant
// context is the single place a request establishes which restaurant it acts for (PR-20 Tasks 3 and 4).
builder.Services.AddScoped<ITenantScope, TenantScope>();
builder.Services.AddScoped<IRestaurantContext, RestaurantContext>();
builder.Services.AddScoped<IRestaurantResolver, RestaurantResolver>();
builder.Services.AddScoped<IPublicMenuReader, PublicMenuReader>();
builder.Services.AddSingleton<PublicMenuSnapshotSerializer>();
builder.Services.AddSingleton<RestaurantStatusCalculator>();
builder.Services.AddSingleton<RestaurantPublicProjectionBuilder>();
builder.Services.AddSingleton<PublicMenuProjectionBuilder>();
builder.Services.AddScoped<RestaurantManagementService>();
builder.Services.AddScoped<IRestaurantManagementService>(provider => provider.GetRequiredService<RestaurantManagementService>());
builder.Services.AddScoped<IMenuManagementService>(provider => provider.GetRequiredService<RestaurantManagementService>());
builder.Services.AddScoped<IGalleryManagementService>(provider => provider.GetRequiredService<RestaurantManagementService>());
builder.Services.AddScoped<IMediaAssetService, MediaAssetService>();
builder.Services.AddScoped<IRestaurantConfigurationService, RestaurantConfigurationService>();
builder.Services.AddScoped<IRestaurantPublicAddressService, RestaurantPublicAddressService>();
builder.Services.AddSingleton<IGalleryThumbnailFactory, GalleryThumbnailFactory>();
builder.Services.AddSingleton<IResponsiveImageVariantFactory, ResponsiveImageVariantFactory>();
builder.Services.AddScoped<IInProcessPublicationDispatcher, InProcessPublicationDispatcher>();
builder.Services.AddSingleton<IPublicationFailurePolicy, NeverFailPublicationPolicy>();
builder.Services.Configure<PublicationDispatcherOptions>(builder.Configuration.GetSection(PublicationDispatcherOptions.SectionName));
builder.Services.AddHostedService<PublicationOutboxWorker>();

// Every publication timing knob is configuration, so it is checked at startup the same way media
// storage is: an out-of-range value fails the process rather than producing a worker that spins, never
// retries, or holds a claim for a day.
var publicationDispatcher = builder.Configuration.GetSection(PublicationDispatcherOptions.SectionName)
    .Get<PublicationDispatcherOptions>() ?? new PublicationDispatcherOptions();
if (publicationDispatcher.PollInterval <= TimeSpan.Zero || publicationDispatcher.PollInterval > TimeSpan.FromHours(1) ||
    publicationDispatcher.ClaimLease <= TimeSpan.Zero || publicationDispatcher.ClaimLease > TimeSpan.FromHours(1) ||
    publicationDispatcher.BatchSize is < 1 or > 500 ||
    publicationDispatcher.PublicationDelay < TimeSpan.Zero || publicationDispatcher.PublicationDelay > TimeSpan.FromHours(1) ||
    publicationDispatcher.MaxAttempts is < 1 or > 100 ||
    publicationDispatcher.RetryBackoff < TimeSpan.Zero || publicationDispatcher.RetryBackoff > TimeSpan.FromHours(1))
{
    throw new InvalidOperationException("PublicationDispatcher configuration is outside the supported safe range.");
}

var performanceLogging = builder.Configuration.GetSection(PerformanceLoggingOptions.SectionName)
    .Get<PerformanceLoggingOptions>() ?? new PerformanceLoggingOptions();
if (performanceLogging.SlowRequestThreshold <= TimeSpan.Zero || performanceLogging.SlowRequestThreshold > TimeSpan.FromMinutes(5) ||
    performanceLogging.SlowQueryThreshold <= TimeSpan.Zero || performanceLogging.SlowQueryThreshold > TimeSpan.FromMinutes(5))
{
    throw new InvalidOperationException("PerformanceLogging configuration is outside the supported safe range.");
}

var configuredMedia = builder.Configuration.GetSection(LocalMediaStorageOptions.SectionName)
    .Get<LocalMediaStorageOptions>() ?? new LocalMediaStorageOptions();
if (builder.Environment.IsProduction() && string.IsNullOrWhiteSpace(configuredMedia.LocalRoot))
{
    throw new InvalidOperationException("Production requires an explicit durable MediaStorage:LocalRoot.");
}
var mediaRoot = Path.GetFullPath(configuredMedia.LocalRoot ?? Path.Combine(builder.Environment.ContentRootPath, ".media-uploads"));
if (!configuredMedia.PublicPathBase.StartsWith("/media/", StringComparison.Ordinal) ||
    configuredMedia.PublicPathBase.Contains("..", StringComparison.Ordinal) ||
    configuredMedia.MaximumBytes is < 1024 or > 20 * 1024 * 1024 || configuredMedia.MaximumDimension is < 1 or > 12000)
{
    throw new InvalidOperationException("MediaStorage configuration is outside the supported safe range.");
}
var mediaStorageOptions = new LocalMediaStorageOptions
{
    LocalRoot = mediaRoot,
    PublicPathBase = configuredMedia.PublicPathBase,
    MaximumBytes = configuredMedia.MaximumBytes,
    MaximumDimension = configuredMedia.MaximumDimension,
    MaximumPixels = configuredMedia.MaximumPixels
};
builder.Services.AddSingleton(Options.Create(mediaStorageOptions));
builder.Services.AddSingleton<ILocalMediaStorage, LocalMediaStorage>();
builder.Services.AddOwnerSecurity(builder.Configuration, builder.Environment);
var loginRateLimitOptions = builder.Configuration.GetSection(LoginRateLimitOptions.SectionName)
    .Get<LoginRateLimitOptions>() ?? new LoginRateLimitOptions();
var loginRateLimitSettings = LoginRateLimitSettings.Create(loginRateLimitOptions, builder.Environment.IsProduction());
builder.Services.AddSingleton(loginRateLimitSettings);
builder.Services.AddSingleton<ILoginAttemptLimiter, LoginAttemptLimiter>();
builder.Services.AddRateLimiter(options =>
{
    options.RejectionStatusCode = StatusCodes.Status429TooManyRequests;
    options.OnRejected = async (context, cancellationToken) =>
    {
        context.HttpContext.Response.Headers.RetryAfter = "900";
        await ApiProblems.Problem(
            StatusCodes.Status429TooManyRequests,
            "auth_rate_limited",
            "Too many sign-in attempts",
            "Wait before trying again.").ExecuteAsync(context.HttpContext);
    };
    options.AddPolicy("owner-login-global", _ => RateLimitPartition.GetFixedWindowLimiter(
        "owner-login-global",
        _ => new FixedWindowRateLimiterOptions
        {
            PermitLimit = loginRateLimitSettings.GlobalPermitLimit,
            Window = loginRateLimitSettings.GlobalWindow,
            QueueLimit = 0,
            AutoReplenishment = true
        }));
});

var proxyConfiguration = builder.Configuration.GetSection(ReverseProxyDeploymentOptions.SectionName)
    .Get<ReverseProxyDeploymentOptions>() ?? new ReverseProxyDeploymentOptions();
if (builder.Environment.IsProduction() && proxyConfiguration.KnownProxies.Length == 0 && proxyConfiguration.KnownNetworks.Length == 0)
{
    throw new InvalidOperationException("Production requires at least one explicitly trusted ReverseProxy:KnownProxies address.");
}

builder.Services.Configure<ForwardedHeadersOptions>(options =>
{
    options.ForwardedHeaders = ForwardedHeaders.XForwardedFor | ForwardedHeaders.XForwardedProto;
    options.ForwardLimit = 1;
    options.KnownProxies.Clear();
    options.KnownIPNetworks.Clear();
    foreach (var value in proxyConfiguration.KnownProxies)
    {
        if (!IPAddress.TryParse(value, out var address))
        {
            throw new InvalidOperationException("ReverseProxy:KnownProxies contains an invalid IP address.");
        }

        options.KnownProxies.Add(address);
    }
    foreach (var value in proxyConfiguration.KnownNetworks)
    {
        if (!System.Net.IPNetwork.TryParse(value, out var network))
        {
            throw new InvalidOperationException("ReverseProxy:KnownNetworks contains an invalid CIDR network.");
        }
        options.KnownIPNetworks.Add(network);
    }
});

var app = builder.Build();

Directory.CreateDirectory(mediaRoot);

// Outermost, above the tenant media mount and the forwarded-header stripper: a fault in either of those
// used to escape as a bare connection reset, because the handler sat below them. Everything downstream
// now produces a ProblemDetails body with a code and a correlation id (PR-22).
app.UseExceptionHandler();
app.UseRequestTiming();

// Media is served only to the restaurant that owns it (PR-20 Task 8). This replaces the blanket
// static-file mount that previously exposed every tenant's files, drafts included, to any caller.
app.UseTenantScopedMedia(mediaStorageOptions.PublicPathBase, mediaRoot);

var explicitlyTrustedProxies = proxyConfiguration.KnownProxies.Select(IPAddress.Parse).ToHashSet();
var explicitlyTrustedNetworks = proxyConfiguration.KnownNetworks.Select(System.Net.IPNetwork.Parse).ToArray();
app.Use(async (context, next) =>
{
    var remote = context.Connection.RemoteIpAddress;
    var trusted = remote is not null &&
        (explicitlyTrustedProxies.Contains(remote) || explicitlyTrustedNetworks.Any(network => network.Contains(remote)));
    if (!trusted)
    {
        foreach (var header in new[] { "Forwarded", "X-Forwarded-For", "X-Forwarded-Host", "X-Forwarded-Proto", "X-Forwarded-Port", "X-Forwarded-Prefix" })
        {
            context.Request.Headers.Remove(header);
        }
    }
    await next();
});
app.UseForwardedHeaders();
app.UseResponseCompression();

if (app.Environment.IsDevelopment() || app.Environment.IsEnvironment("Testing"))
{
    app.MapOpenApi();
}
else
{
    app.UseHsts();
    app.UseHttpsRedirection();
}

app.Use(async (context, next) =>
{
    context.Response.OnStarting(() =>
    {
        context.Response.Headers.XContentTypeOptions = "nosniff";
        context.Response.Headers.XFrameOptions = "DENY";
        context.Response.Headers["Referrer-Policy"] = "no-referrer";
        context.Response.Headers["Content-Security-Policy"] = "default-src 'none'; frame-ancestors 'none'; base-uri 'none'";
        if (context.Request.Path.StartsWithSegments("/api/v1/admin") ||
            context.Request.Path.StartsWithSegments("/api/v1/auth"))
        {
            context.Response.Headers.CacheControl = "private, no-store";
            context.Response.Headers.Pragma = "no-cache";
        }

        return Task.CompletedTask;
    });
    await next();
});

app.UseRateLimiter();
app.UseAuthentication();
app.UseAuthorization();
app.UseAntiforgery();

app.MapApiV1Endpoints();

if (args.Contains("--seed-sample", StringComparer.Ordinal))
{
    await GuardedSampleDataSeeder.SeedAsync(app.Services, app.Environment, large: false);
    return;
}

if (args.Contains("--seed-large", StringComparer.Ordinal))
{
    await GuardedSampleDataSeeder.SeedAsync(app.Services, app.Environment, large: true);
    return;
}

var provisionIndex = Array.IndexOf(args, "--provision-owner");
if (provisionIndex >= 0)
{
    if (args.Length < provisionIndex + 4 || !Guid.TryParse(args[provisionIndex + 2], out var restaurantId))
    {
        throw new InvalidOperationException("Usage: --provision-owner <email> <restaurant-id> <display-name>.");
    }

    await OwnerProvisioning.ProvisionAsync(
        app.Services, app.Environment, args[provisionIndex + 1], restaurantId, args[provisionIndex + 3]);
    return;
}

var revokeIndex = Array.IndexOf(args, "--revoke-owner");
if (revokeIndex >= 0)
{
    if (args.Length < revokeIndex + 3 || !Guid.TryParse(args[revokeIndex + 2], out var restaurantId))
    {
        throw new InvalidOperationException("Usage: --revoke-owner <email> <restaurant-id>.");
    }
    await OwnerProvisioning.RevokeMembershipAsync(
        app.Services, app.Environment, args[revokeIndex + 1], restaurantId);
    return;
}

var disableIndex = Array.IndexOf(args, "--disable-owner");
if (disableIndex >= 0)
{
    if (args.Length < disableIndex + 2)
    {
        throw new InvalidOperationException("Usage: --disable-owner <email>.");
    }
    await OwnerProvisioning.DisableOwnerAsync(app.Services, app.Environment, args[disableIndex + 1]);
    return;
}

app.Run();

public partial class Program;

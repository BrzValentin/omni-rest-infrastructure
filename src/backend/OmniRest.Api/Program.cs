using System.Net;
using System.Threading.RateLimiting;
using Microsoft.AspNetCore.HttpOverrides;
using Microsoft.AspNetCore.RateLimiting;
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
});
builder.Services.AddOpenApi();
builder.Services.AddMemoryCache(options => options.SizeLimit = 64);
builder.Services.AddSingleton(TimeProvider.System);
builder.Services.Configure<PublicMenuOptions>(builder.Configuration.GetSection(PublicMenuOptions.SectionName));
builder.Services.AddDbContext<MenuDbContext>(options =>
    options.UseNpgsql(builder.Configuration.GetConnectionString("MenuDatabase")));
builder.Services.AddScoped<IRestaurantResolver, RestaurantResolver>();
builder.Services.AddScoped<IPublicMenuReader, PublicMenuReader>();
builder.Services.AddSingleton<PublicMenuSnapshotSerializer>();
builder.Services.AddSingleton<RestaurantStatusCalculator>();
builder.Services.AddSingleton<RestaurantPublicProjectionBuilder>();
builder.Services.AddSingleton<PublicMenuProjectionBuilder>();
builder.Services.AddScoped<IRestaurantManagementService, RestaurantManagementService>();
builder.Services.AddScoped<IMediaAssetService, MediaAssetService>();
builder.Services.AddScoped<IInProcessPublicationDispatcher, InProcessPublicationDispatcher>();
builder.Services.AddSingleton<IPublicationFailurePolicy, NeverFailPublicationPolicy>();
builder.Services.Configure<PublicationDispatcherOptions>(builder.Configuration.GetSection(PublicationDispatcherOptions.SectionName));
builder.Services.AddHostedService<PublicationOutboxWorker>();

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
app.UseStaticFiles(new StaticFileOptions
{
    FileProvider = new PhysicalFileProvider(mediaRoot),
    RequestPath = mediaStorageOptions.PublicPathBase,
    ServeUnknownFileTypes = false
});

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
app.UseExceptionHandler();

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

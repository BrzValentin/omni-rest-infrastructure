using Microsoft.Extensions.FileProviders;

namespace OmniRest.Api.Infrastructure;

/// <summary>
/// Restricts <c>/media/uploads</c> to the restaurant serving the request (PR-20 Task 8). Media is laid
/// out one directory per restaurant, so the owning tenant is in the URL and can be checked against the
/// tenant the host resolved to.
/// </summary>
/// <remarks>
/// Before Phase 7 the whole media root was mounted with <c>UseStaticFiles</c> ahead of authentication,
/// which made every file — including unpublished drafts — readable by anyone from any host. The GUIDs
/// are unguessable, but that is obscurity, not access control, and the requirement is that another
/// restaurant's images are <em>inaccessible</em>. This middleware supplies the missing check and then
/// hands off to the static-file pipeline for the actual byte serving, range requests, and ETags.
/// </remarks>
public static class TenantMediaMiddleware
{
    /// <summary>
    /// Serves tenant media, answering 404 for anything that is not a readable file belonging to the
    /// restaurant this host resolved to. Every rejection is a 404 rather than a 403: whether another
    /// tenant's asset exists is itself information a caller should not be able to obtain.
    /// </summary>
    public static IApplicationBuilder UseTenantScopedMedia(
        this WebApplication app,
        string requestPath,
        string mediaRoot)
    {
        var fileProvider = new PhysicalFileProvider(mediaRoot);
        app.Map(requestPath, branch =>
        {
            branch.Use(async (context, next) =>
            {
                if (!TryReadRestaurantDirectory(context.Request.Path, out var owner))
                {
                    context.Response.StatusCode = StatusCodes.Status404NotFound;
                    return;
                }

                var restaurantContext = context.RequestServices.GetRequiredService<IRestaurantContext>();
                var resolved = await restaurantContext.ResolveFromHostAsync(context.Request.Host, context.RequestAborted);
                if (resolved is null || resolved.Id != owner)
                {
                    context.Response.StatusCode = StatusCodes.Status404NotFound;
                    return;
                }

                // Content-addressed by asset GUID: a URL's bytes never change, so it is safe to cache
                // hard. Private, because the file belongs to one tenant and a shared cache keyed on the
                // path alone would not know that.
                context.Response.Headers.CacheControl = "private, max-age=31536000, immutable";
                await next();
            });

            branch.UseStaticFiles(new StaticFileOptions
            {
                FileProvider = fileProvider,
                RequestPath = string.Empty,
                ServeUnknownFileTypes = false
            });
        });

        return app;
    }

    /// <summary>
    /// Reads the owning restaurant from the leading path segment. The segment must be exactly a 32-digit
    /// "N"-format GUID, which rejects <c>.</c>, <c>..</c>, and any other traversal attempt outright
    /// rather than relying on later normalization.
    /// </summary>
    internal static bool TryReadRestaurantDirectory(PathString path, out Guid restaurantId)
    {
        restaurantId = Guid.Empty;
        var value = path.Value;
        if (string.IsNullOrEmpty(value) || value.Length < 2 || value[0] != '/')
        {
            return false;
        }

        var separator = value.IndexOf('/', 1);
        if (separator < 0 || separator == 1 || separator == value.Length - 1)
        {
            return false;
        }

        var segment = value[1..separator];
        return segment.Length == 32 && Guid.TryParseExact(segment, "N", out restaurantId);
    }
}

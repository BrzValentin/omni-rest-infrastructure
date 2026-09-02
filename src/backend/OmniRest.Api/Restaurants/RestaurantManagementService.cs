using System.Globalization;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Caching.Memory;
using OmniRest.Api.Data;
using OmniRest.Api.Menus;
using OmniRest.Api.Security;

namespace OmniRest.Api.Restaurants;

public sealed record ManagementFailure(
    int Status,
    string Code,
    string Title,
    long? CurrentVersion = null,
    IReadOnlyDictionary<string, string[]>? Errors = null);
public sealed record ManagementResult<T>(T? Value, ManagementFailure? Failure)
{
    public static ManagementResult<T> Success(T value) => new(value, null);
    public static ManagementResult<T> Failed(ManagementFailure failure) => new(default, failure);
}

public interface IRestaurantManagementService
{
    Task<ManagementResult<AdminRestaurantResponse>> ReadAsync(OwnerRestaurantAccess access, CancellationToken cancellationToken);
    Task<ManagementResult<AdminMutationResponse>> UpdateProfileAsync(OwnerRestaurantAccess access, string? etag, UpdateRestaurantProfileRequest request, CancellationToken cancellationToken);
    Task<ManagementResult<AdminMutationResponse>> ReplaceRegularHoursAsync(OwnerRestaurantAccess access, string? etag, UpdateRegularHoursRequest request, CancellationToken cancellationToken);
    Task<ManagementResult<AdminMutationResponse>> CreateSpecialHoursAsync(OwnerRestaurantAccess access, string? etag, AdminSpecialHoursRequest request, CancellationToken cancellationToken);
    Task<ManagementResult<AdminMutationResponse>> UpdateSpecialHoursAsync(OwnerRestaurantAccess access, Guid id, string? etag, AdminSpecialHoursRequest request, CancellationToken cancellationToken);
    Task<ManagementResult<AdminMutationResponse>> DeleteSpecialHoursAsync(OwnerRestaurantAccess access, Guid id, string? etag, CancellationToken cancellationToken);
    Task<ManagementResult<AdminMutationResponse>> ReplaceSocialLinksAsync(OwnerRestaurantAccess access, string? etag, UpdateSocialLinksRequest request, CancellationToken cancellationToken);
    Task<ManagementResult<AdminMutationResponse>> SelectMainImageAsync(OwnerRestaurantAccess access, string? etag, SelectMainImageRequest request, CancellationToken cancellationToken);
    Task<ManagementResult<AdminMutationResponse>> SelectLogoAsync(OwnerRestaurantAccess access, string? etag, SelectLogoRequest request, CancellationToken cancellationToken);
    Task<ManagementResult<AdminMutationResponse>> SelectCoverImageAsync(OwnerRestaurantAccess access, string? etag, SelectCoverImageRequest request, CancellationToken cancellationToken);
    Task<ManagementResult<AdminMutationResponse>> UpdateMediaAltTextAsync(OwnerRestaurantAccess access, Guid id, string? etag, UpdateMediaAltTextRequest request, CancellationToken cancellationToken);
    Task<ManagementResult<AdminMutationResponse>> UpdateWebsiteDesignAsync(OwnerRestaurantAccess access, string? etag, UpdateWebsiteDesignRequest request, CancellationToken cancellationToken);
    Task<ManagementResult<PublicRestaurantResponse>> PreviewAsync(OwnerRestaurantAccess access, CancellationToken cancellationToken);
    Task<ManagementResult<PublicMenuResponse>> PreviewWebsiteDesignAsync(OwnerRestaurantAccess access, string designId, CancellationToken cancellationToken);
    Task<ManagementResult<PublicationStatusResponse>> GetPublicationStatusAsync(OwnerRestaurantAccess access, Guid operationId, CancellationToken cancellationToken);
    Task<ManagementResult<PublicationStatusResponse>> RetryPublicationAsync(OwnerRestaurantAccess access, Guid operationId, CancellationToken cancellationToken);
}

public sealed partial class RestaurantManagementService(
    MenuDbContext dbContext,
    PublicMenuProjectionBuilder projectionBuilder,
    PublicMenuSnapshotSerializer serializer,
    IInProcessPublicationDispatcher dispatcher,
    ILocalMediaStorage mediaStorage,
    IGalleryThumbnailFactory thumbnailFactory,
    TimeProvider timeProvider,
    Microsoft.Extensions.Options.IOptions<PublicationDispatcherOptions> dispatcherOptions,
    ILogger<RestaurantManagementService> logger) : IRestaurantManagementService
{
    public async Task<ManagementResult<AdminRestaurantResponse>> ReadAsync(
        OwnerRestaurantAccess access,
        CancellationToken cancellationToken)
    {
        var restaurant = await LoadAggregateAsync(access.RestaurantId, tracking: false, cancellationToken);
        return restaurant is null
            ? ManagementResult<AdminRestaurantResponse>.Failed(NotFound())
            : ManagementResult<AdminRestaurantResponse>.Success(await ToAdminAsync(restaurant, cancellationToken));
    }

    public Task<ManagementResult<AdminMutationResponse>> UpdateProfileAsync(
        OwnerRestaurantAccess access,
        string? etag,
        UpdateRestaurantProfileRequest request,
        CancellationToken cancellationToken) => MutateAsync(access, etag, "restaurant.profile.updated", async (restaurant, _) =>
    {
        restaurant.Name = request.Name.Trim();
        restaurant.Description = request.Description?.Trim();
        restaurant.PhoneE164 = request.PhoneE164;
        restaurant.PhoneDisplay = request.PhoneDisplay?.Trim();
        restaurant.Email = request.Email?.Trim();
        restaurant.WebsiteUrl = string.IsNullOrWhiteSpace(request.WebsiteUrl) ? null : request.WebsiteUrl.Trim();
        restaurant.RestaurantType = string.IsNullOrEmpty(request.RestaurantType) ? null : request.RestaurantType;
        restaurant.PriceRange = string.IsNullOrEmpty(request.PriceRange) ? null : request.PriceRange;
        restaurant.Settings.TimeZoneId = request.TimeZone;
        if (restaurant.Address is null)
        {
            restaurant.Address = new RestaurantAddressEntity { RestaurantId = restaurant.Id, Restaurant = restaurant };
            dbContext.RestaurantAddresses.Add(restaurant.Address);
        }
        ApplyAddress(restaurant.Address, request.Address);
        await Task.CompletedTask;
        return null;
    }, cancellationToken);

    public Task<ManagementResult<AdminMutationResponse>> ReplaceRegularHoursAsync(
        OwnerRestaurantAccess access,
        string? etag,
        UpdateRegularHoursRequest request,
        CancellationToken cancellationToken) => MutateAsync(access, etag, "restaurant.regular_hours.replaced", async (restaurant, _) =>
    {
        dbContext.RegularHourIntervals.RemoveRange(restaurant.RegularHours.ToArray());
        restaurant.RegularHours.Clear();
        foreach (var day in request.Days.OrderBy(item => item.DayOfWeek))
        {
            var order = 0;
            foreach (var interval in day.Intervals)
            {
                var added = new RegularHourIntervalEntity
                {
                    Id = Guid.NewGuid(),
                    RestaurantId = restaurant.Id,
                    Restaurant = restaurant,
                    DayOfWeek = day.DayOfWeek,
                    OpensAt = ParseTime(interval.OpensAt),
                    ClosesAt = ParseTime(interval.ClosesAt),
                    DisplayOrder = order++
                };
                restaurant.RegularHours.Add(added);
                dbContext.RegularHourIntervals.Add(added);
            }
        }
        await Task.CompletedTask;
        return null;
    }, cancellationToken);

    public Task<ManagementResult<AdminMutationResponse>> CreateSpecialHoursAsync(
        OwnerRestaurantAccess access,
        string? etag,
        AdminSpecialHoursRequest request,
        CancellationToken cancellationToken) => MutateAsync(access, etag, "restaurant.special_hours.created", async (restaurant, _) =>
    {
        var date = ParseDate(request.Date);
        if (restaurant.SpecialHours.Any(item => item.Date == date))
        {
            return SpecialDateDuplicate();
        }
        var added = CreateSpecial(restaurant, Guid.NewGuid(), request);
        restaurant.SpecialHours.Add(added);
        dbContext.SpecialHours.Add(added);
        await Task.CompletedTask;
        return null;
    }, cancellationToken);

    public Task<ManagementResult<AdminMutationResponse>> UpdateSpecialHoursAsync(
        OwnerRestaurantAccess access,
        Guid id,
        string? etag,
        AdminSpecialHoursRequest request,
        CancellationToken cancellationToken) => MutateAsync(access, etag, "restaurant.special_hours.updated", async (restaurant, _) =>
    {
        var special = restaurant.SpecialHours.SingleOrDefault(item => item.Id == id);
        if (special is null)
        {
            return NotFound();
        }
        var date = ParseDate(request.Date);
        if (restaurant.SpecialHours.Any(item => item.Id != id && item.Date == date))
        {
            return SpecialDateDuplicate();
        }
        dbContext.SpecialHourIntervals.RemoveRange(special.Intervals.ToArray());
        special.Intervals.Clear();
        ApplySpecial(special, request);
        dbContext.SpecialHourIntervals.AddRange(special.Intervals);
        await Task.CompletedTask;
        return null;
    }, cancellationToken);

    public Task<ManagementResult<AdminMutationResponse>> DeleteSpecialHoursAsync(
        OwnerRestaurantAccess access,
        Guid id,
        string? etag,
        CancellationToken cancellationToken) => MutateAsync(access, etag, "restaurant.special_hours.deleted", async (restaurant, _) =>
    {
        var special = restaurant.SpecialHours.SingleOrDefault(item => item.Id == id);
        if (special is null)
        {
            return NotFound();
        }
        dbContext.SpecialHours.Remove(special);
        await Task.CompletedTask;
        return null;
    }, cancellationToken);

    public Task<ManagementResult<AdminMutationResponse>> ReplaceSocialLinksAsync(
        OwnerRestaurantAccess access,
        string? etag,
        UpdateSocialLinksRequest request,
        CancellationToken cancellationToken) => MutateAsync(access, etag, "restaurant.social_links.replaced", async (restaurant, _) =>
    {
        dbContext.SocialLinks.RemoveRange(restaurant.SocialLinks.ToArray());
        restaurant.SocialLinks.Clear();
        foreach (var link in request.Links.OrderBy(item => item.Platform, StringComparer.Ordinal))
        {
            var added = new SocialLinkEntity
            {
                Id = Guid.NewGuid(),
                RestaurantId = restaurant.Id,
                Restaurant = restaurant,
                Platform = link.Platform,
                Url = link.Url
            };
            restaurant.SocialLinks.Add(added);
            dbContext.SocialLinks.Add(added);
        }
        await Task.CompletedTask;
        return null;
    }, cancellationToken);

    public Task<ManagementResult<AdminMutationResponse>> SelectMainImageAsync(
        OwnerRestaurantAccess access,
        string? etag,
        SelectMainImageRequest request,
        CancellationToken cancellationToken) => SelectRestaurantImageAsync(
            access, etag, request.MediaAssetId, "restaurant.main_image", (restaurant, media) =>
            {
                restaurant.MainMediaAssetId = media?.Id;
                restaurant.MainMediaAsset = media;
            }, cancellationToken);

    public Task<ManagementResult<AdminMutationResponse>> SelectLogoAsync(
        OwnerRestaurantAccess access,
        string? etag,
        SelectLogoRequest request,
        CancellationToken cancellationToken) => SelectRestaurantImageAsync(
            access, etag, request.MediaAssetId, "restaurant.logo", (restaurant, media) =>
            {
                restaurant.LogoMediaAssetId = media?.Id;
                restaurant.LogoMediaAsset = media;
            }, cancellationToken);

    public Task<ManagementResult<AdminMutationResponse>> SelectCoverImageAsync(
        OwnerRestaurantAccess access,
        string? etag,
        SelectCoverImageRequest request,
        CancellationToken cancellationToken) => SelectRestaurantImageAsync(
            access, etag, request.MediaAssetId, "restaurant.cover_image", (restaurant, media) =>
            {
                restaurant.CoverMediaAssetId = media?.Id;
                restaurant.CoverMediaAsset = media;
            }, cancellationToken);

    /// <summary>
    /// Points one restaurant-level image slot at a media asset, or clears it when
    /// <paramref name="mediaAssetId"/> is null. The lookup is scoped to the caller's restaurant, so another
    /// tenant's asset is indistinguishable from a missing one and yields 404 rather than leaking existence.
    /// </summary>
    private Task<ManagementResult<AdminMutationResponse>> SelectRestaurantImageAsync(
        OwnerRestaurantAccess access,
        string? etag,
        Guid? mediaAssetId,
        string auditActionPrefix,
        Action<RestaurantEntity, MediaAssetEntity?> assign,
        CancellationToken cancellationToken) => MutateAsync(
            access,
            etag,
            mediaAssetId is null ? $"{auditActionPrefix}.removed" : $"{auditActionPrefix}.selected",
            async (restaurant, token) =>
    {
        if (mediaAssetId is null)
        {
            assign(restaurant, null);
            return null;
        }
        var media = await dbContext.MediaAssets.Include(item => item.Variants).SingleOrDefaultAsync(
            item => item.Id == mediaAssetId && item.RestaurantId == restaurant.Id, token);
        if (media is null)
        {
            return NotFound();
        }
        if (media.ProcessingStatus != "ready" || media.Variants.Count == 0)
        {
            return new ManagementFailure(409, "media_not_ready", "The selected image is not ready for publication");
        }
        assign(restaurant, media);
        return null;
    }, cancellationToken);

    public Task<ManagementResult<AdminMutationResponse>> UpdateMediaAltTextAsync(
        OwnerRestaurantAccess access,
        Guid id,
        string? etag,
        UpdateMediaAltTextRequest request,
        CancellationToken cancellationToken) => MutateAsync(access, etag, "media.alt_text.updated", async (restaurant, token) =>
    {
        var media = await dbContext.MediaAssets.SingleOrDefaultAsync(
            item => item.Id == id && item.RestaurantId == restaurant.Id, token);
        if (media is null) return NotFound();
        media.AltText = request.AltText.Trim();
        return null;
    }, cancellationToken);

    public Task<ManagementResult<AdminMutationResponse>> UpdateWebsiteDesignAsync(
        OwnerRestaurantAccess access,
        string? etag,
        UpdateWebsiteDesignRequest request,
        CancellationToken cancellationToken)
    {
        if (!WebsiteDesignCatalog.IsSelectable(request.DesignId))
        {
            return Task.FromResult(ManagementResult<AdminMutationResponse>.Failed(WebsiteDesignUnavailable()));
        }

        return MutateAsync(access, etag, "restaurant.website_design.updated", async (restaurant, _) =>
        {
            restaurant.Settings.WebsiteDesignId = request.DesignId;
            restaurant.Settings.ConcurrencyVersion++;
            await Task.CompletedTask;
            return null;
        }, cancellationToken);
    }

    public async Task<ManagementResult<PublicRestaurantResponse>> PreviewAsync(
        OwnerRestaurantAccess access,
        CancellationToken cancellationToken)
    {
        var restaurant = await LoadAggregateAsync(access.RestaurantId, tracking: false, cancellationToken);
        if (restaurant is null)
        {
            return ManagementResult<PublicRestaurantResponse>.Failed(NotFound());
        }
        var menu = restaurant.Menus.SingleOrDefault(item => item.IsActive);
        var response = projectionBuilder.Build(restaurant, menu, restaurant.DraftVersion).Restaurant!;
        return ManagementResult<PublicRestaurantResponse>.Success(response);
    }

    public async Task<ManagementResult<PublicMenuResponse>> PreviewWebsiteDesignAsync(
        OwnerRestaurantAccess access,
        string designId,
        CancellationToken cancellationToken)
    {
        if (!WebsiteDesignCatalog.IsSupported(designId))
        {
            return ManagementResult<PublicMenuResponse>.Failed(WebsiteDesignUnavailable());
        }

        var restaurant = await LoadAggregateAsync(access.RestaurantId, tracking: false, cancellationToken);
        if (restaurant is null)
        {
            return ManagementResult<PublicMenuResponse>.Failed(NotFound());
        }

        var menu = restaurant.Menus.SingleOrDefault(item => item.IsActive);
        return ManagementResult<PublicMenuResponse>.Success(
            projectionBuilder.Build(restaurant, menu, restaurant.DraftVersion, designId));
    }

    public async Task<ManagementResult<PublicationStatusResponse>> GetPublicationStatusAsync(
        OwnerRestaurantAccess access,
        Guid operationId,
        CancellationToken cancellationToken)
    {
        var item = await dbContext.PublicationOutbox.AsNoTracking().SingleOrDefaultAsync(
            value => value.OperationId == operationId && value.RestaurantId == access.RestaurantId, cancellationToken);
        return item is null
            ? ManagementResult<PublicationStatusResponse>.Failed(NotFound())
            : ManagementResult<PublicationStatusResponse>.Success(ToPublicationStatus(item));
    }

    public async Task<ManagementResult<PublicationStatusResponse>> RetryPublicationAsync(
        OwnerRestaurantAccess access,
        Guid operationId,
        CancellationToken cancellationToken)
    {
        await using var transaction = await dbContext.Database.BeginTransactionAsync(cancellationToken);
        var restaurantDraftVersion = await PublicationOrdering.LockRestaurantDraftVersionAsync(
            dbContext, access.RestaurantId, cancellationToken);
        var item = await dbContext.PublicationOutbox.SingleOrDefaultAsync(
            value => value.OperationId == operationId && value.RestaurantId == access.RestaurantId, cancellationToken);
        if (item is null)
        {
            await transaction.RollbackAsync(cancellationToken);
            return ManagementResult<PublicationStatusResponse>.Failed(NotFound());
        }
        if (item.Status == PublicationStatuses.Succeeded)
        {
            await transaction.CommitAsync(cancellationToken);
            return ManagementResult<PublicationStatusResponse>.Success(ToPublicationStatus(item));
        }
        var currentPublicationVersion = await dbContext.Publications.AsNoTracking()
            .Where(value => value.RestaurantId == access.RestaurantId && value.IsCurrent)
            .Select(value => (long?)value.Version)
            .SingleOrDefaultAsync(cancellationToken);
        if (item.ErrorCode == PublicationOrdering.SupersededErrorCode ||
            PublicationOrdering.IsSuperseded(
                item.DraftVersion, restaurantDraftVersion, currentPublicationVersion))
        {
            if (item.Status != PublicationStatuses.Succeeded)
            {
                var supersededAt = timeProvider.GetUtcNow();
                item.Status = PublicationStatuses.Failed;
                item.ErrorCode = PublicationOrdering.SupersededErrorCode;
                item.CompletedAt = supersededAt;
                item.UpdatedAt = supersededAt;
                await dbContext.SaveChangesAsync(cancellationToken);
            }
            await transaction.CommitAsync(cancellationToken);
            return ManagementResult<PublicationStatusResponse>.Failed(PublicationRetrySuperseded());
        }
        if (item.Status == PublicationStatuses.Failed)
        {
            item.Status = PublicationStatuses.Pending;
            item.ErrorCode = null;
            item.CompletedAt = null;
            item.UpdatedAt = timeProvider.GetUtcNow();
            await dbContext.SaveChangesAsync(cancellationToken);
        }
        await transaction.CommitAsync(cancellationToken);
        await dispatcher.DispatchAsync(operationId, cancellationToken);
        dbContext.ChangeTracker.Clear();
        item = await dbContext.PublicationOutbox.AsNoTracking().SingleAsync(value => value.OperationId == operationId, cancellationToken);
        if (item.ErrorCode == PublicationOrdering.SupersededErrorCode)
        {
            return ManagementResult<PublicationStatusResponse>.Failed(PublicationRetrySuperseded());
        }
        return ManagementResult<PublicationStatusResponse>.Success(ToPublicationStatus(item));
    }

    private async Task<ManagementResult<AdminMutationResponse>> MutateAsync(
        OwnerRestaurantAccess access,
        string? etag,
        string action,
        Func<RestaurantEntity, CancellationToken, Task<ManagementFailure?>> apply,
        CancellationToken cancellationToken)
    {
        var outcome = await MutateCoreAsync(access, etag, action, apply, cancellationToken);
        return outcome.Value is null
            ? ManagementResult<AdminMutationResponse>.Failed(outcome.Failure!)
            : ManagementResult<AdminMutationResponse>.Success(new AdminMutationResponse(
                await ToAdminAsync(outcome.Value.Restaurant, cancellationToken), outcome.Value.Publication));
    }

    /// <param name="onCommitted">
    /// Invoked once the mutation transaction has committed, before the post-commit dispatch and reload run.
    /// Callers that compensate side effects (a stored blob, for example) use it to tell a pre-commit failure
    /// apart from a post-commit one: work after the commit can still throw, and the committed rows stay.
    /// </param>
    private async Task<ManagementResult<MutationOutcome>> MutateCoreAsync(
        OwnerRestaurantAccess access,
        string? etag,
        string action,
        Func<RestaurantEntity, CancellationToken, Task<ManagementFailure?>> apply,
        CancellationToken cancellationToken,
        MutationAudit? audit = null,
        Action? onCommitted = null)
    {
        var restaurant = await LoadAggregateAsync(access.RestaurantId, tracking: true, cancellationToken);
        if (restaurant is null)
        {
            return ManagementResult<MutationOutcome>.Failed(NotFound());
        }
        if (!DraftETag.Matches(etag, restaurant.Id, restaurant.DraftVersion))
        {
            return ManagementResult<MutationOutcome>.Failed(
                new ManagementFailure(409, "concurrency_conflict", "The draft changed; reload before saving", restaurant.DraftVersion));
        }

        await using var transaction = await dbContext.Database.BeginTransactionAsync(cancellationToken);
        var failure = await apply(restaurant, cancellationToken);
        if (failure is not null)
        {
            await transaction.RollbackAsync(cancellationToken);
            return ManagementResult<MutationOutcome>.Failed(failure);
        }

        var now = timeProvider.GetUtcNow();
        restaurant.DraftVersion++;
        restaurant.ConcurrencyVersion++;
        restaurant.UpdatedAt = now;
        var operationId = Guid.NewGuid();
        var menu = restaurant.Menus.SingleOrDefault(item => item.IsActive);
        var snapshot = serializer.Serialize(projectionBuilder.Build(restaurant, menu, restaurant.DraftVersion));
        var outbox = new PublicationOutboxEntity
        {
            OperationId = operationId,
            RestaurantId = restaurant.Id,
            Restaurant = restaurant,
            DraftVersion = restaurant.DraftVersion,
            DraftSnapshotJson = snapshot,
            Status = PublicationStatuses.Pending,
            CreatedAt = now,
            UpdatedAt = now
        };
        dbContext.PublicationOutbox.Add(outbox);
        dbContext.AuditEvents.Add(new AuditEventEntity
        {
            Id = Guid.NewGuid(),
            RestaurantId = restaurant.Id,
            ActorUserId = access.UserId,
            Action = action,
            EntityType = audit?.EntityType ?? "restaurant",
            EntityId = audit?.EntityId,
            EntityVersion = restaurant.DraftVersion.ToString(CultureInfo.InvariantCulture),
            OperationId = operationId,
            OccurredAt = now
        });
        try
        {
            await dbContext.SaveChangesAsync(cancellationToken);
            await transaction.CommitAsync(cancellationToken);
        }
        catch (DbUpdateConcurrencyException exception)
        {
            logger.LogWarning("Restaurant mutation encountered a concurrency conflict for entity states {EntityStates}.",
                string.Join(',', exception.Entries.Select(entry => $"{entry.Metadata.ClrType.Name}:{entry.State}")));
            await transaction.RollbackAsync(cancellationToken);
            return ManagementResult<MutationOutcome>.Failed(
                new ManagementFailure(409, "concurrency_conflict", "The draft changed; reload before saving"));
        }
        catch (DbUpdateException exception)
        {
            await transaction.RollbackAsync(cancellationToken);

            // Two owners can each pass the in-memory duplicate check and race to commit the same special
            // date. The loser must not learn about it as an opaque data_conflict: the unique index is the
            // same rule the field-level check enforces, so it reports the same field-level code.
            return ManagementResult<MutationOutcome>.Failed(
                IsSpecialDateConflict(exception)
                    ? SpecialDateDuplicate()
                    : new ManagementFailure(409, "data_conflict", "The requested change conflicts with existing restaurant data"));
        }

        // The transaction is committed from here on: everything below can still fail, but the rows stay.
        onCommitted?.Invoke();

        // Immediate by default (PR-24 Task 11): the inline post-commit dispatch is what makes a saved
        // change visible on the public site before the response is written. A configured
        // PublicationDelay hands timing to the outbox worker instead, and the mutation then reports the
        // operation as pending rather than succeeded.
        if (dispatcherOptions.Value.PublicationDelay <= TimeSpan.Zero)
        {
            await dispatcher.DispatchAsync(operationId, cancellationToken);
        }
        dbContext.ChangeTracker.Clear();
        var saved = await LoadAggregateAsync(access.RestaurantId, tracking: false, cancellationToken);
        var status = await dbContext.PublicationOutbox.AsNoTracking().SingleAsync(item => item.OperationId == operationId, cancellationToken);
        return ManagementResult<MutationOutcome>.Success(
            new MutationOutcome(saved!, ToPublicationStatus(status)));
    }

    private Task<RestaurantEntity?> LoadAggregateAsync(Guid restaurantId, bool tracking, CancellationToken cancellationToken)
    {
        var query = dbContext.Restaurants
            .Include(item => item.Settings)
            .Include(item => item.Address)
            .Include(item => item.RegularHours)
            .Include(item => item.SpecialHours).ThenInclude(item => item.Intervals)
            .Include(item => item.SocialLinks)
            .Include(item => item.MainMediaAsset).ThenInclude(item => item!.Variants)
            .Include(item => item.LogoMediaAsset).ThenInclude(item => item!.Variants)
            .Include(item => item.CoverMediaAsset).ThenInclude(item => item!.Variants)
            .Include(item => item.GalleryImages).ThenInclude(item => item.MediaAsset).ThenInclude(item => item.Variants)
            .Include(item => item.Menus).ThenInclude(item => item.Categories).ThenInclude(item => item.Dishes).ThenInclude(item => item.Badges).ThenInclude(item => item.Badge)
            .Include(item => item.Menus).ThenInclude(item => item.Categories).ThenInclude(item => item.Dishes).ThenInclude(item => item.MediaAsset).ThenInclude(item => item!.Variants)
            .AsSplitQuery()
            .Where(item => item.Id == restaurantId);
        if (!tracking)
        {
            query = query.AsNoTracking();
        }
        return query.SingleOrDefaultAsync(cancellationToken);
    }

    private async Task<AdminRestaurantResponse> ToAdminAsync(RestaurantEntity restaurant, CancellationToken cancellationToken)
    {
        var latest = await dbContext.PublicationOutbox.AsNoTracking()
            .Where(item => item.RestaurantId == restaurant.Id)
            .OrderByDescending(item => item.CreatedAt).ThenByDescending(item => item.OperationId)
            .FirstOrDefaultAsync(cancellationToken);
        var publishedDesignId = await ReadPublishedDesignIdAsync(restaurant.Id, cancellationToken);
        var draftDesignId = WebsiteDesignCatalog.ResolvePublished(restaurant.Settings.WebsiteDesignId);
        if (!string.Equals(draftDesignId, restaurant.Settings.WebsiteDesignId, StringComparison.Ordinal))
        {
            logger.LogWarning(
                "Restaurant {RestaurantId} has an unsupported draft website design; the legacy renderer was selected for management display.",
                restaurant.Id);
        }
        return new AdminRestaurantResponse(
            restaurant.Id.ToString(), restaurant.Name, restaurant.Description, restaurant.PhoneE164,
            restaurant.PhoneDisplay, restaurant.Email, restaurant.Settings.TimeZoneId,
            restaurant.Address is null ? null : new AdminAddressResponse(
                restaurant.Address.Line1, restaurant.Address.Line2, restaurant.Address.City, restaurant.Address.Region,
                restaurant.Address.PostalCode, restaurant.Address.CountryCode, restaurant.Address.Latitude, restaurant.Address.Longitude),
            Enumerable.Range(0, 7).Select(day => new AdminRegularHoursDayResponse(day,
                restaurant.RegularHours.Where(item => item.DayOfWeek == day)
                    .OrderBy(item => item.DisplayOrder).Select(ToAdminInterval).ToArray())).ToArray(),
            restaurant.SpecialHours.OrderBy(item => item.Date).Select(item => new AdminSpecialHoursResponse(
                item.Id.ToString(), item.Date.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture), item.IsClosed, item.Note,
                item.Intervals.OrderBy(interval => interval.DisplayOrder).Select(ToAdminInterval).ToArray())).ToArray(),
            restaurant.SocialLinks.OrderBy(item => item.Platform, StringComparer.Ordinal)
                .Select(item => new AdminSocialLinkResponse(item.Platform, item.Url)).ToArray(),
            ToAdminImage(restaurant.MainMediaAsset),
            draftDesignId,
            publishedDesignId,
            WebsiteDesignCatalog.All.Select(design => new AdminWebsiteDesignResponse(
                design.Id, design.Name, design.ContractVersion, design.Availability)).ToArray(),
            restaurant.DraftVersion.ToString(CultureInfo.InvariantCulture), DraftETag.Create(restaurant.Id, restaurant.DraftVersion),
            latest is null ? null : ToPublicationStatus(latest),
            restaurant.RestaurantType,
            restaurant.PriceRange,
            ToAdminImage(restaurant.LogoMediaAsset),
            ToAdminImage(restaurant.CoverMediaAsset),
            restaurant.WebsiteUrl);
    }

    private static AdminMainImageResponse? ToAdminImage(MediaAssetEntity? asset) => asset is null ? null : new(
        asset.Id.ToString(),
        asset.AltText,
        asset.ProcessingStatus,
        asset.Variants.OrderBy(item => item.Width).ThenBy(item => item.Height)
            .Select(item => new PublicMediaVariant(item.Url, item.Width, item.Height)).ToArray());

    private async Task<string> ReadPublishedDesignIdAsync(Guid restaurantId, CancellationToken cancellationToken)
    {
        var snapshot = await dbContext.Publications.AsNoTracking()
            .Where(item => item.RestaurantId == restaurantId && item.IsCurrent)
            .Select(item => item.SnapshotJson)
            .SingleOrDefaultAsync(cancellationToken);
        if (snapshot is null)
        {
            return WebsiteDesignIds.LegacyCurrent;
        }

        var storedDesignId = serializer.Deserialize(snapshot).WebsiteDesignId;
        var resolvedDesignId = WebsiteDesignCatalog.ResolvePublished(storedDesignId);
        if (!string.Equals(storedDesignId, resolvedDesignId, StringComparison.Ordinal))
        {
            logger.LogWarning(
                "The current publication for restaurant {RestaurantId} has a missing or unsupported website design; the legacy renderer was selected.",
                restaurantId);
        }
        return resolvedDesignId;
    }

    private static void ApplyAddress(RestaurantAddressEntity target, AdminAddressRequest source)
    {
        target.Line1 = source.Line1.Trim(); target.Line2 = source.Line2?.Trim(); target.City = source.City.Trim();
        target.Region = source.Region.Trim(); target.PostalCode = source.PostalCode.Trim();
        target.CountryCode = source.CountryCode; target.Latitude = source.Latitude; target.Longitude = source.Longitude;
        target.ConcurrencyVersion++;
    }

    private static SpecialHourEntity CreateSpecial(RestaurantEntity restaurant, Guid id, AdminSpecialHoursRequest request)
    {
        var special = new SpecialHourEntity { Id = id, RestaurantId = restaurant.Id, Restaurant = restaurant };
        ApplySpecial(special, request);
        return special;
    }

    private static void ApplySpecial(SpecialHourEntity special, AdminSpecialHoursRequest request)
    {
        special.Date = ParseDate(request.Date); special.IsClosed = request.IsClosed; special.Note = request.Note?.Trim();
        special.ConcurrencyVersion++;
        var order = 0;
        foreach (var interval in request.Intervals)
        {
            special.Intervals.Add(new SpecialHourIntervalEntity
            {
                Id = Guid.NewGuid(),
                RestaurantId = special.RestaurantId,
                SpecialHourId = special.Id,
                SpecialHour = special,
                OpensAt = ParseTime(interval.OpensAt),
                ClosesAt = ParseTime(interval.ClosesAt),
                DisplayOrder = order++
            });
        }
    }

    private static AdminHourIntervalResponse ToAdminInterval(RegularHourIntervalEntity item) => new(
        item.OpensAt.ToString("HH:mm:ss", CultureInfo.InvariantCulture),
        item.ClosesAt.ToString("HH:mm:ss", CultureInfo.InvariantCulture), item.ClosesAt <= item.OpensAt);
    private static AdminHourIntervalResponse ToAdminInterval(SpecialHourIntervalEntity item) => new(
        item.OpensAt.ToString("HH:mm:ss", CultureInfo.InvariantCulture),
        item.ClosesAt.ToString("HH:mm:ss", CultureInfo.InvariantCulture), item.ClosesAt <= item.OpensAt);
    private static TimeOnly ParseTime(string value) => TimeOnly.Parse(value, CultureInfo.InvariantCulture);
    private static DateOnly ParseDate(string value) => DateOnly.ParseExact(value, "yyyy-MM-dd", CultureInfo.InvariantCulture);
    private static PublicationStatusResponse ToPublicationStatus(PublicationOutboxEntity item) => new(
        item.OperationId.ToString(), item.Status, item.DraftVersion.ToString(CultureInfo.InvariantCulture),
        item.AttemptCount, item.ErrorCode, item.UpdatedAt);
    private static ManagementFailure WebsiteDesignUnavailable() => new(
        400,
        "website_design_unavailable",
        "The selected website design is not available",
        Errors: new Dictionary<string, string[]> { ["designId"] = ["website_design_unavailable"] });
    /// <summary>
    /// The unique index behind a second special-hours row on the same date. Named here so the service can
    /// tell that specific constraint apart from every other write conflict.
    /// </summary>
    private const string SpecialDateUniqueIndex = "IX_special_hours_restaurant_id_date";

    private static bool IsSpecialDateConflict(DbUpdateException exception) =>
        exception.InnerException is Npgsql.PostgresException { SqlState: "23505" } postgres &&
        string.Equals(postgres.ConstraintName, SpecialDateUniqueIndex, StringComparison.Ordinal);

    private static ManagementFailure SpecialDateDuplicate() => new(
        409,
        "special_date_duplicate",
        "Special hours already exist for that date",
        Errors: new Dictionary<string, string[]> { ["date"] = ["special_date_duplicate"] });
    private static ManagementFailure PublicationRetrySuperseded() => new(
        409,
        "publication_retry_superseded",
        "This publication was superseded by newer restaurant changes; reload before retrying");
    private static ManagementFailure NotFound() => new(404, "admin_resource_not_found", "Resource not found");
}

public static class PublicationOrdering
{
    public const string SupersededErrorCode = "publication_superseded";

    /// <summary>
    /// Written once a publication has burned <see cref="PublicationDispatcherOptions.MaxAttempts"/>
    /// attempts. It is terminal to the worker: permanently invalid content stops being re-queued and the
    /// exhausted state is observable through the publication-status contract.
    /// </summary>
    public const string RetryExhaustedErrorCode = "publication_retry_exhausted";

    /// <summary>The transient failure code the worker retries automatically inside its attempt budget.</summary>
    public const string DispatchFailedErrorCode = "publication_dispatch_failed";

    public static bool IsSuperseded(
        long operationDraftVersion,
        long restaurantDraftVersion,
        long? currentPublicationVersion) =>
        restaurantDraftVersion > operationDraftVersion ||
        currentPublicationVersion > operationDraftVersion;

    internal static async Task<long> LockRestaurantDraftVersionAsync(
        MenuDbContext dbContext,
        Guid restaurantId,
        CancellationToken cancellationToken)
    {
        var versions = await dbContext.Database.SqlQuery<long>(
                $"SELECT draft_version AS \"Value\" FROM restaurants WHERE id = {restaurantId} FOR UPDATE")
            .ToListAsync(cancellationToken);
        return versions.Single();
    }
}

public interface IPublicationFailurePolicy
{
    bool ShouldFail(Guid operationId);
}

public sealed class NeverFailPublicationPolicy : IPublicationFailurePolicy
{
    public bool ShouldFail(Guid operationId) => false;
}

public interface IInProcessPublicationDispatcher
{
    Task DispatchAsync(Guid operationId, CancellationToken cancellationToken);
}

public sealed class PublicationDispatcherOptions
{
    public const string SectionName = "PublicationDispatcher";
    public bool Enabled { get; init; } = true;
    public TimeSpan PollInterval { get; init; } = TimeSpan.FromSeconds(2);
    public TimeSpan ClaimLease { get; init; } = TimeSpan.FromSeconds(30);
    public int BatchSize { get; init; } = 20;

    /// <summary>
    /// How long a freshly written outbox row waits before the worker may claim it. The default of zero
    /// keeps publication immediate: the mutation dispatches inline post-commit so a saved change is
    /// visible on the public site straight away (PR-24 Task 11). Any positive value hands timing to
    /// <see cref="PublicationOutboxWorker"/> instead, and the mutation response then reports
    /// <c>pending</c> rather than <c>succeeded</c>.
    /// </summary>
    public TimeSpan PublicationDelay { get; init; } = TimeSpan.Zero;

    /// <summary>
    /// Total attempts a single publication may consume before the worker gives up on it and writes
    /// <see cref="PublicationOrdering.RetryExhaustedErrorCode"/>. An owner can still retry by hand.
    /// </summary>
    public int MaxAttempts { get; init; } = 5;

    /// <summary>How long a failed row rests before the worker retries it automatically.</summary>
    public TimeSpan RetryBackoff { get; init; } = TimeSpan.FromSeconds(30);
}

public sealed class InProcessPublicationDispatcher(
    MenuDbContext dbContext,
    IMemoryCache cache,
    IPublicationFailurePolicy failurePolicy,
    Microsoft.Extensions.Options.IOptions<PublicationDispatcherOptions> options,
    TimeProvider timeProvider,
    ILogger<InProcessPublicationDispatcher> logger) : IInProcessPublicationDispatcher
{
    public async Task DispatchAsync(Guid operationId, CancellationToken cancellationToken)
    {
        var claimedAt = timeProvider.GetUtcNow();
        var leaseCutoff = claimedAt - options.Value.ClaimLease;
        var retryCutoff = claimedAt - options.Value.RetryBackoff;
        var maxAttempts = options.Value.MaxAttempts;
        dbContext.ChangeTracker.Clear();

        // A failed row is claimable again once it has rested for the backoff and still has attempts left.
        // Superseded and exhausted rows are terminal: re-claiming them would only burn the attempt budget.
        var claimed = await dbContext.PublicationOutbox
            .Where(item => item.OperationId == operationId &&
                (item.Status == PublicationStatuses.Pending ||
                 item.Status == PublicationStatuses.Processing && item.UpdatedAt <= leaseCutoff ||
                 item.Status == PublicationStatuses.Failed &&
                     item.ErrorCode != PublicationOrdering.SupersededErrorCode &&
                     item.ErrorCode != PublicationOrdering.RetryExhaustedErrorCode &&
                     item.AttemptCount < maxAttempts &&
                     item.UpdatedAt <= retryCutoff))
            .ExecuteUpdateAsync(setters => setters
                .SetProperty(item => item.Status, PublicationStatuses.Processing)
                .SetProperty(item => item.AttemptCount, item => item.AttemptCount + 1)
                .SetProperty(item => item.UpdatedAt, claimedAt), cancellationToken);
        if (claimed == 0)
        {
            return;
        }

        var claimedState = await dbContext.PublicationOutbox.AsNoTracking()
            .Where(item => item.OperationId == operationId)
            .Select(item => new { item.RestaurantId, item.DraftVersion, item.AttemptCount })
            .SingleOrDefaultAsync(cancellationToken);
        if (claimedState is null)
        {
            return;
        }
        var elapsed = System.Diagnostics.Stopwatch.StartNew();
        logger.LogInformation(
            "Publication operation {OperationId} claimed for restaurant {RestaurantId} at draft version {DraftVersion} on attempt {AttemptCount}.",
            operationId, claimedState.RestaurantId, claimedState.DraftVersion, claimedState.AttemptCount);

        try
        {
            await using var transaction = await dbContext.Database.BeginTransactionAsync(cancellationToken);
            var restaurantId = claimedState.RestaurantId;
            var restaurantDraftVersion = await PublicationOrdering.LockRestaurantDraftVersionAsync(
                dbContext, restaurantId, cancellationToken);
            dbContext.ChangeTracker.Clear();
            var outbox = await dbContext.PublicationOutbox.SingleOrDefaultAsync(
                item => item.OperationId == operationId, cancellationToken);
            if (outbox is null || outbox.Status != PublicationStatuses.Processing)
            {
                return;
            }
            var currentPublicationVersion = await dbContext.Publications.AsNoTracking()
                .Where(item => item.RestaurantId == outbox.RestaurantId && item.IsCurrent)
                .Select(item => (long?)item.Version)
                .SingleOrDefaultAsync(cancellationToken);
            if (PublicationOrdering.IsSuperseded(
                    outbox.DraftVersion, restaurantDraftVersion, currentPublicationVersion))
            {
                var supersededAt = timeProvider.GetUtcNow();
                outbox.Status = PublicationStatuses.Failed;
                outbox.ErrorCode = PublicationOrdering.SupersededErrorCode;
                outbox.CompletedAt = supersededAt;
                outbox.UpdatedAt = supersededAt;
                await dbContext.SaveChangesAsync(cancellationToken);
                await transaction.CommitAsync(cancellationToken);
                logger.LogInformation(
                    "Publication operation {OperationId} for restaurant {RestaurantId} was ignored because draft version {DraftVersion} was superseded on attempt {AttemptCount} after {ElapsedMilliseconds} ms.",
                    operationId, outbox.RestaurantId, outbox.DraftVersion, outbox.AttemptCount,
                    elapsed.Elapsed.TotalMilliseconds);
                return;
            }
            if (failurePolicy.ShouldFail(operationId))
            {
                throw new InvalidOperationException("Injected publication failure.");
            }

            var oldVersion = currentPublicationVersion;
            await dbContext.Publications
                .Where(item => item.RestaurantId == outbox.RestaurantId && item.IsCurrent)
                .ExecuteUpdateAsync(setters => setters.SetProperty(item => item.IsCurrent, false), cancellationToken);
            var publication = await dbContext.Publications.SingleOrDefaultAsync(
                item => item.OperationId == operationId, cancellationToken);
            if (publication is null)
            {
                publication = new PublicationEntity
                {
                    Id = Guid.NewGuid(),
                    OperationId = operationId,
                    RestaurantId = outbox.RestaurantId,
                    Version = outbox.DraftVersion,
                    SnapshotJson = outbox.DraftSnapshotJson,
                    IsCurrent = true,
                    PublishedAt = timeProvider.GetUtcNow()
                };
                dbContext.Publications.Add(publication);
            }
            else
            {
                publication.IsCurrent = true;
            }
            outbox.Status = PublicationStatuses.Succeeded;
            outbox.ErrorCode = null;
            outbox.CompletedAt = timeProvider.GetUtcNow();
            outbox.UpdatedAt = outbox.CompletedAt.Value;
            await dbContext.SaveChangesAsync(cancellationToken);
            await transaction.CommitAsync(cancellationToken);
            if (oldVersion is not null)
            {
                cache.Remove($"public-menu:{outbox.RestaurantId:N}:{oldVersion.Value}");
            }
            logger.LogInformation(
                "Publication operation {OperationId} published restaurant {RestaurantId} at draft version {DraftVersion} on attempt {AttemptCount} in {ElapsedMilliseconds} ms.",
                operationId, outbox.RestaurantId, outbox.DraftVersion, outbox.AttemptCount,
                elapsed.Elapsed.TotalMilliseconds);
        }
        catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested)
        {
            throw;
        }
        catch (Exception exception)
        {
            dbContext.ChangeTracker.Clear();
            var failed = await dbContext.PublicationOutbox.SingleOrDefaultAsync(item => item.OperationId == operationId, cancellationToken);
            var errorCode = PublicationOrdering.DispatchFailedErrorCode;
            if (failed is not null && failed.Status == PublicationStatuses.Processing)
            {
                // AttemptCount was already incremented by the claim, so this compares attempts consumed
                // against the budget: the last permitted attempt lands on the terminal code, not on a
                // transient one the worker would keep re-queuing.
                var failedAt = timeProvider.GetUtcNow();
                var exhausted = failed.AttemptCount >= maxAttempts;
                errorCode = exhausted
                    ? PublicationOrdering.RetryExhaustedErrorCode
                    : PublicationOrdering.DispatchFailedErrorCode;
                failed.Status = PublicationStatuses.Failed;
                failed.ErrorCode = errorCode;
                failed.UpdatedAt = failedAt;
                if (exhausted)
                {
                    failed.CompletedAt = failedAt;
                }
                await dbContext.SaveChangesAsync(cancellationToken);
            }
            logger.LogWarning(
                exception,
                "Publication operation {OperationId} for restaurant {RestaurantId} failed on attempt {AttemptCount} after {ElapsedMilliseconds} ms with safe code {ErrorCode}.",
                operationId, claimedState.RestaurantId, failed?.AttemptCount ?? claimedState.AttemptCount,
                elapsed.Elapsed.TotalMilliseconds, errorCode);
        }
    }
}

public sealed class PublicationOutboxWorker(
    IServiceScopeFactory scopeFactory,
    Microsoft.Extensions.Options.IOptions<PublicationDispatcherOptions> options,
    TimeProvider timeProvider,
    ILogger<PublicationOutboxWorker> logger) : BackgroundService
{
    private bool migrationWaitLogged;

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        if (!options.Value.Enabled)
        {
            return;
        }
        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                await DrainAsync(stoppingToken);
            }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
            {
                return;
            }
            catch (Exception exception)
            {
                logger.LogWarning(exception, "Publication outbox recovery pass failed; the next pass will retry safely.");
            }
            await Task.Delay(options.Value.PollInterval, timeProvider, stoppingToken);
        }
    }

    internal async Task DrainAsync(CancellationToken cancellationToken)
    {
        await using var scope = scopeFactory.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<MenuDbContext>();
        var pendingMigrations = await db.Database.GetPendingMigrationsAsync(cancellationToken);
        if (pendingMigrations.Any())
        {
            if (!migrationWaitLogged)
            {
                logger.LogInformation(
                    "Publication worker is waiting for the documented migration-before-start step to complete.");
                migrationWaitLogged = true;
            }
            return;
        }
        migrationWaitLogged = false;
        var now = timeProvider.GetUtcNow();
        var leaseCutoff = now - options.Value.ClaimLease;
        var releaseCutoff = now - options.Value.PublicationDelay;
        var retryCutoff = now - options.Value.RetryBackoff;
        var maxAttempts = options.Value.MaxAttempts;

        // Three recoverable shapes: a pending row whose configured publication delay has elapsed, a
        // processing row whose claim lease expired, and a failed row that is still inside its attempt
        // budget and has rested for the backoff. Superseded and exhausted rows are deliberately terminal.
        var operationIds = await db.PublicationOutbox.AsNoTracking()
            .Where(item =>
                item.Status == PublicationStatuses.Pending && item.CreatedAt <= releaseCutoff ||
                item.Status == PublicationStatuses.Processing && item.UpdatedAt <= leaseCutoff ||
                item.Status == PublicationStatuses.Failed &&
                    item.ErrorCode != PublicationOrdering.SupersededErrorCode &&
                    item.ErrorCode != PublicationOrdering.RetryExhaustedErrorCode &&
                    item.AttemptCount < maxAttempts &&
                    item.UpdatedAt <= retryCutoff)
            .OrderBy(item => item.CreatedAt).ThenBy(item => item.OperationId)
            .Select(item => item.OperationId)
            .Take(options.Value.BatchSize)
            .ToArrayAsync(cancellationToken);
        var dispatcher = scope.ServiceProvider.GetRequiredService<IInProcessPublicationDispatcher>();
        foreach (var operationId in operationIds)
        {
            await dispatcher.DispatchAsync(operationId, cancellationToken);
        }
    }
}

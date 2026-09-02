using System.Net;
using System.Net.Http.Json;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using OmniRest.Api.Data;
using OmniRest.Api.Infrastructure;
using OmniRest.Api.Restaurants;

namespace OmniRest.Api.Tests.Integration;

/// <summary>
/// Automatic publication retry (PR-25). Every test here runs the outbox worker, which is why they live in
/// their own file: <see cref="PostgresFixture"/> deliberately disables the worker so that
/// <see cref="AdminRestaurantApiTests"/> can assert exact attempt counts, and each test below scopes its own
/// <c>PublicationDispatcher:*</c> overrides rather than moving that default.
/// <para>
/// The stake is that this is the only code path that can move a live restaurant's public site backwards: a
/// stale failed operation that the worker retries after a newer edit has already published would republish
/// an older snapshot over a newer one.
/// </para>
/// </summary>
[Collection(PostgresCollection.Name)]
public sealed class PublicationRetryApiTests(PostgresFixture postgres)
{
    private const string Email = "retry-manager@example.test";

    /// <summary>
    /// The worker, not a hand-driven <c>RetryPublicationAsync</c> call, carries a transiently failed
    /// publication to <c>succeeded</c> once the fault clears — and leaves exactly one current publication
    /// row behind rather than a second row racing the first.
    /// </summary>
    [Fact]
    public async Task TheOutboxWorkerAutomaticallyRepublishesAFailedOperationOnceTheTransientFaultClears()
    {
        var failure = new ScopedFailurePolicy { FailEverything = true };
        using var baseFactory = postgres.CreateFactory();
        using var factory = CreateWorkerFactory(baseFactory, failure, builder =>
        {
            builder.UseSetting("PublicationDispatcher:RetryBackoff", "00:00:00.500");
            builder.UseSetting("PublicationDispatcher:MaxAttempts", "100");
        });
        await postgres.RecreateLatestAndSeedAsync(baseFactory);
        await OwnerApiHarness.CreateOwnerAsync(baseFactory, GuardedSampleDataSeeder.OrdinaryRestaurantId, Email);
        using var client = OwnerApiHarness.CreateSecureClient(factory);
        await OwnerApiHarness.LoginAsync(client, Email);

        var saved = await SaveProfileAsync(client, "Worker Retried Name", await ReadDraftETagAsync(client));
        Assert.NotEqual(PublicationStatuses.Succeeded, saved.Publication.Status);
        var operationId = Guid.Parse(saved.Publication.OperationId);

        var failed = await WaitForFailedDispatchAsync(factory, operationId);
        Assert.True(failed.AttemptCount >= 1);

        failure.FailEverything = false;

        var settled = await WaitForOutboxAsync(
            factory, operationId, item => item.Status == PublicationStatuses.Succeeded);
        Assert.Null(settled.ErrorCode);
        Assert.NotNull(settled.CompletedAt);
        Assert.True(settled.AttemptCount >= 2, $"Expected a retried attempt but the row was on attempt {settled.AttemptCount}.");

        await using (var scope = factory.Services.CreateAsyncScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<MenuDbContext>();
            var publications = await db.Publications.AsNoTracking()
                .Where(item => item.RestaurantId == GuardedSampleDataSeeder.OrdinaryRestaurantId)
                .ToArrayAsync();
            var current = Assert.Single(publications, item => item.IsCurrent);
            Assert.Equal(operationId, current.OperationId);
            Assert.Equal(long.Parse(saved.Publication.DraftVersion), current.Version);
            Assert.Single(publications, item => item.OperationId == operationId);
        }

        using var publicClient = CreatePublicClient(factory);
        var published = await publicClient.GetFromJsonAsync<PublicRestaurantResponse>("/api/v1/public/restaurant");
        Assert.Equal("Worker Retried Name", published!.Name);
        Assert.Equal(saved.Publication.DraftVersion, published.PublicationVersion);
    }

    /// <summary>
    /// The rollback guard. A publication that failed before a newer edit published must retire itself as
    /// <c>publication_superseded</c> when the worker re-claims it, never overwrite the newer publication
    /// with its own older snapshot, and never be re-claimed again afterwards.
    /// </summary>
    [Fact]
    public async Task AStaleFailedPublicationRetiresAsSupersededAndNeverRollsBackTheNewerPublication()
    {
        var failure = new ScopedFailurePolicy { FailEverything = true };
        using var baseFactory = postgres.CreateFactory();
        using var factory = CreateWorkerFactory(baseFactory, failure, builder =>
        {
            builder.UseSetting("PublicationDispatcher:RetryBackoff", "00:00:01");
            builder.UseSetting("PublicationDispatcher:MaxAttempts", "100");
        });
        await postgres.RecreateLatestAndSeedAsync(baseFactory);
        await OwnerApiHarness.CreateOwnerAsync(baseFactory, GuardedSampleDataSeeder.OrdinaryRestaurantId, Email);
        using var client = OwnerApiHarness.CreateSecureClient(factory);
        await OwnerApiHarness.LoginAsync(client, Email);

        var stale = await SaveProfileAsync(client, "Stale Losing Edit", await ReadDraftETagAsync(client));
        Assert.NotEqual(PublicationStatuses.Succeeded, stale.Publication.Status);
        var staleOperationId = Guid.Parse(stale.Publication.OperationId);

        // Pin the failure to the stale operation before releasing everything else, so the worker can never
        // win a race and publish the older snapshot in the window before the newer edit lands.
        failure.FailOnly(staleOperationId);
        await WaitForFailedDispatchAsync(factory, staleOperationId);

        var winner = await SaveProfileAsync(client, "Newer Winning Edit", stale.Restaurant.ETag);
        Assert.Equal(PublicationStatuses.Succeeded, winner.Publication.Status);
        var winnerOperationId = Guid.Parse(winner.Publication.OperationId);
        Assert.True(long.Parse(winner.Publication.DraftVersion) > long.Parse(stale.Publication.DraftVersion));

        var retired = await WaitForOutboxAsync(
            factory, staleOperationId, item => item.ErrorCode == PublicationOrdering.SupersededErrorCode);
        Assert.Equal(PublicationStatuses.Failed, retired.Status);
        Assert.NotNull(retired.CompletedAt);
        var attemptsWhenRetired = retired.AttemptCount;

        await AssertPublicSiteIsAsync(factory, winner, "Newer Winning Edit");

        await using (var scope = factory.Services.CreateAsyncScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<MenuDbContext>();
            var publications = await db.Publications.AsNoTracking()
                .Where(item => item.RestaurantId == GuardedSampleDataSeeder.OrdinaryRestaurantId)
                .ToArrayAsync();
            Assert.DoesNotContain(publications, item => item.OperationId == staleOperationId);
            var current = Assert.Single(publications, item => item.IsCurrent);
            Assert.Equal(winnerOperationId, current.OperationId);
            Assert.Equal(long.Parse(winner.Publication.DraftVersion), current.Version);
        }

        // Superseded is terminal: several further poll intervals must not burn another attempt, because a
        // row the worker keeps re-claiming is a row that keeps re-deciding whether to roll the site back.
        await Task.Delay(TimeSpan.FromSeconds(2));
        var stillRetired = await ReadOutboxAsync(factory, staleOperationId);
        Assert.Equal(PublicationOrdering.SupersededErrorCode, stillRetired.ErrorCode);
        Assert.Equal(attemptsWhenRetired, stillRetired.AttemptCount);
        await AssertPublicSiteIsAsync(factory, winner, "Newer Winning Edit");
    }

    /// <summary>
    /// A permanently failing publication burns its budget and then stops: it lands on
    /// <c>publication_retry_exhausted</c> at exactly <c>MaxAttempts</c> attempts and the worker never claims
    /// it again, so a poison row cannot spin the worker forever.
    /// </summary>
    [Fact]
    public async Task PermanentFailuresStopBeingReclaimedOnceTheAttemptBudgetIsExhausted()
    {
        var failure = new ScopedFailurePolicy { FailEverything = true };
        using var baseFactory = postgres.CreateFactory();
        using var factory = CreateWorkerFactory(baseFactory, failure, builder =>
        {
            builder.UseSetting("PublicationDispatcher:RetryBackoff", "00:00:00");
            builder.UseSetting("PublicationDispatcher:MaxAttempts", "3");
        });
        await postgres.RecreateLatestAndSeedAsync(baseFactory);
        await OwnerApiHarness.CreateOwnerAsync(baseFactory, GuardedSampleDataSeeder.OrdinaryRestaurantId, Email);
        using var client = OwnerApiHarness.CreateSecureClient(factory);
        await OwnerApiHarness.LoginAsync(client, Email);

        // The zero backoff means the worker may already have re-claimed the row by the time the mutation
        // response is written, so only the fact that it did not publish is asserted here.
        var saved = await SaveProfileAsync(client, "Never Publishes", await ReadDraftETagAsync(client));
        Assert.NotEqual(PublicationStatuses.Succeeded, saved.Publication.Status);
        var operationId = Guid.Parse(saved.Publication.OperationId);

        var exhausted = await WaitForOutboxAsync(
            factory, operationId, item => item.ErrorCode == PublicationOrdering.RetryExhaustedErrorCode);
        Assert.Equal(PublicationStatuses.Failed, exhausted.Status);
        Assert.Equal(3, exhausted.AttemptCount);
        Assert.NotNull(exhausted.CompletedAt);

        // Many poll intervals later the attempt count must be unmoved: exhausted is terminal to the worker
        // even though the backoff is zero and the row is otherwise the oldest claimable candidate.
        await Task.Delay(TimeSpan.FromSeconds(2));
        var stillExhausted = await ReadOutboxAsync(factory, operationId);
        Assert.Equal(PublicationOrdering.RetryExhaustedErrorCode, stillExhausted.ErrorCode);
        Assert.Equal(3, stillExhausted.AttemptCount);

        await using (var scope = factory.Services.CreateAsyncScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<MenuDbContext>();
            var publications = await db.Publications.AsNoTracking()
                .Where(item => item.RestaurantId == GuardedSampleDataSeeder.OrdinaryRestaurantId)
                .ToArrayAsync();
            Assert.DoesNotContain(publications, item => item.OperationId == operationId);
            Assert.Single(publications, item => item.IsCurrent);
        }

        using var publicClient = CreatePublicClient(factory);
        var published = await publicClient.GetFromJsonAsync<PublicRestaurantResponse>("/api/v1/public/restaurant");
        Assert.Equal("Prairie Table", published!.Name);
    }

    /// <summary>
    /// The backoff gate, driven through the <see cref="TimeProvider"/> the worker already takes so that a
    /// ten-minute backoff costs no wall-clock time: a freshly failed row is passed over while the backoff is
    /// outstanding and claimed on the first pass after it elapses.
    /// </summary>
    [Fact]
    public async Task AFreshlyFailedPublicationIsNotReclaimedUntilTheRetryBackoffHasElapsed()
    {
        var failure = new ScopedFailurePolicy { FailEverything = true };
        var time = new OffsetTimeProvider();
        using var baseFactory = postgres.CreateFactory();
        using var factory = CreateWorkerFactory(
            baseFactory,
            failure,
            builder =>
            {
                builder.UseSetting("PublicationDispatcher:RetryBackoff", "00:10:00");
                builder.UseSetting("PublicationDispatcher:MaxAttempts", "100");
            },
            time);
        await postgres.RecreateLatestAndSeedAsync(baseFactory);
        await OwnerApiHarness.CreateOwnerAsync(baseFactory, GuardedSampleDataSeeder.OrdinaryRestaurantId, Email);
        using var client = OwnerApiHarness.CreateSecureClient(factory);
        await OwnerApiHarness.LoginAsync(client, Email);

        var saved = await SaveProfileAsync(client, "Waiting On Backoff", await ReadDraftETagAsync(client));
        Assert.NotEqual(PublicationStatuses.Succeeded, saved.Publication.Status);
        var operationId = Guid.Parse(saved.Publication.OperationId);
        Assert.Equal(1, (await WaitForFailedDispatchAsync(factory, operationId)).AttemptCount);

        // Many poll intervals of real time, but no provider time: the row must still be on its first attempt.
        await Task.Delay(TimeSpan.FromSeconds(1));
        var beforeBackoff = await ReadOutboxAsync(factory, operationId);
        Assert.Equal(1, beforeBackoff.AttemptCount);
        Assert.Equal(PublicationStatuses.Failed, beforeBackoff.Status);
        Assert.Equal(PublicationOrdering.DispatchFailedErrorCode, beforeBackoff.ErrorCode);

        time.Offset = TimeSpan.FromMinutes(11);

        // Settling matters, not merely claiming: the claim bumps the attempt count while the row is still
        // "processing", so the assertions below wait for the retry to have finished failing.
        var reclaimed = await WaitForOutboxAsync(
            factory,
            operationId,
            item => item.AttemptCount >= 2 && item.Status == PublicationStatuses.Failed);
        Assert.Equal(2, reclaimed.AttemptCount);
        Assert.Equal(PublicationOrdering.DispatchFailedErrorCode, reclaimed.ErrorCode);

        // The retry reset the clock on the row, so a third claim waits out a fresh backoff too.
        await Task.Delay(TimeSpan.FromSeconds(1));
        Assert.Equal(2, (await ReadOutboxAsync(factory, operationId)).AttemptCount);
    }

    /// <summary>
    /// PR-25 timing: a non-zero <c>PublicationDelay</c> hands publication to the worker, so a save reports
    /// <c>pending</c> and the public site keeps serving the previous snapshot until the delay elapses — at
    /// which point the worker flips it, with no owner action at all.
    /// </summary>
    [Fact]
    public async Task ANonZeroPublicationDelayLeavesTheSavePendingAndThePublicSiteOnTheOldContent()
    {
        var time = new OffsetTimeProvider();
        using var baseFactory = postgres.CreateFactory();
        using var factory = CreateWorkerFactory(
            baseFactory,
            new ScopedFailurePolicy(),
            builder => builder.UseSetting("PublicationDispatcher:PublicationDelay", "01:00:00"),
            time);
        await postgres.RecreateLatestAndSeedAsync(baseFactory);
        await OwnerApiHarness.CreateOwnerAsync(baseFactory, GuardedSampleDataSeeder.OrdinaryRestaurantId, Email);
        using var client = OwnerApiHarness.CreateSecureClient(factory);
        await OwnerApiHarness.LoginAsync(client, Email);

        var saved = await SaveProfileAsync(client, "Delayed Publication Name", await ReadDraftETagAsync(client));
        Assert.Equal(PublicationStatuses.Pending, saved.Publication.Status);
        Assert.Equal(0, saved.Publication.AttemptCount);
        Assert.Null(saved.Publication.ErrorCode);
        var operationId = Guid.Parse(saved.Publication.OperationId);

        // The draft moved but nothing published: the public site is still on the seeded snapshot.
        using var publicClient = CreatePublicClient(factory);
        var beforeDelay = await publicClient.GetFromJsonAsync<PublicRestaurantResponse>("/api/v1/public/restaurant");
        Assert.Equal("Prairie Table", beforeDelay!.Name);
        Assert.NotEqual(saved.Publication.DraftVersion, beforeDelay.PublicationVersion);
        Assert.Equal("Delayed Publication Name", saved.Restaurant.Name);

        await Task.Delay(TimeSpan.FromSeconds(1));
        Assert.Equal(PublicationStatuses.Pending, (await ReadOutboxAsync(factory, operationId)).Status);

        time.Offset = TimeSpan.FromHours(2);

        var released = await WaitForOutboxAsync(
            factory, operationId, item => item.Status == PublicationStatuses.Succeeded);
        Assert.Equal(1, released.AttemptCount);
        Assert.Null(released.ErrorCode);

        var afterDelay = await publicClient.GetFromJsonAsync<PublicRestaurantResponse>("/api/v1/public/restaurant");
        Assert.Equal("Delayed Publication Name", afterDelay!.Name);
        Assert.Equal(saved.Publication.DraftVersion, afterDelay.PublicationVersion);
    }

    private static WebApplicationFactory<Program> CreateWorkerFactory(
        MenuApiFactory baseFactory,
        IPublicationFailurePolicy failurePolicy,
        Action<Microsoft.AspNetCore.Hosting.IWebHostBuilder> configure,
        TimeProvider? timeProvider = null) => baseFactory.WithWebHostBuilder(builder =>
    {
        builder.UseSetting("PublicationDispatcher:Enabled", "true");
        builder.UseSetting("PublicationDispatcher:PollInterval", "00:00:00.050");
        configure(builder);
        builder.ConfigureServices(services =>
        {
            services.RemoveAll<IPublicationFailurePolicy>();
            services.AddSingleton<IPublicationFailurePolicy>(failurePolicy);
            if (timeProvider is not null)
            {
                services.RemoveAll<TimeProvider>();
                services.AddSingleton<TimeProvider>(timeProvider);
            }
        });
    });

    private static HttpClient CreatePublicClient(WebApplicationFactory<Program> factory)
    {
        var client = factory.CreateClient();
        client.DefaultRequestHeaders.Host = "menu.localhost";
        return client;
    }

    private static async Task<string> ReadDraftETagAsync(HttpClient client) =>
        (await client.GetFromJsonAsync<AdminRestaurantResponse>("/api/v1/admin/restaurant"))!.ETag;

    private static async Task<AdminMutationResponse> SaveProfileAsync(HttpClient client, string name, string etag)
    {
        var token = await OwnerApiHarness.GetAntiforgeryAsync(client);
        using var response = await OwnerApiHarness.SendAsync(
            client,
            HttpMethod.Put,
            "/api/v1/admin/restaurant/profile",
            new UpdateRestaurantProfileRequest(
                name,
                "Seasonal local food",
                "+12045550123",
                "+1 204-555-0123",
                "hello@example.test",
                "America/Winnipeg",
                new AdminAddressRequest("1 Main Street", null, "Winnipeg", "MB", "R3C 0V8", "CA", 49.8951m, -97.1384m)),
            token,
            etag);
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        return await OwnerApiHarness.ExpectOkAsync<AdminMutationResponse>(response);
    }

    private static async Task AssertPublicSiteIsAsync(
        WebApplicationFactory<Program> factory, AdminMutationResponse expected, string expectedName)
    {
        using var publicClient = CreatePublicClient(factory);
        var published = await publicClient.GetFromJsonAsync<PublicRestaurantResponse>("/api/v1/public/restaurant");
        Assert.Equal(expectedName, published!.Name);
        Assert.Equal(expected.Publication.DraftVersion, published.PublicationVersion);
    }

    private static async Task<PublicationOutboxEntity> ReadOutboxAsync(
        WebApplicationFactory<Program> factory, Guid operationId)
    {
        await using var scope = factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<MenuDbContext>();
        return await db.PublicationOutbox.AsNoTracking().SingleAsync(item => item.OperationId == operationId);
    }

    /// <summary>
    /// Settles on the transiently failed state. With the worker running and no publication delay, either the
    /// inline post-commit dispatch or the worker's first pass may win the claim, so the mutation response's
    /// own status is a race; the row reaching <c>failed</c> is not.
    /// </summary>
    private static Task<PublicationOutboxEntity> WaitForFailedDispatchAsync(
        WebApplicationFactory<Program> factory, Guid operationId) => WaitForOutboxAsync(
        factory,
        operationId,
        item => item.Status == PublicationStatuses.Failed &&
            item.ErrorCode == PublicationOrdering.DispatchFailedErrorCode);

    private static async Task<PublicationOutboxEntity> WaitForOutboxAsync(
        WebApplicationFactory<Program> factory,
        Guid operationId,
        Func<PublicationOutboxEntity, bool> settled)
    {
        PublicationOutboxEntity? row = null;
        for (var attempt = 0; attempt < 200; attempt++)
        {
            row = await ReadOutboxAsync(factory, operationId);
            if (settled(row))
            {
                return row;
            }
            await Task.Delay(50);
        }
        Assert.Fail(
            $"The outbox row never settled: status {row?.Status}, error {row?.ErrorCode}, " +
            $"attempt {row?.AttemptCount}.");
        return row!;
    }

    /// <summary>
    /// Fails publication for a chosen set of operations. <see cref="FailEverything"/> covers the window
    /// before an operation id is known; <see cref="FailOnly"/> then pins the failure to that one operation so
    /// a later edit can publish normally while the earlier one stays permanently broken.
    /// </summary>
    private sealed class ScopedFailurePolicy : IPublicationFailurePolicy
    {
        private readonly HashSet<Guid> permanent = [];
        private volatile bool failEverything;

        public bool FailEverything
        {
            get => failEverything;
            set => failEverything = value;
        }

        public void FailOnly(Guid operationId)
        {
            lock (permanent)
            {
                permanent.Add(operationId);
            }
            failEverything = false;
        }

        public bool ShouldFail(Guid operationId)
        {
            if (failEverything)
            {
                return true;
            }
            lock (permanent)
            {
                return permanent.Contains(operationId);
            }
        }
    }

    /// <summary>
    /// Moves the clock the dispatcher and worker read, while leaving timers on real time so the worker's poll
    /// loop still runs. That is what lets a ten-minute backoff or a one-hour publication delay be tested in
    /// milliseconds instead of being skipped as too slow.
    /// </summary>
    private sealed class OffsetTimeProvider : TimeProvider
    {
        private long offsetTicks;

        public TimeSpan Offset
        {
            get => TimeSpan.FromTicks(Interlocked.Read(ref offsetTicks));
            set => Interlocked.Exchange(ref offsetTicks, value.Ticks);
        }

        public override DateTimeOffset GetUtcNow() => TimeProvider.System.GetUtcNow() + Offset;

        public override long GetTimestamp() => TimeProvider.System.GetTimestamp();

        public override long TimestampFrequency => TimeProvider.System.TimestampFrequency;

        public override TimeZoneInfo LocalTimeZone => TimeProvider.System.LocalTimeZone;

        public override ITimer CreateTimer(TimerCallback callback, object? state, TimeSpan dueTime, TimeSpan period) =>
            TimeProvider.System.CreateTimer(callback, state, dueTime, period);
    }
}

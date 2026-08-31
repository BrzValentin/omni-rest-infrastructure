using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;
using Npgsql;
using OmniRest.Api.Data;

namespace OmniRest.Api.Tests.Integration;

[Collection(PostgresCollection.Name)]
public sealed class MigrationTests(PostgresFixture postgres)
{
    [Fact]
    public async Task CleanDatabaseMigratesToLatestModel()
    {
        await using var context = CreateContext();
        await context.Database.EnsureDeletedAsync();
        await context.Database.MigrateAsync();

        var pending = await context.Database.GetPendingMigrationsAsync();
        Assert.Empty(pending);
        Assert.Equal(9, (await context.Database.GetAppliedMigrationsAsync()).Count());
    }

    [Fact]
    public async Task StagedUpgradeBackfillsSlugAndAvailability()
    {
        await using var context = CreateContext();
        await context.Database.EnsureDeletedAsync();
        var migrator = context.Database.GetService<IMigrator>();
        await migrator.MigrateAsync("20260731044751_Pr5MenuBrowsing");

        await using (var connection = new NpgsqlConnection(postgres.ConnectionString))
        {
            await connection.OpenAsync();
            await using var insert = new NpgsqlCommand(
                """
                INSERT INTO public.restaurants (id, name, created_at, updated_at) VALUES
                  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Legacy', now(), now());
                INSERT INTO public.menus (id, restaurant_id, name, is_active, created_at, updated_at) VALUES
                  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Legacy Menu', true, now(), now());
                INSERT INTO public.menu_categories
                  (id, restaurant_id, menu_id, name, display_order, is_active, created_at, updated_at) VALUES
                  ('cccccccc-cccc-cccc-cccc-cccccccccccc', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'Crème Soup', 0, true, now(), now());
                INSERT INTO public.dishes
                  (id, restaurant_id, menu_id, category_id, name, price, availability_status, is_active, display_order, created_at, updated_at) VALUES
                  ('dddddddd-dddd-dddd-dddd-dddddddddddd', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'cccccccc-cccc-cccc-cccc-cccccccccccc', 'Legacy Dish', 9.50, NULL, true, 0, now(), now());
                """, connection);
            await insert.ExecuteNonQueryAsync();
        }

        await migrator.MigrateAsync("20260731044752_Pr6MenuCategorySlugs");
        await migrator.MigrateAsync("20260731044753_Pr7DishAvailability");

        await using var verify = new NpgsqlConnection(postgres.ConnectionString);
        await verify.OpenAsync();
        await using var command = new NpgsqlCommand(
            "SELECT slug, availability_status FROM public.menu_categories CROSS JOIN public.dishes LIMIT 1;", verify);
        await using var reader = await command.ExecuteReaderAsync();
        Assert.True(await reader.ReadAsync());
        Assert.Equal("cr-me-soup", reader.GetString(0));
        Assert.Equal("available", reader.GetString(1));
    }

    [Fact]
    public async Task StagedUpgradeResolvesLongSlugPrefixCollisions()
    {
        await using var context = CreateContext();
        await context.Database.EnsureDeletedAsync();
        var migrator = context.Database.GetService<IMigrator>();
        await migrator.MigrateAsync("20260731044751_Pr5MenuBrowsing");

        var sharedPrefix = new string('A', 91);
        var firstName = $"{sharedPrefix} Alpha";
        var secondName = $"{sharedPrefix} Beta";
        Assert.InRange(firstName.Length, 1, 100);
        Assert.InRange(secondName.Length, 1, 100);

        await using (var connection = new NpgsqlConnection(postgres.ConnectionString))
        {
            await connection.OpenAsync();
            await using var insert = new NpgsqlCommand(
                """
                INSERT INTO public.restaurants (id, name, created_at, updated_at) VALUES
                  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Legacy', now(), now());
                INSERT INTO public.menus (id, restaurant_id, name, is_active, created_at, updated_at) VALUES
                  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Legacy Menu', true, now(), now());
                INSERT INTO public.menu_categories
                  (id, restaurant_id, menu_id, name, display_order, is_active, created_at, updated_at) VALUES
                  ('11111111-1111-1111-1111-111111111111', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', @firstName, 0, true, now(), now()),
                  ('22222222-2222-2222-2222-222222222222', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', @secondName, 1, true, now(), now());
                """, connection);
            insert.Parameters.AddWithValue("firstName", firstName);
            insert.Parameters.AddWithValue("secondName", secondName);
            await insert.ExecuteNonQueryAsync();
        }

        await migrator.MigrateAsync("20260731044752_Pr6MenuCategorySlugs");
        await migrator.MigrateAsync("20260731044753_Pr7DishAvailability");

        var slugs = new List<string>();
        await using (var connection = new NpgsqlConnection(postgres.ConnectionString))
        {
            await connection.OpenAsync();
            await using var command = new NpgsqlCommand(
                """
                SELECT slug
                FROM public.menu_categories
                WHERE menu_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'
                ORDER BY id;
                """, connection);
            await using var reader = await command.ExecuteReaderAsync();
            while (await reader.ReadAsync())
            {
                slugs.Add(reader.GetString(0));
            }
        }

        Assert.Equal(2, slugs.Count);
        Assert.Equal(new string('a', 91), slugs[0]);
        Assert.Equal($"{new string('a', 67)}-{new string('2', 32)}", slugs[1]);
        Assert.Equal(slugs.Count, slugs.Distinct(StringComparer.Ordinal).Count());
        Assert.All(slugs, slug => Assert.InRange(slug.Length, 1, 100));
        Assert.All(slugs, slug => Assert.Matches("^[a-z0-9]+(?:-[a-z0-9]+)*$", slug));
    }

    [Fact]
    public async Task PhaseThreeUpgradePreservesExistingPublicationAndBackfillsDraftVersionAndRestaurantProjection()
    {
        await using var context = CreateContext();
        await context.Database.EnsureDeletedAsync();
        var migrator = context.Database.GetService<IMigrator>();
        await migrator.MigrateAsync("20260731044753_Pr7DishAvailability");

        await using (var connection = new NpgsqlConnection(postgres.ConnectionString))
        {
            await connection.OpenAsync();
            await using var insert = new NpgsqlCommand(
                """
                INSERT INTO public.restaurants (id, name, created_at, updated_at)
                VALUES ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Preserved Restaurant', now(), now());
                INSERT INTO public.restaurant_settings
                  (restaurant_id, locale, currency, tax_display_mode, concurrency_version)
                VALUES ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'en-CA', 'CAD', 'inclusive', 1);
                INSERT INTO public.publications
                  (id, restaurant_id, version, snapshot, is_current, published_at)
                VALUES (
                  'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
                  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
                  7,
                  '{"restaurantId":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa","restaurantName":"Preserved Restaurant","locale":"en-CA","currency":"CAD","taxDisplayMode":"inclusive","taxNoticeKey":null,"publicationVersion":"7","menu":null}'::jsonb,
                  true,
                  now());
                """, connection);
            await insert.ExecuteNonQueryAsync();
        }

        await migrator.MigrateAsync();

        await using var verify = new NpgsqlConnection(postgres.ConnectionString);
        await verify.OpenAsync();
        await using var command = new NpgsqlCommand(
            """
            SELECT restaurant.draft_version,
                   settings.time_zone_id,
                   settings.website_design_id,
                   publication.snapshot #>> '{restaurant,name}'
            FROM public.restaurants AS restaurant
            JOIN public.restaurant_settings AS settings ON settings.restaurant_id = restaurant.id
            JOIN public.publications AS publication ON publication.restaurant_id = restaurant.id;
            """, verify);
        await using var reader = await command.ExecuteReaderAsync();
        Assert.True(await reader.ReadAsync());
        Assert.Equal(7, reader.GetInt64(0));
        Assert.Equal("America/Winnipeg", reader.GetString(1));
        Assert.Equal("legacy-current-v1", reader.GetString(2));
        Assert.Equal("Preserved Restaurant", reader.GetString(3));
    }

    [Fact]
    public async Task LatestUpgradeRepairsLegacyPublicationOutboxStatusConstraint()
    {
        await using var context = CreateContext();
        await context.Database.EnsureDeletedAsync();
        var migrator = context.Database.GetService<IMigrator>();
        await migrator.MigrateAsync("20260820045841_WebsiteDesignSelection");

        await using (var connection = new NpgsqlConnection(postgres.ConnectionString))
        {
            await connection.OpenAsync();
            await using var legacyConstraint = new NpgsqlCommand(
                """
                ALTER TABLE public.publication_outbox
                  DROP CONSTRAINT ck_publication_outbox_status;
                ALTER TABLE public.publication_outbox
                  ADD CONSTRAINT ck_publication_outbox_status
                  CHECK (status IN ('pending', 'succeeded', 'failed'));
                """, connection);
            await legacyConstraint.ExecuteNonQueryAsync();
        }

        await migrator.MigrateAsync();

        await using var verify = new NpgsqlConnection(postgres.ConnectionString);
        await verify.OpenAsync();
        await using var command = new NpgsqlCommand(
            """
            SELECT pg_get_constraintdef(oid)
            FROM pg_constraint
            WHERE conrelid = 'public.publication_outbox'::regclass
              AND conname = 'ck_publication_outbox_status';
            """, verify);
        var definition = Assert.IsType<string>(await command.ExecuteScalarAsync());
        Assert.Contains("'processing'", definition, StringComparison.Ordinal);
    }

    [Fact]
    public async Task PhaseSixUpgradeWidensSocialPlatformsAndAddsRestaurantIdentityColumns()
    {
        await using var context = CreateContext();
        await context.Database.EnsureDeletedAsync();
        var migrator = context.Database.GetService<IMigrator>();
        await migrator.MigrateAsync("20260827120000_Phase5RestaurantGallery");

        // A pre-Phase 6 tenant with a link on one of the originally allowed platforms must survive the upgrade.
        await using (var connection = new NpgsqlConnection(postgres.ConnectionString))
        {
            await connection.OpenAsync();
            await using var seed = new NpgsqlCommand(
                """
                INSERT INTO public.restaurants (id, name, created_at, updated_at)
                VALUES ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Legacy Social', now(), now());
                INSERT INTO public.social_links (id, restaurant_id, platform, url, concurrency_version)
                VALUES (
                  'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
                  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
                  'instagram',
                  'https://www.instagram.com/legacy',
                  1);
                """, connection);
            await seed.ExecuteNonQueryAsync();
        }

        await migrator.MigrateAsync();

        await using var verify = new NpgsqlConnection(postgres.ConnectionString);
        await verify.OpenAsync();
        await using var constraint = new NpgsqlCommand(
            """
            SELECT pg_get_constraintdef(oid)
            FROM pg_constraint
            WHERE conrelid = 'public.social_links'::regclass
              AND conname = 'ck_social_links_platform';
            """, verify);
        var definition = Assert.IsType<string>(await constraint.ExecuteScalarAsync());
        Assert.Contains("'x'", definition, StringComparison.Ordinal);
        Assert.Contains("'youtube'", definition, StringComparison.Ordinal);
        Assert.Contains("'linkedin'", definition, StringComparison.Ordinal);
        Assert.Contains("'instagram'", definition, StringComparison.Ordinal);

        await using var preserved = new NpgsqlCommand(
            "SELECT count(*) FROM public.social_links WHERE platform = 'instagram';", verify);
        Assert.Equal(1L, await preserved.ExecuteScalarAsync());

        // A widened platform now inserts, and the new identity columns accept only the allowed values.
        await using var widened = new NpgsqlCommand(
            """
            INSERT INTO public.social_links (id, restaurant_id, platform, url, concurrency_version)
            VALUES (gen_random_uuid(), 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'youtube', 'https://www.youtube.com/@legacy', 1);
            UPDATE public.restaurants
               SET restaurant_type = 'CafeOrCoffeeShop', price_range = '$$'
             WHERE id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
            """, verify);
        await widened.ExecuteNonQueryAsync();

        await using var rejectedType = new NpgsqlCommand(
            "UPDATE public.restaurants SET restaurant_type = 'Nightclub' WHERE id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';",
            verify);
        var typeFailure = await Assert.ThrowsAsync<PostgresException>(() => rejectedType.ExecuteNonQueryAsync());
        Assert.Equal("ck_restaurants_restaurant_type", typeFailure.ConstraintName);

        await using var rejectedPrice = new NpgsqlCommand(
            "UPDATE public.restaurants SET price_range = '####' WHERE id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';",
            verify);
        var priceFailure = await Assert.ThrowsAsync<PostgresException>(() => rejectedPrice.ExecuteNonQueryAsync());
        Assert.Equal("ck_restaurants_price_range", priceFailure.ConstraintName);
    }

    private MenuDbContext CreateContext()
    {
        var options = new DbContextOptionsBuilder<MenuDbContext>()
            .UseNpgsql(postgres.ConnectionString)
            .Options;
        return new MenuDbContext(options);
    }
}

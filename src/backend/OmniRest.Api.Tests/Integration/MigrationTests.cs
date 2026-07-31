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
        Assert.Equal(3, (await context.Database.GetAppliedMigrationsAsync()).Count());
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

    private MenuDbContext CreateContext()
    {
        var options = new DbContextOptionsBuilder<MenuDbContext>()
            .UseNpgsql(postgres.ConnectionString)
            .Options;
        return new MenuDbContext(options);
    }
}

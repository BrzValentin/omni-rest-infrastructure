using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using OmniRest.Api.Data;
using OmniRest.Api.Infrastructure;
using Testcontainers.PostgreSql;

namespace OmniRest.Api.Tests.Integration;

[CollectionDefinition(Name)]
public sealed class PostgresCollection : ICollectionFixture<PostgresFixture>
{
    public const string Name = "PostgreSQL 18";
}

public sealed class PostgresFixture : IAsyncLifetime
{
    private readonly PostgreSqlContainer container = new PostgreSqlBuilder("postgres:18")
        .WithDatabase("omni_rest_tests")
        .WithUsername("omni_rest")
        .WithPassword("test_only_password")
        .Build();

    public string ConnectionString => container.GetConnectionString();

    public Task InitializeAsync() => container.StartAsync();

    public Task DisposeAsync() => container.DisposeAsync().AsTask();

    public MenuApiFactory CreateFactory() => new(ConnectionString);

    public async Task RecreateLatestAndSeedAsync(MenuApiFactory factory, bool large = false)
    {
        await using var scope = factory.Services.CreateAsyncScope();
        var dbContext = scope.ServiceProvider.GetRequiredService<MenuDbContext>();
        await dbContext.Database.EnsureDeletedAsync();
        await dbContext.Database.MigrateAsync();
        var environment = scope.ServiceProvider.GetRequiredService<IWebHostEnvironment>();
        await GuardedSampleDataSeeder.SeedAsync(factory.Services, environment, large);
    }
}

public sealed class MenuApiFactory(string connectionString) : WebApplicationFactory<Program>
{
    protected override void ConfigureWebHost(IWebHostBuilder builder)
    {
        builder.UseEnvironment("Testing");
        builder.UseSetting("ConnectionStrings:MenuDatabase", connectionString);
        builder.UseSetting("PublicMenu:AllowedMediaHosts:0", "images.example.test");
        builder.UseSetting("Logging:LogLevel:Default", "Warning");
        builder.UseSetting("Logging:LogLevel:Microsoft.EntityFrameworkCore", "Warning");
    }
}

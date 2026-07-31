using Microsoft.EntityFrameworkCore;
using OmniRest.Api.Data;
using OmniRest.Api.Infrastructure;
using OmniRest.Api.Menus;
using OmniRest.Api.Modules;

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddProblemDetails();
builder.Services.AddOpenApi();
builder.Services.AddMemoryCache(options => options.SizeLimit = 64);
builder.Services.Configure<PublicMenuOptions>(builder.Configuration.GetSection(PublicMenuOptions.SectionName));
builder.Services.AddDbContext<MenuDbContext>(options =>
    options.UseNpgsql(builder.Configuration.GetConnectionString("MenuDatabase")));
builder.Services.AddScoped<IRestaurantResolver, RestaurantResolver>();
builder.Services.AddScoped<IPublicMenuReader, PublicMenuReader>();
builder.Services.AddSingleton<PublicMenuSnapshotSerializer>();
builder.Services.AddSingleton<PublicMenuProjectionBuilder>();

var app = builder.Build();

app.UseExceptionHandler();

if (app.Environment.IsDevelopment() || app.Environment.IsEnvironment("Testing"))
{
    app.MapOpenApi();
}

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

app.Run();

public partial class Program;

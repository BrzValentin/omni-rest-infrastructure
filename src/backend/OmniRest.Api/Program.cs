using OmniRest.Api.Modules;

var builder = WebApplication.CreateBuilder(args);
var app = builder.Build();

app.MapApiV1Endpoints();

app.Run();

public partial class Program;

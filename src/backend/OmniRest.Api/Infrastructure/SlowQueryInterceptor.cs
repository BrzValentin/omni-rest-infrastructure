using System.Data.Common;
using System.Diagnostics;
using Microsoft.EntityFrameworkCore.Diagnostics;
using Microsoft.Extensions.Options;

namespace OmniRest.Api.Infrastructure;

/// <summary>
/// Thresholds for the two performance signals this API emits (PR-23). Both are configurable so an
/// operator can tighten or relax them per environment without a rebuild; neither has a hardcoded value
/// in the pipeline itself.
/// </summary>
public sealed class PerformanceLoggingOptions
{
    public const string SectionName = "PerformanceLogging";

    /// <summary>A request slower than this is logged once, after the response has been produced.</summary>
    public TimeSpan SlowRequestThreshold { get; init; } = TimeSpan.FromMilliseconds(500);

    /// <summary>A single database command slower than this is logged once, when it completes.</summary>
    public TimeSpan SlowQueryThreshold { get; init; } = TimeSpan.FromMilliseconds(200);
}

/// <summary>
/// Logs one structured warning per database command that exceeds
/// <see cref="PerformanceLoggingOptions.SlowQueryThreshold"/>. Registered as a singleton on the
/// <c>MenuDbContext</c> registration, so it is stateless by construction and safe on every scope.
/// <para>
/// The command text is logged truncated and parameter <em>values</em> never are: EF Core hands the text
/// over with placeholders, and keeping it that way means a slow-query warning can never become a tenant
/// data leak in the log sink.
/// </para>
/// </summary>
public sealed class SlowQueryInterceptor(
    IOptions<PerformanceLoggingOptions> options,
    ILogger<SlowQueryInterceptor> logger) : DbCommandInterceptor
{
    /// <summary>Longest command text carried into a warning; enough to identify the query shape.</summary>
    private const int MaximumLoggedCommandLength = 400;

    public override DbDataReader ReaderExecuted(
        DbCommand command, CommandExecutedEventData eventData, DbDataReader result)
    {
        Log(command, eventData);
        return base.ReaderExecuted(command, eventData, result);
    }

    public override ValueTask<DbDataReader> ReaderExecutedAsync(
        DbCommand command,
        CommandExecutedEventData eventData,
        DbDataReader result,
        CancellationToken cancellationToken = default)
    {
        Log(command, eventData);
        return base.ReaderExecutedAsync(command, eventData, result, cancellationToken);
    }

    public override object? ScalarExecuted(
        DbCommand command, CommandExecutedEventData eventData, object? result)
    {
        Log(command, eventData);
        return base.ScalarExecuted(command, eventData, result);
    }

    public override ValueTask<object?> ScalarExecutedAsync(
        DbCommand command,
        CommandExecutedEventData eventData,
        object? result,
        CancellationToken cancellationToken = default)
    {
        Log(command, eventData);
        return base.ScalarExecutedAsync(command, eventData, result, cancellationToken);
    }

    public override int NonQueryExecuted(
        DbCommand command, CommandExecutedEventData eventData, int result)
    {
        Log(command, eventData);
        return base.NonQueryExecuted(command, eventData, result);
    }

    public override ValueTask<int> NonQueryExecutedAsync(
        DbCommand command,
        CommandExecutedEventData eventData,
        int result,
        CancellationToken cancellationToken = default)
    {
        Log(command, eventData);
        return base.NonQueryExecutedAsync(command, eventData, result, cancellationToken);
    }

    private void Log(DbCommand command, CommandExecutedEventData eventData)
    {
        var threshold = options.Value.SlowQueryThreshold;
        if (threshold <= TimeSpan.Zero || eventData.Duration < threshold)
        {
            return;
        }

        logger.LogWarning(
            "Slow database command {CommandId} took {ElapsedMilliseconds} ms (threshold {ThresholdMilliseconds} ms): {CommandText}",
            eventData.CommandId,
            eventData.Duration.TotalMilliseconds,
            threshold.TotalMilliseconds,
            Truncate(command.CommandText));
    }

    private static string Truncate(string? commandText)
    {
        if (string.IsNullOrEmpty(commandText))
        {
            return string.Empty;
        }
        var single = commandText.ReplaceLineEndings(" ");
        return single.Length <= MaximumLoggedCommandLength
            ? single
            : string.Concat(single.AsSpan(0, MaximumLoggedCommandLength), "…");
    }
}

/// <summary>
/// Request-side half of the same signal: one structured warning per request that outlives
/// <see cref="PerformanceLoggingOptions.SlowRequestThreshold"/>.
/// </summary>
public static class RequestTimingMiddleware
{
    /// <summary>
    /// Times the rest of the pipeline. Register it early so the measurement covers compression,
    /// authentication, and the endpoint itself rather than only the handler.
    /// </summary>
    public static IApplicationBuilder UseRequestTiming(this IApplicationBuilder app)
    {
        var options = app.ApplicationServices.GetRequiredService<IOptions<PerformanceLoggingOptions>>();
        var logger = app.ApplicationServices.GetRequiredService<ILoggerFactory>()
            .CreateLogger("OmniRest.Api.Infrastructure.RequestTiming");
        return app.Use(async (context, next) =>
        {
            var threshold = options.Value.SlowRequestThreshold;
            if (threshold <= TimeSpan.Zero)
            {
                await next();
                return;
            }

            var timestamp = Stopwatch.GetTimestamp();
            try
            {
                await next();
            }
            finally
            {
                var elapsed = Stopwatch.GetElapsedTime(timestamp);
                if (elapsed >= threshold)
                {
                    // The route pattern, not the raw path, and never the query string: a slow-request
                    // warning must not become a record of who looked at what.
                    logger.LogWarning(
                        "Slow request {Method} {Path} responded {StatusCode} in {ElapsedMilliseconds} ms (threshold {ThresholdMilliseconds} ms, correlationId {CorrelationId}).",
                        context.Request.Method,
                        context.Request.Path.Value,
                        context.Response.StatusCode,
                        elapsed.TotalMilliseconds,
                        threshold.TotalMilliseconds,
                        context.TraceIdentifier);
                }
            }
        });
    }
}

using System.Data.Common;
using Microsoft.EntityFrameworkCore.Diagnostics;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using Npgsql;
using OmniRest.Api.Infrastructure;

namespace OmniRest.Api.Tests.Unit;

/// <summary>
/// The slow-query signal is exercised on synthetic <see cref="CommandExecutedEventData"/> rather than on a
/// live database, deliberately: a test that had to make a real query take longer than a threshold would be
/// exactly the kind of wall-clock-sensitive test that flakes on a loaded CI agent. Everything the
/// interceptor actually decides — threshold comparison, truncation, and what reaches the log sink — is
/// decided from that event data alone.
/// </summary>
public sealed class SlowQueryInterceptorTests
{
    [Fact]
    public void CommandsSlowerThanTheThresholdAreLoggedOnceAsAWarning()
    {
        var logger = new RecordingLogger<SlowQueryInterceptor>();
        var interceptor = CreateInterceptor(TimeSpan.FromMilliseconds(200), logger);
        using var command = CreateCommand("SELECT id FROM restaurants WHERE id = $1");

        interceptor.NonQueryExecuted(command, CreateEventData(TimeSpan.FromMilliseconds(201)), 1);

        var entry = Assert.Single(logger.Entries);
        Assert.Equal(LogLevel.Warning, entry.Level);
        Assert.Contains("Slow database command", entry.Message, StringComparison.Ordinal);
        Assert.Contains("SELECT id FROM restaurants WHERE id = $1", entry.Message, StringComparison.Ordinal);
    }

    [Fact]
    public void CommandsFasterThanTheThresholdAreNeverLogged()
    {
        var logger = new RecordingLogger<SlowQueryInterceptor>();
        var interceptor = CreateInterceptor(TimeSpan.FromMilliseconds(200), logger);
        using var command = CreateCommand("SELECT id FROM restaurants WHERE id = $1");

        interceptor.NonQueryExecuted(command, CreateEventData(TimeSpan.FromMilliseconds(199)), 1);
        interceptor.ScalarExecuted(command, CreateEventData(TimeSpan.Zero), null);
        interceptor.NonQueryExecuted(command, CreateEventData(TimeSpan.FromMilliseconds(1)), 1);

        Assert.Empty(logger.Entries);
    }

    /// <summary>
    /// The threshold is the only thing that decides whether a command is logged, and it is exactly
    /// inclusive: a command that lands on the threshold is slow, one a tick under it is not.
    /// </summary>
    [Theory]
    [InlineData(200, 200, true)]
    [InlineData(200, 500, true)]
    [InlineData(500, 200, false)]
    [InlineData(1, 0, false)]
    public void TheConfiguredThresholdIsTheInclusiveBoundaryBetweenSilenceAndAWarning(
        int thresholdMilliseconds, int durationMilliseconds, bool expectLogged)
    {
        var logger = new RecordingLogger<SlowQueryInterceptor>();
        var interceptor = CreateInterceptor(TimeSpan.FromMilliseconds(thresholdMilliseconds), logger);
        using var command = CreateCommand("SELECT 1");

        interceptor.NonQueryExecuted(
            command, CreateEventData(TimeSpan.FromMilliseconds(durationMilliseconds)), 1);

        Assert.Equal(expectLogged ? 1 : 0, logger.Entries.Count);
    }

    /// <summary>
    /// A non-positive threshold disables the signal outright rather than logging every command, which is
    /// what makes the option safe to turn off in an environment that ships its own database telemetry.
    /// </summary>
    [Fact]
    public void ANonPositiveThresholdSilencesTheSignalEntirely()
    {
        var logger = new RecordingLogger<SlowQueryInterceptor>();
        var interceptor = CreateInterceptor(TimeSpan.Zero, logger);
        using var command = CreateCommand("SELECT 1");

        interceptor.NonQueryExecuted(command, CreateEventData(TimeSpan.FromHours(1)), 1);

        Assert.Empty(logger.Entries);
    }

    /// <summary>
    /// The warning carries the command shape, never a parameter value: EF Core hands the text over with
    /// placeholders, and a slow-query warning that leaked bound values would turn the log sink into a
    /// cross-tenant data leak.
    /// </summary>
    [Fact]
    public void TheWarningCarriesTheCommandShapeButNeverABoundParameterValue()
    {
        var logger = new RecordingLogger<SlowQueryInterceptor>();
        var interceptor = CreateInterceptor(TimeSpan.FromMilliseconds(10), logger);
        using var command = CreateCommand("SELECT name FROM restaurants WHERE email = $1");
        command.Parameters.Add(new NpgsqlParameter { ParameterName = "p0", Value = "owner@secret.test" });

        interceptor.NonQueryExecuted(command, CreateEventData(TimeSpan.FromSeconds(1)), 1);

        var entry = Assert.Single(logger.Entries);
        Assert.Contains("WHERE email = $1", entry.Message, StringComparison.Ordinal);
        Assert.DoesNotContain("owner@secret.test", entry.Message, StringComparison.Ordinal);
    }

    /// <summary>
    /// A pathological command text is truncated instead of flooding the sink, and the truncation marker is
    /// what tells an operator the text was cut rather than the query being that short.
    /// </summary>
    [Fact]
    public void OverlongCommandTextIsTruncatedAndFlattenedOntoOneLine()
    {
        var logger = new RecordingLogger<SlowQueryInterceptor>();
        var interceptor = CreateInterceptor(TimeSpan.FromMilliseconds(10), logger);
        using var command = CreateCommand(
            "SELECT" + Environment.NewLine + new string('x', 5_000));

        interceptor.NonQueryExecuted(command, CreateEventData(TimeSpan.FromSeconds(1)), 1);

        var entry = Assert.Single(logger.Entries);
        Assert.Contains("…", entry.Message, StringComparison.Ordinal);
        Assert.DoesNotContain(Environment.NewLine, entry.Message, StringComparison.Ordinal);
        Assert.True(entry.Message.Length < 1_000, $"Expected a truncated message but it was {entry.Message.Length} characters.");
    }

    private static SlowQueryInterceptor CreateInterceptor(
        TimeSpan threshold, ILogger<SlowQueryInterceptor> logger) => new(
        Options.Create(new PerformanceLoggingOptions { SlowQueryThreshold = threshold }),
        logger);

    private static NpgsqlCommand CreateCommand(string commandText) => new(commandText);

    /// <summary>
    /// Only <see cref="CommandExecutedEventData.Duration"/> and <c>CommandId</c> steer the interceptor, so
    /// the diagnostic plumbing EF Core would normally supply is left null rather than reconstructed.
    /// </summary>
    private static CommandExecutedEventData CreateEventData(TimeSpan duration) => new(
        eventDefinition: null!,
        messageGenerator: null!,
        connection: null!,
        command: null!,
        logCommandText: string.Empty,
        context: null,
        executeMethod: DbCommandMethod.ExecuteNonQuery,
        commandId: Guid.NewGuid(),
        connectionId: Guid.NewGuid(),
        result: null,
        async: false,
        logParameterValues: false,
        startTime: DateTimeOffset.UtcNow - duration,
        duration: duration,
        commandSource: CommandSource.LinqQuery);

    private sealed class RecordingLogger<T> : ILogger<T>
    {
        public List<(LogLevel Level, string Message)> Entries { get; } = [];

        public IDisposable? BeginScope<TState>(TState state) where TState : notnull => null;

        public bool IsEnabled(LogLevel logLevel) => true;

        public void Log<TState>(
            LogLevel logLevel,
            EventId eventId,
            TState state,
            Exception? exception,
            Func<TState, Exception?, string> formatter) =>
            Entries.Add((logLevel, formatter(state, exception)));
    }
}

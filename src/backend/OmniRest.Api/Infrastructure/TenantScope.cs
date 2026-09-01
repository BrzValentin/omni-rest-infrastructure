namespace OmniRest.Api.Infrastructure;

/// <summary>
/// The ambient restaurant a request is acting for. <see cref="Data.MenuDbContext"/> reads this to apply
/// its global query filters, so binding it is what makes tenant isolation automatic rather than a rule
/// every query has to remember (PR-20 Task 4).
/// </summary>
/// <remarks>
/// The scope starts unbound and is deliberately inert in that state: the host resolver, the owner
/// membership lookup, the publication outbox worker, the guarded seeder, migrations, and the
/// provisioning CLI all run before or outside any tenant and must see the whole table. Everything that
/// runs <em>after</em> the tenant is known goes through <see cref="Bind"/>, and from that point the
/// filters cannot be forgotten.
/// </remarks>
public interface ITenantScope
{
    /// <summary>The bound restaurant, or <c>null</c> while the request is not acting for one.</summary>
    Guid? RestaurantId { get; }

    /// <summary>True once <see cref="Bind"/> has run and query filters are active.</summary>
    bool IsBound { get; }

    /// <summary>
    /// Binds the scope to <paramref name="restaurantId"/> for the rest of the request. Re-binding to the
    /// same restaurant is a no-op so repeated resolution stays harmless; re-binding to a different one
    /// throws, because a single request must never straddle two tenants.
    /// </summary>
    void Bind(Guid restaurantId);

    /// <summary>
    /// Temporarily lifts the tenant filter for work that is legitimately cross-tenant, restoring the
    /// previous binding on dispose. Every call site must say in a comment why it is allowed to see
    /// other tenants' rows.
    /// </summary>
    IDisposable Suppress();
}

/// <inheritdoc cref="ITenantScope"/>
public sealed class TenantScope : ITenantScope
{
    private Guid? restaurantId;

    public Guid? RestaurantId => restaurantId;

    public bool IsBound => restaurantId is not null;

    public void Bind(Guid restaurantId)
    {
        if (restaurantId == Guid.Empty)
        {
            throw new ArgumentException("The empty GUID is not a restaurant.", nameof(restaurantId));
        }

        if (this.restaurantId is { } bound && bound != restaurantId)
        {
            // A request that resolved one tenant and then bound another means resolution disagreed with
            // authorization. Failing loudly here turns a would-be data leak into a 500 the tests catch.
            throw new InvalidOperationException(
                $"The request is already bound to restaurant {bound}; it cannot also act for {restaurantId}.");
        }

        this.restaurantId = restaurantId;
    }

    public IDisposable Suppress()
    {
        var previous = restaurantId;
        restaurantId = null;
        return new Restoration(this, previous);
    }

    private sealed class Restoration(TenantScope scope, Guid? previous) : IDisposable
    {
        private bool disposed;

        public void Dispose()
        {
            if (disposed)
            {
                return;
            }

            disposed = true;
            scope.restaurantId = previous;
        }
    }
}

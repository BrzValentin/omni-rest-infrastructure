using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using OmniRest.Api.Data;

namespace OmniRest.Api.Security;

public static class OwnerProvisioning
{
    public const string PasswordEnvironmentVariable = "OMNIREST_PROVISION_PASSWORD";
    public const string ProductionProvisioningGate = "OMNIREST_ALLOW_OWNER_PROVISIONING";
    public const string ProductionAdministrationGate = "OMNIREST_ALLOW_OWNER_ADMIN";

    public static async Task ProvisionAsync(
        IServiceProvider services,
        IHostEnvironment environment,
        string email,
        Guid restaurantId,
        string displayName,
        CancellationToken cancellationToken = default)
    {
        if (environment.IsProduction() &&
            !string.Equals(Environment.GetEnvironmentVariable(ProductionProvisioningGate), "true", StringComparison.Ordinal))
        {
            throw new InvalidOperationException($"Production owner provisioning requires the controlled job gate {ProductionProvisioningGate}=true.");
        }

        var password = Environment.GetEnvironmentVariable(PasswordEnvironmentVariable);
        if (string.IsNullOrEmpty(password))
        {
            throw new InvalidOperationException($"Set {PasswordEnvironmentVariable} through a one-time secret channel.");
        }

        await using var scope = services.CreateAsyncScope();
        var dbContext = scope.ServiceProvider.GetRequiredService<MenuDbContext>();
        if (!await dbContext.Restaurants.AnyAsync(item => item.Id == restaurantId, cancellationToken))
        {
            throw new InvalidOperationException("The target restaurant does not exist.");
        }

        var userManager = scope.ServiceProvider.GetRequiredService<UserManager<OwnerUser>>();
        var normalizedEmail = email.Trim();
        if (await userManager.FindByEmailAsync(normalizedEmail) is not null)
        {
            throw new InvalidOperationException("An owner with that email already exists.");
        }

        await using var transaction = await dbContext.Database.BeginTransactionAsync(cancellationToken);
        var now = DateTimeOffset.UtcNow;
        var user = new OwnerUser
        {
            Id = Guid.NewGuid(),
            UserName = normalizedEmail,
            Email = normalizedEmail,
            EmailConfirmed = true,
            DisplayName = displayName.Trim(),
            IsActive = true,
            CreatedAt = now
        };
        var result = await userManager.CreateAsync(user, password);
        if (!result.Succeeded)
        {
            throw new InvalidOperationException($"Owner provisioning failed: {string.Join(", ", result.Errors.Select(error => error.Code))}");
        }

        dbContext.RestaurantMemberships.Add(new RestaurantMembershipEntity
        {
            Id = Guid.NewGuid(),
            UserId = user.Id,
            RestaurantId = restaurantId,
            Role = MembershipRoles.Owner,
            Status = MembershipStatuses.Active,
            CreatedAt = now,
            UpdatedAt = now
        });
        dbContext.AuditEvents.Add(new AuditEventEntity
        {
            Id = Guid.NewGuid(),
            ActorUserId = user.Id,
            RestaurantId = restaurantId,
            Action = "owner.provisioned",
            EntityType = "owner_user",
            EntityVersion = user.Id.ToString(),
            OccurredAt = now
        });
        await dbContext.SaveChangesAsync(cancellationToken);
        await transaction.CommitAsync(cancellationToken);
    }

    public static async Task RevokeMembershipAsync(
        IServiceProvider services,
        IHostEnvironment environment,
        string email,
        Guid restaurantId,
        CancellationToken cancellationToken = default)
    {
        EnsureAdministrativeGate(environment);
        await using var scope = services.CreateAsyncScope();
        var userManager = scope.ServiceProvider.GetRequiredService<UserManager<OwnerUser>>();
        var user = await userManager.FindByEmailAsync(email.Trim()) ??
            throw new InvalidOperationException("The owner account was not found.");
        var dbContext = scope.ServiceProvider.GetRequiredService<MenuDbContext>();
        var membership = await dbContext.RestaurantMemberships.SingleOrDefaultAsync(
            item => item.UserId == user.Id && item.RestaurantId == restaurantId, cancellationToken) ??
            throw new InvalidOperationException("The owner membership was not found.");
        if (membership.Status != MembershipStatuses.Revoked)
        {
            var now = DateTimeOffset.UtcNow;
            membership.Status = MembershipStatuses.Revoked;
            membership.UpdatedAt = now;
            membership.ConcurrencyVersion++;
            dbContext.AuditEvents.Add(new AuditEventEntity
            {
                Id = Guid.NewGuid(),
                ActorUserId = user.Id,
                RestaurantId = restaurantId,
                Action = "owner.membership.revoked",
                EntityType = "restaurant_membership",
                EntityVersion = membership.ConcurrencyVersion.ToString(),
                OccurredAt = now
            });
            await dbContext.SaveChangesAsync(cancellationToken);
            var stamp = await userManager.UpdateSecurityStampAsync(user);
            if (!stamp.Succeeded)
            {
                throw new InvalidOperationException("Membership was revoked, but session-stamp rotation failed; stop and investigate.");
            }
        }
    }

    public static async Task DisableOwnerAsync(
        IServiceProvider services,
        IHostEnvironment environment,
        string email,
        CancellationToken cancellationToken = default)
    {
        EnsureAdministrativeGate(environment);
        await using var scope = services.CreateAsyncScope();
        var userManager = scope.ServiceProvider.GetRequiredService<UserManager<OwnerUser>>();
        var user = await userManager.FindByEmailAsync(email.Trim()) ??
            throw new InvalidOperationException("The owner account was not found.");
        if (user.IsActive)
        {
            user.IsActive = false;
            user.DisabledAt = DateTimeOffset.UtcNow;
            var update = await userManager.UpdateAsync(user);
            if (!update.Succeeded)
            {
                throw new InvalidOperationException("Owner disable failed.");
            }
            var stamp = await userManager.UpdateSecurityStampAsync(user);
            if (!stamp.Succeeded)
            {
                throw new InvalidOperationException("Owner was disabled, but session-stamp rotation failed; stop and investigate.");
            }
        }
    }

    private static void EnsureAdministrativeGate(IHostEnvironment environment)
    {
        if (environment.IsProduction() &&
            !string.Equals(Environment.GetEnvironmentVariable(ProductionAdministrationGate), "true", StringComparison.Ordinal))
        {
            throw new InvalidOperationException($"Production owner administration requires the controlled job gate {ProductionAdministrationGate}=true.");
        }
    }
}

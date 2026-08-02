using Microsoft.AspNetCore.Identity;
using OmniRest.Api.Data;

namespace OmniRest.Api.Security;

public sealed record LoginPasswordWorkResult(bool Succeeded, bool RehashNeeded);

public interface ILoginPasswordWork
{
    LoginPasswordWorkResult Verify(OwnerUser? user, string suppliedPassword);
}

/// <summary>Performs exactly one configured Identity password verification for every syntactically valid login.</summary>
public sealed class LoginPasswordWork : ILoginPasswordWork
{
    private readonly IPasswordHasher<OwnerUser> hasher;
    private readonly OwnerUser dummyUser = new() { Id = Guid.Empty, UserName = "invalid-login@invalid" };
    private readonly string dummyHash;

    public LoginPasswordWork(IPasswordHasher<OwnerUser> hasher)
    {
        this.hasher = hasher;
        dummyHash = hasher.HashPassword(dummyUser, "Dummy-Password-Work-9!NeverAccepted");
    }

    public LoginPasswordWorkResult Verify(OwnerUser? user, string suppliedPassword)
    {
        var target = user?.PasswordHash is null ? dummyUser : user;
        var hash = user?.PasswordHash ?? dummyHash;
        var result = hasher.VerifyHashedPassword(target, hash, suppliedPassword);
        return new LoginPasswordWorkResult(
            result is PasswordVerificationResult.Success or PasswordVerificationResult.SuccessRehashNeeded,
            result == PasswordVerificationResult.SuccessRehashNeeded && user is not null);
    }
}

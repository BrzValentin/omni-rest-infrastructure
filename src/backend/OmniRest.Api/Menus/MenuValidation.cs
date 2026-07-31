using System.Globalization;
using System.Text;

namespace OmniRest.Api.Menus;

public static class MenuValidation
{
    private static readonly Uri TrustedRelativeMediaOrigin = new("https://same-origin.invalid/");

    public static string CreateSlug(string name, Guid id, ISet<string> existing)
    {
        var normalized = name.Normalize(NormalizationForm.FormD);
        var builder = new StringBuilder(normalized.Length);
        var pendingHyphen = false;

        foreach (var character in normalized)
        {
            if (CharUnicodeInfo.GetUnicodeCategory(character) == UnicodeCategory.NonSpacingMark)
            {
                continue;
            }

            if (character <= 127 && char.IsLetterOrDigit(character))
            {
                if (pendingHyphen && builder.Length > 0)
                {
                    builder.Append('-');
                }

                builder.Append(char.ToLowerInvariant(character));
                pendingHyphen = false;
            }
            else
            {
                pendingHyphen = builder.Length > 0;
            }
        }

        var baseSlug = builder.ToString().Trim('-');
        var suffix = id.ToString("N", CultureInfo.InvariantCulture)[..8];
        if (baseSlug.Length == 0)
        {
            baseSlug = $"category-{suffix}";
        }

        baseSlug = baseSlug[..Math.Min(baseSlug.Length, 91)].TrimEnd('-');
        var slug = baseSlug;
        if (existing.Contains(slug))
        {
            slug = $"{baseSlug}-{suffix}";
        }

        if (!existing.Add(slug))
        {
            throw new InvalidOperationException("Category slug collision could not be resolved deterministically.");
        }

        return slug;
    }

    public static void ValidateBadgeAssignments(IEnumerable<string> codes)
    {
        var seen = new HashSet<string>(StringComparer.Ordinal);
        foreach (var code in codes)
        {
            if (!BadgeCatalog.TryGet(code, out _))
            {
                throw new ArgumentException($"Unknown badge code '{code}'.", nameof(codes));
            }

            if (!seen.Add(code))
            {
                throw new ArgumentException($"Duplicate badge code '{code}'.", nameof(codes));
            }
        }
    }

    public static bool IsSafeMediaUrl(string value, IReadOnlySet<string> allowedHosts)
    {
        if (string.IsNullOrEmpty(value) || value.Contains('\\') || value.Any(char.IsControl))
        {
            return false;
        }

        if (value.StartsWith("/", StringComparison.Ordinal))
        {
            if (value.StartsWith("//", StringComparison.Ordinal) ||
                !Uri.TryCreate(TrustedRelativeMediaOrigin, value, out var resolved))
            {
                return false;
            }

            return resolved.Scheme == TrustedRelativeMediaOrigin.Scheme &&
                resolved.IdnHost == TrustedRelativeMediaOrigin.IdnHost &&
                resolved.Port == TrustedRelativeMediaOrigin.Port;
        }

        return Uri.TryCreate(value, UriKind.Absolute, out var uri) &&
            uri.Scheme == Uri.UriSchemeHttps &&
            uri.UserInfo.Length == 0 &&
            uri.IsDefaultPort &&
            allowedHosts.Contains(uri.IdnHost);
    }
}

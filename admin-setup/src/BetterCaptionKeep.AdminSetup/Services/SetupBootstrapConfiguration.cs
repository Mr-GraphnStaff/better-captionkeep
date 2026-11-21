using System.IO;
using System.Text.Json;

namespace BetterCaptionKeep.AdminSetup.Services;

public sealed record SetupBootstrapConfiguration(Guid PublicClientId, Guid TenantId, string Authority)
{
    public static bool TryLoad(out SetupBootstrapConfiguration? configuration)
    {
        configuration = null;
        var path = Path.Combine(AppContext.BaseDirectory, "setup-bootstrap.json");
        if (!File.Exists(path)) return false;
        return TryParse(File.ReadAllText(path), out configuration);
    }

    public static bool TryParse(string json, out SetupBootstrapConfiguration? configuration)
    {
        configuration = null;
        try
        {
            var parsed = JsonSerializer.Deserialize<SetupBootstrapConfiguration>(json, JsonSerializerOptions.Web);
            if (parsed is null || parsed.PublicClientId == Guid.Empty || parsed.TenantId == Guid.Empty) return false;
            var expectedAuthority = $"https://login.microsoftonline.com/{parsed.TenantId:D}";
            if (!Uri.TryCreate(parsed.Authority, UriKind.Absolute, out var authority)
                || !string.Equals(parsed.Authority, expectedAuthority, StringComparison.OrdinalIgnoreCase)
                || authority.Scheme != Uri.UriSchemeHttps
                || !string.Equals(authority.Host, "login.microsoftonline.com", StringComparison.OrdinalIgnoreCase)
                || authority.Port != 443
                || !string.IsNullOrEmpty(authority.UserInfo)
                || !string.IsNullOrEmpty(authority.Query)
                || !string.IsNullOrEmpty(authority.Fragment)) return false;
            configuration = parsed;
            return true;
        }
        catch (JsonException)
        {
            return false;
        }
    }
}

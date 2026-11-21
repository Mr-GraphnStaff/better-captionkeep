using System.Net.Http;
using System.Net.Http.Headers;
using System.Text.Json;
using BetterCaptionKeep.AdminSetup.Domain;
using Microsoft.Identity.Client;
using Microsoft.Identity.Client.Broker;

namespace BetterCaptionKeep.AdminSetup.Services;

public sealed class MicrosoftAdministratorSession : IAdministratorAuthenticationService, IAdministratorSessionProvider
{
    internal static readonly string[] DiscoveryScopes =
    [
        "GroupMember.Read.All"
    ];
    internal static readonly string[] ApplicationProvisioningScopes =
    [
        "Application.ReadWrite.All"
    ];

    private readonly IPublicClientApplication application;
    private readonly Func<IntPtr> parentWindow;
    private readonly HttpClient httpClient;
    private readonly Guid bootstrapClientId;
    private readonly Dictionary<string, Session> sessions = new(StringComparer.Ordinal);
    private readonly Lock sessionLock = new();

    public MicrosoftAdministratorSession(SetupBootstrapConfiguration configuration, Func<IntPtr> parentWindow, HttpClient httpClient)
    {
        this.parentWindow = parentWindow;
        this.httpClient = httpClient;
        bootstrapClientId = configuration.PublicClientId;
        var broker = new BrokerOptions(BrokerOptions.OperatingSystems.Windows)
        {
            Title = "Better CaptionKeep organization setup",
            ListOperatingSystemAccounts = true
        };
        application = PublicClientApplicationBuilder.Create(configuration.PublicClientId.ToString("D"))
            .WithAuthority(configuration.Authority)
            .WithDefaultRedirectUri()
            .WithBroker(broker)
            .Build();
    }

    public async Task<AuthenticatedAdministrator> SignInAsync(string? loginHint, CancellationToken cancellationToken)
    {
        var builder = application.AcquireTokenInteractive(DiscoveryScopes)
            .WithParentActivityOrWindow(parentWindow())
            .WithPrompt(Prompt.SelectAccount);
        if (!string.IsNullOrWhiteSpace(loginHint)) builder = builder.WithLoginHint(loginHint.Trim());
        var result = await builder.ExecuteAsync(cancellationToken);
        if (!Guid.TryParse(result.TenantId, out var tenantId) || tenantId == Guid.Empty)
            throw new InvalidOperationException("Microsoft did not return a valid organization tenant.");
        var account = result.Account ?? throw new InvalidOperationException("Microsoft did not return an administrator account.");
        var accountId = account.HomeAccountId?.Identifier;
        var userPrincipalName = account.Username;
        if (string.IsNullOrWhiteSpace(accountId) || string.IsNullOrWhiteSpace(userPrincipalName))
            throw new InvalidOperationException("Microsoft did not return a tenant-bound administrator account.");

        var tenantName = await ReadTenantNameAsync(result.AccessToken, tenantId, cancellationToken);
        var handle = Convert.ToHexString(System.Security.Cryptography.RandomNumberGenerator.GetBytes(32));
        lock (sessionLock) sessions[handle] = new(account, tenantId, accountId, result.ExpiresOn);
        return new(tenantId, accountId, userPrincipalName, tenantName, CloudEnvironment.Global, handle);
    }

    public async Task<string> AcquireAccessTokenAsync(
        AuthenticatedAdministrator administrator,
        GraphAccessPurpose purpose,
        CancellationToken cancellationToken)
    {
        Session? session;
        lock (sessionLock) sessions.TryGetValue(administrator.SessionHandle, out session);
        if (session is null || session.TenantId != administrator.TenantId || session.AccountId != administrator.AccountId)
            throw new InvalidOperationException("The administrator session does not match the reviewed tenant and account.");
        if (purpose != GraphAccessPurpose.Discovery)
            throw new InvalidOperationException("Provisioning authorization must be bound to an approved deployment.");
        var silent = await application.AcquireTokenSilent(DiscoveryScopes, session.Account).ExecuteAsync(cancellationToken);
        ValidateBoundAccount(silent, administrator);
        return silent.AccessToken;
    }

    public async Task<string> AcquireProvisioningAccessTokenAsync(
        ApprovedDeployment approvedDeployment,
        CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(approvedDeployment);
        var administrator = approvedDeployment.Plan.Administrator;
        if (!string.Equals(approvedDeployment.Digest, approvedDeployment.Plan.DigestSha256(), StringComparison.OrdinalIgnoreCase))
            throw new InvalidOperationException("Provisioning authorization does not match the approved plan digest.");
        if (!approvedDeployment.Plan.RequestedScopes.ToHashSet(StringComparer.Ordinal).SetEquals(
                DiscoveryScopes.Concat(ApplicationProvisioningScopes)))
            throw new InvalidOperationException("The approved plan permissions do not match the provisioning authorization contract.");
        Session? session;
        lock (sessionLock) sessions.TryGetValue(administrator.SessionHandle, out session);
        if (session is null || session.TenantId != administrator.TenantId || session.AccountId != administrator.AccountId)
            throw new InvalidOperationException("The administrator session does not match the approved tenant and account.");
        try
        {
            var silent = await application.AcquireTokenSilent(ApplicationProvisioningScopes, session.Account).ExecuteAsync(cancellationToken);
            ValidateProvisioningResult(silent, administrator);
            lock (sessionLock) sessions[administrator.SessionHandle] = session with { ExpiresOn = silent.ExpiresOn };
            return silent.AccessToken;
        }
        catch (MsalUiRequiredException)
        {
            var interactive = await application.AcquireTokenInteractive(ApplicationProvisioningScopes)
                .WithAccount(session.Account)
                .WithParentActivityOrWindow(parentWindow())
                .ExecuteAsync(cancellationToken);
            ValidateProvisioningResult(interactive, administrator);
            lock (sessionLock) sessions[administrator.SessionHandle] = new(interactive.Account, administrator.TenantId, administrator.AccountId, interactive.ExpiresOn);
            return interactive.AccessToken;
        }
    }

    public async Task<string> AcquireRecoveryAccessTokenAsync(
        AuthenticatedAdministrator administrator,
        DeploymentJournal journal,
        CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(journal);
        if (!journal.MatchesAdministrator(administrator) || !journal.IsUnresolved || journal.PlanDigest.Length != 64)
            throw new InvalidOperationException("Recovery authorization does not match an unresolved approved operation.");
        Session? session;
        lock (sessionLock) sessions.TryGetValue(administrator.SessionHandle, out session);
        if (session is null || session.TenantId != administrator.TenantId || session.AccountId != administrator.AccountId)
            throw new InvalidOperationException("The administrator session does not match the recovery receipt.");
        try
        {
            var silent = await application.AcquireTokenSilent(ApplicationProvisioningScopes, session.Account).ExecuteAsync(cancellationToken);
            ValidateProvisioningResult(silent, administrator);
            return silent.AccessToken;
        }
        catch (MsalUiRequiredException)
        {
            var interactive = await application.AcquireTokenInteractive(ApplicationProvisioningScopes)
                .WithAccount(session.Account)
                .WithParentActivityOrWindow(parentWindow())
                .ExecuteAsync(cancellationToken);
            ValidateProvisioningResult(interactive, administrator);
            lock (sessionLock) sessions[administrator.SessionHandle] = new(interactive.Account, administrator.TenantId, administrator.AccountId, interactive.ExpiresOn);
            return interactive.AccessToken;
        }
    }

    public async Task<ProvisioningCleanupResult> CompleteProvisioningAsync(
        AuthenticatedAdministrator administrator,
        string accessToken,
        CancellationToken cancellationToken)
    {
        Session? session;
        lock (sessionLock) sessions.TryGetValue(administrator.SessionHandle, out session);
        if (session is null || session.TenantId != administrator.TenantId || session.AccountId != administrator.AccountId)
            throw new InvalidOperationException("The administrator session does not match the provisioning cleanup request.");

        var servicePrincipalRemoved = false;
        var cacheCleared = false;
        string safeMessage;
        try
        {
            var servicePrincipalId = await FindBootstrapServicePrincipalAsync(accessToken, cancellationToken);
            if (servicePrincipalId is null)
            {
                servicePrincipalRemoved = true;
            }
            else
            {
                using var request = new HttpRequestMessage(HttpMethod.Delete,
                    $"https://graph.microsoft.com/v1.0/servicePrincipals/{servicePrincipalId:D}");
                request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", accessToken);
                using var response = await httpClient.SendAsync(request, HttpCompletionOption.ResponseHeadersRead, cancellationToken);
                servicePrincipalRemoved = response.IsSuccessStatusCode || response.StatusCode == System.Net.HttpStatusCode.NotFound;
            }
            safeMessage = servicePrincipalRemoved
                ? "Temporary bootstrap service principal and tenant consent were removed."
                : "Microsoft did not confirm removal of the temporary bootstrap service principal; administrator review is required.";
        }
        catch (HttpRequestException)
        {
            safeMessage = "Temporary bootstrap cleanup could not be confirmed because Microsoft Graph was unavailable; administrator review is required.";
        }
        finally
        {
            try
            {
                await application.RemoveAsync(session.Account);
                cacheCleared = true;
            }
            finally
            {
                lock (sessionLock) sessions.Remove(administrator.SessionHandle);
            }
        }

        if (cacheCleared)
            safeMessage += " The local MSAL account and token cache entry were cleared.";
        safeMessage += session.ExpiresOn > DateTimeOffset.UtcNow
            ? $" Microsoft may continue accepting the already-issued access token until approximately {session.ExpiresOn.UtcDateTime:yyyy-MM-dd HH:mm:ss} UTC."
            : " The recorded provisioning access token has expired.";
        return new(servicePrincipalRemoved, cacheCleared, session.ExpiresOn, safeMessage);
    }

    private async Task<Guid?> FindBootstrapServicePrincipalAsync(string accessToken, CancellationToken cancellationToken)
    {
        var filter = Uri.EscapeDataString($"appId eq '{bootstrapClientId:D}'");
        using var request = new HttpRequestMessage(HttpMethod.Get,
            $"https://graph.microsoft.com/v1.0/servicePrincipals?$filter={filter}&$select=id,appId");
        request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", accessToken);
        using var response = await httpClient.SendAsync(request, HttpCompletionOption.ResponseHeadersRead, cancellationToken);
        if (!response.IsSuccessStatusCode)
            throw new InvalidOperationException("Microsoft Graph could not identify the temporary bootstrap service principal for cleanup.");
        await using var stream = await response.Content.ReadAsStreamAsync(cancellationToken);
        using var document = await JsonDocument.ParseAsync(stream, cancellationToken: cancellationToken);
        if (!document.RootElement.TryGetProperty("value", out var value) || value.GetArrayLength() == 0) return null;
        if (value.GetArrayLength() != 1
            || !Guid.TryParse(value[0].GetProperty("id").GetString(), out var objectId)
            || !Guid.TryParse(value[0].GetProperty("appId").GetString(), out var appId)
            || appId != bootstrapClientId)
            throw new InvalidOperationException("The temporary bootstrap service principal could not be identified unambiguously; nothing was deleted.");
        return objectId;
    }

    private static void ValidateBoundAccount(AuthenticationResult result, AuthenticatedAdministrator administrator)
    {
        if (!Guid.TryParse(result.TenantId, out var tenantId)
            || tenantId != administrator.TenantId
            || !string.Equals(result.Account?.HomeAccountId?.Identifier, administrator.AccountId, StringComparison.Ordinal))
            throw new InvalidOperationException("Microsoft returned a different tenant or administrator. Review the plan again.");
    }

    private static void ValidateProvisioningResult(AuthenticationResult result, AuthenticatedAdministrator administrator)
    {
        ValidateBoundAccount(result, administrator);
        if (!ProvisioningScopesAreExact(result.Scopes))
            throw new InvalidOperationException("Microsoft returned provisioning authorization with unexpected permissions.");
    }

    internal static bool ProvisioningScopesAreExact(IEnumerable<string> scopes)
    {
        // Microsoft can return previously consented discovery scopes after incremental consent.
        // Permit that reviewed union, but reject missing provisioning or unrelated permissions.
        var returned = scopes.ToHashSet(StringComparer.OrdinalIgnoreCase);
        var approved = DiscoveryScopes.Concat(ApplicationProvisioningScopes).ToHashSet(StringComparer.OrdinalIgnoreCase);
        return ApplicationProvisioningScopes.All(returned.Contains) && returned.IsSubsetOf(approved);
    }

    private async Task<string> ReadTenantNameAsync(string accessToken, Guid tenantId, CancellationToken cancellationToken)
    {
        using var request = new HttpRequestMessage(HttpMethod.Get, "https://graph.microsoft.com/v1.0/organization?$select=id,displayName");
        request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", accessToken);
        using var response = await httpClient.SendAsync(request, HttpCompletionOption.ResponseHeadersRead, cancellationToken);
        if (!response.IsSuccessStatusCode) return $"Microsoft organization {tenantId:D}";
        await using var stream = await response.Content.ReadAsStreamAsync(cancellationToken);
        using var document = await JsonDocument.ParseAsync(stream, cancellationToken: cancellationToken);
        if (!document.RootElement.TryGetProperty("value", out var value) || value.GetArrayLength() != 1)
            return $"Microsoft organization {tenantId:D}";
        var organization = value[0];
        return organization.TryGetProperty("displayName", out var displayName) && !string.IsNullOrWhiteSpace(displayName.GetString())
            ? displayName.GetString()!
            : $"Microsoft organization {tenantId:D}";
    }

    private sealed record Session(IAccount Account, Guid TenantId, string AccountId, DateTimeOffset ExpiresOn);
}

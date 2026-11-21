using System.Net;
using System.Net.Http;
using System.Net.Http.Headers;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using BetterCaptionKeep.AdminSetup.Domain;

namespace BetterCaptionKeep.AdminSetup.Services;

public sealed class MicrosoftGraphProvisioningService : IMicrosoftGraphProvisioningService
{
    private const string GraphRoot = "https://graph.microsoft.com/v1.0";
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web);
    private readonly IAdministratorSessionProvider sessions;
    private readonly HttpClient httpClient;
    private readonly IDeploymentJournalStore journals;
    private readonly Func<DateTimeOffset> utcNow;
    private readonly Func<TimeSpan, CancellationToken, Task> delay;

    public MicrosoftGraphProvisioningService(
        IAdministratorSessionProvider sessions,
        HttpClient httpClient,
        IDeploymentJournalStore? journals = null,
        Func<DateTimeOffset>? utcNow = null,
        Func<TimeSpan, CancellationToken, Task>? delay = null)
    {
        this.sessions = sessions;
        this.httpClient = httpClient;
        this.journals = journals ?? new FileDeploymentJournalStore();
        this.utcNow = utcNow ?? (() => DateTimeOffset.UtcNow);
        this.delay = delay ?? Task.Delay;
    }

    public async Task<IReadOnlyList<VerifiedGroupReference>> FindExistingGroupsAsync(
        AuthenticatedAdministrator administrator,
        string searchText,
        CancellationToken cancellationToken)
    {
        var term = searchText.Trim();
        var query = "$select=id,displayName,groupTypes,securityEnabled,membershipRule&$top=25&$count=true";
        if (term.Length > 0)
        {
            var search = Uri.EscapeDataString($"\"displayName:{term.Replace("\"", string.Empty, StringComparison.Ordinal)}\"");
            query += $"&$search={search}";
        }
        var token = await sessions.AcquireAccessTokenAsync(administrator, GraphAccessPurpose.Discovery, cancellationToken);
        using var request = CreateRequest(HttpMethod.Get, $"{GraphRoot}/groups?{query}", token);
        request.Headers.TryAddWithoutValidation("ConsistencyLevel", "eventual");
        using var response = await httpClient.SendAsync(request, HttpCompletionOption.ResponseHeadersRead, cancellationToken);
        if (!response.IsSuccessStatusCode)
            throw new InvalidOperationException("Microsoft Graph could not list existing Intune groups for this administrator.");
        await using var stream = await response.Content.ReadAsStreamAsync(cancellationToken);
        using var document = await JsonDocument.ParseAsync(stream, cancellationToken: cancellationToken);
        return ParseGroups(document.RootElement, administrator.TenantId);
    }

    public async Task<DeploymentResult> DeployAsync(
        ApprovedDeployment approvedDeployment,
        IProgress<DeploymentProgress> progress,
        CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(approvedDeployment);
        await using var administratorLock = await journals.AcquireOperationLockAsync(
            AdministratorLockId(approvedDeployment.Plan.Administrator), cancellationToken);
        var unresolved = await journals.ListUnresolvedAsync(approvedDeployment.Plan.Administrator, cancellationToken);
        if (unresolved.Any(journal => journal.OperationId != approvedDeployment.Plan.Nonce))
            throw new InvalidOperationException("An earlier application operation must be recovered before a new plan can deploy.");
        await using var operationLock = await journals.AcquireOperationLockAsync(
            approvedDeployment.Plan.Nonce, cancellationToken);
        return await DeployLockedAsync(approvedDeployment, progress, cancellationToken);
    }

    private async Task<DeploymentResult> DeployLockedAsync(
        ApprovedDeployment approvedDeployment,
        IProgress<DeploymentProgress> progress,
        CancellationToken cancellationToken)
    {
        var now = utcNow();
        approvedDeployment.Plan.Validate(now);
        if (!FixedHexEquals(approvedDeployment.Digest, approvedDeployment.Plan.DigestSha256()))
            throw new InvalidOperationException("The approved plan changed. Review it again before deployment.");

        await VerifySelectedGroupAsync(approvedDeployment.Plan, cancellationToken);
        var desired = DesiredApplication.FromPlan(approvedDeployment.Plan);
        var requestDigest = desired.RequestDigest();
        var journal = await journals.ReadAsync(approvedDeployment.Plan.Nonce, cancellationToken)
            ?? DeploymentJournal.Create(approvedDeployment, requestDigest, now);
        journal.ValidateFor(approvedDeployment, requestDigest);
        var receiptPath = await journals.WriteAsync(journal, cancellationToken);
        progress.Report(new(DeploymentStep.Journal, journal.State,
            "Durable operation receipt verified. No application write has started.", 10, journal.TenantMutationPossible));

        if (journal.State is OperationState.Confirmed or OperationState.Reconciled)
            return ResultFrom(journal, receiptPath);

        cancellationToken.ThrowIfCancellationRequested();
        journal = journal with
        {
            State = OperationState.Pending,
            TenantMutationPossible = true,
            UpdatedAtUtc = utcNow(),
            SafeMessage = "Administrator authorization requested after explicit plan approval."
        };
        receiptPath = await journals.WriteAsync(journal, cancellationToken);
        progress.Report(new(DeploymentStep.Authorization, OperationState.Pending,
            "Requesting the approved application-registration permission.", 20, true));
        var token = await sessions.AcquireProvisioningAccessTokenAsync(approvedDeployment, cancellationToken);

        var matches = await FindApplicationsAsync(desired, token, cancellationToken);
        if (matches.Count > 1)
            return await StopForRecoveryAsync(journal, receiptPath,
                "Multiple application registrations match this deployment marker. No further write was attempted.",
                OperationState.Ambiguous, progress, cancellationToken);

        if (matches.Count == 1)
        {
            var existing = matches[0];
            if (existing.Matches(desired))
            {
                return await FinalizeSuccessfulProvisioningAsync(journal, existing, token,
                    OperationState.Reconciled,
                    "Existing application registration exactly matches the approved plan and was observed without a write.",
                    approvedDeployment.Plan.Administrator, progress, cancellationToken);
            }
            return await StopForRecoveryAsync(journal, receiptPath,
                "The marked application registration differs from the approved plan. No update was attempted; manual review is required.",
                OperationState.RecoveryRequired, progress, cancellationToken);
        }

        if (journal.MutationAttempts > 0)
            return await StopForRecoveryAsync(journal, receiptPath,
                "A prior application write has no observable result yet. Automatic retry is blocked to prevent duplicates.",
                OperationState.RecoveryRequired, progress, cancellationToken);

        return await CreateApplicationAsync(journal, receiptPath, desired, token,
            approvedDeployment.Plan.Administrator, progress, cancellationToken);
    }

    public async Task<DeploymentResult> RecoverAsync(
        AuthenticatedAdministrator administrator,
        DeploymentJournal journal,
        IProgress<DeploymentProgress> progress,
        CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(administrator);
        ArgumentNullException.ThrowIfNull(journal);
        if (!journal.MatchesAdministrator(administrator) || !journal.IsUnresolved)
            throw new InvalidOperationException("The recovery receipt does not match this administrator or is already resolved.");
        await using var administratorLock = await journals.AcquireOperationLockAsync(
            AdministratorLockId(administrator), cancellationToken);
        await using var operationLock = await journals.AcquireOperationLockAsync(journal.OperationId, cancellationToken);
        var current = await journals.ReadAsync(journal.OperationId, cancellationToken)
            ?? throw new InvalidOperationException("The recovery receipt is unavailable.");
        if (!current.MatchesAdministrator(administrator))
            throw new InvalidOperationException("The recovery receipt does not match this administrator.");
        var receiptPath = journals.GetReceiptPath(current.OperationId);
        if (!current.IsUnresolved) return ResultFrom(current, receiptPath);

        var desired = DesiredApplication.FromPersisted(current.DesiredApplication);
        if (!FixedHexEquals(current.RequestDigest, desired.RequestDigest()))
            throw new InvalidOperationException("The persisted recovery operation fingerprint is invalid.");
        var token = await sessions.AcquireRecoveryAccessTokenAsync(administrator, current, cancellationToken);
        var matches = await FindApplicationsAsync(desired, token, cancellationToken);
        if (matches.Count > 1)
            return await StopForRecoveryAsync(current, receiptPath,
                "Multiple applications match the original operation marker. Manual review is required.",
                OperationState.Ambiguous, progress, cancellationToken);
        if (matches.Count == 1)
        {
            if (!matches[0].Matches(desired))
                return await StopForRecoveryAsync(current, receiptPath,
                    "The original marked application differs from the approved desired state. No update was attempted.",
                    OperationState.RecoveryRequired, progress, cancellationToken);
            return await FinalizeSuccessfulProvisioningAsync(current, matches[0], token,
                OperationState.Reconciled,
                "The original application operation was recovered and fully observed.",
                administrator, progress, cancellationToken);
        }
        if (current.MutationAttempts > 0)
            return await StopForRecoveryAsync(current, receiptPath,
                "The original create attempt remains unobserved. A duplicate POST is blocked.",
                OperationState.RecoveryRequired, progress, cancellationToken);

        current = current with
        {
            State = OperationState.Failed,
            UpdatedAtUtc = utcNow(),
            SafeMessage = "No create attempt or application was observed; the original operation is closed without a tenant write."
        };
        receiptPath = await journals.WriteAsync(current, cancellationToken);
        return ResultFrom(current, receiptPath);
    }

    private async Task VerifySelectedGroupAsync(SetupPlan plan, CancellationToken cancellationToken)
    {
        var token = await sessions.AcquireAccessTokenAsync(plan.Administrator, GraphAccessPurpose.Discovery, cancellationToken);
        using var request = CreateRequest(HttpMethod.Get,
            $"{GraphRoot}/groups/{plan.Group.ObjectId:D}?$select=id,displayName,groupTypes,securityEnabled,membershipRule", token);
        using var response = await httpClient.SendAsync(request, HttpCompletionOption.ResponseHeadersRead, cancellationToken);
        if (!response.IsSuccessStatusCode)
            throw new InvalidOperationException("The selected Intune group could not be verified. Review the plan again.");
        await using var stream = await response.Content.ReadAsStreamAsync(cancellationToken);
        using var document = await JsonDocument.ParseAsync(stream, cancellationToken: cancellationToken);
        var root = document.RootElement;
        if (!Guid.TryParse(root.GetProperty("id").GetString(), out var id)
            || id != plan.Group.ObjectId
            || !root.TryGetProperty("securityEnabled", out var security)
            || security.ValueKind != JsonValueKind.True)
            throw new InvalidOperationException("The selected Intune group is no longer a valid security group. Review the plan again.");
    }

    private async Task<DeploymentResult> CreateApplicationAsync(
        DeploymentJournal journal,
        string receiptPath,
        DesiredApplication desired,
        string token,
        AuthenticatedAdministrator administrator,
        IProgress<DeploymentProgress> progress,
        CancellationToken cancellationToken)
    {
        journal = journal with
        {
            State = OperationState.Pending,
            MutationAttempts = journal.MutationAttempts + 1,
            UpdatedAtUtc = utcNow(),
            SafeMessage = "Application creation request is pending observation."
        };
        receiptPath = await journals.WriteAsync(journal, cancellationToken);
        progress.Report(new(DeploymentStep.EntraApplication, OperationState.Pending,
            "Creating the customer-owned Entra application registration.", 55, true));

        using var request = CreateJsonRequest(HttpMethod.Post, $"{GraphRoot}/applications", token, desired.ToRequestBody());
        try
        {
            using var response = await httpClient.SendAsync(request, HttpCompletionOption.ResponseHeadersRead, cancellationToken);
            if (response.IsSuccessStatusCode)
            {
                var created = await ReadApplicationAsync(response, cancellationToken);
                journal = journal with
                {
                    State = OperationState.Partial,
                    ApplicationObjectId = created.ObjectId,
                    ApplicationClientId = created.ClientId,
                    UpdatedAtUtc = utcNow(),
                    SafeMessage = "Application identifiers were returned and durably recorded; full-state verification is pending."
                };
                receiptPath = await journals.WriteAsync(journal, CancellationToken.None);
                var observed = await GetApplicationAsync(created.ObjectId, token, CancellationToken.None);
                if (observed is null || !observed.Matches(desired))
                    return await StopForRecoveryAsync(journal, receiptPath,
                        "The created application could not be verified against the full approved desired state. No update or delete was attempted.",
                        OperationState.RecoveryRequired, progress, CancellationToken.None);
                return await FinalizeSuccessfulProvisioningAsync(journal, observed, token,
                    OperationState.Confirmed,
                    "Customer-owned Entra application registration was created and its full approved state was observed.",
                    administrator, progress, CancellationToken.None);
            }
            if ((int)response.StatusCode < 500)
                return await StopForRecoveryAsync(journal, receiptPath,
                    $"Microsoft Graph rejected application creation ({(int)response.StatusCode}).",
                    OperationState.Failed, progress, cancellationToken);
        }
        catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested)
        {
            return await RecoverCreateAsync(journal, receiptPath, desired, token, administrator, progress);
        }
        catch (HttpRequestException)
        {
            return await RecoverCreateAsync(journal, receiptPath, desired, token, administrator, progress);
        }
        return await RecoverCreateAsync(journal, receiptPath, desired, token, administrator, progress);
    }

    private async Task<DeploymentResult> RecoverCreateAsync(
        DeploymentJournal journal,
        string receiptPath,
        DesiredApplication desired,
        string token,
        AuthenticatedAdministrator administrator,
        IProgress<DeploymentProgress> progress)
    {
        foreach (var wait in new[] { TimeSpan.Zero, TimeSpan.FromMilliseconds(250), TimeSpan.FromSeconds(1) })
        {
            if (wait > TimeSpan.Zero) await delay(wait, CancellationToken.None);
            var matches = await FindApplicationsAsync(desired, token, CancellationToken.None);
            if (matches.Count == 1 && matches[0].Matches(desired))
            {
                return await FinalizeSuccessfulProvisioningAsync(journal, matches[0], token,
                    OperationState.Reconciled,
                    "Application creation was recovered after an ambiguous response.",
                    administrator, progress, CancellationToken.None);
            }
            if (matches.Count > 1)
                return await StopForRecoveryAsync(journal, receiptPath,
                    "Multiple application registrations appeared after an ambiguous response.",
                    OperationState.Ambiguous, progress, CancellationToken.None);
        }
        return await StopForRecoveryAsync(journal, receiptPath,
            "Application creation could not be confirmed. Automatic retry is blocked to prevent duplicates.",
            OperationState.RecoveryRequired, progress, CancellationToken.None);
    }

    private async Task<IReadOnlyList<ApplicationSnapshot>> FindApplicationsAsync(
        DesiredApplication desired,
        string token,
        CancellationToken cancellationToken)
    {
        var filter = Uri.EscapeDataString($"displayName eq '{desired.DisplayName.Replace("'", "''", StringComparison.Ordinal)}'");
        using var request = CreateRequest(HttpMethod.Get,
            $"{GraphRoot}/applications?$filter={filter}&$select=id,appId,displayName,notes,signInAudience,spa", token);
        using var response = await httpClient.SendAsync(request, HttpCompletionOption.ResponseHeadersRead, cancellationToken);
        if (!response.IsSuccessStatusCode)
            throw new InvalidOperationException("Microsoft Graph could not reconcile the application registration safely.");
        await using var stream = await response.Content.ReadAsStreamAsync(cancellationToken);
        using var document = await JsonDocument.ParseAsync(stream, cancellationToken: cancellationToken);
        if (!document.RootElement.TryGetProperty("value", out var value)) return [];
        return value.EnumerateArray().Select(ParseApplication)
            .Where(application => application.Marker == desired.Marker).ToArray();
    }

    private async Task<ApplicationSnapshot?> GetApplicationAsync(Guid objectId, string token, CancellationToken cancellationToken)
    {
        using var request = CreateRequest(HttpMethod.Get,
            $"{GraphRoot}/applications/{objectId:D}?$select=id,appId,displayName,notes,signInAudience,spa", token);
        using var response = await httpClient.SendAsync(request, HttpCompletionOption.ResponseHeadersRead, cancellationToken);
        if (response.StatusCode == HttpStatusCode.NotFound) return null;
        if (!response.IsSuccessStatusCode)
            throw new InvalidOperationException("Microsoft Graph could not verify the created application registration.");
        return await ReadApplicationAsync(response, cancellationToken);
    }

    private static async Task<ApplicationSnapshot> ReadApplicationAsync(HttpResponseMessage response, CancellationToken cancellationToken)
    {
        await using var stream = await response.Content.ReadAsStreamAsync(cancellationToken);
        using var document = await JsonDocument.ParseAsync(stream, cancellationToken: cancellationToken);
        return ParseApplication(document.RootElement);
    }

    private static ApplicationSnapshot ParseApplication(JsonElement item)
    {
        if (!Guid.TryParse(item.GetProperty("id").GetString(), out var objectId)
            || !Guid.TryParse(item.GetProperty("appId").GetString(), out var clientId))
            throw new InvalidOperationException("Microsoft Graph returned an invalid application identity.");
        var redirects = item.TryGetProperty("spa", out var spa)
            && spa.TryGetProperty("redirectUris", out var values)
            ? values.EnumerateArray().Select(value => value.GetString() ?? string.Empty).ToArray()
            : [];
        return new(objectId, clientId,
            item.TryGetProperty("displayName", out var name) ? name.GetString() ?? string.Empty : string.Empty,
            item.TryGetProperty("notes", out var notes) ? notes.GetString() ?? string.Empty : string.Empty,
            item.TryGetProperty("signInAudience", out var audience) ? audience.GetString() ?? string.Empty : string.Empty,
            redirects);
    }

    private static IReadOnlyList<VerifiedGroupReference> ParseGroups(JsonElement root, Guid tenantId)
    {
        var groups = new List<VerifiedGroupReference>();
        if (!root.TryGetProperty("value", out var value)) return groups;
        foreach (var item in value.EnumerateArray())
        {
            if (!Guid.TryParse(item.GetProperty("id").GetString(), out var objectId)) continue;
            var securityEnabled = item.TryGetProperty("securityEnabled", out var security) && security.ValueKind == JsonValueKind.True;
            if (!securityEnabled) continue;
            var displayName = item.TryGetProperty("displayName", out var name) ? name.GetString() : null;
            var groupTypes = item.TryGetProperty("groupTypes", out var types)
                ? string.Join(", ", types.EnumerateArray().Select(type => type.GetString()).Where(type => !string.IsNullOrWhiteSpace(type)))
                : string.Empty;
            var dynamic = item.TryGetProperty("membershipRule", out var rule) && !string.IsNullOrWhiteSpace(rule.GetString());
            groups.Add(new(tenantId, objectId, displayName ?? objectId.ToString("D"),
                string.IsNullOrWhiteSpace(groupTypes) ? "Assigned security group" : groupTypes, true, dynamic, null));
        }
        return groups;
    }

    private async Task<DeploymentResult> StopForRecoveryAsync(
        DeploymentJournal journal,
        string receiptPath,
        string message,
        OperationState state,
        IProgress<DeploymentProgress> progress,
        CancellationToken cancellationToken)
    {
        journal = journal with { State = state, UpdatedAtUtc = utcNow(), SafeMessage = message };
        receiptPath = await journals.WriteAsync(journal, cancellationToken);
        progress.Report(new(DeploymentStep.EntraApplication, state, message, 100, true));
        return ResultFrom(journal, receiptPath);
    }

    private DeploymentJournal Confirm(
        DeploymentJournal journal,
        ApplicationSnapshot application,
        OperationState state,
        string message) => journal with
        {
            State = state,
            ApplicationObjectId = application.ObjectId,
            ApplicationClientId = application.ClientId,
            UpdatedAtUtc = utcNow(),
            SafeMessage = message
        };

    private async Task<DeploymentResult> FinalizeSuccessfulProvisioningAsync(
        DeploymentJournal journal,
        ApplicationSnapshot application,
        string token,
        OperationState successState,
        string successMessage,
        AuthenticatedAdministrator administrator,
        IProgress<DeploymentProgress> progress,
        CancellationToken cancellationToken)
    {
        journal = Confirm(journal, application, OperationState.Partial,
            $"{successMessage} Temporary provisioning access cleanup is pending.");
        var receiptPath = await journals.WriteAsync(journal, cancellationToken);
        progress.Report(new(DeploymentStep.ProvisioningCleanup, OperationState.Pending,
            "Removing the temporary bootstrap identity and clearing the local token cache.", 90, true));

        ProvisioningCleanupResult cleanup;
        try
        {
            cleanup = await sessions.CompleteProvisioningAsync(administrator, token, cancellationToken);
        }
        catch (Exception exception) when (exception is HttpRequestException or InvalidOperationException)
        {
            journal = journal with
            {
                State = OperationState.RecoveryRequired,
                UpdatedAtUtc = utcNow(),
                SafeMessage = $"{successMessage} Temporary provisioning access cleanup was not confirmed. Remove the Better CaptionKeep setup enterprise application in Microsoft Entra and allow the issued access token to expire before treating setup as complete."
            };
            receiptPath = await journals.WriteAsync(journal, CancellationToken.None);
            progress.Report(new(DeploymentStep.ProvisioningCleanup, journal.State, journal.SafeMessage, 100, true));
            return ResultFrom(journal, receiptPath);
        }

        journal = journal with
        {
            State = cleanup.Complete ? successState : OperationState.RecoveryRequired,
            BootstrapServicePrincipalRemoved = cleanup.BootstrapServicePrincipalRemoved,
            LocalTokenCacheCleared = cleanup.LocalTokenCacheCleared,
            ProvisioningAccessTokenExpiresAtUtc = cleanup.AccessTokenExpiresAtUtc,
            UpdatedAtUtc = utcNow(),
            SafeMessage = $"{successMessage} {cleanup.SafeMessage}"
        };
        receiptPath = await journals.WriteAsync(journal, CancellationToken.None);
        progress.Report(new(DeploymentStep.ProvisioningCleanup, journal.State, journal.SafeMessage, 100, true));
        return ResultFrom(journal, receiptPath);
    }

    private static DeploymentResult ResultFrom(DeploymentJournal journal, string receiptPath) => new(
        journal.OperationId,
        journal.State,
        false,
        false,
        false,
        false,
        receiptPath);

    private static HttpRequestMessage CreateRequest(HttpMethod method, string uri, string token)
    {
        var request = new HttpRequestMessage(method, uri);
        request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);
        request.Headers.TryAddWithoutValidation("client-request-id", Guid.NewGuid().ToString("D"));
        request.Headers.TryAddWithoutValidation("return-client-request-id", "true");
        return request;
    }

    private static HttpRequestMessage CreateJsonRequest(HttpMethod method, string uri, string token, object body)
    {
        var request = CreateRequest(method, uri, token);
        request.Content = new ByteArrayContent(JsonSerializer.SerializeToUtf8Bytes(body, JsonOptions));
        request.Content.Headers.ContentType = new MediaTypeHeaderValue("application/json");
        return request;
    }

    private static bool FixedHexEquals(string left, string right)
    {
        try { return CryptographicOperations.FixedTimeEquals(Convert.FromHexString(left), Convert.FromHexString(right)); }
        catch (FormatException) { return false; }
    }

    private static Guid AdministratorLockId(AuthenticatedAdministrator administrator)
    {
        var bytes = SHA256.HashData(Encoding.UTF8.GetBytes(
            $"BetterCaptionKeepAdministratorLock:{administrator.TenantId:D}:{administrator.AccountId}"));
        return new Guid(bytes.AsSpan(0, 16));
    }

    private sealed record DesiredApplication(string DisplayName, string Marker, string SignInAudience, string[] RedirectUris)
    {
        public static DesiredApplication FromPlan(SetupPlan plan)
        {
            var desired = plan.DesiredApplication;
            return new(desired.DisplayName, desired.Marker, desired.SignInAudience,
                desired.RedirectUris.Order(StringComparer.Ordinal).ToArray());
        }

        public static DesiredApplication FromPersisted(DesiredApplicationPlan desired) =>
            new(desired.DisplayName, desired.Marker, desired.SignInAudience,
                desired.RedirectUris.Order(StringComparer.Ordinal).ToArray());

        public object ToRequestBody() => new
        {
            displayName = DisplayName,
            notes = Marker,
            signInAudience = SignInAudience,
            spa = new { redirectUris = RedirectUris }
        };

        public string RequestDigest() => Convert.ToHexString(
            SHA256.HashData(JsonSerializer.SerializeToUtf8Bytes(ToRequestBody(), JsonOptions))).ToLowerInvariant();
    }

    private sealed record ApplicationSnapshot(
        Guid ObjectId,
        Guid ClientId,
        string DisplayName,
        string Marker,
        string SignInAudience,
        string[] RedirectUris)
    {
        public bool MatchesIdentity(DesiredApplication desired) =>
            string.Equals(DisplayName, desired.DisplayName, StringComparison.Ordinal)
            && string.Equals(Marker, desired.Marker, StringComparison.Ordinal);

        public bool Matches(DesiredApplication desired) => MatchesIdentity(desired)
            && string.Equals(SignInAudience, desired.SignInAudience, StringComparison.Ordinal)
            && RedirectUris.Order(StringComparer.Ordinal).SequenceEqual(desired.RedirectUris, StringComparer.Ordinal);
    }
}

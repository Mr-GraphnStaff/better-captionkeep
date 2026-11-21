using System.Collections.Immutable;
using System.Security.Cryptography;
using System.Text.Json;

namespace BetterCaptionKeep.AdminSetup.Domain;

public enum SetupStage { Welcome, AdministratorAccount, Deployment, Review, Deploying, Result }
[Flags] public enum BrowserTargets { None = 0, Edge = 1, Chrome = 2 }
public enum CloudEnvironment { Global, UsGovernment, UsGovernmentDod, China }
public enum OperationState { Planned, Pending, Confirmed, Reconciled, Ambiguous, Partial, RecoveryRequired, Failed }
public enum ApplicationProvisioningAction { CreateOrObserve }
public enum ApplicationDriftPolicy { StopForManualReview }

public sealed record AuthenticatedAdministrator(
    Guid TenantId,
    string AccountId,
    string UserPrincipalName,
    string TenantDisplayName,
    CloudEnvironment Cloud,
    string SessionHandle);

public sealed record VerifiedGroupReference(
    Guid TenantId,
    Guid ObjectId,
    string DisplayName,
    string GroupType,
    bool SecurityEnabled,
    bool DynamicMembership,
    int? MemberCount);

public sealed record DesiredApplicationPlan(
    string DisplayName,
    string Marker,
    string SignInAudience,
    ImmutableArray<string> RedirectUris,
    ApplicationProvisioningAction Action,
    ApplicationDriftPolicy DriftPolicy);

public sealed record SetupPlan(
    int SchemaVersion,
    AuthenticatedAdministrator Administrator,
    VerifiedGroupReference Group,
    BrowserTargets Browsers,
    ImmutableArray<string> RequestedScopes,
    DesiredApplicationPlan DesiredApplication,
    ImmutableDictionary<string, string> EndpointPayloadSha256,
    string BuildIdentity,
    Guid Nonce,
    DateTimeOffset CreatedAtUtc,
    DateTimeOffset ExpiresAtUtc)
{
    public string DigestSha256()
    {
        var canonical = new
        {
            schemaVersion = SchemaVersion,
            tenantId = Administrator.TenantId.ToString("D").ToLowerInvariant(),
            accountId = Administrator.AccountId,
            administrator = Administrator.UserPrincipalName.Trim().ToLowerInvariant(),
            cloud = Administrator.Cloud.ToString(),
            groupTenantId = Group.TenantId.ToString("D").ToLowerInvariant(),
            groupObjectId = Group.ObjectId.ToString("D").ToLowerInvariant(),
            groupName = Group.DisplayName,
            groupType = Group.GroupType,
            groupSecurityEnabled = Group.SecurityEnabled,
            groupDynamic = Group.DynamicMembership,
            browsers = Browsers.ToString(),
            scopes = RequestedScopes.Order(StringComparer.Ordinal).ToArray(),
            desiredApplication = new
            {
                displayName = DesiredApplication.DisplayName,
                marker = DesiredApplication.Marker,
                signInAudience = DesiredApplication.SignInAudience,
                redirectUris = DesiredApplication.RedirectUris.Order(StringComparer.Ordinal).ToArray(),
                action = DesiredApplication.Action.ToString(),
                driftPolicy = DesiredApplication.DriftPolicy.ToString()
            },
            endpointPayloads = EndpointPayloadSha256.OrderBy(pair => pair.Key, StringComparer.Ordinal)
                .Select(pair => new { name = pair.Key, sha256 = pair.Value.ToLowerInvariant() }).ToArray(),
            buildIdentity = BuildIdentity,
            nonce = Nonce.ToString("D").ToLowerInvariant(),
            createdAt = CreatedAtUtc.ToUniversalTime().ToString("O"),
            expiresAt = ExpiresAtUtc.ToUniversalTime().ToString("O")
        };
        var bytes = JsonSerializer.SerializeToUtf8Bytes(canonical);
        return Convert.ToHexString(SHA256.HashData(bytes));
    }

    public void Validate(DateTimeOffset now)
    {
        if (SchemaVersion != 1) throw new InvalidOperationException("Unsupported setup plan version.");
        if (Administrator.TenantId == Guid.Empty || Group.TenantId != Administrator.TenantId)
            throw new InvalidOperationException("Administrator and Intune group must belong to the same tenant.");
        if (string.IsNullOrWhiteSpace(Administrator.AccountId) || string.IsNullOrWhiteSpace(Administrator.SessionHandle))
            throw new InvalidOperationException("A bound administrator session is required.");
        if (Group.ObjectId == Guid.Empty || !Group.SecurityEnabled)
            throw new InvalidOperationException("Choose a verified, security-enabled Intune group.");
        if (Browsers == BrowserTargets.None || (Browsers & ~(BrowserTargets.Edge | BrowserTargets.Chrome)) != 0)
            throw new InvalidOperationException("Choose at least one supported browser.");
        if (RequestedScopes.IsDefaultOrEmpty || RequestedScopes.Any(string.IsNullOrWhiteSpace)
            || RequestedScopes.Distinct(StringComparer.Ordinal).Count() != RequestedScopes.Length
            || DesiredApplication is null
            || string.IsNullOrWhiteSpace(DesiredApplication.DisplayName)
            || string.IsNullOrWhiteSpace(DesiredApplication.Marker)
            || !string.Equals(DesiredApplication.SignInAudience, "AzureADMyOrg", StringComparison.Ordinal)
            || DesiredApplication.RedirectUris.IsDefaultOrEmpty || DesiredApplication.RedirectUris.Any(string.IsNullOrWhiteSpace)
            || DesiredApplication.Action != ApplicationProvisioningAction.CreateOrObserve
            || DesiredApplication.DriftPolicy != ApplicationDriftPolicy.StopForManualReview
            || EndpointPayloadSha256.Count == 0
            || EndpointPayloadSha256.Any(pair => string.IsNullOrWhiteSpace(pair.Key)
                || pair.Value.Length != 64
                || !pair.Value.All(Uri.IsHexDigit)
                || pair.Value.All(character => character == '0')))
            throw new InvalidOperationException("The plan is missing permissions or endpoint payload identities.");
        if (string.IsNullOrWhiteSpace(BuildIdentity) || Nonce == Guid.Empty || ExpiresAtUtc - CreatedAtUtc > TimeSpan.FromMinutes(15))
            throw new InvalidOperationException("The plan identity or lifetime is invalid.");
        var expectedScopes = string.Equals(BuildIdentity, "development-no-write-preview", StringComparison.Ordinal)
            ? new[] { "GroupMember.Read.All" }
            : new[] { "GroupMember.Read.All", "Application.ReadWrite.All" };
        if (!RequestedScopes.ToHashSet(StringComparer.Ordinal).SetEquals(expectedScopes))
            throw new InvalidOperationException("The plan requests permissions outside the approved setup slice.");
        if (now < CreatedAtUtc || now >= ExpiresAtUtc)
            throw new InvalidOperationException("The reviewed plan expired. Review it again.");
    }
}

public sealed class ApprovedDeployment
{
    internal ApprovedDeployment(SetupPlan plan, string digest, Guid approvalId, DateTimeOffset approvedAtUtc)
        => (Plan, Digest, ApprovalId, ApprovedAtUtc) = (plan, digest, approvalId, approvedAtUtc);
    public SetupPlan Plan { get; }
    public string Digest { get; }
    public Guid ApprovalId { get; }
    public DateTimeOffset ApprovedAtUtc { get; }
}
public sealed record OperationJournalEntry(string Operation, OperationState State, string RequestDigest, string? ResourceId);

public sealed class SetupWorkflow
{
    public SetupStage Stage { get; private set; } = SetupStage.Welcome;
    public AuthenticatedAdministrator? VerifiedAdministrator { get; private set; }
    public SetupPlan? ReviewedPlan { get; private set; }
    public bool HasStartedWrites { get; private set; }
    public bool DeploymentInProgress => Stage == SetupStage.Deploying;

    public void ContinueFromWelcome() => RequireAndMove(SetupStage.Welcome, SetupStage.AdministratorAccount);

    public void SetVerifiedAdministrator(AuthenticatedAdministrator administrator)
    {
        ArgumentNullException.ThrowIfNull(administrator);
        if (administrator.TenantId == Guid.Empty || string.IsNullOrWhiteSpace(administrator.AccountId) ||
            string.IsNullOrWhiteSpace(administrator.UserPrincipalName) || string.IsNullOrWhiteSpace(administrator.SessionHandle))
            throw new ArgumentException("A tenant-bound Microsoft administrator session is required.");
        RequireStage(SetupStage.AdministratorAccount);
        VerifiedAdministrator = administrator;
        Stage = SetupStage.Deployment;
    }

    public void Review(SetupPlan plan, DateTimeOffset now)
    {
        ArgumentNullException.ThrowIfNull(plan);
        RequireStage(SetupStage.Deployment);
        if (VerifiedAdministrator is null || plan.Administrator != VerifiedAdministrator)
            throw new InvalidOperationException("The plan does not match the verified administrator session.");
        plan.Validate(now);
        ReviewedPlan = plan;
        Stage = SetupStage.Review;
    }

    public ApprovedDeployment ApproveAndBegin(string reviewedDigest, DateTimeOffset now)
    {
        RequireStage(SetupStage.Review);
        if (ReviewedPlan is null) throw new InvalidOperationException("No reviewed plan is available.");
        ReviewedPlan.Validate(now);
        var actual = ReviewedPlan.DigestSha256();
        if (!CryptographicOperations.FixedTimeEquals(Convert.FromHexString(actual), Convert.FromHexString(reviewedDigest)))
            throw new InvalidOperationException("The reviewed plan changed. Review it again before deployment.");
        Stage = SetupStage.Deploying;
        return new ApprovedDeployment(ReviewedPlan, actual, Guid.NewGuid(), now);
    }

    public void MarkWriteBoundaryCrossed()
    {
        RequireStage(SetupStage.Deploying);
        HasStartedWrites = true;
    }

    public void CompleteDeployment()
    {
        RequireStage(SetupStage.Deploying);
        Stage = SetupStage.Result;
    }

    public bool CancelBeforeWrites()
    {
        if (HasStartedWrites) return false;
        Stage = SetupStage.Welcome;
        VerifiedAdministrator = null;
        ReviewedPlan = null;
        HasStartedWrites = false;
        return true;
    }

    private void RequireAndMove(SetupStage expected, SetupStage next) { RequireStage(expected); Stage = next; }
    private void RequireStage(SetupStage expected)
    {
        if (Stage != expected) throw new InvalidOperationException($"Expected setup stage {expected}, but current stage is {Stage}.");
    }
}

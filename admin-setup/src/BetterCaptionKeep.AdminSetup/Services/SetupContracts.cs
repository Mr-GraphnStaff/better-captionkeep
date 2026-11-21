using BetterCaptionKeep.AdminSetup.Domain;

namespace BetterCaptionKeep.AdminSetup.Services;

public interface IAdministratorAuthenticationService
{
    Task<AuthenticatedAdministrator> SignInAsync(string? loginHint, CancellationToken cancellationToken);
}

public enum GraphAccessPurpose { Discovery, ApplicationProvisioning }

public interface IAdministratorSessionProvider
{
    Task<string> AcquireAccessTokenAsync(
        AuthenticatedAdministrator administrator,
        GraphAccessPurpose purpose,
        CancellationToken cancellationToken);

    Task<string> AcquireProvisioningAccessTokenAsync(
        ApprovedDeployment approvedDeployment,
        CancellationToken cancellationToken);

    Task<string> AcquireRecoveryAccessTokenAsync(
        AuthenticatedAdministrator administrator,
        DeploymentJournal journal,
        CancellationToken cancellationToken);

    Task<ProvisioningCleanupResult> CompleteProvisioningAsync(
        AuthenticatedAdministrator administrator,
        string accessToken,
        CancellationToken cancellationToken);
}

public sealed record ProvisioningCleanupResult(
    bool BootstrapServicePrincipalRemoved,
    bool LocalTokenCacheCleared,
    DateTimeOffset? AccessTokenExpiresAtUtc,
    string SafeMessage)
{
    public bool Complete => BootstrapServicePrincipalRemoved && LocalTokenCacheCleared;
}

public interface IMicrosoftGraphProvisioningService
{
    Task<IReadOnlyList<VerifiedGroupReference>> FindExistingGroupsAsync(
        AuthenticatedAdministrator administrator,
        string searchText,
        CancellationToken cancellationToken);

    Task<DeploymentResult> DeployAsync(
        ApprovedDeployment approvedDeployment,
        IProgress<DeploymentProgress> progress,
        CancellationToken cancellationToken);

    Task<DeploymentResult> RecoverAsync(
        AuthenticatedAdministrator administrator,
        DeploymentJournal journal,
        IProgress<DeploymentProgress> progress,
        CancellationToken cancellationToken);
}

public sealed record DeploymentProgress(
    DeploymentStep Step,
    OperationState State,
    string SafeMessage,
    int Percent,
    bool TenantMutationPossible = false);
public enum DeploymentStep { Journal, Authorization, EntraApplication, ProvisioningCleanup }
public sealed record DeploymentResult(
    Guid OperationId,
    OperationState State,
    bool AssignmentSubmitted,
    bool ManagedPolicyDetected,
    bool ExtensionInstallationObserved,
    bool EmployeeOAuthVerified,
    string ReceiptPath);

public sealed class NotConfiguredAuthenticationService : IAdministratorAuthenticationService
{
    public Task<AuthenticatedAdministrator> SignInAsync(string? loginHint, CancellationToken cancellationToken) =>
        Task.FromException<AuthenticatedAdministrator>(new NotSupportedException("Microsoft administrator sign-in is not connected in this development slice."));
}

public sealed class NotConfiguredGraphProvisioningService : IMicrosoftGraphProvisioningService
{
    public Task<IReadOnlyList<VerifiedGroupReference>> FindExistingGroupsAsync(AuthenticatedAdministrator administrator, string searchText, CancellationToken cancellationToken) =>
        Task.FromException<IReadOnlyList<VerifiedGroupReference>>(new NotSupportedException("Microsoft Graph group discovery is not connected in this development slice."));
    public Task<DeploymentResult> DeployAsync(ApprovedDeployment approvedDeployment, IProgress<DeploymentProgress> progress, CancellationToken cancellationToken) =>
        Task.FromException<DeploymentResult>(new NotSupportedException("Microsoft Graph deployment is not connected in this development slice."));
    public Task<DeploymentResult> RecoverAsync(AuthenticatedAdministrator administrator, DeploymentJournal journal, IProgress<DeploymentProgress> progress, CancellationToken cancellationToken) =>
        Task.FromException<DeploymentResult>(new NotSupportedException("Microsoft Graph recovery is not connected in this development slice."));
}

public sealed class PreviewAuthenticationService : IAdministratorAuthenticationService
{
    public Task<AuthenticatedAdministrator> SignInAsync(string? loginHint, CancellationToken cancellationToken) => Task.FromResult(
        new AuthenticatedAdministrator(Guid.Parse("11111111-1111-4111-8111-111111111111"), "preview-account", string.IsNullOrWhiteSpace(loginHint) ? "admin@example.invalid" : loginHint.Trim(), "Example organization — no-write preview", CloudEnvironment.Global, "preview-session"));
}

public sealed class PreviewGraphProvisioningService : IMicrosoftGraphProvisioningService
{
    public Task<IReadOnlyList<VerifiedGroupReference>> FindExistingGroupsAsync(AuthenticatedAdministrator administrator, string searchText, CancellationToken cancellationToken)
    {
        IReadOnlyList<VerifiedGroupReference> groups =
        [new(administrator.TenantId, Guid.Parse("22222222-2222-4222-8222-222222222222"), "Pilot devices — synthetic preview", "Assigned security group", true, false, 1)];
        return Task.FromResult(groups);
    }
    public Task<DeploymentResult> DeployAsync(ApprovedDeployment approvedDeployment, IProgress<DeploymentProgress> progress, CancellationToken cancellationToken) =>
        Task.FromException<DeploymentResult>(new NotSupportedException("No-write preview mode never performs deployment."));
    public Task<DeploymentResult> RecoverAsync(AuthenticatedAdministrator administrator, DeploymentJournal journal, IProgress<DeploymentProgress> progress, CancellationToken cancellationToken) =>
        Task.FromException<DeploymentResult>(new NotSupportedException("No-write preview mode has no deployment to recover."));
}

using System.IO;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using BetterCaptionKeep.AdminSetup.Domain;

namespace BetterCaptionKeep.AdminSetup.Services;

public sealed record DeploymentJournal(
    int SchemaVersion,
    Guid OperationId,
    string PlanDigest,
    Guid TenantId,
    string AdministratorAccountSha256,
    string Operation,
    DesiredApplicationPlan DesiredApplication,
    OperationState State,
    string RequestDigest,
    int MutationAttempts,
    bool TenantMutationPossible,
    Guid? ApplicationObjectId,
    Guid? ApplicationClientId,
    DateTimeOffset CreatedAtUtc,
    DateTimeOffset UpdatedAtUtc,
    string SafeMessage,
    bool BootstrapServicePrincipalRemoved = false,
    bool LocalTokenCacheCleared = false,
    DateTimeOffset? ProvisioningAccessTokenExpiresAtUtc = null)
{
    public static DeploymentJournal Create(ApprovedDeployment approved, string requestDigest, DateTimeOffset now) => new(
        3,
        approved.Plan.Nonce,
        approved.Digest,
        approved.Plan.Administrator.TenantId,
        HashAccountId(approved.Plan.Administrator.AccountId),
        "entra-application-registration",
        approved.Plan.DesiredApplication,
        OperationState.Planned,
        requestDigest,
        0,
        false,
        null,
        null,
        now,
        now,
        "Approved plan recorded. No tenant mutation has started.");

    public void ValidateFor(ApprovedDeployment approved, string requestDigest)
    {
        if (SchemaVersion is not (2 or 3)
            || OperationId != approved.Plan.Nonce
            || TenantId != approved.Plan.Administrator.TenantId
            || !FixedHexEquals(PlanDigest, approved.Digest)
            || !FixedHexEquals(RequestDigest, requestDigest)
            || !DesiredMatches(DesiredApplication, approved.Plan.DesiredApplication)
            || !FixedHexEquals(AdministratorAccountSha256, HashAccountId(approved.Plan.Administrator.AccountId)))
            throw new InvalidOperationException("The durable setup receipt does not match the approved plan. Recovery is required.");
    }

    public bool MatchesAdministrator(AuthenticatedAdministrator administrator) =>
        TenantId == administrator.TenantId
        && FixedHexEquals(AdministratorAccountSha256, HashAccountId(administrator.AccountId));

    public bool IsUnresolved => State is OperationState.Planned or OperationState.Pending
        or OperationState.Partial or OperationState.Ambiguous or OperationState.RecoveryRequired;

    private static string HashAccountId(string accountId) => Convert.ToHexString(
        SHA256.HashData(Encoding.UTF8.GetBytes(accountId))).ToLowerInvariant();

    private static bool DesiredMatches(DesiredApplicationPlan left, DesiredApplicationPlan right) =>
        string.Equals(left.DisplayName, right.DisplayName, StringComparison.Ordinal)
        && string.Equals(left.Marker, right.Marker, StringComparison.Ordinal)
        && string.Equals(left.SignInAudience, right.SignInAudience, StringComparison.Ordinal)
        && left.Action == right.Action
        && left.DriftPolicy == right.DriftPolicy
        && left.RedirectUris.Order(StringComparer.Ordinal).SequenceEqual(right.RedirectUris.Order(StringComparer.Ordinal), StringComparer.Ordinal);

    private static bool FixedHexEquals(string left, string right)
    {
        try
        {
            return CryptographicOperations.FixedTimeEquals(Convert.FromHexString(left), Convert.FromHexString(right));
        }
        catch (FormatException)
        {
            return false;
        }
    }
}

public interface IDeploymentJournalStore
{
    Task<DeploymentJournal?> ReadAsync(Guid operationId, CancellationToken cancellationToken);
    Task<string> WriteAsync(DeploymentJournal journal, CancellationToken cancellationToken);
    Task<IReadOnlyList<DeploymentJournal>> ListUnresolvedAsync(AuthenticatedAdministrator administrator, CancellationToken cancellationToken);
    Task<IAsyncDisposable> AcquireOperationLockAsync(Guid operationId, CancellationToken cancellationToken);
    string GetReceiptPath(Guid operationId);
}

public sealed class FileDeploymentJournalStore : IDeploymentJournalStore
{
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web)
    {
        WriteIndented = true
    };

    private readonly string root;

    public FileDeploymentJournalStore(string? root = null)
    {
        this.root = root ?? Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
            "DAF-TECH",
            "BetterCaptionKeep",
            "AdminSetup",
            "operations");
    }

    public string GetReceiptPath(Guid operationId) => Path.Combine(root, operationId.ToString("D"), "receipt.json");

    public async Task<DeploymentJournal?> ReadAsync(Guid operationId, CancellationToken cancellationToken)
    {
        var path = GetReceiptPath(operationId);
        if (!File.Exists(path)) return null;
        await using var stream = new FileStream(path, FileMode.Open, FileAccess.Read, FileShare.Read, 4096, FileOptions.Asynchronous);
        return await JsonSerializer.DeserializeAsync<DeploymentJournal>(stream, JsonOptions, cancellationToken)
            ?? throw new InvalidDataException("The setup receipt is empty.");
    }

    public async Task<string> WriteAsync(DeploymentJournal journal, CancellationToken cancellationToken)
    {
        var path = GetReceiptPath(journal.OperationId);
        var directory = Path.GetDirectoryName(path) ?? throw new InvalidOperationException("Receipt path has no directory.");
        Directory.CreateDirectory(directory);
        var next = Path.Combine(directory, "receipt.next.json");
        var payload = JsonSerializer.SerializeToUtf8Bytes(journal, JsonOptions);
        await using (var stream = new FileStream(next, FileMode.Create, FileAccess.Write, FileShare.None, 4096,
            FileOptions.Asynchronous | FileOptions.WriteThrough))
        {
            await stream.WriteAsync(payload, cancellationToken);
            await stream.FlushAsync(cancellationToken);
            stream.Flush(true);
        }
        File.Move(next, path, true);
        return path;
    }

    public async Task<IReadOnlyList<DeploymentJournal>> ListUnresolvedAsync(
        AuthenticatedAdministrator administrator,
        CancellationToken cancellationToken)
    {
        if (!Directory.Exists(root)) return [];
        var unresolved = new List<DeploymentJournal>();
        foreach (var path in Directory.EnumerateFiles(root, "receipt.json", SearchOption.AllDirectories))
        {
            cancellationToken.ThrowIfCancellationRequested();
            await using var stream = new FileStream(path, FileMode.Open, FileAccess.Read, FileShare.Read, 4096, FileOptions.Asynchronous);
            var journal = await JsonSerializer.DeserializeAsync<DeploymentJournal>(stream, JsonOptions, cancellationToken)
                ?? throw new InvalidDataException("A setup receipt is empty.");
            if (!journal.MatchesAdministrator(administrator)) continue;
            if (journal.SchemaVersion is not (2 or 3) || journal.DesiredApplication is null)
                throw new InvalidDataException("An unsupported setup receipt blocks new deployment until manual review.");
            if (journal.IsUnresolved) unresolved.Add(journal);
        }
        return unresolved.OrderBy(journal => journal.CreatedAtUtc).ToArray();
    }

    public async Task<IAsyncDisposable> AcquireOperationLockAsync(Guid operationId, CancellationToken cancellationToken)
    {
        var directory = Path.GetDirectoryName(GetReceiptPath(operationId))
            ?? throw new InvalidOperationException("Receipt path has no directory.");
        Directory.CreateDirectory(directory);
        var path = Path.Combine(directory, "operation.lock");
        while (true)
        {
            cancellationToken.ThrowIfCancellationRequested();
            try
            {
                return new OperationLock(new FileStream(path, FileMode.OpenOrCreate, FileAccess.ReadWrite, FileShare.None));
            }
            catch (IOException)
            {
                await Task.Delay(50, cancellationToken);
            }
        }
    }

    private sealed class OperationLock(FileStream stream) : IAsyncDisposable
    {
        public ValueTask DisposeAsync()
        {
            stream.Dispose();
            return ValueTask.CompletedTask;
        }
    }
}

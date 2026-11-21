using System.Collections.Immutable;
using System.Net;
using System.Net.Http;
using System.Text;
using BetterCaptionKeep.AdminSetup.Domain;
using BetterCaptionKeep.AdminSetup.Services;

var failures = new List<string>();
var testCount = 0;
if (args.SequenceEqual(new[] { "--browser-integration-only" }))
{
    BrowserIntegrationTests.Run(Run, Assert);
    if (failures.Count > 0) { Console.Error.WriteLine(string.Join(Environment.NewLine, failures)); return 1; }
    Console.WriteLine($"{testCount} browser integration contract tests passed (no windows or child processes).");
    return 0;
}
if (args.SequenceEqual(new[] { "--azure-routing-only" }))
{
    EnterpriseAzureRoutingTests.Run(Run, Assert);
    if (failures.Count > 0) { Console.Error.WriteLine(string.Join(Environment.NewLine, failures)); return 1; }
    Console.WriteLine($"{testCount} Azure routing contract tests passed (no windows or child processes).");
    return 0;
}
if (args.SequenceEqual(new[] { "--window-caption-only" }))
{
    WindowCaptionCommandTests.Run(Run, Assert);
    if (failures.Count > 0) { Console.Error.WriteLine(string.Join(Environment.NewLine, failures)); return 1; }
    Console.WriteLine($"{testCount} window-caption contract tests passed (unshown windows only).");
    return 0;
}
var now = DateTimeOffset.Parse("2026-11-12T18:00:00Z");
var bootstrapClientId = Guid.Parse("11111111-1111-4111-8111-111111111111");
var bootstrapTenantId = Guid.Parse("22222222-2222-4222-8222-222222222222");
BrowserIntegrationTests.Run(Run, Assert);
EnterpriseSetupProgressTests.Run(Run, Assert);
OwnedSignInWindowTests.Run(Run, Assert);
WindowCaptionCommandTests.Run(Run, Assert);
EnterpriseAzureRoutingTests.Run(Run, Assert);

Run("bootstrap requires exact matching single-tenant authority", () =>
{
    var json = $$"""{"publicClientId":"{{bootstrapClientId:D}}","tenantId":"{{bootstrapTenantId:D}}","authority":"https://login.microsoftonline.com/{{bootstrapTenantId:D}}"}""";
    Assert(SetupBootstrapConfiguration.TryParse(json, out var configuration)
        && configuration?.PublicClientId == bootstrapClientId
        && configuration.TenantId == bootstrapTenantId,
        "exact tenant authority must be accepted");
});
foreach (var rejectedAuthority in new[]
{
    "https://login.microsoftonline.com/organizations",
    "https://login.microsoftonline.com/common",
    "https://login.microsoftonline.com/consumers",
    "https://login.microsoftonline.com/not-a-tenant",
    "https://login.microsoftonline.com/33333333-3333-4333-8333-333333333333",
    $"https://login.microsoftonline.com/{bootstrapTenantId:D}/",
    $"https://login.microsoftonline.com/{bootstrapTenantId:D}?widened=true",
    $"http://login.microsoftonline.com/{bootstrapTenantId:D}",
    $"https://login.microsoftonline.example/{bootstrapTenantId:D}"
})
{
    Run($"bootstrap rejects authority {rejectedAuthority}", () =>
    {
        var json = $$"""{"publicClientId":"{{bootstrapClientId:D}}","tenantId":"{{bootstrapTenantId:D}}","authority":"{{rejectedAuthority}}"}""";
        Assert(!SetupBootstrapConfiguration.TryParse(json, out _), "non-exact or cross-tenant authority must be rejected");
    });
}

Run("guided demo selection is zero-write", () =>
{
    var experience = SetupExperienceSelection.ChooseGuidedDemo();
    Assert(experience.Kind == SetupExperienceKind.GuidedDemo, "guided demo expected");
    Assert(!experience.AllowsNetwork && !experience.AllowsJournal && !experience.AllowsTenantWrites,
        "guided demo must not allow network, journal, or tenant writes");
});
Run("manual setup avoids tenant writes", () =>
{
    var experience = SetupExperienceSelection.ChooseManualSetup();
    Assert(experience.Kind == SetupExperienceKind.ManualSetup, "manual setup expected");
    Assert(experience.AllowsNetwork && experience.AllowsJournal && !experience.AllowsTenantWrites,
        "manual setup may open Microsoft and save a local receipt but must not perform tenant writes");
});
Run("unavailable real setup is zero-write", () =>
{
    var experience = SetupExperienceSelection.ChooseReal(bootstrapAvailable: false);
    Assert(experience.Kind == SetupExperienceKind.RealUnavailable, "prerequisite state expected");
    Assert(!experience.AllowsNetwork && !experience.AllowsJournal && !experience.AllowsTenantWrites,
        "unavailable real setup must not allow network, journal, or tenant writes");
});
Run("configured real setup is explicit", () =>
{
    var experience = SetupExperienceSelection.ChooseReal(bootstrapAvailable: true);
    Assert(experience.Kind == SetupExperienceKind.RealAvailable
        && experience.AllowsNetwork && experience.AllowsJournal && experience.AllowsTenantWrites,
        "configured real setup capabilities expected");
});
Run("sample receipt is deterministic and clearly unsaved", () =>
{
    var operationId = Guid.Parse("77777777-7777-4777-8777-777777777777");
    var first = SetupExperienceSelection.CreateSampleReceipt(operationId);
    var second = SetupExperienceSelection.CreateSampleReceipt(operationId);
    Assert(first == second && first.Contains("DEMO-77777777777747778777777777777777", StringComparison.Ordinal),
        "stable sample receipt expected");
    Assert(first.Contains("Demo only—not saved or submitted.", StringComparison.Ordinal),
        "sample receipt must disclose zero persistence");
});

Run("welcome continues without writes", () => { var w = new SetupWorkflow(); w.ContinueFromWelcome(); Assert(w.Stage == SetupStage.AdministratorAccount && !w.HasStartedWrites, "safe transition expected"); });
Run("unverified administrator cannot be skipped", () => { var w = new SetupWorkflow(); w.ContinueFromWelcome(); Expect<InvalidOperationException>(() => w.Review(ValidPlan(Administrator()), now)); });
Run("cross-tenant group is rejected", () => { var w = VerifiedWorkflow(); var p = ValidPlan(w.VerifiedAdministrator!) with { Group = Group(Guid.Parse("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa")) }; Expect<InvalidOperationException>(() => w.Review(p, now)); });
Run("review requires browser and verified group", () => { var w = VerifiedWorkflow(); Expect<InvalidOperationException>(() => w.Review(ValidPlan(w.VerifiedAdministrator!) with { Browsers = BrowserTargets.None }, now)); });
Run("every consequential field changes digest", () =>
{
    var p = ValidPlan(Administrator()); var digest = p.DigestSha256();
    Assert(digest != (p with { Group = p.Group with { DisplayName = "Changed" } }).DigestSha256(), "group name must bind digest");
    Assert(digest != (p with { RequestedScopes = [.. p.RequestedScopes, "Additional.Scope"] }).DigestSha256(), "scopes must bind digest");
    Assert(digest != (p with { BuildIdentity = "changed" }).DigestSha256(), "build must bind digest");
    Assert(digest != (p with { DesiredApplication = p.DesiredApplication with { DisplayName = "Changed" } }).DigestSha256(), "app name must bind digest");
    Assert(digest != (p with { DesiredApplication = p.DesiredApplication with { Marker = "Changed" } }).DigestSha256(), "marker must bind digest");
    Assert(digest != (p with { DesiredApplication = p.DesiredApplication with { SignInAudience = "Changed" } }).DigestSha256(), "audience must bind digest");
    Assert(digest != (p with { DesiredApplication = p.DesiredApplication with { RedirectUris = ["https://changed.invalid"] } }).DigestSha256(), "redirects must bind digest");
});
Run("plan discloses temporary broad application permission exactly", () =>
{
    var scopes = ValidPlan(Administrator()).RequestedScopes;
    Assert(scopes.Contains("Application.ReadWrite.All"), "temporary application write permission expected");
    Assert(!scopes.Contains("AppRegistration.Create") && !scopes.Contains("Application.Read.All"), "undeliverable scope contract must be absent");
    var configured = (string[]?)typeof(MicrosoftAdministratorSession)
        .GetField("ApplicationProvisioningScopes", System.Reflection.BindingFlags.NonPublic | System.Reflection.BindingFlags.Static)
        ?.GetValue(null);
    Assert(configured is not null && configured.SequenceEqual(new[] { "Application.ReadWrite.All" }),
        "MSAL must request the disclosed temporary provisioning scope after approval");
    var exactScopeCheck = typeof(MicrosoftAdministratorSession)
        .GetMethod("ProvisioningScopesAreExact", System.Reflection.BindingFlags.NonPublic | System.Reflection.BindingFlags.Static)
        ?? throw new InvalidOperationException("scope validator expected");
    Assert((bool)exactScopeCheck.Invoke(null, new object[] { new[] { "Application.ReadWrite.All" } })!,
        "exact returned scopes must be accepted");
    Assert((bool)exactScopeCheck.Invoke(null, new object[] { new[] { "Application.ReadWrite.All", "GroupMember.Read.All" } })!,
        "previously granted discovery scopes must be accepted with provisioning");
    Assert(!(bool)exactScopeCheck.Invoke(null, new object[] { new[] { "Application.ReadWrite.All", "Directory.Read.All" } })!,
        "widened returned scopes must be rejected");
    Assert(!(bool)exactScopeCheck.Invoke(null, new object[] { new[] { "Application.Read.All" } })!,
        "missing returned scopes must be rejected");
});
Run("approval is not the tenant write boundary", () =>
{
    var w = VerifiedWorkflow(); var p = ValidPlan(w.VerifiedAdministrator!); w.Review(p, now);
    Expect<InvalidOperationException>(() => w.ApproveAndBegin(new string('0', 64), now));
    var approved = w.ApproveAndBegin(p.DigestSha256(), now);
    Assert(!w.HasStartedWrites && approved.Plan == p, "approval must precede the write boundary");
    w.MarkWriteBoundaryCrossed();
    Assert(w.HasStartedWrites, "explicit write boundary expected");
});
Run("expired plan cannot deploy", () => { var w = VerifiedWorkflow(); var p = ValidPlan(w.VerifiedAdministrator!); w.Review(p, now); Expect<InvalidOperationException>(() => w.ApproveAndBegin(p.DigestSha256(), p.ExpiresAtUtc)); });
Run("cancellation is blocked synchronously at authorization boundary", () =>
{
    var w = VerifiedWorkflow(); Assert(w.CancelBeforeWrites(), "pre-write cancel expected");
    w = VerifiedWorkflow(); var p = ValidPlan(w.VerifiedAdministrator!); w.Review(p, now); w.ApproveAndBegin(p.DigestSha256(), now); w.MarkWriteBoundaryCrossed();
    Assert(!w.CancelBeforeWrites(), "cancel must be blocked before provisioning authorization begins");
});

await RunAsync("lost create response blocks blind retry", async () =>
{
    var (approved, _) = Approved();
    var store = new MemoryJournalStore();
    var posts = 0;
    var handler = new DelegateHandler(request =>
    {
        if (request.RequestUri!.AbsolutePath.Contains("/groups/", StringComparison.Ordinal)) return Json(GroupJson());
        if (request.Method == HttpMethod.Post) { posts++; throw new HttpRequestException("simulated lost response"); }
        return Json("{\"value\":[]}");
    });
    var service = Service(handler, store);
    var first = await service.DeployAsync(approved, new ProgressSink(), CancellationToken.None);
    var second = await service.DeployAsync(approved, new ProgressSink(), CancellationToken.None);
    Assert(first.State == OperationState.RecoveryRequired && second.State == OperationState.RecoveryRequired, "recovery state expected");
    Assert(posts == 1, "a lost POST must never be repeated blindly");
    Assert(store.Journal?.MutationAttempts == 1, "one durable mutation attempt expected");
});

await RunAsync("existing exact application is idempotently reconciled", async () =>
{
    var (approved, plan) = Approved();
    var store = new MemoryJournalStore();
    var writes = 0;
    var handler = new DelegateHandler(request =>
    {
        if (request.RequestUri!.AbsolutePath.Contains("/groups/", StringComparison.Ordinal)) return Json(GroupJson());
        if (request.Method != HttpMethod.Get) writes++;
        return Json(ApplicationListJson(plan));
    });
    var result = await Service(handler, store).DeployAsync(approved, new ProgressSink(), CancellationToken.None);
    Assert(result.State == OperationState.Reconciled && writes == 0, "matching app must not be written again");
    Assert(store.Journal is { BootstrapServicePrincipalRemoved: true, LocalTokenCacheCleared: true, ProvisioningAccessTokenExpiresAtUtc: not null },
        "successful setup receipt must record bootstrap removal, local cache clearing, and token expiry");
});

await RunAsync("cleanup failure blocks successful completion", async () =>
{
    var (approved, plan) = Approved();
    var store = new MemoryJournalStore();
    var session = new FakeSession { CleanupSucceeds = false };
    var handler = new DelegateHandler(request => request.RequestUri!.AbsolutePath.Contains("/groups/", StringComparison.Ordinal)
        ? Json(GroupJson()) : Json(ApplicationListJson(plan)));
    var result = await Service(handler, store, session).DeployAsync(approved, new ProgressSink(), CancellationToken.None);
    Assert(result.State == OperationState.RecoveryRequired, "unconfirmed cleanup must not report setup success");
    Assert(store.Journal is { BootstrapServicePrincipalRemoved: false, LocalTokenCacheCleared: true },
        "receipt must preserve the exact partial cleanup result");
});

await RunAsync("provisioning authorization is bound to approved digest", async () =>
{
    var (approved, plan) = Approved();
    var session = new FakeSession();
    var handler = new DelegateHandler(request => request.RequestUri!.AbsolutePath.Contains("/groups/", StringComparison.Ordinal)
        ? Json(GroupJson()) : Json(ApplicationListJson(plan)));
    await Service(handler, new MemoryJournalStore(), session).DeployAsync(approved, new ProgressSink(), CancellationToken.None);
    Assert(session.ApprovedCalls == 1 && session.LastApprovedDigest == approved.Digest,
        "provisioning token request must carry the exact approved digest");
    Assert(session.CleanupCalls == 1, "successful provisioning must run cleanup exactly once");
});

await RunAsync("drifted marked application stops without PATCH", async () =>
{
    var (approved, plan) = Approved();
    var writes = new List<HttpMethod>();
    var handler = new DelegateHandler(request =>
    {
        if (request.RequestUri!.AbsolutePath.Contains("/groups/", StringComparison.Ordinal)) return Json(GroupJson());
        if (request.Method != HttpMethod.Get) writes.Add(request.Method);
        return Json(ApplicationListJson(plan, drifted: true));
    });
    var result = await Service(handler, new MemoryJournalStore()).DeployAsync(approved, new ProgressSink(), CancellationToken.None);
    Assert(result.State == OperationState.RecoveryRequired, "drift must require manual recovery");
    Assert(writes.Count == 0, "drifted existing applications must never be changed");
});

await RunAsync("journal tamper is rejected", async () =>
{
    var (approved, _) = Approved();
    var store = new MemoryJournalStore { Journal = DeploymentJournal.Create(approved, new string('A', 64), now) };
    var service = Service(new DelegateHandler(request => request.RequestUri!.AbsolutePath.Contains("/groups/", StringComparison.Ordinal) ? Json(GroupJson()) : Json("{\"value\":[]}")), store);
    await ExpectAsync<InvalidOperationException>(() => service.DeployAsync(approved, new ProgressSink(), CancellationToken.None));
});

await RunAsync("POST success persists IDs before full-state verification", async () =>
{
    var (approved, plan) = Approved();
    var store = new MemoryJournalStore();
    var handler = new DelegateHandler(request =>
    {
        var path = request.RequestUri!.AbsolutePath;
        if (path.Contains("/groups/", StringComparison.Ordinal)) return Json(GroupJson());
        if (request.Method == HttpMethod.Post) return Json(ApplicationObjectJson(plan));
        if (path.EndsWith("/applications", StringComparison.Ordinal)) return Json("{\"value\":[]}");
        return Json(ApplicationObjectJson(plan, drifted: true));
    });
    var result = await Service(handler, store).DeployAsync(approved, new ProgressSink(), CancellationToken.None);
    Assert(result.State == OperationState.RecoveryRequired, "full-state mismatch must require recovery");
    Assert(store.History.Any(journal => journal.State == OperationState.Partial
        && journal.ApplicationObjectId is not null && journal.ApplicationClientId is not null),
        "returned IDs must be durable before verification");
    Assert(store.Journal?.ApplicationObjectId is not null && store.Journal.ApplicationClientId is not null,
        "mismatch receipt must retain returned IDs");
});

await RunAsync("restart recovery never duplicates an ambiguous POST", async () =>
{
    var (approved, _) = Approved();
    var store = new MemoryJournalStore();
    var initialPosts = 0;
    var firstHandler = new DelegateHandler(request =>
    {
        if (request.RequestUri!.AbsolutePath.Contains("/groups/", StringComparison.Ordinal)) return Json(GroupJson());
        if (request.Method == HttpMethod.Post) { initialPosts++; throw new HttpRequestException("lost response"); }
        return Json("{\"value\":[]}");
    });
    await Service(firstHandler, store).DeployAsync(approved, new ProgressSink(), CancellationToken.None);
    var recoveredJournal = store.Journal ?? throw new InvalidOperationException("recovery journal expected");

    var restartedPosts = 0;
    var restartedHandler = new DelegateHandler(request =>
    {
        if (request.Method == HttpMethod.Post) restartedPosts++;
        if (request.RequestUri!.AbsolutePath.Contains("/groups/", StringComparison.Ordinal)) return Json(GroupJson());
        return Json("{\"value\":[]}");
    });
    var restartedService = Service(restartedHandler, store, new FakeSession());
    var recovery = await restartedService.RecoverAsync(Administrator(), recoveredJournal, new ProgressSink(), CancellationToken.None);
    var retry = await restartedService.DeployAsync(approved, new ProgressSink(), CancellationToken.None);
    Assert(initialPosts == 1 && restartedPosts == 0, "new process/service state must not duplicate POST");
    Assert(recovery.State == OperationState.RecoveryRequired && retry.State == OperationState.RecoveryRequired,
        "original ambiguous operation must remain the recovery authority");
});

await RunAsync("unresolved original operation blocks a fresh nonce", async () =>
{
    var (firstApproved, _) = Approved();
    var store = new MemoryJournalStore();
    var handler = new DelegateHandler(request =>
    {
        if (request.RequestUri!.AbsolutePath.Contains("/groups/", StringComparison.Ordinal)) return Json(GroupJson());
        if (request.Method == HttpMethod.Post) throw new HttpRequestException("lost response");
        return Json("{\"value\":[]}");
    });
    var service = Service(handler, store);
    await service.DeployAsync(firstApproved, new ProgressSink(), CancellationToken.None);

    var admin = Administrator();
    var nonce = Guid.Parse("66666666-6666-4666-8666-666666666666");
    var secondPlan = ValidPlan(admin) with
    {
        Nonce = nonce,
        DesiredApplication = ValidPlan(admin).DesiredApplication with
        {
            DisplayName = "Better CaptionKeep second",
            Marker = $"BetterCaptionKeepDeployment:{nonce:D}"
        }
    };
    var workflow = VerifiedWorkflow();
    workflow.Review(secondPlan, now);
    var secondApproved = workflow.ApproveAndBegin(secondPlan.DigestSha256(), now);
    await ExpectAsync<InvalidOperationException>(() => service.DeployAsync(secondApproved, new ProgressSink(), CancellationToken.None));
});

await RunAsync("operation lock serializes concurrent deploy callers", async () =>
{
    var (approved, plan) = Approved();
    var store = new MemoryJournalStore();
    var posts = 0;
    var handler = new DelegateHandler(request =>
    {
        var path = request.RequestUri!.AbsolutePath;
        if (path.Contains("/groups/", StringComparison.Ordinal)) return Json(GroupJson());
        if (request.Method == HttpMethod.Post) { Interlocked.Increment(ref posts); Thread.Sleep(80); return Json(ApplicationObjectJson(plan)); }
        if (path.EndsWith("/applications", StringComparison.Ordinal)) return Json("{\"value\":[]}");
        return Json(ApplicationObjectJson(plan));
    });
    var service = Service(handler, store);
    var results = await Task.WhenAll(
        service.DeployAsync(approved, new ProgressSink(), CancellationToken.None),
        service.DeployAsync(approved, new ProgressSink(), CancellationToken.None));
    Assert(posts == 1 && results.All(result => result.State == OperationState.Confirmed),
        "concurrent callers must produce one POST and one confirmed operation");
});

await RunAsync("receipt is durable and redacts credentials", async () =>
{
    var (approved, _) = Approved();
    var root = Path.Combine(Path.GetTempPath(), "bck-contract-" + Guid.NewGuid().ToString("N"));
    try
    {
        var store = new FileDeploymentJournalStore(root);
        var journal = DeploymentJournal.Create(approved, new string('B', 64), now);
        var path = await store.WriteAsync(journal, CancellationToken.None);
        var text = await File.ReadAllTextAsync(path);
        Assert(!text.Contains("admin@example.invalid", StringComparison.OrdinalIgnoreCase), "UPN must be redacted");
        Assert(!text.Contains("session-secret", StringComparison.Ordinal) && !text.Contains("token-secret", StringComparison.Ordinal), "credentials must be absent");
        Assert(text.Contains("administratorAccountSha256", StringComparison.Ordinal), "account hash expected");
        Assert(text.Contains(approved.Plan.DesiredApplication.Marker, StringComparison.Ordinal), "stable marker must be persisted");
        var unresolved = await store.ListUnresolvedAsync(Administrator(), CancellationToken.None);
        Assert(unresolved.Count == 1 && unresolved[0].DesiredApplication.DisplayName == approved.Plan.DesiredApplication.DisplayName,
            "restart discovery must recover the original desired state");
    }
    finally { if (Directory.Exists(root)) Directory.Delete(root, true); }
});

await RunAsync("file lock excludes a second process store", async () =>
{
    var root = Path.Combine(Path.GetTempPath(), "bck-lock-" + Guid.NewGuid().ToString("N"));
    try
    {
        var operationId = Guid.NewGuid();
        var first = new FileDeploymentJournalStore(root);
        var second = new FileDeploymentJournalStore(root);
        var held = await first.AcquireOperationLockAsync(operationId, CancellationToken.None);
        using var timeout = new CancellationTokenSource(TimeSpan.FromSeconds(3));
        var waiting = second.AcquireOperationLockAsync(operationId, timeout.Token);
        await Task.Delay(120);
        Assert(!waiting.IsCompleted, "second store must wait while the operation lock is held");
        await held.DisposeAsync();
        await using var acquired = await waiting;
    }
    finally { if (Directory.Exists(root)) Directory.Delete(root, true); }
});

Run("complete enterprise package launches without a tenant bootstrap", () => WithEnterprisePackage(root =>
{
    var launcher = new EnterpriseSetupLauncher(root);
    Assert(launcher.TryLocate(out var found, out var reason) && found == root && reason.Length == 0,
        "complete engine must be available without setup-bootstrap.json");
    foreach (var mode in Enum.GetValues<EnterpriseSetupMode>())
    {
        var start = launcher.CreateStartInfo(mode);
        Assert(start.UseShellExecute && !start.CreateNoWindow && start.WindowStyle == System.Diagnostics.ProcessWindowStyle.Hidden
            && start.WorkingDirectory == root,
            "graphical wizard must allocate a hidden console so Microsoft WAM can resolve its parent window");
        Assert(start.FileName == Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.System),
                "WindowsPowerShell", "v1.0", "powershell.exe")
            && string.IsNullOrEmpty(start.Verb) && !start.RedirectStandardInput && !start.RedirectStandardOutput
            && !start.RedirectStandardError,
            "shell launch must use only system PowerShell without elevation, associations or redirected browser pipes");
        var expectedArguments = new[] { "-NoLogo", "-NoProfile", "-STA", "-File",
            Path.Combine(root, "Enterprise-Launcher.ps1"), "-Mode", mode.ToString(), "-GuidedUi",
            "-OutputRoot", launcher.GetOutputRoot(), "-DeploymentTransport", "Win32" };
        Assert(start.ArgumentList.SequenceEqual(expectedArguments),
            "argument vector must contain only the fixed script and supported operation");
        Assert(!start.ArgumentList.Any(argument => argument.Contains("Bypass", StringComparison.OrdinalIgnoreCase)),
            "setup must not bypass execution policy");
    }
    Expect<ArgumentOutOfRangeException>(() => launcher.CreateStartInfo((EnterpriseSetupMode)999));
}));
Run("receipt destination is writable independently of the protected package", () =>
{
    var fixture = Path.Combine("P:\\", "bck-destination-fixture-" + Guid.NewGuid().ToString("N"), "administrator");
    var development = new EnterpriseSetupLauncher(Path.Combine(fixture, "enterprise"));
    Assert(development.GetOutputRoot() == Path.Combine(fixture, "operations"),
        "P development receipts must remain on P outside the checksummed engine folder");
    var installed = new EnterpriseSetupLauncher("C:\\Program Files\\DAF-TECH\\Better CaptionKeep\\enterprise");
    var expected = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
        "DAF-TECH", "Better CaptionKeep", "Deployments");
    Assert(installed.GetOutputRoot() == expected,
        "asInvoker customer installations require per-user receipts outside Program Files");
    Assert(!Directory.Exists(Path.Combine(fixture, "operations")),
        "choosing a destination must not create an operation before approval");
});
Run("graphical setup preserves a WAM parent window through its PowerShell child chain", () => WithEnterprisePackage(root =>
{
    var probe = Path.Combine(root, "console-probe.ps1");
    var firstReport = Path.Combine(root, "winps-window.json");
    var nestedReport = Path.Combine(root, "pwsh-window.json");
    var powerShell7 = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles), "PowerShell", "7", "pwsh.exe");
    Assert(File.Exists(powerShell7), "supported PowerShell 7 is required for the native launcher regression");
    File.WriteAllText(probe, """
        param([string]$ReportPath,[string]$NestedReportPath,[string]$NativePowerShell)
        $ErrorActionPreference='Stop'
        Add-Type -TypeDefinition @'
        using System;
        using System.Runtime.InteropServices;
        public static class NativeConsoleProbe {
         [DllImport("kernel32.dll")] public static extern IntPtr GetConsoleWindow();
         [DllImport("user32.dll", ExactSpelling=true)] public static extern IntPtr GetAncestor(IntPtr hwnd,uint flags);
        }
        '@
        $console=[NativeConsoleProbe]::GetConsoleWindow()
        $owner=[NativeConsoleProbe]::GetAncestor($console,3)
        [IO.File]::WriteAllText($ReportPath,(@{consoleHwnd=$console.ToInt64();rootOwnerHwnd=$owner.ToInt64()}|ConvertTo-Json -Compress))
        if($NativePowerShell) {
         & $NativePowerShell -NoLogo -NoProfile -STA -File $PSCommandPath -ReportPath $NestedReportPath
         if($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
        }
        """);
    var start = new EnterpriseSetupLauncher(root).CreateStartInfo(EnterpriseSetupMode.Setup);
    start.ArgumentList.Clear();
    foreach (var argument in new[] { "-NoLogo", "-NoProfile", "-STA", "-File", probe,
        "-ReportPath", firstReport, "-NestedReportPath", nestedReport, "-NativePowerShell", powerShell7 })
        start.ArgumentList.Add(argument);
    using var process = System.Diagnostics.Process.Start(start)
        ?? throw new InvalidOperationException("Native console probe did not start.");
    if (!process.WaitForExit(20000)) { process.Kill(true); throw new InvalidOperationException("Native console probe exceeded its bounded wait."); }
    Assert(process.ExitCode == 0, "native console probe must exit successfully without authentication");
    var evidenceDirectory = Path.Combine(Environment.GetEnvironmentVariable("AGENT_WORKING_DIR") ?? Path.GetTempPath(), "reports");
    Directory.CreateDirectory(evidenceDirectory);
    var evidencePath = Path.Combine(evidenceDirectory, "wam-console-probe-" + Guid.NewGuid().ToString("N") + ".json");
    File.WriteAllText(evidencePath, System.Text.Json.JsonSerializer.Serialize(new
    {
        parentConsoleHwnd = NativeConsoleTestUtilities.GetConsoleWindow().ToInt64(),
        parentRootOwnerHwnd = NativeConsoleTestUtilities.GetAncestor(NativeConsoleTestUtilities.GetConsoleWindow(), 3).ToInt64(),
        windowsPowerShell = System.Text.Json.JsonDocument.Parse(File.ReadAllText(firstReport)).RootElement,
        powerShell7 = System.Text.Json.JsonDocument.Parse(File.ReadAllText(nestedReport)).RootElement
    }));
    foreach (var report in new[] { firstReport, nestedReport })
    {
        using var document = System.Text.Json.JsonDocument.Parse(File.ReadAllText(report));
        Assert(document.RootElement.GetProperty("consoleHwnd").GetInt64() != 0
            && document.RootElement.GetProperty("rootOwnerHwnd").GetInt64() != 0,
            $"Microsoft Graph's GetConsoleWindow/GetAncestor lookup must resolve a nonzero WAM parent: {Path.GetFileName(report)} {document.RootElement.GetRawText()}. Preserved {evidencePath}");
    }
}));
Run("changed deployment script is blocked before launch", () => WithEnterprisePackage(root =>
{
    File.AppendAllText(Path.Combine(root, "Enterprise-Setup.ps1"), "tampered");
    var launcher = new EnterpriseSetupLauncher(root);
    Assert(!launcher.TryLocate(out _, out var reason) && reason.Contains("No Microsoft 365 settings have changed", StringComparison.Ordinal),
        "corruption must be safely actionable");
    Expect<InvalidOperationException>(() => launcher.CreateStartInfo(EnterpriseSetupMode.Setup));
}));
Run("incomplete engine manifest is rejected", () => WithEnterprisePackage(root =>
{
    var path = Path.Combine(root, "SHA256SUMS.txt");
    File.WriteAllLines(path, File.ReadAllLines(path).Where(line => !line.EndsWith("profile.chrome.json", StringComparison.Ordinal)));
    Expect<InvalidOperationException>(() => EnterpriseSetupLauncher.ValidatePackage(root));
}));
Run("manifest traversal and duplicate entries are rejected", () => WithEnterprisePackage(root =>
{
    var manifest = Path.Combine(root, "SHA256SUMS.txt");
    var original = File.ReadAllText(manifest);
    foreach (var invalid in new[] { "../outside.ps1", "C:/outside.ps1", "nested/../outside.ps1", "./Enterprise-Setup.ps1", "nested\\outside.ps1" })
    {
        File.WriteAllText(manifest, original + new string('a', 64) + "  " + invalid + "\n");
        Expect<InvalidOperationException>(() => EnterpriseSetupLauncher.ValidatePackage(root));
    }
    File.WriteAllText(manifest, original + original.Split('\n', StringSplitOptions.RemoveEmptyEntries)[0] + "\n");
    Expect<InvalidOperationException>(() => EnterpriseSetupLauncher.ValidatePackage(root));
}));

if (failures.Count > 0) { Console.Error.WriteLine(string.Join(Environment.NewLine, failures)); return 1; }
Console.WriteLine($"{testCount} contract tests passed."); return 0;

AuthenticatedAdministrator Administrator() => new(Guid.Parse("11111111-1111-4111-8111-111111111111"), "account-1", "admin@example.invalid", "Example", CloudEnvironment.Global, "session-secret");
VerifiedGroupReference Group(Guid? tenant = null) => new(tenant ?? Administrator().TenantId, Guid.Parse("22222222-2222-4222-8222-222222222222"), "Pilot", "Assigned security group", true, false, 1);
SetupPlan ValidPlan(AuthenticatedAdministrator admin)
{
    var nonce = Guid.Parse("33333333-3333-4333-8333-333333333333");
    return new(1, admin, Group(admin.TenantId), BrowserTargets.Edge | BrowserTargets.Chrome,
        ["Application.ReadWrite.All", "GroupMember.Read.All"],
        new("Better CaptionKeep test", $"BetterCaptionKeepDeployment:{nonce:D}", "AzureADMyOrg",
            ["https://example.invalid/callback"], ApplicationProvisioningAction.CreateOrObserve,
            ApplicationDriftPolicy.StopForManualReview),
        new Dictionary<string,string>{{"app-contract",new string('A',64)}}.ToImmutableDictionary(StringComparer.Ordinal),
        "dev-build", nonce, now, now.AddMinutes(10));
}
SetupWorkflow VerifiedWorkflow() { var w = new SetupWorkflow(); w.ContinueFromWelcome(); w.SetVerifiedAdministrator(Administrator()); return w; }
(ApprovedDeployment Approved, SetupPlan Plan) Approved() { var w = VerifiedWorkflow(); var p = ValidPlan(w.VerifiedAdministrator!); w.Review(p, now); return (w.ApproveAndBegin(p.DigestSha256(), now), p); }
MicrosoftGraphProvisioningService Service(HttpMessageHandler handler, IDeploymentJournalStore store, FakeSession? session = null) => new(session ?? new FakeSession(), new HttpClient(handler), store, () => now, (_, _) => Task.CompletedTask);
string GroupJson() => $"{{\"id\":\"{Group().ObjectId:D}\",\"displayName\":\"Pilot\",\"groupTypes\":[],\"securityEnabled\":true,\"membershipRule\":null}}";
string ApplicationListJson(SetupPlan plan, bool drifted = false)
{
    var display = plan.DesiredApplication.DisplayName;
    var redirects = string.Join(',', plan.DesiredApplication.RedirectUris.Select(uri => $"\"{uri}\""));
    var audience = drifted ? "AzureADMultipleOrgs" : "AzureADMyOrg";
    return $"{{\"value\":[{{\"id\":\"44444444-4444-4444-8444-444444444444\",\"appId\":\"55555555-5555-4555-8555-555555555555\",\"displayName\":\"{display}\",\"notes\":\"{plan.DesiredApplication.Marker}\",\"signInAudience\":\"{audience}\",\"spa\":{{\"redirectUris\":[{redirects}]}}}}]}}";
}
string ApplicationObjectJson(SetupPlan plan, bool drifted = false) => ApplicationListJson(plan, drifted)[10..^2];
HttpResponseMessage Json(string value) => new(HttpStatusCode.OK) { Content = new StringContent(value, Encoding.UTF8, "application/json") };
void Run(string name, Action action) { testCount++; try { action(); } catch (Exception e) { failures.Add($"FAIL {name}: {e.Message}"); } }
async Task RunAsync(string name, Func<Task> action) { testCount++; try { await action(); } catch (Exception e) { failures.Add($"FAIL {name}: {e.Message}"); } }
void Assert(bool condition, string message) { if (!condition) throw new InvalidOperationException(message); }
void Expect<T>(Action action) where T : Exception { try { action(); } catch (T) { return; } throw new InvalidOperationException($"Expected {typeof(T).Name}."); }
async Task ExpectAsync<T>(Func<Task> action) where T : Exception { try { await action(); } catch (T) { return; } throw new InvalidOperationException($"Expected {typeof(T).Name}."); }
void WithEnterprisePackage(Action<string> action)
{
    var fixture = Path.Combine(Path.GetTempPath(), "bck-enterprise-launch-" + Guid.NewGuid().ToString("N"));
    var root = Path.Combine(fixture, "enterprise");
    Directory.CreateDirectory(root);
    try
    {
        var names = new[] { "Enterprise-Launcher.ps1", "Enterprise-Setup.ps1", "Enterprise-Endpoint.ps1", "Enterprise-Dialogs.ps1", "Enterprise-Runtime.ps1", "Enterprise-Signing.ps1", "Enterprise-SignerMigration.ps1",
            "managed-schema.json", "profile.json", "profile.chrome.json", "profile.local-only.json",
            "Enterprise-Win32.ps1", "EndpointWorker.exe", "endpoint-worker.intunewin", "endpoint-worker-package.json" };
        var lines = new List<string>();
        foreach (var name in names)
        {
            var content = Encoding.UTF8.GetBytes("synthetic fixture: " + name);
            File.WriteAllBytes(Path.Combine(root, name), content);
            lines.Add(Convert.ToHexString(System.Security.Cryptography.SHA256.HashData(content)).ToLowerInvariant() + "  " + name);
        }
        File.WriteAllText(Path.Combine(root, "SHA256SUMS.txt"), string.Join('\n', lines) + "\n");
        EnterpriseAzureRoutingTests.WriteSettings(fixture);
        action(root);
    }
    finally { Directory.Delete(fixture, true); }
}

sealed class FakeSession : IAdministratorSessionProvider
{
    public bool CleanupSucceeds { get; init; } = true;
    public int ApprovedCalls { get; private set; }
    public int CleanupCalls { get; private set; }
    public string? LastApprovedDigest { get; private set; }
    public Task<string> AcquireAccessTokenAsync(AuthenticatedAdministrator administrator, GraphAccessPurpose purpose, CancellationToken cancellationToken) => Task.FromResult("token-secret");
    public Task<string> AcquireProvisioningAccessTokenAsync(ApprovedDeployment approvedDeployment, CancellationToken cancellationToken)
    {
        ApprovedCalls++;
        LastApprovedDigest = approvedDeployment.Digest;
        return Task.FromResult("token-secret");
    }
    public Task<string> AcquireRecoveryAccessTokenAsync(AuthenticatedAdministrator administrator, DeploymentJournal journal, CancellationToken cancellationToken) => Task.FromResult("token-secret");
    public Task<ProvisioningCleanupResult> CompleteProvisioningAsync(AuthenticatedAdministrator administrator, string accessToken, CancellationToken cancellationToken)
    {
        CleanupCalls++;
        return Task.FromResult(new ProvisioningCleanupResult(CleanupSucceeds, true, DateTimeOffset.Parse("2026-11-12T19:00:00Z"),
            CleanupSucceeds
                ? "Temporary bootstrap identity removed; local token cache cleared; issued token expiry recorded."
                : "Bootstrap identity removal was not confirmed; local token cache cleared; issued token expiry recorded."));
    }
}

sealed class ProgressSink : IProgress<DeploymentProgress> { public void Report(DeploymentProgress value) { } }

sealed class DelegateHandler(Func<HttpRequestMessage, HttpResponseMessage> send) : HttpMessageHandler
{
    protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken) => Task.FromResult(send(request));
}

static class NativeConsoleTestUtilities
{
    [System.Runtime.InteropServices.DllImport("kernel32.dll")]
    public static extern IntPtr GetConsoleWindow();
    [System.Runtime.InteropServices.DllImport("user32.dll", ExactSpelling = true)]
    public static extern IntPtr GetAncestor(IntPtr hwnd, uint flags);
}

sealed class MemoryJournalStore : IDeploymentJournalStore
{
    private readonly System.Collections.Concurrent.ConcurrentDictionary<Guid, SemaphoreSlim> gates = new();
    public DeploymentJournal? Journal { get; set; }
    public List<DeploymentJournal> History { get; } = [];
    public Task<DeploymentJournal?> ReadAsync(Guid operationId, CancellationToken cancellationToken) => Task.FromResult(Journal);
    public Task<string> WriteAsync(DeploymentJournal journal, CancellationToken cancellationToken) { Journal = journal; History.Add(journal); return Task.FromResult("memory://receipt"); }
    public Task<IReadOnlyList<DeploymentJournal>> ListUnresolvedAsync(AuthenticatedAdministrator administrator, CancellationToken cancellationToken) =>
        Task.FromResult<IReadOnlyList<DeploymentJournal>>(Journal is { IsUnresolved: true } && Journal.MatchesAdministrator(administrator) ? [Journal] : []);
    public async Task<IAsyncDisposable> AcquireOperationLockAsync(Guid operationId, CancellationToken cancellationToken)
    {
        var gate = gates.GetOrAdd(operationId, _ => new SemaphoreSlim(1, 1));
        await gate.WaitAsync(cancellationToken);
        return new Releaser(gate);
    }
    public string GetReceiptPath(Guid operationId) => "memory://receipt";
    private sealed class Releaser(SemaphoreSlim gate) : IAsyncDisposable
    {
        public ValueTask DisposeAsync() { gate.Release(); return ValueTask.CompletedTask; }
    }
}

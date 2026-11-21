using System.Collections.Immutable;
using System.ComponentModel;
using System.Diagnostics;
using System.IO;
using System.Net.Http;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Windows;
using System.Windows.Interop;
using System.Windows.Input;
using BetterCaptionKeep.AdminSetup.Domain;
using BetterCaptionKeep.AdminSetup.Services;

namespace BetterCaptionKeep.AdminSetup;

public partial class MainWindow : Window
{
    private enum PreviewExperienceStage { None, Progress, Result }

    private SetupWorkflow workflow = new();
    private IAdministratorAuthenticationService? authenticationService;
    private IMicrosoftGraphProvisioningService? graphService;
    private readonly CancellationTokenSource lifetime = new();
    private IDeploymentJournalStore? journalStore;
    private readonly SetupBootstrapConfiguration? bootstrapConfiguration;
    private readonly string launchMode;
    private string sourceExtensionId = "pjpibiimicedkckleehljlklmblkacph";
    private readonly bool realModeConfigured;
    private SetupExperienceSelection experience = SetupExperienceSelection.Welcome;
    private CancellationTokenSource? groupSearch;
    private CancellationTokenSource? previewAnimation;
    private CancellationTokenSource? deploymentCancellation;
    private DeploymentJournal? pendingRecovery;
    private bool recoveryInProgress;
    private bool recoveryInventoryFailed;
    private long groupSearchGeneration;
    private string? acknowledgedPlanDigest;
    private PreviewExperienceStage previewExperience;
    private DeploymentResult? lastDeploymentResult;
    private readonly EnterpriseSetupLauncher enterpriseLauncher = new();
    private readonly BrowserIntegrationService browserIntegration = new();
    private Process? enterpriseProcess;
    private bool authenticationInProgress;
    private bool browserIntegrationInProgress;
    private bool externalLaunchInProgress;
    private EnterpriseSetupProgress? enterpriseProgress;
    private OwnedSignInWindow? ownedSignIn;
    private EnterpriseSetupStage? externalStage;
    private System.Windows.Controls.TextBlock? externalSelectedStep;
    private Guid externalOperationId;
    private long externalPresentationVersion;
    private bool ExternalOperationActive => browserIntegrationInProgress || externalLaunchInProgress
        || enterpriseProcess is { HasExited: false };

    private bool IsGuidedDemo => experience.Kind == SetupExperienceKind.GuidedDemo;
    private bool previewMode => IsGuidedDemo;
    private IAdministratorAuthenticationService AuthenticationService => authenticationService
        ?? throw new InvalidOperationException("Choose a setup experience before authentication.");
    private IMicrosoftGraphProvisioningService GraphService => graphService
        ?? throw new InvalidOperationException("Choose a setup experience before Microsoft Graph operations.");
    private IDeploymentJournalStore JournalStore => journalStore
        ?? throw new InvalidOperationException("The durable journal is available only for configured real setup.");

    public MainWindow()
    {
        InitializeComponent();
        // Custom chrome uses routed commands; Window does not bind these automatically.
        CommandBindings.Add(new CommandBinding(SystemCommands.CloseWindowCommand,
            (_, e) => { Close(); e.Handled = true; },
            (_, e) => { e.CanExecute = true; e.Handled = true; }));
        CommandBindings.Add(new CommandBinding(SystemCommands.MinimizeWindowCommand,
            (_, e) => { WindowState = WindowState.Minimized; e.Handled = true; },
            (_, e) => { e.CanExecute = ResizeMode != ResizeMode.NoResize; e.Handled = true; }));
        CommandBindings.Add(new CommandBinding(SystemCommands.MaximizeWindowCommand,
            (_, e) => { WindowState = WindowState.Maximized; e.Handled = true; },
            (_, e) => { e.CanExecute = ResizeMode is ResizeMode.CanResize or ResizeMode.CanResizeWithGrip; e.Handled = true; }));
        CommandBindings.Add(new CommandBinding(SystemCommands.RestoreWindowCommand,
            (_, e) => { WindowState = WindowState.Normal; e.Handled = true; },
            (_, e) => { e.CanExecute = true; e.Handled = true; }));
        launchMode = GetLaunchMode(Environment.GetCommandLineArgs());
        if (previewMode)
        {
            Title += " — NO-WRITE PREVIEW";
            EnvironmentBadgeText.Text = "DEVELOPMENT · NO-WRITE PREVIEW";
            WelcomeDescription.Text = "Explore the administrator setup flow with synthetic data. This preview does not contact Microsoft, request consent, create an application registration, change Intune, or make endpoint changes.";
            YourControlsText.Text = "Nothing is deployed until an administrator reviews and approves an exact plan. This preview never deploys.";
            TenantCardDescription.Text = "The planned Entra application and later Intune assignment remain customer-owned.";
            VerifiedResultDescription.Text = "Preview the review, verification, and durable-receipt experience without tenant changes.";
            AdministratorConsentNote.Text = "Production note: Microsoft may request read-only consent before group discovery. Granting consent can create or update a tenant permission grant. This synthetic preview requests nothing.";
        }
        else
        {
            Title += " — Development tenant changes";
            EnvironmentBadgeText.Text = "DEVELOPMENT · TENANT CHANGES";
            WelcomeDescription.Text = "Choose guided automatic setup or create the Entra application yourself. Automatic setup uses temporary Application.ReadWrite.All only after final approval, creates or observes the exact customer-owned app, removes the bootstrap enterprise application, clears its local token cache, and records the remaining token-expiry window. Intune deployment remains disabled.";
            YourControlsText.Text = "No tenant write begins until an administrator reviews the exact tenant, group, application, permissions, and operation digest, then gives final approval.";
            TenantCardDescription.Text = "Automatic setup can create only the reviewed customer-owned Entra application registration. Manual setup avoids broad provisioning permission.";
            VerifiedResultDescription.Text = "Verify the application registration and retain a durable operation receipt. Endpoint deployment is not enabled in this build.";
            AdministratorConsentNote.Text = "Group discovery requests GroupMember.Read.All. Automatic application creation later requests temporary Application.ReadWrite.All only after you review and approve the exact plan.";
        }
        realModeConfigured = SetupBootstrapConfiguration.TryLoad(out var configuration) && configuration is not null;
        bootstrapConfiguration = configuration;
        var arguments = Environment.GetCommandLineArgs();
        var sourceIndex = Array.IndexOf(arguments, "--source-extension");
        var versionIndex = Array.IndexOf(arguments, "--extension-version");
        if (sourceIndex >= 0 && sourceIndex + 1 < arguments.Length && versionIndex >= 0 && versionIndex + 1 < arguments.Length)
        {
            var sourceId = arguments[sourceIndex + 1];
            var sourceVersion = arguments[versionIndex + 1];
            if (sourceId.Length == 32 && sourceId.All(character => character is >= 'a' and <= 'p') && Version.TryParse(sourceVersion, out _))
            {
                sourceExtensionId = sourceId;
                ManualRedirectUri.Text = $"https://{sourceExtensionId}.chromiumapp.org/microsoft";
                StatusText.Text = $"Opened from Better CaptionKeep {sourceVersion}. No organization changes have been made.";
            }
        }
        ApplyWelcomePresentation();
        RenderStage();
    }

    private async void StartEnterpriseSetupButton_Click(object sender, RoutedEventArgs e)
    {
        if (ExternalOperationActive) return;
        browserIntegrationInProgress = true;
        PresentExternalStage(EnterpriseSetupStage.Preparing);
        UpdateEnterpriseActions();
        try
        {
            // Yield a visible busy card first, then keep package/registry checks off the UI thread.
            await System.Windows.Threading.Dispatcher.Yield(System.Windows.Threading.DispatcherPriority.Render);
            await Task.Run(() => browserIntegration.EnsureRegisteredAsync(lifetime.Token), lifetime.Token);
            if (!lifetime.IsCancellationRequested) await LaunchEnterpriseSetupAsync(EnterpriseSetupMode.Setup, true);
        }
        catch (OperationCanceledException) { PresentExternalStage(EnterpriseSetupStage.Canceled); }
        catch (Exception exception)
        {
            PresentExternalStage(EnterpriseSetupStage.Failed);
            EnterpriseLaunchStatus.Text = SafeError(exception);
            StatusText.Text = "Browser integration needs attention. Microsoft 365 setup has not started.";
        }
        finally
        {
            browserIntegrationInProgress = false;
            UpdateEnterpriseActions();
        }
    }

    private async void EnterpriseStatusButton_Click(object sender, RoutedEventArgs e) => await LaunchEnterpriseSetupAsync(EnterpriseSetupMode.Status);

    private async void EnterpriseContinueButton_Click(object sender, RoutedEventArgs e) => await LaunchEnterpriseSetupAsync(EnterpriseSetupMode.Continue);

    private async Task LaunchEnterpriseSetupAsync(EnterpriseSetupMode mode, bool browserPrepared = false)
    {
        if (externalLaunchInProgress || enterpriseProcess is { HasExited: false } || (browserIntegrationInProgress && !browserPrepared))
        {
            EnterpriseLaunchStatus.Text = "A setup window is already open. Finish or close it before starting another operation.";
            return;
        }
        externalLaunchInProgress = true;
        var operationId = externalOperationId = Guid.NewGuid();
        PresentExternalStage(EnterpriseSetupStage.Preparing);
        UpdateEnterpriseActions();
        try
        {
            await System.Windows.Threading.Dispatcher.Yield(System.Windows.Threading.DispatcherPriority.Render);
            if (enterpriseProgress is not null) await enterpriseProgress.DisposeAsync();
            ownedSignIn?.Dispose();
            var owner = new WindowInteropHelper(this).EnsureHandle();
            ownedSignIn = new OwnedSignInWindow(owner);
            enterpriseProgress = new EnterpriseSetupProgress(stage => Dispatcher.BeginInvoke(() =>
            {
                if (!lifetime.IsCancellationRequested && externalOperationId == operationId && ExternalOperationActive) PresentExternalStage(stage);
            }));
            enterpriseProcess?.Dispose();
            enterpriseProcess = null;
            var pipeName = enterpriseProgress.PipeName;
            enterpriseProcess = await Task.Run(() => enterpriseLauncher.Launch(mode, owner, pipeName), lifetime.Token);
            enterpriseProgress.BindToProcess(enterpriseProcess.Id);
            var launchedProcess = enterpriseProcess;
            launchedProcess.Exited += (_, _) => Dispatcher.BeginInvoke(async () =>
            {
                if (lifetime.IsCancellationRequested || !ReferenceEquals(enterpriseProcess, launchedProcess)) return;
                externalOperationId = Guid.Empty;
                ownedSignIn?.Dispose();
                ownedSignIn = null;
                var progress = enterpriseProgress;
                enterpriseProgress = null;
                if (progress is not null) await progress.DisposeAsync();
                if (externalStage is not (EnterpriseSetupStage.Complete or EnterpriseSetupStage.Failed or EnterpriseSetupStage.Canceled))
                    PresentExternalStage(launchedProcess.ExitCode == 0 ? EnterpriseSetupStage.Complete : EnterpriseSetupStage.Failed);
                ExternalOperationProgress.IsIndeterminate = false;
                ShowSigninButton.Visibility = Visibility.Collapsed;
                EnterpriseLaunchStatus.Text = "The setup window closed. Check deployment status to see Microsoft's recorded result; closing the window does not prove setup completed.";
                UpdateEnterpriseActions();
            });
            launchedProcess.EnableRaisingEvents = true;
            EnterpriseLaunchStatus.Text = mode switch
            {
                EnterpriseSetupMode.Status => "Deployment status opened in a separate setup window. Select the saved receipt to check the actual result.",
                EnterpriseSetupMode.Continue => "Recovery opened in a separate setup window. Select the original receipt to continue without creating a duplicate deployment.",
                _ => "Microsoft 365 setup opened in a separate window. Sign in with Microsoft, choose the pilot group and browsers, and review the changes there. Keep that window open until it records your receipt."
            };
            StatusText.Text = "Preparing Microsoft setup. Follow the progress here; deployment is not yet verified.";
        }
        catch (Exception exception)
        {
            PresentExternalStage(EnterpriseSetupStage.Failed);
            EnterpriseLaunchStatus.Text = SafeError(exception);
            StatusText.Text = enterpriseProcess is null
                ? "The setup window could not be opened. No deployment was started by this action."
                : "The setup window opened, but its status could not be monitored. Check the setup window and saved receipt before trying again.";
            if (enterpriseProcess is null && enterpriseProgress is not null)
            {
                externalOperationId = Guid.Empty;
                await enterpriseProgress.DisposeAsync();
                enterpriseProgress = null;
                ownedSignIn?.Dispose();
                ownedSignIn = null;
            }
        }
        finally { externalLaunchInProgress = false; }
        UpdateEnterpriseActions();
    }

    private void PresentExternalStage(EnterpriseSetupStage stage)
    {
        var previous = externalStage;
        externalStage = stage;
        ExternalOperationPanel.Visibility = Visibility.Visible;
        (ExternalOperationHeading.Text, ExternalOperationDescription.Text) = stage switch
        {
            EnterpriseSetupStage.Preparing => ("Getting setup ready", "Checking the administrator package and browser connection. Please keep this window open."),
            EnterpriseSetupStage.Prerequisites => ("Preparing Microsoft components", "Setup is checking the Microsoft tools it needs. Review any installation request before continuing."),
            EnterpriseSetupStage.SignIn => ("Waiting for Microsoft sign-in", "Microsoft is checking available work accounts. Its sign-in window belongs to this setup; select your account and complete any verification there."),
            EnterpriseSetupStage.SignInTeams => ("Signing in to Microsoft Teams", "The Microsoft Graph connection returned. Microsoft Teams is checking the same administrator account; complete its sign-in or verification in the owned Microsoft window."),
            EnterpriseSetupStage.SignInReady => ("Continue in Microsoft sign-in", "Choose your work administrator account and complete any Microsoft verification. Use Show Microsoft sign-in if the window is behind another application."),
            EnterpriseSetupStage.Group => ("Choose your pilot group", "Microsoft sign-in returned. Choose the existing group and browser rollout options in the owned setup dialog."),
            EnterpriseSetupStage.Review => ("Review before anything changes", "Check the organization, group, permissions and effects. Apply the plan only when these choices are correct."),
            EnterpriseSetupStage.Signing => ("Preparing the device installation", "Setup is checking the signed installation package and the organization settings you reviewed before upload."),
            EnterpriseSetupStage.Deploying => ("Applying the reviewed setup", "Keep setup open while Microsoft records the approved configuration and rollout. The saved receipt is used for recovery."),
            EnterpriseSetupStage.Verifying => ("Checking Microsoft's recorded result", "Setup is checking the recorded configuration and assignments. Assignment acceptance does not prove installation or employee sign-in."),
            EnterpriseSetupStage.Complete => ("Setup window finished", "Use the saved receipt to check the recorded result. Device installation and employee sign-in require their own verification."),
            EnterpriseSetupStage.Canceled => ("Setup was canceled", "No new operation will start automatically. Preserve any receipt and use Continue saved setup if changes may already have started."),
            _ => ("Setup needs attention", "Review the setup message and preserve its receipt. Continue the saved operation rather than starting a duplicate deployment.")
        };
        ExternalOperationProgress.IsIndeterminate = stage is not (EnterpriseSetupStage.Complete or EnterpriseSetupStage.Failed or EnterpriseSetupStage.Canceled);
        var selectedStep = stage switch
        {
            EnterpriseSetupStage.Preparing or EnterpriseSetupStage.Prerequisites => StepWelcome,
            EnterpriseSetupStage.SignIn or EnterpriseSetupStage.SignInTeams or EnterpriseSetupStage.SignInReady => StepAdministrator,
            EnterpriseSetupStage.Group => StepDeployment,
            EnterpriseSetupStage.Review => StepReview,
            EnterpriseSetupStage.Signing or EnterpriseSetupStage.Deploying => StepDeployment,
            EnterpriseSetupStage.Failed or EnterpriseSetupStage.Canceled => externalSelectedStep ?? StepWelcome,
            _ => StepVerify
        };
        externalSelectedStep = selectedStep;
        foreach (var step in new[] { StepWelcome, StepAdministrator, StepDeployment, StepReview, StepVerify })
        {
            var active = ReferenceEquals(step, selectedStep);
            step.FontWeight = active ? FontWeights.SemiBold : FontWeights.Normal;
            step.Opacity = active ? 1 : 0.62;
            step.Foreground = new System.Windows.Media.SolidColorBrush(active
                ? System.Windows.Media.Color.FromRgb(8, 125, 115) : System.Windows.Media.Color.FromRgb(73, 109, 104));
        }
        var signIn = IsExternalSignInStage(stage);
        ShowSigninButton.Visibility = signIn ? Visibility.Visible : Visibility.Collapsed;
        ShowSigninButton.IsEnabled = signIn && ExternalOperationActive;
        StatusText.Text = ExternalOperationHeading.Text + ". " + ExternalOperationDescription.Text;
        var presentationVersion = ++externalPresentationVersion;
        Dispatcher.BeginInvoke(System.Windows.Threading.DispatcherPriority.Loaded, new Action(() =>
        {
            if (lifetime.IsCancellationRequested || presentationVersion != externalPresentationVersion
                || !ExternalOperationPanel.IsVisible) return;
            // Reveal the live state after layout without moving keyboard focus or activating a window.
            ExternalOperationPanel.BringIntoView();
            // With enlarged fonts the card can exceed the viewport; keep the active recovery action reachable.
            if (ShowSigninButton.IsVisible) ShowSigninButton.BringIntoView();
        }));
        if (signIn && (!IsExternalSignInStage(previous) || (stage == EnterpriseSetupStage.SignInTeams && previous != stage)))
        {
            Activate(); // Foreground this application's own progress, never an unrelated application.
            ownedSignIn?.BeginOneShotActivation();
        }
        else if (!signIn) ownedSignIn?.StopAutomaticActivation();
    }

    private void ShowSignin_Click(object sender, RoutedEventArgs e)
    {
        if (!ExternalOperationActive || !IsExternalSignInStage(externalStage)) return;
        if (WindowState == WindowState.Minimized) WindowState = WindowState.Normal;
        Activate();
        if (ownedSignIn?.ShowOwnedSignIn() != true)
            StatusText.Text = "Microsoft is still preparing sign-in. This setup window is active; choose Show Microsoft sign-in again when the account window appears.";
    }

    private static bool IsExternalSignInStage(EnterpriseSetupStage? stage) => stage is EnterpriseSetupStage.SignIn
        or EnterpriseSetupStage.SignInTeams or EnterpriseSetupStage.SignInReady;

    private void UpdateEnterpriseActions()
    {
        var running = ExternalOperationActive;
        var reason = string.Empty;
        // Once an operation starts, do not delay its first rendered status with synchronous I/O.
        // The background launcher independently revalidates package integrity at its boundary.
        var available = running || enterpriseLauncher.TryLocate(out _, out reason);
        StartEnterpriseSetupButton.IsEnabled = available && !running;
        EnterpriseStatusButton.IsEnabled = available && !running;
        EnterpriseContinueButton.IsEnabled = available && !running;
        AdvancedOptionsPanel.IsEnabled = !running;
        RecoveryOptionsPanel.IsEnabled = !running;
        RunGuidedDemoButton.IsEnabled = !running;
        StartRealSetupButton.IsEnabled = !running;
        StartManualSetupButton.IsEnabled = !running;
        ShowSigninButton.IsEnabled = running && IsExternalSignInStage(externalStage);
        if (!available) EnterpriseLaunchStatus.Text = reason;
    }

    private void RunGuidedDemoButton_Click(object sender, RoutedEventArgs e) => StartGuidedDemo();

    private void StartGuidedDemo()
    {
        if (ExternalOperationActive) return;
        experience = SetupExperienceSelection.ChooseGuidedDemo();
        authenticationService = new PreviewAuthenticationService();
        graphService = new PreviewGraphProvisioningService();
        journalStore = null;
        Title = "Better CaptionKeep Administrator Setup — GUIDED DEMO";
        EnvironmentBadgeText.Text = "GUIDED DEMO · SYNTHETIC · NO TENANT CHANGES";
        YourControlsText.Text = "This Contoso example is entirely in memory. It cannot contact Microsoft, save a receipt, or change an organization.";
        AdministratorHeading.Text = "Meet the Contoso demo administrator";
        AdministratorEmail.Text = "alex.admin@contoso.example";
        SignInButton.Content = "Load Contoso demo administrator";
        AdministratorConsentNote.Text = "Demo only: this button loads synthetic example data in memory. It does not open Microsoft sign-in or request consent.";
        StatusText.Text = "Guided demo selected. No network or organization operation is available.";
        workflow.ContinueFromWelcome();
        RenderStage();
    }

    private void StartRealSetupButton_Click(object sender, RoutedEventArgs e)
    {
        if (ExternalOperationActive) return;
        experience = SetupExperienceSelection.ChooseReal(realModeConfigured);
        if (experience.Kind == SetupExperienceKind.RealUnavailable)
        {
            authenticationService = null;
            graphService = null;
            journalStore = null;
            Title = "Better CaptionKeep Administrator Setup — PREREQUISITES";
            EnvironmentBadgeText.Text = "REAL SETUP · NOT CONFIGURED";
            StatusText.Text = "Real setup prerequisites are missing. No network, sign-in, journal, or tenant operation was attempted.";
            RenderStage();
            return;
        }

        var configuration = bootstrapConfiguration
            ?? throw new InvalidOperationException("The reviewed administrator bootstrap is unavailable.");
        journalStore = new FileDeploymentJournalStore();
        var session = new MicrosoftAdministratorSession(configuration, () => new WindowInteropHelper(this).Handle, new HttpClient());
        authenticationService = session;
        graphService = new MicrosoftGraphProvisioningService(session, new HttpClient(), journalStore);
        Title = "Better CaptionKeep Administrator Setup — DEVELOPMENT TENANT CHANGES";
        EnvironmentBadgeText.Text = "DEVELOPMENT · TENANT CHANGES";
        SignInButton.Content = "Continue with Microsoft";
        StatusText.Text = "Real setup selected. No organization changes have been made.";
        workflow.ContinueFromWelcome();
        RenderStage();
    }

    private void StartManualSetupButton_Click(object sender, RoutedEventArgs e)
    {
        if (ExternalOperationActive) return;
        experience = SetupExperienceSelection.ChooseManualSetup();
        Title = "Better CaptionKeep Administrator Setup — MANUAL APP REGISTRATION";
        EnvironmentBadgeText.Text = "MANUAL SETUP · NO BROAD PROVISIONING PERMISSION";
        StatusText.Text = "Manual setup selected. No Microsoft sign-in, consent, or tenant change has been performed by Better CaptionKeep.";
        RenderStage();
    }

    private void OpenEntraAppRegistrationsButton_Click(object sender, RoutedEventArgs e)
    {
        Process.Start(new ProcessStartInfo
        {
            FileName = "https://entra.microsoft.com/#view/Microsoft_AAD_RegisteredApps/ApplicationsListBlade",
            UseShellExecute = true
        });
        StatusText.Text = "Microsoft Entra app registrations opened in your default browser. Better CaptionKeep has not changed the tenant.";
    }

    private void SaveManualConfigurationButton_Click(object sender, RoutedEventArgs e)
    {
        if (!Guid.TryParse(ManualTenantId.Text.Trim(), out var tenantId) || tenantId == Guid.Empty
            || !Guid.TryParse(ManualClientId.Text.Trim(), out var clientId) || clientId == Guid.Empty)
        {
            ManualConfigurationStatus.Text = "Enter valid non-zero tenant and application client GUIDs.";
            return;
        }
        var directory = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
            "DAF-TECH", "BetterCaptionKeep", "AdminSetup", "manual");
        Directory.CreateDirectory(directory);
        var path = Path.Combine(directory, $"manual-application-{DateTimeOffset.UtcNow:yyyyMMdd-HHmmss}.json");
        var next = path + ".next";
        var payload = JsonSerializer.SerializeToUtf8Bytes(new
        {
            schemaVersion = 1,
            tenantId,
            clientId,
            redirectUri = ManualRedirectUri.Text,
            createdAtUtc = DateTimeOffset.UtcNow,
            source = "administrator-entered; not Graph-verified",
            containsSecrets = false
        }, new JsonSerializerOptions(JsonSerializerDefaults.Web) { WriteIndented = true });
        File.WriteAllBytes(next, payload);
        File.Move(next, path, true);
        ManualConfigurationPathText.Text = path;
        ManualConfigurationPathText.Visibility = Visibility.Visible;
        ManualConfigurationStatus.Text = "Identifiers are well formed and the non-secret manual configuration receipt was saved. No Microsoft consent or tenant write was performed.";
        StatusText.Text = "Manual application identifiers recorded locally. Microsoft verification remains required before deployment.";
    }

    private void BackToWelcomeButton_Click(object sender, RoutedEventArgs e)
    {
        if (ExternalOperationActive) return;
        experience = SetupExperienceSelection.Welcome;
        ApplyWelcomePresentation();
        RenderStage();
    }

    private void RunDemoAgainButton_Click(object sender, RoutedEventArgs e)
    {
        if (ExternalOperationActive) return;
        previewAnimation?.Cancel();
        previewExperience = PreviewExperienceStage.None;
        workflow = new SetupWorkflow();
        ResetExperienceControls();
        StartGuidedDemo();
    }

    private void CloseResultButton_Click(object sender, RoutedEventArgs e) => Close();

    private void ApplyWelcomePresentation()
    {
        Title = "Better CaptionKeep Administrator Setup";
        EnvironmentBadgeText.Text = "MICROSOFT 365 · ADMINISTRATOR SETUP";
        WelcomeDescription.Text = "Connect Better CaptionKeep to Microsoft 365 and roll it out to a pilot group. Start below; Microsoft handles sign-in, and setup guides you through the choices.";
        YourControlsText.Text = "You choose the organization, browsers, and pilot group. Review the exact changes before setup applies them. Keep the receipt to check or continue your deployment.";
        TenantCardDescription.Text = "Your organization owns its Microsoft 365 connection and Intune deployment.";
        VerifiedResultDescription.Text = "Track submitted assignments separately from device installation and employee sign-in.";
        StatusText.Text = "Ready to set up Microsoft 365. No organization changes have been made.";
        UpdateEnterpriseActions();
    }

    private void ResetExperienceControls()
    {
        acknowledgedPlanDigest = null;
        pendingRecovery = null;
        recoveryInventoryFailed = false;
        lastDeploymentResult = null;
        ReviewAcknowledgement.IsChecked = false;
        FinalWriteAcknowledgement.IsChecked = false;
        GroupResults.ItemsSource = null;
        GroupSearch.Text = string.Empty;
        ResultSummary.Text = string.Empty;
        ReceiptPathText.Text = string.Empty;
        DeploymentProgressBar.Value = 0;
        ProgressPercent.Text = "0%";
    }

    private async void ContinueButton_Click(object sender, RoutedEventArgs e)
    {
        try
        {
            if (previewExperience == PreviewExperienceStage.Result) { Close(); return; }
            if (workflow.Stage == SetupStage.Welcome) workflow.ContinueFromWelcome();
            else if (workflow.Stage == SetupStage.AdministratorAccount) { StatusText.Text = "Sign in with Microsoft before choosing deployment options."; return; }
            else if (workflow.Stage == SetupStage.Deployment)
            {
                if (recoveryInventoryFailed) { StatusText.Text = "Durable operation receipts could not be verified. New deployment is blocked."; return; }
                if (workflow.VerifiedAdministrator is null || GroupResults.SelectedItem is not VerifiedGroupReference group) { StatusText.Text = "Choose a verified existing Intune group."; return; }
                var browsers = (EdgeChoice.IsChecked == true ? BrowserTargets.Edge : BrowserTargets.None) | (ChromeChoice.IsChecked == true ? BrowserTargets.Chrome : BrowserTargets.None);
                var now = DateTimeOffset.UtcNow;
                var plan = CreatePlan(workflow.VerifiedAdministrator, group, browsers, now);
                workflow.Review(plan, now);
                ReviewOrganization.Text = plan.Administrator.TenantDisplayName;
                ReviewAdministrator.Text = $"Administrator · {plan.Administrator.UserPrincipalName}";
                ReviewBrowsers.Text = plan.Browsers.ToString().Replace(",", " +", StringComparison.Ordinal);
                ReviewGroup.Text = $"Existing group · {plan.Group.DisplayName}";
                ReviewPermissions.Text = previewMode
                    ? "• Read existing security groups\n• Preview the planned deployment without tenant writes"
                    : "• Read the selected security group\n• Temporarily use Application.ReadWrite.All to create one customer-owned Entra application registration, or observe an exact existing match\n• Remove the Better CaptionKeep bootstrap enterprise application and clear the local MSAL token cache after verification\n• Microsoft may continue accepting the already-issued access token until its recorded expiry\n• Stop for manual review if an existing marked application has drifted\n• No Intune assignment or endpoint change in this release";
                ReviewTechnical.Text =
                    $"Tenant ID       {plan.Administrator.TenantId:D}\n" +
                    $"Group object ID {plan.Group.ObjectId:D}\n" +
                    $"Group type      {plan.Group.GroupType}; dynamic: {plan.Group.DynamicMembership}\n" +
                    $"Permissions     {string.Join(", ", plan.RequestedScopes)}\n" +
                    $"App name        {plan.DesiredApplication.DisplayName}\n" +
                    $"App marker      {plan.DesiredApplication.Marker}\n" +
                    $"Audience        {plan.DesiredApplication.SignInAudience}\n" +
                    $"Redirect URIs   {string.Join(", ", plan.DesiredApplication.RedirectUris)}\n" +
                    $"Action          {plan.DesiredApplication.Action}; drift: {plan.DesiredApplication.DriftPolicy}\n" +
                    $"Plan SHA-256    {plan.DigestSha256()}";
                acknowledgedPlanDigest = null;
                FinalWriteAcknowledgement.IsChecked = false;
                FinalWriteAcknowledgement.Content = new System.Windows.Controls.TextBlock
                {
                    TextWrapping = TextWrapping.Wrap,
                    Text = $"I authorize temporary Application.ReadWrite.All for this one create-or-observe operation in tenant {plan.Administrator.TenantId:D}, followed by bootstrap enterprise-application removal and local token-cache clearing. I understand the issued access token may remain accepted until its recorded expiry. Plan {plan.DigestSha256()}."
                };
            }
            else if (workflow.Stage == SetupStage.Review)
            {
                if (!previewMode) { StatusText.Text = "Use the final administrator approval control to authorize this exact plan."; return; }
                if (ReviewAcknowledgement.IsChecked != true) { StatusText.Text = "Confirm the no-write preview statement before continuing."; return; }
                await RunPreviewExperienceAsync();
                return;
            }
            RenderStage();
        }
        catch (Exception exception) { StatusText.Text = SafeError(exception); }
        await Task.CompletedTask;
    }

    private async void SignInButton_Click(object sender, RoutedEventArgs e)
    {
        if (authenticationInProgress) return;
        if (!previewMode && !realModeConfigured)
        {
            AuthenticationStatus.Text = "Microsoft sign-in is unavailable because the reviewed administrator bootstrap is not installed.";
            StatusText.Text = "Administrator setup is not configured on this PC. No Microsoft sign-in or tenant write was attempted.";
            return;
        }
        authenticationInProgress = true;
        SignInButton.IsEnabled = false; AuthenticationStatus.Text = previewMode ? "Creating synthetic no-write administrator session…" : "Opening Microsoft sign-in…";
        try
        {
            var administrator = await AuthenticationService.SignInAsync(AdministratorEmail.Text, lifetime.Token);
            workflow.SetVerifiedAdministrator(administrator);
            StatusText.Text = previewMode ? "Synthetic administrator loaded. No Microsoft sign-in occurred." : $"Microsoft account signed in for {administrator.TenantDisplayName}. Write permissions have not been requested.";
            if (!previewMode)
            {
                var unresolved = await JournalStore.ListUnresolvedAsync(administrator, lifetime.Token);
                recoveryInventoryFailed = false;
                if (unresolved.Count > 0)
                {
                    var recovery = unresolved[0];
                    pendingRecovery = recovery;
                    ResultHeading.Text = "An earlier application operation needs recovery";
                    ResultSummary.Text = $"Original operation: {recovery.OperationId:D}\nState: {recovery.State}\nMarker: {recovery.DesiredApplication.Marker}\nNew deployment plans are blocked until this original operation is resolved.";
                    ReceiptPathText.Text = JournalStore.GetReceiptPath(recovery.OperationId);
                    CheckStatusButton.Content = "Reconcile original operation";
                    RenderStage();
                    return;
                }
            }
            await LoadGroupsAsync(); RenderStage();
        }
        catch (OperationCanceledException) { AuthenticationStatus.Text = "Sign-in cancelled. No tenant deployment writes were started."; }
        catch (NotSupportedException exception) { AuthenticationStatus.Text = SafeError(exception); StatusText.Text = "Administrator setup is not configured on this PC. No Microsoft sign-in or tenant write was attempted."; }
        catch (Exception exception) { recoveryInventoryFailed = !previewMode; AuthenticationStatus.Text = SafeError(exception); StatusText.Text = previewMode ? "No tenant deployment writes were started." : "Durable operation receipts could not be verified. New deployment is blocked."; }
        finally { authenticationInProgress = false; RenderStage(); }
    }

    private async void GroupSearch_TextChanged(object sender, System.Windows.Controls.TextChangedEventArgs e)
    {
        if (workflow.VerifiedAdministrator is null) return;
        var generation = Interlocked.Increment(ref groupSearchGeneration);
        groupSearch?.Cancel();
        groupSearch?.Dispose();
        groupSearch = CancellationTokenSource.CreateLinkedTokenSource(lifetime.Token);
        var token = groupSearch.Token;
        GroupResults.ItemsSource = null;
        StatusText.Text = "Searching existing security groups…";
        try
        {
            await Task.Delay(300, token);
            var groups = await GraphService.FindExistingGroupsAsync(workflow.VerifiedAdministrator, GroupSearch.Text, token);
            if (generation != Volatile.Read(ref groupSearchGeneration)) return;
            GroupResults.ItemsSource = groups;
            StatusText.Text = groups.Count == 0 ? "No matching security groups found." : $"Found {groups.Count} matching security groups.";
        }
        catch (OperationCanceledException) when (token.IsCancellationRequested) { }
        catch (Exception exception) { if (generation == Volatile.Read(ref groupSearchGeneration)) StatusText.Text = SafeError(exception); }
    }

    private async Task LoadGroupsAsync()
    {
        if (workflow.VerifiedAdministrator is null) return;
        GroupResults.ItemsSource = await GraphService.FindExistingGroupsAsync(workflow.VerifiedAdministrator, string.Empty, lifetime.Token);
        if (GroupResults.Items.Count == 1) GroupResults.SelectedIndex = 0;
    }

    private void CancelButton_Click(object sender, RoutedEventArgs e)
    {
        if (recoveryInProgress) { StatusText.Text = "Recovery authorization or observation is in progress. Wait for its durable result."; return; }
        if (pendingRecovery is not null) { Close(); return; }
        if (previewExperience == PreviewExperienceStage.Result || workflow.Stage == SetupStage.Result) { Close(); return; }
        if (previewExperience == PreviewExperienceStage.Progress)
        {
            previewAnimation?.Cancel();
            previewExperience = PreviewExperienceStage.None;
        }
        if (workflow.Stage == SetupStage.Welcome) { Close(); return; }
        if (!workflow.CancelBeforeWrites()) { StatusText.Text = "Deployment may be in progress. Close only after its durable status is recorded."; return; }
        acknowledgedPlanDigest = null;
        FinalWriteAcknowledgement.IsChecked = false;
        ReviewAcknowledgement.IsChecked = false;
        StatusText.Text = "Setup cancelled. No tenant deployment writes were started."; RenderStage();
    }

    private void Window_Closing(object? sender, CancelEventArgs e)
    {
        if (browserIntegrationInProgress) { e.Cancel = true; StatusText.Text = "Browser integration is recording its result. Wait for it to finish before closing."; return; }
        if ((workflow.DeploymentInProgress && workflow.HasStartedWrites) || recoveryInProgress) { e.Cancel = true; StatusText.Text = "Deployment or recovery may be in progress. Wait for its durable result before closing."; return; }
        if (enterpriseProcess is { HasExited: false }
            && MessageBox.Show(this,
                "This window owns Microsoft sign-in and shows setup progress. Closing it may interrupt sign-in while the setup process is still recording changes. Finish or cancel the owned setup dialog first, and preserve any receipt for recovery.\n\nClose this overview anyway?",
                "Microsoft 365 setup is still running", MessageBoxButton.YesNo, MessageBoxImage.Information,
                MessageBoxResult.No) != MessageBoxResult.Yes)
        {
            e.Cancel = true;
            return;
        }
        groupSearch?.Cancel();
        groupSearch?.Dispose();
        previewAnimation?.Cancel();
        previewAnimation?.Dispose();
        ownedSignIn?.Dispose();
        if (enterpriseProgress is not null) _ = enterpriseProgress.DisposeAsync();
        lifetime.Cancel();
    }

    private void ReviewAcknowledgement_Changed(object sender, RoutedEventArgs e) => RenderStage();

    private void FinalWriteAcknowledgement_Changed(object sender, RoutedEventArgs e)
    {
        acknowledgedPlanDigest = FinalWriteAcknowledgement.IsChecked == true
            ? workflow.ReviewedPlan?.DigestSha256()
            : null;
        RenderStage();
    }

    private async void DeployButton_Click(object sender, RoutedEventArgs e)
    {
        var reviewedPlan = workflow.ReviewedPlan;
        if (previewMode || workflow.Stage != SetupStage.Review || FinalWriteAcknowledgement.IsChecked != true
            || reviewedPlan is null || !string.Equals(acknowledgedPlanDigest, reviewedPlan.DigestSha256(), StringComparison.Ordinal))
        {
            StatusText.Text = "Review the immutable plan and provide final administrator approval before deployment.";
            return;
        }

        try
        {
            var plan = reviewedPlan;
            if (pendingRecovery is not null) throw new InvalidOperationException("Resolve the earlier operation before creating a new deployment plan.");
            var approved = workflow.ApproveAndBegin(plan.DigestSha256(), DateTimeOffset.UtcNow);
            workflow.MarkWriteBoundaryCrossed();
            deploymentCancellation?.Dispose();
            deploymentCancellation = CancellationTokenSource.CreateLinkedTokenSource(lifetime.Token);
            RenderStage();
            var progress = new Progress<DeploymentProgress>(update =>
            {
                ProgressStepTitle.Text = update.Step switch
                {
                    DeploymentStep.Journal => "Verify durable operation receipt",
                    DeploymentStep.Authorization => "Authorize application registration",
                    DeploymentStep.EntraApplication => "Reconcile Entra application registration",
                    _ => "Record deployment result"
                };
                ProgressStepDetail.Text = update.SafeMessage;
                DeploymentProgressText.Text = $"State: {update.State}";
                DeploymentProgressBar.Value = update.Percent;
                ProgressPercent.Text = $"{update.Percent}%";
                StatusText.Text = update.SafeMessage;
            });
            lastDeploymentResult = await GraphService.DeployAsync(approved, progress, deploymentCancellation.Token);
            workflow.CompleteDeployment();
            ShowDeploymentResult(lastDeploymentResult);
        }
        catch (Exception exception)
        {
            if (workflow.DeploymentInProgress) workflow.CompleteDeployment();
            var plan = workflow.ReviewedPlan;
            ResultHeading.Text = workflow.HasStartedWrites ? "Deployment needs status review" : "Deployment did not start";
            ResultSummary.Text = SafeError(exception) + (workflow.HasStartedWrites
                ? " The durable receipt records the last safe state; retry only through this setup app."
                : " No tenant mutation boundary was crossed.");
            if (plan is not null) ReceiptPathText.Text = JournalStore.GetReceiptPath(plan.Nonce);
            StatusText.Text = SafeError(exception);
        }
        finally
        {
            deploymentCancellation?.Dispose();
            deploymentCancellation = null;
            RenderStage();
        }
    }

    private async void CheckStatusButton_Click(object sender, RoutedEventArgs e)
    {
        try
        {
            if (pendingRecovery is not null)
            {
                var administrator = workflow.VerifiedAdministrator
                    ?? throw new InvalidOperationException("Sign in with the administrator bound to the recovery receipt.");
                deploymentCancellation?.Dispose();
                deploymentCancellation = CancellationTokenSource.CreateLinkedTokenSource(lifetime.Token);
                recoveryInProgress = true;
                RenderStage();
                var progress = new Progress<DeploymentProgress>(update => StatusText.Text = update.SafeMessage);
                var result = await GraphService.RecoverAsync(administrator, pendingRecovery, progress, deploymentCancellation.Token);
                var refreshed = await JournalStore.ReadAsync(pendingRecovery.OperationId, lifetime.Token);
                if (refreshed is null || !refreshed.IsUnresolved)
                {
                    pendingRecovery = null;
                    StatusText.Text = "The original operation is resolved. A new plan may now be reviewed.";
                    await LoadGroupsAsync();
                    RenderStage();
                    return;
                }
                pendingRecovery = refreshed;
                ShowDeploymentResult(result);
                return;
            }
            var plan = workflow.ReviewedPlan;
            if (plan is null) return;
            var journal = await JournalStore.ReadAsync(plan.Nonce, lifetime.Token);
            ResultSummary.Text = journal is null
                ? "No durable deployment receipt exists for this plan."
                : $"State: {journal.State}\nOperation: {journal.Operation}\nMutation attempts: {journal.MutationAttempts}\nApplication object ID: {journal.ApplicationObjectId?.ToString("D") ?? "not recorded"}\n{journal.SafeMessage}";
            ReceiptPathText.Text = JournalStore.GetReceiptPath(plan.Nonce);
        }
        catch (Exception exception) { StatusText.Text = SafeError(exception); }
        finally { recoveryInProgress = false; deploymentCancellation?.Dispose(); deploymentCancellation = null; RenderStage(); }
    }

    private async Task RunPreviewExperienceAsync()
    {
        previewAnimation?.Cancel();
        previewAnimation?.Dispose();
        previewAnimation = CancellationTokenSource.CreateLinkedTokenSource(lifetime.Token);
        var token = previewAnimation.Token;
        previewExperience = PreviewExperienceStage.Progress;
        RenderStage();
        var steps = new (string Title, string Detail, int Percent)[]
        {
            ("Load the Contoso example plan", "Uses only synthetic administrator, group, browser, and approval data held in this demo.", 12),
            ("Review the sample application", "Demonstrates how an administrator would inspect the exact proposed application without creating anything.", 32),
            ("Apply administrator-approved consent", "Would request only the permissions displayed on the review screen and record Microsoft’s observed result.", 50),
            ("Preview the browser target", "Shows the selected example browsers and Contoso pilot group without submitting any payload.", 70),
            ("Verify the demo state", "Confirms that network requests, journal writes, tenant writes, and endpoint changes all remain zero.", 88),
            ("Create the sample receipt", "Builds a display-only sample ID in memory. Nothing is saved or submitted.", 100)
        };
        try
        {
            foreach (var step in steps)
            {
                token.ThrowIfCancellationRequested();
                ProgressStepTitle.Text = step.Title;
                ProgressStepDetail.Text = step.Detail;
                DeploymentProgressBar.Value = step.Percent;
                ProgressPercent.Text = $"{step.Percent}%";
                StatusText.Text = $"Synthetic preview: {step.Title.ToLowerInvariant()}. No organization operation is running.";
                await Task.Delay(520, token);
            }
            var plan = workflow.ReviewedPlan ?? throw new InvalidOperationException("The reviewed preview plan is unavailable.");
            ResultSummary.Text =
                $"Status: SYNTHETIC PREVIEW — NO CHANGES MADE\n" +
                $"Organization: {plan.Administrator.TenantDisplayName}\n" +
                $"Administrator: {plan.Administrator.UserPrincipalName}\n" +
                $"Browsers: {plan.Browsers}\n" +
                $"Existing group: {plan.Group.DisplayName}\n" +
                $"Group object ID: {plan.Group.ObjectId:D}\n" +
                $"Plan digest: {plan.DigestSha256()}\n" +
                $"Microsoft Graph writes: 0 · Intune writes: 0 · Endpoint changes: 0";
            ResultHeading.Text = "Sample deployment receipt";
            ReceiptHeading.Text = "Sample deployment receipt";
            ReceiptLabel.Text = "Sample receipt ID";
            ResultSummary.Text =
                $"Demo only—not saved or submitted.\n" +
                $"Organization: Contoso Example (synthetic)\n" +
                $"Administrator: alex.admin@contoso.example\n" +
                $"Browsers: {plan.Browsers}\n" +
                $"Existing group: {plan.Group.DisplayName}\n" +
                $"Plan digest: {plan.DigestSha256()}\n" +
                "Network requests: 0 · Journal writes: 0 · Tenant writes: 0 · Endpoint changes: 0";
            ReceiptPathText.Text = SetupExperienceSelection.CreateSampleReceipt(plan.Nonce);
            previewExperience = PreviewExperienceStage.Result;
            StatusText.Text = "Preview complete. No Microsoft, Intune, browser, or endpoint changes were made.";
            RenderStage();
        }
        catch (OperationCanceledException) when (token.IsCancellationRequested)
        {
            StatusText.Text = "Preview stopped. No organization changes were made.";
        }
    }

    private SetupPlan CreatePlan(
        AuthenticatedAdministrator administrator,
        VerifiedGroupReference group,
        BrowserTargets browsers,
        DateTimeOffset now)
    {
        if (browsers == BrowserTargets.None) throw new InvalidOperationException("Choose at least one supported browser.");
        var nonce = Guid.NewGuid();
        if (previewMode)
            return new(1, administrator, group, browsers,
                ["GroupMember.Read.All"],
                new("Synthetic Better CaptionKeep preview", $"BetterCaptionKeepPreview:{nonce:D}", "AzureADMyOrg",
                    ["synthetic://no-write-preview/redirect"], ApplicationProvisioningAction.CreateOrObserve,
                    ApplicationDriftPolicy.StopForManualReview),
                new Dictionary<string, string> { ["synthetic-no-write-preview"] = new string('A', 64) }.ToImmutableDictionary(StringComparer.Ordinal),
                "development-no-write-preview", nonce, now, now.AddMinutes(10));

        var redirects = new List<string>
        {
            $"https://{sourceExtensionId}.chromiumapp.org/microsoft"
        };
        var contractHash = Convert.ToHexString(SHA256.HashData(
            Encoding.UTF8.GetBytes("better-captionkeep:entra-application-registration-contract:v1")));
        return new(1, administrator, group, browsers,
            ["GroupMember.Read.All", "Application.ReadWrite.All"],
            new($"Better CaptionKeep {nonce:N}"[..31], $"BetterCaptionKeepDeployment:{nonce:D}", "AzureADMyOrg",
                redirects.ToImmutableArray(), ApplicationProvisioningAction.CreateOrObserve,
                ApplicationDriftPolicy.StopForManualReview),
            new Dictionary<string, string> { ["entra-application-registration-contract-v1"] = contractHash }
                .ToImmutableDictionary(StringComparer.Ordinal),
            "admin-setup-entra-application-temporary-consent-v2", nonce, now, now.AddMinutes(10));
    }

    private void ShowDeploymentResult(DeploymentResult result)
    {
        ReceiptHeading.Text = "Durable operation receipt";
        ReceiptLabel.Text = "Receipt path";
        ResultHeading.Text = result.State is OperationState.Confirmed or OperationState.Reconciled
            ? "Application registration is reconciled"
            : "Deployment needs status review";
        ResultSummary.Text =
            $"State: {result.State}\n" +
            $"Operation ID: {result.OperationId:D}\n" +
            "Application registration: recorded in the durable receipt\n" +
            "Temporary bootstrap identity removal: recorded in the durable receipt\nLocal token-cache clearing: recorded in the durable receipt\nResidual token expiry: recorded in the durable receipt\nIntune changes: not attempted\nEndpoint changes: not attempted";
        ReceiptPathText.Text = result.ReceiptPath;
        StatusText.Text = result.State is OperationState.Confirmed or OperationState.Reconciled
            ? "The approved Entra application registration is recorded."
            : "Review the durable receipt before retrying this operation.";
    }

    private void RenderStage()
    {
        var showingProgress = previewExperience == PreviewExperienceStage.Progress || workflow.Stage == SetupStage.Deploying;
        var showingResult = previewExperience == PreviewExperienceStage.Result || workflow.Stage == SetupStage.Result || pendingRecovery is not null;
        var showingPrerequisites = experience.Kind == SetupExperienceKind.RealUnavailable;
        var showingManual = experience.Kind == SetupExperienceKind.ManualSetup;
        WelcomePanel.Visibility = !showingProgress && !showingResult && !showingPrerequisites && !showingManual && workflow.Stage == SetupStage.Welcome ? Visibility.Visible : Visibility.Collapsed;
        PrerequisitePanel.Visibility = showingPrerequisites ? Visibility.Visible : Visibility.Collapsed;
        ManualSetupPanel.Visibility = showingManual ? Visibility.Visible : Visibility.Collapsed;
        AdministratorPanel.Visibility = !showingManual && !showingProgress && !showingResult && workflow.Stage == SetupStage.AdministratorAccount ? Visibility.Visible : Visibility.Collapsed;
        DeploymentPanel.Visibility = !showingProgress && !showingResult && workflow.Stage == SetupStage.Deployment ? Visibility.Visible : Visibility.Collapsed;
        ReviewPanel.Visibility = !showingProgress && !showingResult && workflow.Stage == SetupStage.Review ? Visibility.Visible : Visibility.Collapsed;
        ProgressPanel.Visibility = showingProgress ? Visibility.Visible : Visibility.Collapsed;
        ResultPanel.Visibility = showingResult ? Visibility.Visible : Visibility.Collapsed;
        PreviewModeBanner.Visibility = previewMode ? Visibility.Visible : Visibility.Collapsed;
        PreviewAcknowledgementPanel.Visibility = previewMode ? Visibility.Visible : Visibility.Collapsed;
        FinalWriteAcknowledgementPanel.Visibility = !previewMode && workflow.Stage == SetupStage.Review
            ? Visibility.Visible : Visibility.Collapsed;
        DeployButton.Visibility = !previewMode && workflow.Stage == SetupStage.Review
            ? Visibility.Visible : Visibility.Collapsed;
        DeployButton.IsEnabled = FinalWriteAcknowledgement.IsChecked == true
            && workflow.ReviewedPlan is { } reviewedPlan
            && string.Equals(acknowledgedPlanDigest, reviewedPlan.DigestSha256(), StringComparison.Ordinal);
        DeploymentProgressText.Visibility = !previewMode && showingProgress ? Visibility.Visible : Visibility.Collapsed;
        CheckStatusButton.Visibility = !previewMode && showingResult ? Visibility.Visible : Visibility.Collapsed;
        DemoResultActions.Visibility = previewMode && showingResult ? Visibility.Visible : Visibility.Collapsed;
        CheckStatusButton.Content = pendingRecovery is null ? "View local receipt status" : "Reconcile original operation";
        ProgressHeading.Text = previewMode ? "Previewing deployment and verification" : "Creating or observing the approved application registration";
        ProgressStepTitle.Text = previewMode ? "Preparing preview" : "Preparing approved application operation";
        SetModeSpecificTextVisibility();

        ContinueButton.Visibility = showingProgress || showingResult || showingPrerequisites || showingManual
            || workflow.Stage is SetupStage.Welcome or SetupStage.AdministratorAccount
            || (!previewMode && workflow.Stage == SetupStage.Review) ? Visibility.Collapsed : Visibility.Visible;
        ContinueButton.Content = showingResult ? "Close" : workflow.Stage switch
        {
            SetupStage.Welcome => "Get started",
            SetupStage.Deployment => "Review plan",
            SetupStage.Review => previewMode ? "Preview deployment experience" : "Deploy",
            _ => "Continue"
        };
        ContinueButton.IsEnabled = !showingProgress && (workflow.Stage != SetupStage.Review || !previewMode || ReviewAcknowledgement.IsChecked == true);
        CancelButton.Content = showingResult ? "Close" : showingProgress
            ? (previewMode ? "Stop preview" : "Deployment running")
            : workflow.Stage == SetupStage.Welcome ? "Exit" : "Cancel setup";
        CancelButton.IsEnabled = !(workflow.DeploymentInProgress && workflow.HasStartedWrites) && !recoveryInProgress;
        CheckStatusButton.IsEnabled = !recoveryInProgress;
        SignInButton.IsEnabled = !authenticationInProgress
            && experience.Kind is SetupExperienceKind.GuidedDemo or SetupExperienceKind.RealAvailable;

        foreach (var step in new[] { StepWelcome, StepAdministrator, StepDeployment, StepReview, StepVerify })
        {
            step.FontWeight = FontWeights.Normal;
            step.Opacity = 0.62;
            step.Foreground = new System.Windows.Media.SolidColorBrush(System.Windows.Media.Color.FromRgb(73, 109, 104));
        }
        var activeStep = showingProgress || showingResult ? StepVerify : workflow.Stage switch
        {
            SetupStage.Welcome => StepWelcome,
            SetupStage.AdministratorAccount => StepAdministrator,
            SetupStage.Deployment => StepDeployment,
            SetupStage.Review => StepReview,
            _ => StepWelcome
        };
        activeStep.FontWeight = FontWeights.SemiBold;
        activeStep.Opacity = 1;
        activeStep.Foreground = new System.Windows.Media.SolidColorBrush(System.Windows.Media.Color.FromRgb(8, 125, 115));

        Dispatcher.BeginInvoke(() => (showingProgress ? ProgressHeading : showingResult ? ResultHeading : showingPrerequisites ? PrerequisiteHeading : showingManual ? ManualSetupHeading : workflow.Stage switch
        {
            SetupStage.Welcome => WelcomeHeading,
            SetupStage.AdministratorAccount => AdministratorHeading,
            SetupStage.Deployment => DeploymentHeading,
            SetupStage.Review => ReviewHeading,
            _ => WelcomeHeading
        }).Focus());
    }

    private static string SafeError(Exception exception) => exception switch
    {
        NotSupportedException => exception.Message,
        InvalidOperationException => exception.Message,
        _ => "The operation could not continue. No additional tenant deployment writes were started."
    };

    private static string GetLaunchMode(string[] arguments)
    {
        if (arguments.Contains("--no-write-preview", StringComparer.OrdinalIgnoreCase)) return "preview";
        var index = Array.FindIndex(arguments, argument => string.Equals(argument, "--mode", StringComparison.OrdinalIgnoreCase));
        if (index < 0) return "preview";
        if (index + 1 >= arguments.Length) throw new InvalidOperationException("The setup launch mode is missing.");
        var mode = arguments[index + 1].ToLowerInvariant();
        return mode is "real" or "preview" ? mode : throw new InvalidOperationException("The setup launch mode is invalid.");
    }

    private void SetModeSpecificTextVisibility()
    {
        ReceiptHeading.Text = previewMode ? "Sample deployment receipt" : "Durable operation receipt";
        ReceiptLabel.Text = previewMode ? "Sample receipt ID" : "Receipt path";
        foreach (var text in Descendants<System.Windows.Controls.TextBlock>(ProgressPanel))
        {
            if (text.Text.StartsWith("This screen demonstrates", StringComparison.Ordinal)
                || text.Text.StartsWith("Simulation only", StringComparison.Ordinal))
                text.Visibility = previewMode ? Visibility.Visible : Visibility.Collapsed;
        }
        foreach (var text in Descendants<System.Windows.Controls.TextBlock>(ResultPanel))
        {
            if (text.Text.StartsWith("The final product will only show", StringComparison.Ordinal))
                text.Visibility = previewMode ? Visibility.Visible : Visibility.Collapsed;
            if (text.Text is "✓  Preview completed" or "Application operation recorded")
                text.Text = previewMode ? "✓  Preview completed" : "Application operation recorded";
            if (text.Text is "Deployment receipt preview" or "Durable operation receipt")
                text.Text = previewMode ? "Deployment receipt preview" : "Durable operation receipt";
        }
    }

    private static IEnumerable<T> Descendants<T>(System.Windows.DependencyObject root) where T : System.Windows.DependencyObject
    {
        for (var index = 0; index < System.Windows.Media.VisualTreeHelper.GetChildrenCount(root); index++)
        {
            var child = System.Windows.Media.VisualTreeHelper.GetChild(root, index);
            if (child is T match) yield return match;
            foreach (var descendant in Descendants<T>(child)) yield return descendant;
        }
    }
}

using System.Reflection;
using System.Windows;
using System.Windows.Interop;
using BetterCaptionKeep.AdminSetup;
using BetterCaptionKeep.AdminSetup.Services;

internal static class WindowCaptionCommandTests
{
    public static void Run(Action<string, Action> run, Action<bool, string> assert)
        => OnSta(() => RunCore(run, assert));

    private static void RunCore(Action<string, Action> run, Action<bool, string> assert)
    {
        run("caption commands are enabled on the actual unshown setup window", () =>
        {
            var window = new MainWindow();
            try
            {
                foreach (var command in new[] { SystemCommands.CloseWindowCommand, SystemCommands.MinimizeWindowCommand,
                    SystemCommands.MaximizeWindowCommand, SystemCommands.RestoreWindowCommand })
                    assert(command.CanExecute(window, window), $"{command.Name} must route to an enabled window binding");
                assert(new WindowInteropHelper(window).Handle == IntPtr.Zero, "test must not create or show a native window");
            }
            finally { window.Close(); }
        });
        run("caption close preserves the existing browser-registration closing guard", () =>
        {
            var window = new MainWindow();
            var field = typeof(MainWindow).GetField("browserIntegrationInProgress", BindingFlags.NonPublic | BindingFlags.Instance)!;
            field.SetValue(window, true);
            var closing = false;
            var closed = false;
            window.Closing += (_, e) => { closing = true; if ((bool)field.GetValue(window)!) assert(e.Cancel, "existing registration guard must cancel caption close"); };
            window.Closed += (_, _) => closed = true;
            try
            {
                SystemCommands.CloseWindowCommand.Execute(window, window);
                assert(closing && !closed, "caption close must reach Closing and preserve its cancellation");
                assert(new WindowInteropHelper(window).Handle == IntPtr.Zero, "guard test must remain unshown");
            }
            finally
            {
                field.SetValue(window, false);
                // The first handler observes cancellation only during the guarded attempt.
                if (!closed) window.Close();
            }
        });
        run("caption close closes an idle unshown setup window", () =>
        {
            var window = new MainWindow();
            var closed = false;
            window.Closed += (_, _) => closed = true;
            SystemCommands.CloseWindowCommand.Execute(window, window);
            assert(closed, "idle close command must close through the ordinary window lifecycle");
        });
        run("signing status is recognized and highlights deployment rather than verification", () =>
        {
            assert(EnterpriseSetupProgress.TryParseMessage("{\"version\":1,\"stage\":\"signing\"}\n", out var stage)
                && stage == EnterpriseSetupStage.Signing, "fixed signing status must pass the strict parser");
            var window = new MainWindow();
            try
            {
                Present(window, stage);
                assert(((System.Windows.Controls.TextBlock)window.FindName("ExternalOperationHeading")).Text == "Preparing the device installation", "the public setup must describe checking its pre-signed installation package");
                AssertStep(window, "StepDeployment", assert);
                Present(window, EnterpriseSetupStage.Deploying);
                AssertStep(window, "StepDeployment", assert);
                assert(new WindowInteropHelper(window).Handle == IntPtr.Zero, "phase tests must remain unshown");
            }
            finally { window.Close(); }
        });
        run("failed and canceled status retain the last active setup step", () =>
        {
            var window = new MainWindow();
            try
            {
                Present(window, EnterpriseSetupStage.Signing);
                Present(window, EnterpriseSetupStage.Failed);
                AssertStep(window, "StepDeployment", assert);
                Present(window, EnterpriseSetupStage.Canceled);
                AssertStep(window, "StepDeployment", assert);
                Present(window, EnterpriseSetupStage.Review);
                Present(window, EnterpriseSetupStage.Failed);
                AssertStep(window, "StepReview", assert);
            }
            finally { window.Close(); }
        });
    }

    private static void Present(MainWindow window, EnterpriseSetupStage stage)
        => typeof(MainWindow).GetMethod("PresentExternalStage", BindingFlags.NonPublic | BindingFlags.Instance)!.Invoke(window, [stage]);

    private static void AssertStep(MainWindow window, string selected, Action<bool, string> assert)
    {
        foreach (var name in new[] { "StepWelcome", "StepAdministrator", "StepDeployment", "StepReview", "StepVerify" })
            assert(((System.Windows.Controls.TextBlock)window.FindName(name)).FontWeight == (name == selected ? FontWeights.SemiBold : FontWeights.Normal), "only the actual active phase should be highlighted: " + name);
    }

    private static void OnSta(Action action)
    {
        Exception? failure = null;
        var thread = new Thread(() =>
        {
            try
            {
                var application = new App { ShutdownMode = ShutdownMode.OnExplicitShutdown };
                application.InitializeComponent();
                action();
                application.Shutdown();
            }
            catch (Exception exception) { failure = exception; }
        });
        thread.SetApartmentState(ApartmentState.STA);
        thread.Start();
        thread.Join();
        if (failure is not null) throw new InvalidOperationException(failure.Message, failure);
    }
}

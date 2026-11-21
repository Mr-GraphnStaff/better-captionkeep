namespace BetterCaptionKeep.AdminSetup.Domain;

public enum SetupExperienceKind
{
    Welcome,
    GuidedDemo,
    ManualSetup,
    RealAvailable,
    RealUnavailable
}

public sealed record SetupExperienceSelection(
    SetupExperienceKind Kind,
    bool AllowsNetwork,
    bool AllowsJournal,
    bool AllowsTenantWrites)
{
    public static SetupExperienceSelection Welcome { get; } =
        new(SetupExperienceKind.Welcome, false, false, false);

    public static SetupExperienceSelection ChooseGuidedDemo() =>
        new(SetupExperienceKind.GuidedDemo, false, false, false);

    public static SetupExperienceSelection ChooseManualSetup() =>
        new(SetupExperienceKind.ManualSetup, true, true, false);

    public static SetupExperienceSelection ChooseReal(bool bootstrapAvailable) => bootstrapAvailable
        ? new(SetupExperienceKind.RealAvailable, true, true, true)
        : new(SetupExperienceKind.RealUnavailable, false, false, false);

    public static string CreateSampleReceipt(Guid operationId)
    {
        if (operationId == Guid.Empty) throw new ArgumentException("A sample operation ID is required.", nameof(operationId));
        return $"DEMO-{operationId:N}\nDemo only—not saved or submitted.";
    }
}

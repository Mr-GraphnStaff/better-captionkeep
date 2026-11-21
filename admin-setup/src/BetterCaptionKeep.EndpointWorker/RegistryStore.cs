using Microsoft.Win32;
using System.Text.Json;

namespace BetterCaptionKeep.EndpointWorker;

public sealed record RegistryData(string Kind, JsonElement Data)
{
    public static RegistryData From<T>(string kind, T data) => new(kind, JsonSerializer.SerializeToElement(data));
    public bool Matches(RegistryData? other) => other is not null && Kind == other.Kind && Data.GetRawText() == other.Data.GetRawText();
    public object ToRegistryValue() => Kind switch
    {
        "String" or "ExpandString" => Data.GetString()!,
        "DWord" => Data.GetInt32(), "QWord" => Data.GetInt64(),
        "MultiString" => Data.EnumerateArray().Select(item => item.GetString()!).ToArray(),
        "Binary" or "None" => Data.GetBytesFromBase64(),
        _ => throw new InvalidOperationException("Unsupported registry type.")
    };
}
public interface IRegistryStore
{
    bool Exists(string key);
    string[] ValueNames(string key);
    string[] SubKeys(string key);
    RegistryData? Read(string key, string name);
    void Create(string key);
    void Write(string key, string name, RegistryData value);
    void DeleteValue(string key, string name);
    void DeleteTree(string key);
}

public sealed class WindowsRegistryStore : IRegistryStore, IDisposable
{
    private readonly RegistryKey machine = RegistryKey.OpenBaseKey(RegistryHive.LocalMachine, RegistryView.Registry64);
    public bool Exists(string key) { using var opened = machine.OpenSubKey(key); return opened is not null; }
    public string[] ValueNames(string key) { using var opened = machine.OpenSubKey(key); return opened?.GetValueNames() ?? []; }
    public string[] SubKeys(string key) { using var opened = machine.OpenSubKey(key); return opened?.GetSubKeyNames() ?? []; }
    public RegistryData? Read(string key, string name)
    {
        using var opened = machine.OpenSubKey(key);
        if (opened is null || !opened.GetValueNames().Contains(name, StringComparer.OrdinalIgnoreCase)) return null;
        return RegistryData.From(opened.GetValueKind(name).ToString(), opened.GetValue(name, null, RegistryValueOptions.DoNotExpandEnvironmentNames)!);
    }
    public void Create(string key) { using var opened = machine.CreateSubKey(key, writable: true); }
    public void Write(string key, string name, RegistryData value) { using var opened = machine.CreateSubKey(key, writable: true); opened.SetValue(name, value.ToRegistryValue(), Enum.Parse<RegistryValueKind>(value.Kind)); }
    public void DeleteValue(string key, string name) { using var opened = machine.OpenSubKey(key, writable: true); opened?.DeleteValue(name, throwOnMissingValue: false); }
    public void DeleteTree(string key) => machine.DeleteSubKeyTree(key, throwOnMissingSubKey: false);
    public void Dispose() => machine.Dispose();
}

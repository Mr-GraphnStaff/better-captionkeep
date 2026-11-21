using System.Runtime.InteropServices;
using System.Security.AccessControl;
using System.Security.Cryptography;
using System.Security.Cryptography.X509Certificates;
using System.Security.Principal;
using System.Text;
using System.Text.Json;
using Microsoft.Win32;

namespace BetterCaptionKeep.EndpointWorker;

public sealed class WindowsBridgePlatform : IEndpointBridgePlatform
{
    private const string Publisher="DAVID ANTHONY FARRIS";
    private const string TaskFolder=@"\DAF-TECH\BetterCaptionKeep";
    private const string TaskSecurity="D:P(A;;FA;;;SY)(A;;FA;;;BA)";
    private readonly string executable;
    public WindowsBridgePlatform(string? currentExecutable=null)
    {
        if(!OperatingSystem.IsWindows()||WindowsIdentity.GetCurrent().User?.Value!="S-1-5-18")throw new InvalidOperationException("The endpoint bridge requires its Intune SYSTEM context.");
        executable=Path.GetFullPath(currentExecutable??Environment.ProcessPath??throw new InvalidOperationException());
    }
    public static string DirectoryFor(string deployment,string browser)
    {
        if(!Guid.TryParseExact(deployment,"D",out var id)||id==Guid.Empty||browser is not("edge" or "chrome"))throw new InvalidDataException();
        return Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles),"DAF-TECH","Better CaptionKeep","ManagedEndpoint",id.ToString("D"),browser);
    }
    private static string DirectoryFor(WorkerConfiguration configuration)=>DirectoryFor(configuration.DeploymentId,configuration.Browser);
    private static string ConfigPath(WorkerConfiguration configuration)=>Path.Combine(DirectoryFor(configuration),"configuration.json");
    private static string BinaryPath(WorkerConfiguration configuration)=>Path.Combine(DirectoryFor(configuration),"EndpointWorker.exe");
    private static string TaskName(WorkerConfiguration configuration)=>configuration.DeploymentId+"-"+configuration.Browser;
    private static string Arguments(WorkerConfiguration configuration)=>$"--installed-bridge {configuration.DeploymentId} --browser {configuration.Browser} --action ReconcileBridge";
    private static string Marker(WorkerConfiguration configuration)=>$"BCKManagedBridge:{configuration.DeploymentId}:{configuration.Browser}:{configuration.ConfigurationHash}";

    public IDisposable AcquireExtensionLock(string extensionId)
    {
        if(extensionId is not("edefcbdhahfolgkoamkbknjppojpaffk" or "nabjdlnkkaonnbnimnmnhjcbigceebml"))throw new InvalidDataException();
        var mutex=new Mutex(false,@"Global\DAFTECH-BCK-Endpoint-"+extensionId);
        try{try{if(!mutex.WaitOne(TimeSpan.FromSeconds(30)))throw new TimeoutException();}catch(AbandonedMutexException){}return new MutexLease(mutex);}catch{mutex.Dispose();throw;}
    }
    private sealed class MutexLease(Mutex mutex):IDisposable{public void Dispose(){mutex.ReleaseMutex();mutex.Dispose();}}

    public BridgeInstallation? ReadInstallation(WorkerConfiguration configuration)
    {
        var directory=DirectoryFor(configuration);
        AssertPath(directory);
        if(!Directory.Exists(directory))return null;
        AssertProtectedDirectory(directory);
        var file=ConfigPath(configuration);
        if(!File.Exists(file))throw new InvalidDataException("An incomplete installation must be retried with its approved package.");
        AssertProtectedFile(file);
        if(new FileInfo(file).Length>20000)throw new InvalidDataException();
        var record=JsonSerializer.Deserialize<BridgeInstallation>(File.ReadAllText(file))??throw new InvalidDataException();
        ValidateRecord(configuration,record);
        var binary=BinaryPath(configuration);
        if(File.Exists(binary)){AssertProtectedFile(binary);VerifyRelease(binary,record.WorkerSha256);}
        else if(record.Phase!="PolicyRestored")throw new InvalidDataException("The installed executable is missing.");
        return record;
    }
    public static (WorkerConfiguration Configuration,BridgeInstallation Installation) ReadFixedConfiguration(string deployment,string browser)
    {
        var directory=DirectoryFor(deployment,browser);AssertPath(directory);AssertProtectedDirectory(directory);
        var file=Path.Combine(directory,"configuration.json");AssertProtectedFile(file);
        if(new FileInfo(file).Length>20000)throw new InvalidDataException();
        var installation=JsonSerializer.Deserialize<BridgeInstallation>(File.ReadAllText(file))??throw new InvalidDataException();
        var configuration=WorkerConfiguration.Parse(installation.EncodedConfiguration);
        if(configuration.DeploymentId!=deployment||configuration.Browser!=browser)throw new InvalidDataException();
        ValidateRecord(configuration,installation);
        return(configuration,installation);
    }
    private static void ValidateRecord(WorkerConfiguration configuration,BridgeInstallation record)
    {
        if(record.Version!=1||record.Phase is not("Prepared" or "Installed" or "Removing" or "PolicyRestored")||!ValidHash(record.WorkerSha256)
            ||WorkerConfiguration.Parse(record.EncodedConfiguration).ConfigurationHash!=configuration.ConfigurationHash)throw new InvalidDataException();
    }
    public void PrepareInstallation(WorkerConfiguration configuration,BridgeInstallation installation)
    {
        ValidateRecord(configuration,installation);VerifyRelease(executable,installation.WorkerSha256);
        AssertNoCompetingTask(configuration);
        var directory=DirectoryFor(configuration);AssertPath(directory);
        // Never take ownership of a previously writable installation location.
        // Its owner could replace files or rewrite a DACL after we inspected it.
        AssertProtectedDirectory(directory);
        if(Directory.Exists(directory)&&File.Exists(ConfigPath(configuration)))
        {
            AssertProtectedDirectory(directory);AssertProtectedFile(ConfigPath(configuration));
            var previous=JsonSerializer.Deserialize<BridgeInstallation>(File.ReadAllText(ConfigPath(configuration)))??throw new InvalidDataException();
            ValidateRecord(configuration,previous);
            if(previous.Phase is not("Prepared" or "Installed"))throw new InvalidDataException("Removal is pending; deployment evidence is retained.");
            var binary=BinaryPath(configuration);
            // Reconcile a crash between a verified binary replacement and its
            // configuration checkpoint only against this approved new hash.
            if(File.Exists(binary)){AssertProtectedFile(binary);var hash=Hash(binary);if(hash!=previous.WorkerSha256&&hash!=installation.WorkerSha256)throw new InvalidDataException();VerifyRelease(binary,hash);}
            DisableAndStopTask(configuration);
        }
        Directory.CreateDirectory(directory);ProtectDirectory(directory);AssertProtectedDirectory(directory);
        var destination=BinaryPath(configuration);
        if(!string.Equals(executable,destination,StringComparison.OrdinalIgnoreCase))
        {
            var next=Path.Combine(directory,".EndpointWorker.installing");AssertPath(next);
            using(var input=File.OpenRead(executable))using(var output=new FileStream(next,FileMode.Create,FileAccess.Write,FileShare.None)){input.CopyTo(output);output.Flush(true);}
            ProtectFile(next);VerifyRelease(next,installation.WorkerSha256);File.Move(next,destination,true);
        }
        ProtectFile(destination);VerifyRelease(destination,installation.WorkerSha256);
        WriteInstallation(configuration,installation);
    }
    public void WriteInstallation(WorkerConfiguration configuration,BridgeInstallation installation)
    {
        ValidateRecord(configuration,installation);var directory=DirectoryFor(configuration);AssertPath(directory);AssertProtectedDirectory(directory);
        var temporary=Path.Combine(directory,".configuration.installing");AssertPath(temporary);
        using(var file=new FileStream(temporary,FileMode.Create,FileAccess.Write,FileShare.None)){file.Write(JsonSerializer.SerializeToUtf8Bytes(installation));file.Flush(true);}
        ProtectFile(temporary);File.Move(temporary,ConfigPath(configuration),true);AssertProtectedFile(ConfigPath(configuration));
        if(File.ReadAllText(ConfigPath(configuration))!=JsonSerializer.Serialize(installation))throw new IOException("The installation checkpoint was not confirmed.");
    }
    public void DeleteInstallation(WorkerConfiguration configuration)
    {
        if(ReadInstallation(configuration)?.Phase!="PolicyRestored")throw new InvalidDataException();
        var directory=DirectoryFor(configuration);
        if(Directory.EnumerateDirectories(directory).Any()||Directory.EnumerateFiles(directory).Any(file=>Path.GetFileName(file) is not("EndpointWorker.exe" or "configuration.json")))throw new InvalidDataException("Unexpected files are preserved.");
        File.Delete(BinaryPath(configuration));File.Delete(ConfigPath(configuration));Directory.Delete(directory,false);
    }

    public void ValidateRegistryTrust(WorkerConfiguration configuration)
    {
        using var machine=RegistryKey.OpenBaseKey(RegistryHive.LocalMachine,RegistryView.Registry64);
        foreach(var path in new[]{ManagedPolicyBridge.StagingRoot+"\\"+configuration.Browser,configuration.StatePath,configuration.PolicyPath,configuration.ForcePath})
        {
            var parts=path.Split('\\');
            for(var length=1;length<=parts.Length;length++)
            {
                using var key=machine.OpenSubKey(string.Join('\\',parts.Take(length)),false);
                if(key is null)continue;
                var security=key.GetAccessControl();AssertOwner(security);
                using var next=length<parts.Length?machine.OpenSubKey(string.Join('\\',parts.Take(length+1)),false):null;
                var createsChildren=length==parts.Length||next is null;
                AssertRules(security.GetAccessRules(true,true,typeof(SecurityIdentifier)).Cast<RegistryAccessRule>()
                    .Where(rule=>rule.AccessControlType==AccessControlType.Allow&&((rule.PropagationFlags&PropagationFlags.InheritOnly)==0
                        // CREATOR OWNER resolves to our enforced SYSTEM owner
                        // for new keys; other inheritable writers are unsafe.
                        ||createsChildren&&(rule.InheritanceFlags&InheritanceFlags.ContainerInherit)!=0&&rule.IdentityReference.Value!="S-1-3-0"))
                    .Select(rule=>(rule.IdentityReference.Value,(long)(rule.RegistryRights&(RegistryRights.SetValue|RegistryRights.CreateSubKey|RegistryRights.Delete|RegistryRights.ChangePermissions|RegistryRights.TakeOwnership)))));
            }
        }
    }
    private static void AssertRules(IEnumerable<(string Identity,long Rights)> rules)
    {if(rules.Any(rule=>rule.Rights!=0&&!Privileged(rule.Identity)))throw new InvalidDataException("Writable management paths are not trusted.");}
    private static bool Privileged(string sid)=>sid is "S-1-5-18" or "S-1-5-32-544" or "S-1-5-80-956008885-3418522649-1831038044-1853292631-2271478464";
    private static void AssertOwner(ObjectSecurity security)
    {var owner=security.GetOwner(typeof(SecurityIdentifier))?.Value;if(owner is null||!Privileged(owner))throw new InvalidDataException("The management path owner is not trusted.");}
    private static void AssertPath(string path)
    {
        for(var cursor=Path.GetFullPath(path);!string.IsNullOrEmpty(cursor);cursor=Path.GetDirectoryName(cursor))
            if((File.Exists(cursor)||Directory.Exists(cursor))&&(File.GetAttributes(cursor)&FileAttributes.ReparsePoint)!=0)throw new InvalidDataException("Linked executable/configuration paths are not allowed.");
    }
    private static void AssertProtectedDirectory(string path)
    {
        AssertPath(path);
        var nearest=Ancestors(path).FirstOrDefault()??throw new InvalidDataException();
        foreach(var cursor in Ancestors(path))
        {
            var security=new DirectoryInfo(cursor).GetAccessControl();AssertOwner(security);
            var rules=security.GetAccessRules(true,true,typeof(SecurityIdentifier)).Cast<FileSystemAccessRule>();
            var destructive=FileSystemRights.Delete|FileSystemRights.DeleteSubdirectoriesAndFiles|FileSystemRights.ChangePermissions|FileSystemRights.TakeOwnership;
            var writes=cursor.Equals(nearest,StringComparison.OrdinalIgnoreCase)?FileSystemRights.Write:0;
            AssertRules(rules.Where(rule=>rule.AccessControlType==AccessControlType.Allow&&((rule.PropagationFlags&PropagationFlags.InheritOnly)==0
                ||cursor.Equals(nearest,StringComparison.OrdinalIgnoreCase)&&(rule.InheritanceFlags&(InheritanceFlags.ContainerInherit|InheritanceFlags.ObjectInherit))!=0
                    &&rule.IdentityReference.Value!="S-1-3-0")).Select(rule=>(rule.IdentityReference.Value,(long)(rule.FileSystemRights&(destructive|writes)))));
        }
    }
    private static IEnumerable<string> Ancestors(string path){for(var cursor=Path.GetFullPath(path);cursor is not null;cursor=Path.GetDirectoryName(cursor))if(Directory.Exists(cursor))yield return cursor;}
    private static void AssertProtectedFile(string path)
    {
        AssertPath(path);AssertProtectedDirectory(Path.GetDirectoryName(path)!);
        var security=new FileInfo(path).GetAccessControl();AssertOwner(security);
        AssertRules(security.GetAccessRules(true,true,typeof(SecurityIdentifier)).Cast<FileSystemAccessRule>()
            .Where(rule=>rule.AccessControlType==AccessControlType.Allow&&(rule.PropagationFlags&PropagationFlags.InheritOnly)==0).Select(rule=>(rule.IdentityReference.Value,(long)(rule.FileSystemRights&(FileSystemRights.Write|FileSystemRights.Delete|FileSystemRights.ChangePermissions|FileSystemRights.TakeOwnership)))));
    }
    private static void ProtectDirectory(string path){var acl=new DirectorySecurity();acl.SetAccessRuleProtection(true,false);foreach(var sid in new[]{"S-1-5-18","S-1-5-32-544"})acl.AddAccessRule(new FileSystemAccessRule(new SecurityIdentifier(sid),FileSystemRights.FullControl,InheritanceFlags.ContainerInherit|InheritanceFlags.ObjectInherit,PropagationFlags.None,AccessControlType.Allow));new DirectoryInfo(path).SetAccessControl(acl);}
    private static void ProtectFile(string path){var acl=new FileSecurity();acl.SetAccessRuleProtection(true,false);foreach(var sid in new[]{"S-1-5-18","S-1-5-32-544"})acl.AddAccessRule(new FileSystemAccessRule(new SecurityIdentifier(sid),FileSystemRights.FullControl,AccessControlType.Allow));new FileInfo(path).SetAccessControl(acl);}
    private static bool ValidHash(string hash)=>hash.Length==64&&hash.All(Uri.IsHexDigit);
    private static string Hash(string path){using var stream=File.OpenRead(path);return Convert.ToHexString(SHA256.HashData(stream)).ToLowerInvariant();}
    private static void VerifyRelease(string path,string expected)
    {
        AssertPath(path);if(!ValidHash(expected)||Hash(path)!=expected.ToLowerInvariant())throw new InvalidDataException("The approved executable hash differs.");
        PublicSignature.Verify(path,Publisher);
    }

    private static dynamic Scheduler(){var type=Type.GetTypeFromProgID("Schedule.Service")??throw new InvalidOperationException();dynamic scheduler=Activator.CreateInstance(type)!;scheduler.Connect();return scheduler;}
    private static dynamic? FindTask(dynamic scheduler,WorkerConfiguration configuration)
    {try{return scheduler.GetFolder(TaskFolder).GetTask(TaskName(configuration));}catch(COMException error)when(error.HResult is unchecked((int)0x80070002) or unchecked((int)0x80070003)){return null;}}
    private void AssertNoCompetingTask(WorkerConfiguration configuration)
    {
        dynamic scheduler=Scheduler();dynamic folder;
        try{folder=scheduler.GetFolder(TaskFolder);}
        catch(COMException error)when(error.HResult is unchecked((int)0x80070002) or unchecked((int)0x80070003)){return;}
        if(!TaskSecurityMatches((string)folder.GetSecurityDescriptor(5)))throw new InvalidDataException("A different task folder is preserved.");
        dynamic tasks=folder.GetTasks(1); // Include hidden product tasks.
        for(var index=1;index<=(int)tasks.Count;index++)
        {
            dynamic task=tasks.Item(index);var name=(string)task.Name;
            if(name.Equals(TaskName(configuration),StringComparison.OrdinalIgnoreCase))continue;
            var browser=name.EndsWith("-edge",StringComparison.OrdinalIgnoreCase)?"edge":name.EndsWith("-chrome",StringComparison.OrdinalIgnoreCase)?"chrome":null;
            if(browser is null||!Guid.TryParseExact(name[..^(browser.Length+1)],"D",out var deployment)||deployment==Guid.Empty)
                throw new InvalidDataException("Unexpected management tasks are preserved.");
            if(browser==configuration.Browser)throw new InvalidDataException("CompetingDeployment");
            // A different browser can share the fixed product folder only when
            // its protected configuration and exact task action agree. A name
            // alone cannot establish which browser another task controls.
            var other=ReadFixedConfiguration(deployment.ToString("D"),browser).Configuration;
            if(!TaskMatches(other,false))throw new InvalidDataException("Unexpected management tasks are preserved.");
        }
    }
    public bool TaskMatches(WorkerConfiguration configuration,bool requireEnabled=true)
    {
        dynamic scheduler=Scheduler();dynamic? task=FindTask(scheduler,configuration);if(task is null)return false;
        foreach(var folder in new[]{@"\DAF-TECH",TaskFolder})if(!TaskSecurityMatches((string)scheduler.GetFolder(folder).GetSecurityDescriptor(5)))return false;
        dynamic definition=task.Definition;
        var principal=(string)definition.Principal.UserId;
        if(principal is not("SYSTEM" or "S-1-5-18" or "NT AUTHORITY\\SYSTEM")||(int)definition.Principal.LogonType!=5||(int)definition.Principal.RunLevel!=1
            ||(string)definition.RegistrationInfo.Description!=Marker(configuration)||(int)definition.Actions.Count!=1||(int)definition.Triggers.Count!=2
            ||(requireEnabled&&(!(bool)task.Enabled||!(bool)definition.Settings.Enabled))||(string)definition.Settings.ExecutionTimeLimit!="PT1M"||(int)definition.Settings.MultipleInstances!=2
            ||!(bool)definition.Settings.StartWhenAvailable||(bool)definition.Settings.DisallowStartIfOnBatteries||(bool)definition.Settings.StopIfGoingOnBatteries)return false;
        dynamic action=definition.Actions.Item(1);
        if((int)action.Type!=0||!string.Equals((string)action.Path,BinaryPath(configuration),StringComparison.OrdinalIgnoreCase)||(string)action.Arguments!=Arguments(configuration)
            ||!string.Equals((string)action.WorkingDirectory,DirectoryFor(configuration),StringComparison.OrdinalIgnoreCase))return false;
        var boot=false;var periodic=false;
        for(var index=1;index<=2;index++)
        {
            dynamic trigger=definition.Triggers.Item(index);
            if(!(bool)trigger.Enabled||!string.IsNullOrEmpty((string)trigger.EndBoundary))return false;
            if((int)trigger.Type==8&&(string)trigger.Delay=="PT30S")boot=true;
            else if((int)trigger.Type==1&&(string)trigger.Repetition.Interval=="PT5M"&&string.IsNullOrEmpty((string)trigger.Repetition.Duration)
                &&!(bool)trigger.Repetition.StopAtDurationEnd&&DateTime.TryParse((string)trigger.StartBoundary,out var start)&&start<=DateTime.Now.AddMinutes(1))periodic=true;
            else return false;
        }
        if(!TaskSecurityMatches((string)task.GetSecurityDescriptor(5)))return false;
        return boot&&periodic;
    }
    private static bool TaskSecurityMatches(string descriptor)
    {
        var security=new RawSecurityDescriptor(descriptor);
        if(security.Owner is null||!Privileged(security.Owner.Value)||security.DiscretionaryAcl is null)return false;
        foreach(var entry in security.DiscretionaryAcl)
        {
            // The installed descriptor uses ordinary allow ACEs. Unknown or
            // object-specific ACE forms must not be silently skipped.
            if(entry is not CommonAce ace||ace.AceQualifier!=AceQualifier.AccessAllowed)return false;
            if(ace.AccessMask!=0&&!Privileged(ace.SecurityIdentifier.Value))return false;
        }
        return true;
    }
    public void RegisterTask(WorkerConfiguration configuration)
    {
        _=ReadInstallation(configuration)??throw new InvalidDataException();
        AssertNoCompetingTask(configuration);
        dynamic scheduler=Scheduler();dynamic? existing=FindTask(scheduler,configuration);
        if(existing is not null&&!TaskMatches(configuration,false))throw new InvalidDataException("A different task is preserved.");
        dynamic folder=scheduler.GetFolder("\\");
        foreach(var component in new[]{"DAF-TECH","BetterCaptionKeep"}){try{folder=folder.GetFolder(component);}catch(COMException error)when(error.HResult==unchecked((int)0x80070002)){folder=folder.CreateFolder(component,TaskSecurity);}if(!TaskSecurityMatches((string)folder.GetSecurityDescriptor(5)))throw new InvalidDataException("A different task folder is preserved.");}
        dynamic definition=scheduler.NewTask(0);definition.RegistrationInfo.Description=Marker(configuration);
        definition.Principal.UserId="SYSTEM";definition.Principal.LogonType=5;definition.Principal.RunLevel=1;
        definition.Settings.Hidden=true;definition.Settings.Enabled=true;definition.Settings.StartWhenAvailable=true;definition.Settings.ExecutionTimeLimit="PT1M";definition.Settings.MultipleInstances=2;
        definition.Settings.DisallowStartIfOnBatteries=false;definition.Settings.StopIfGoingOnBatteries=false;
        dynamic boot=definition.Triggers.Create(8);boot.Delay="PT30S";
        dynamic periodic=definition.Triggers.Create(1);periodic.StartBoundary=DateTime.Now.ToString("s");periodic.Repetition.Interval="PT5M";
        dynamic action=definition.Actions.Create(0);action.Path=BinaryPath(configuration);action.Arguments=Arguments(configuration);action.WorkingDirectory=DirectoryFor(configuration);
        folder.RegisterTaskDefinition(TaskName(configuration),definition,6,"SYSTEM",null,5,TaskSecurity);
        if(!TaskMatches(configuration))throw new InvalidDataException("The registered task did not match its approved action.");
    }
    public void DisableAndStopTask(WorkerConfiguration configuration)
    {dynamic scheduler=Scheduler();dynamic? task=FindTask(scheduler,configuration);if(task is null)return;if(!TaskMatches(configuration,false))throw new InvalidDataException("A different task is preserved.");task.Enabled=false;task.Stop(0);if((bool)task.Enabled)throw new InvalidDataException();}
    public void DeleteTask(WorkerConfiguration configuration)
    {dynamic scheduler=Scheduler();dynamic? task=FindTask(scheduler,configuration);if(task is null)return;if(!TaskMatches(configuration,false)||(bool)task.Enabled)throw new InvalidDataException();scheduler.GetFolder(TaskFolder).DeleteTask(TaskName(configuration),0);if(FindTask(scheduler,configuration)is not null)throw new InvalidDataException();}
    public void RecordHealth(WorkerConfiguration configuration,BridgeHostResult result)
    {
        using var machine=RegistryKey.OpenBaseKey(RegistryHive.LocalMachine,RegistryView.Registry64);
        using var key=machine.CreateSubKey(configuration.StatePath+@"\ManagedBridge");
        var security=new RegistrySecurity();security.SetAccessRuleProtection(true,false);foreach(var sid in new[]{"S-1-5-18","S-1-5-32-544"})security.AddAccessRule(new RegistryAccessRule(new SecurityIdentifier(sid),RegistryRights.FullControl,InheritanceFlags.ContainerInherit,PropagationFlags.None,AccessControlType.Allow));key.SetAccessControl(security);
        key.SetValue("Health",JsonSerializer.Serialize(new{attemptedAtUtc=DateTimeOffset.UtcNow,result}),RegistryValueKind.String);
    }
    public DateTimeOffset? ReadHealth(WorkerConfiguration configuration)
    {
        using var machine=RegistryKey.OpenBaseKey(RegistryHive.LocalMachine,RegistryView.Registry64);
        using var key=machine.OpenSubKey(configuration.StatePath+@"\ManagedBridge",false);
        if(key is null||!key.GetValueNames().Contains("Health",StringComparer.OrdinalIgnoreCase))return null;
        if(key.GetValueKind("Health")!=RegistryValueKind.String||key.GetValue("Health",null,RegistryValueOptions.DoNotExpandEnvironmentNames) is not string text
            ||Encoding.UTF8.GetByteCount(text)>8192)throw new InvalidDataException("Invalid bridge health record.");
        using var health=JsonDocument.Parse(text,new JsonDocumentOptions{MaxDepth=8});
        if(!health.RootElement.TryGetProperty("attemptedAtUtc",out var attempted)||!attempted.TryGetDateTimeOffset(out var timestamp))throw new InvalidDataException("Invalid bridge health timestamp.");
        return timestamp;
    }

    private static class PublicSignature
    {
        [StructLayout(LayoutKind.Sequential,CharSet=CharSet.Unicode)]private struct FileInfo{public uint Size;public IntPtr Path;public IntPtr Handle;public IntPtr Subject;}
        [StructLayout(LayoutKind.Sequential,CharSet=CharSet.Unicode)]private struct TrustData{public uint Size;public IntPtr Callback;public IntPtr Sip;public uint Ui;public uint Revocation;public uint Choice;public IntPtr File;public uint StateAction;public IntPtr State;public IntPtr Url;public uint Flags;public uint Context;}
        [DllImport("wintrust.dll",ExactSpelling=true)]private static extern int WinVerifyTrust(IntPtr window,[In]ref Guid action,ref TrustData data);
        public static void Verify(string file,string publisher)
        {
            var path=Marshal.StringToCoTaskMemUni(file);var pointer=Marshal.AllocHGlobal(Marshal.SizeOf<FileInfo>());
            var info=new FileInfo{Size=(uint)Marshal.SizeOf<FileInfo>(),Path=path};Marshal.StructureToPtr(info,pointer,false);
            var action=new Guid("00AAC56B-CD44-11d0-8CC2-00C04FC295EE");
            var data=new TrustData{Size=(uint)Marshal.SizeOf<TrustData>(),Ui=2,Choice=1,File=pointer,StateAction=1,Flags=0x1000|0x80};
            try{
                if(WinVerifyTrust(new IntPtr(-1),ref action,ref data)!=0)throw new InvalidDataException("Windows did not verify the publisher signature.");
                // LoadCertificate reads certificate blobs, not a signed PE.
                // Use the compatibility extractor only after WinVerifyTrust;
                // no private key or unverified standalone certificate is used.
#pragma warning disable SYSLIB0057
                using var raw=X509Certificate.CreateFromSignedFile(file);
#pragma warning restore SYSLIB0057
                using var certificate=X509CertificateLoader.LoadCertificate(raw.Export(X509ContentType.Cert));
                var purposes=certificate.Extensions.OfType<X509EnhancedKeyUsageExtension>().SelectMany(extension=>extension.EnhancedKeyUsages.Cast<Oid>()).Select(oid=>oid.Value).ToArray();
                if(certificate.GetNameInfo(X509NameType.SimpleName,false)!=publisher||!purposes.Contains("1.3.6.1.5.5.7.3.3")||!purposes.Contains("1.3.6.1.4.1.311.97.1.0")||purposes.Any(oid=>oid?.StartsWith("1.3.6.1.4.1.311.97.1.3.1.")==true))throw new InvalidDataException("A public approved publisher signature is required.");
            }finally{data.StateAction=2;_ = WinVerifyTrust(new IntPtr(-1),ref action,ref data);Marshal.FreeHGlobal(pointer);Marshal.FreeCoTaskMem(path);}
        }
    }
}

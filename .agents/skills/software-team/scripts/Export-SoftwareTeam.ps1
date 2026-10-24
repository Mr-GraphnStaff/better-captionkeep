param([Parameter(Mandatory=$true)][string]$OutputDirectory)
$ErrorActionPreference='Stop'
Set-StrictMode -Version Latest

$sourceRoot=[IO.Path]::GetFullPath((Split-Path -Parent $PSScriptRoot))
$skillText=[IO.File]::ReadAllText((Join-Path $sourceRoot 'SKILL.md'))
$versionMatch=[regex]::Match($skillText,'(?m)^  version: "([0-9]+\.[0-9]+\.[0-9]+)"\r?$')
if(-not $versionMatch.Success){throw 'SKILL.md must declare metadata.version as a quoted semantic version.'}
$version=$versionMatch.Groups[1].Value
$outputRoot=[IO.Path]::GetFullPath($OutputDirectory)
if(Test-Path -LiteralPath $outputRoot){throw 'Choose a fresh output directory; existing releases are never overwritten.'}
if($outputRoot.StartsWith($sourceRoot+[IO.Path]::DirectorySeparatorChar,[StringComparison]::OrdinalIgnoreCase)){throw 'Export outside the authoring skill folder.'}
$pluginRoot=Join-Path $outputRoot 'software-team'
$skillRoot=Join-Path $pluginRoot 'skills/software-team'
[IO.Directory]::CreateDirectory($skillRoot)|Out-Null

$files=@(Get-Item -LiteralPath (Join-Path $sourceRoot 'SKILL.md'))
foreach($directory in @('agents','assets','references','scripts')){
  $candidate=Join-Path $sourceRoot $directory
  if(Test-Path -LiteralPath $candidate){$files+=@(Get-ChildItem -LiteralPath $candidate -File -Recurse)}
}
foreach($file in $files){
  if($file.Attributes -band [IO.FileAttributes]::ReparsePoint){throw 'Do not export linked source files.'}
  $relative=[IO.Path]::GetRelativePath($sourceRoot,$file.FullName)
  $destination=Join-Path $skillRoot $relative
  [IO.Directory]::CreateDirectory((Split-Path -Parent $destination))|Out-Null
  Copy-Item -LiteralPath $file.FullName -Destination $destination
}
$manifest=[ordered]@{
  '$schema'='https://agent-plugins.org/schemas/1.0.0/plugin.schema.json'
  name='software-team';version=$version
  description='Your named software team with mentor influences, independent review and FinOps discipline.'
  extensions=@{'com.openai'=@{interface=@{displayName='Software Team';shortDescription='Your named software team';longDescription='Work with your named engineering, research and security teams under your direction, with clear evidence and cost accountability.';category='Productivity';defaultPrompt=@('Use Software Team to assess this project and staff the appropriate named specialists.')}}}
}
[IO.File]::WriteAllText((Join-Path $pluginRoot 'plugin.json'),($manifest|ConvertTo-Json -Depth 12)+[Environment]::NewLine)
$entries=@(Get-ChildItem -LiteralPath $pluginRoot -File -Recurse|Sort-Object FullName|ForEach-Object{
  [ordered]@{path=([IO.Path]::GetRelativePath($pluginRoot,$_.FullName).Replace('\','/'));sha256=(Get-FileHash -LiteralPath $_.FullName -Algorithm SHA256).Hash.ToLowerInvariant()}
})
$release=[ordered]@{name='software-team';version=$version;files=$entries}
[IO.File]::WriteAllText((Join-Path $pluginRoot 'release-manifest.json'),($release|ConvertTo-Json -Depth 8)+[Environment]::NewLine)
$archive=Join-Path $outputRoot "software-team-$version.zip"
Add-Type -AssemblyName System.IO.Compression.FileSystem
[IO.Compression.ZipFile]::CreateFromDirectory($pluginRoot,$archive)
$archiveHash=(Get-FileHash -LiteralPath $archive -Algorithm SHA256).Hash.ToLowerInvariant()
[IO.File]::WriteAllText("$archive.sha256","$archiveHash  $([IO.Path]::GetFileName($archive))"+[Environment]::NewLine)
[pscustomobject]@{Version=$version;PluginDirectory=$pluginRoot;Archive=$archive;Sha256=$archiveHash;Files=$entries.Count}|ConvertTo-Json

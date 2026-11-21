#Requires -Version 5.1
# The engine owns decisions and permission validation. These branded setup dialogs
# collect answers; Microsoft alone presents credentials, MFA and consent screens.
$script:SetupDialogMessages=[Collections.Generic.List[string]]::new()
$script:SetupGuidedUi=$false

function Write-SetupMessage {
    param([Parameter(Position=0)]$Object,$ForegroundColor)
    if($script:SetupGuidedUi){$script:SetupDialogMessages.Add([string]$Object)}
    else {Microsoft.PowerShell.Utility\Write-Host $Object}
}

function New-SetupDialog {
    param([string]$Heading,[string]$Description)
    Add-Type -AssemblyName PresentationFramework
    Add-Type -AssemblyName PresentationCore
    Add-Type -AssemblyName WindowsBase
    if([Threading.Thread]::CurrentThread.ApartmentState -ne 'STA'){
        throw 'Open the administrator setup application again. Its guided windows require the normal STA launcher.'
    }
    $xaml=@'
<Window xmlns="http://schemas.microsoft.com/winfx/2006/xaml/presentation"
        xmlns:x="http://schemas.microsoft.com/winfx/2006/xaml"
        Name="BckSetupDialog" Title="Better CaptionKeep - Microsoft 365 setup"
        Width="800" Height="660" MinWidth="520" MinHeight="420"
        WindowStartupLocation="CenterScreen" Background="{DynamicResource SurfaceBrush}"
        Foreground="{DynamicResource InkBrush}" FontFamily="Segoe UI Variable Text, Segoe UI"
        FontSize="{DynamicResource BodyFontSize}" UseLayoutRounding="True">
 <Window.Resources>
  <Style x:Key="SetupAction" TargetType="Button">
   <Setter Property="MinHeight" Value="44"/><Setter Property="MinWidth" Value="120"/>
   <Setter Property="MaxWidth" Value="390"/><Setter Property="Margin" Value="8,6,0,0"/>
   <Setter Property="FontWeight" Value="SemiBold"/><Setter Property="Cursor" Value="Hand"/>
   <Setter Property="Foreground" Value="{DynamicResource InkBrush}"/>
   <Setter Property="Background" Value="{DynamicResource SubtleBrush}"/>
   <Setter Property="BorderBrush" Value="{DynamicResource EdgeBrush}"/>
   <Setter Property="Template"><Setter.Value>
    <ControlTemplate TargetType="Button">
     <Border x:Name="ActionBorder" CornerRadius="10" Padding="18,11" BorderThickness="1"
             Background="{TemplateBinding Background}" BorderBrush="{TemplateBinding BorderBrush}">
      <ContentPresenter HorizontalAlignment="Center" VerticalAlignment="Center">
       <ContentPresenter.ContentTemplate><DataTemplate>
        <TextBlock Text="{Binding}" TextWrapping="Wrap" TextAlignment="Center"/>
       </DataTemplate></ContentPresenter.ContentTemplate>
      </ContentPresenter>
     </Border>
     <ControlTemplate.Triggers>
      <Trigger Property="IsMouseOver" Value="True"><Setter TargetName="ActionBorder" Property="Opacity" Value="0.88"/></Trigger>
      <Trigger Property="IsKeyboardFocused" Value="True"><Setter TargetName="ActionBorder" Property="BorderBrush" Value="{DynamicResource FocusBrush}"/><Setter TargetName="ActionBorder" Property="BorderThickness" Value="3"/></Trigger>
      <Trigger Property="IsEnabled" Value="False"><Setter TargetName="ActionBorder" Property="Opacity" Value="0.5"/></Trigger>
     </ControlTemplate.Triggers>
    </ControlTemplate>
   </Setter.Value></Setter>
  </Style>
  <Style TargetType="TextBox">
   <Setter Property="Foreground" Value="{DynamicResource InkBrush}"/>
   <Setter Property="Background" Value="{DynamicResource CardBrush}"/>
   <Setter Property="BorderBrush" Value="{DynamicResource EdgeBrush}"/>
   <Setter Property="Padding" Value="10,9"/><Setter Property="MinHeight" Value="44"/>
  </Style>
  <Style TargetType="ComboBoxItem">
   <Setter Property="Foreground" Value="{DynamicResource InkBrush}"/>
   <Setter Property="Background" Value="{DynamicResource CardBrush}"/>
   <Setter Property="Padding" Value="12,10"/>
   <Setter Property="Template"><Setter.Value><ControlTemplate TargetType="ComboBoxItem">
    <Border x:Name="ChoiceBorder" Background="{TemplateBinding Background}" CornerRadius="6" Padding="{TemplateBinding Padding}">
     <ContentPresenter/>
    </Border>
    <ControlTemplate.Triggers>
     <Trigger Property="IsHighlighted" Value="True"><Setter TargetName="ChoiceBorder" Property="Background" Value="{DynamicResource SubtleBrush}"/></Trigger>
     <Trigger Property="IsSelected" Value="True"><Setter TargetName="ChoiceBorder" Property="Background" Value="{DynamicResource AccentBrush}"/><Setter Property="Foreground" Value="{DynamicResource AccentInkBrush}"/></Trigger>
    </ControlTemplate.Triggers>
   </ControlTemplate></Setter.Value></Setter>
  </Style>
  <Style TargetType="ComboBox">
   <Setter Property="Template"><Setter.Value><ControlTemplate TargetType="ComboBox">
    <Grid>
     <ToggleButton Focusable="False" ClickMode="Press" IsChecked="{Binding IsDropDownOpen, Mode=TwoWay, RelativeSource={RelativeSource TemplatedParent}}">
      <ToggleButton.Template><ControlTemplate TargetType="ToggleButton">
       <Border x:Name="ChoiceShell" Background="{DynamicResource CardBrush}" BorderBrush="{DynamicResource EdgeBrush}" BorderThickness="1" CornerRadius="8">
        <Path Data="M 0 0 L 5 5 L 10 0" Stroke="{DynamicResource InkBrush}" StrokeThickness="2" HorizontalAlignment="Right" VerticalAlignment="Center" Margin="0,0,14,0"/>
       </Border>
       <ControlTemplate.Triggers><Trigger Property="IsChecked" Value="True"><Setter TargetName="ChoiceShell" Property="BorderBrush" Value="{DynamicResource AccentBrush}"/></Trigger></ControlTemplate.Triggers>
      </ControlTemplate></ToggleButton.Template>
     </ToggleButton>
     <ContentPresenter Content="{TemplateBinding SelectionBoxItem}" ContentTemplate="{TemplateBinding SelectionBoxItemTemplate}" Margin="12,10,38,10" VerticalAlignment="Center" IsHitTestVisible="False"/>
     <Border x:Name="ChoiceFocusRing" BorderThickness="2" CornerRadius="8" BorderBrush="Transparent" IsHitTestVisible="False"/>
     <Popup Name="PART_Popup" Placement="Bottom" IsOpen="{TemplateBinding IsDropDownOpen}" AllowsTransparency="True" Focusable="False" PopupAnimation="Slide">
      <Border MinWidth="{TemplateBinding ActualWidth}" MaxHeight="320" Background="{DynamicResource CardBrush}" BorderBrush="{DynamicResource EdgeBrush}" BorderThickness="1" CornerRadius="8" Padding="4" Margin="0,4,0,0">
       <ScrollViewer VerticalScrollBarVisibility="Auto" HorizontalScrollBarVisibility="Disabled"><ItemsPresenter KeyboardNavigation.DirectionalNavigation="Contained"/></ScrollViewer>
      </Border>
     </Popup>
    </Grid>
    <ControlTemplate.Triggers><Trigger Property="IsKeyboardFocusWithin" Value="True"><Setter TargetName="ChoiceFocusRing" Property="BorderBrush" Value="{DynamicResource FocusBrush}"/></Trigger></ControlTemplate.Triggers>
   </ControlTemplate></Setter.Value></Setter>
  </Style>
 </Window.Resources>
 <Grid>
  <Grid.RowDefinitions><RowDefinition Height="Auto"/><RowDefinition Height="*"/><RowDefinition Height="Auto"/></Grid.RowDefinitions>
  <Border Background="#063B35" Padding="28,21">
   <StackPanel>
    <TextBlock Text="Better CaptionKeep" FontWeight="SemiBold" FontSize="{DynamicResource BrandFontSize}" Foreground="White" TextWrapping="Wrap"/>
    <TextBlock Text="DAF-TECH  /  Microsoft 365 administrator setup" Foreground="#C8E9E1" Margin="0,5,0,0" FontSize="{DynamicResource SmallFontSize}" TextWrapping="Wrap"/>
   </StackPanel>
  </Border>
  <ScrollViewer Name="DialogScroll" Grid.Row="1" VerticalScrollBarVisibility="Auto" HorizontalScrollBarVisibility="Disabled" Padding="28,26">
   <StackPanel>
    <Border Name="DialogAlert" Visibility="Collapsed" Background="{DynamicResource DangerSurfaceBrush}" CornerRadius="8" Padding="12,8" Margin="0,0,0,16">
     <TextBlock Name="DialogAlertText" Text="Setup needs attention" Foreground="{DynamicResource DangerBrush}" FontWeight="SemiBold" TextWrapping="Wrap"/>
    </Border>
    <TextBlock Name="DialogHeading" FontSize="{DynamicResource HeadingFontSize}" FontWeight="SemiBold" TextWrapping="Wrap" Focusable="True"/>
    <TextBlock Name="DialogDescription" Margin="0,12,0,22" TextWrapping="Wrap" AutomationProperties.LiveSetting="Polite"/>
    <Border Name="DialogDetailsCard" Background="{DynamicResource CardBrush}" BorderBrush="{DynamicResource EdgeBrush}" BorderThickness="1" CornerRadius="14" Padding="20">
     <StackPanel>
      <TextBox Name="DialogDetails" IsReadOnly="True" AcceptsReturn="True" TextWrapping="Wrap" BorderThickness="0" Padding="0" MinHeight="0"
               AutomationProperties.Name="Setup details and proposed changes"/>
      <StackPanel Name="DialogProgressPanel" Visibility="Collapsed" Margin="0,18,0,0">
       <ProgressBar Name="PrerequisiteActivity" Height="7" IsIndeterminate="True" Foreground="{DynamicResource AccentBrush}" Background="{DynamicResource SubtleBrush}"
                    AutomationProperties.Name="Setup is working; time remaining is unknown"/>
       <TextBlock Name="PrerequisiteStatus" Margin="0,14,0,0" TextWrapping="Wrap" AutomationProperties.LiveSetting="Polite"/>
      </StackPanel>
     </StackPanel>
    </Border>
    <StackPanel Name="DialogInputSection" Margin="0,22,0,0">
     <TextBlock Name="DialogAnswerLabel" Text="Your answer" FontWeight="SemiBold" TextWrapping="Wrap" Margin="0,0,0,8"/>
     <TextBox Name="DialogAnswerInput" TextWrapping="Wrap"/>
     <ComboBox Name="DialogAnswerChoice" Visibility="Collapsed" MinHeight="44" Padding="10,8"
               Foreground="{DynamicResource InkBrush}" Background="{DynamicResource CardBrush}" BorderBrush="{DynamicResource EdgeBrush}">
      <ComboBox.ItemTemplate><DataTemplate><TextBlock Text="{Binding}" TextWrapping="Wrap" MaxWidth="600"/></DataTemplate></ComboBox.ItemTemplate>
     </ComboBox>
    </StackPanel>
    <Expander Name="DialogContextExpander" Header="Earlier setup details" Foreground="{DynamicResource InkBrush}" Visibility="Collapsed" Margin="0,22,0,0">
     <TextBox Name="DialogContextDetails" IsReadOnly="True" AcceptsReturn="True" TextWrapping="Wrap" Margin="0,12,0,0"
              AutomationProperties.Name="Earlier setup details"/>
    </Expander>
   </StackPanel>
  </ScrollViewer>
  <Border Grid.Row="2" Background="{DynamicResource CardBrush}" BorderBrush="{DynamicResource EdgeBrush}" BorderThickness="0,1,0,0" Padding="20,14,28,20">
   <WrapPanel HorizontalAlignment="Right">
    <Button Name="DialogCancel" Content="Cancel" Style="{StaticResource SetupAction}" IsCancel="True"/>
    <Button Name="DialogAccept" Content="Continue" Style="{StaticResource SetupAction}" IsDefault="True"
            Background="{DynamicResource AccentBrush}" Foreground="{DynamicResource AccentInkBrush}" BorderBrush="{DynamicResource AccentBrush}"/>
   </WrapPanel>
  </Border>
 </Grid>
</Window>
'@
    $window=[Windows.Markup.XamlReader]::Parse($xaml)
    $dark=$false
    try{
        $key=[Microsoft.Win32.Registry]::CurrentUser.OpenSubKey('Software\Microsoft\Windows\CurrentVersion\Themes\Personalize',$false)
        if($null -ne $key){try{$dark=$key.GetValue('AppsUseLightTheme',1) -eq 0}finally{$key.Dispose()}}
    }catch{$dark=$false}
    $palette=if($dark){@{SurfaceBrush='#132421';CardBrush='#1B302C';InkBrush='#F0F8F5';MutedBrush='#B7CEC6';AccentBrush='#46CBB9';AccentInkBrush='#062C28';EdgeBrush='#4B7166';SubtleBrush='#263F38';FocusBrush='#8BE9D7';DangerBrush='#FFB4AB';DangerSurfaceBrush='#482727'}}
        else{@{SurfaceBrush='#F4F8F7';CardBrush='#FFFFFF';InkBrush='#142523';MutedBrush='#496D68';AccentBrush='#087D73';AccentInkBrush='#FFFFFF';EdgeBrush='#A9C8BE';SubtleBrush='#E7F2ED';FocusBrush='#004F47';DangerBrush='#9F2727';DangerSurfaceBrush='#FFF0EE'}}
    $converter=New-Object Windows.Media.BrushConverter
    foreach($entry in $palette.GetEnumerator()){$window.Resources[$entry.Key]=$converter.ConvertFromString($entry.Value)}
    if([Windows.SystemParameters]::HighContrast){
        foreach($name in @('SurfaceBrush','CardBrush','SubtleBrush')){$window.Resources[$name]=[Windows.SystemColors]::WindowBrush}
        $window.Resources['InkBrush']=[Windows.SystemColors]::WindowTextBrush
        $window.Resources['EdgeBrush']=[Windows.SystemColors]::WindowTextBrush
        $window.Resources['AccentBrush']=[Windows.SystemColors]::HighlightBrush
        $window.Resources['AccentInkBrush']=[Windows.SystemColors]::HighlightTextBrush
        $window.Resources['FocusBrush']=[Windows.SystemColors]::HighlightBrush
    }
    $window.Resources['BodyFontSize']=[double]15;$window.Resources['SmallFontSize']=[double]12
    $window.Resources['HeadingFontSize']=[double]26;$window.Resources['BrandFontSize']=[double]24
    $dialog=@{Window=$window}
    foreach($name in @('DialogHeading','DialogDescription','DialogDetails','DialogDetailsCard','DialogInputSection','DialogAnswerLabel','DialogAnswerInput','DialogAnswerChoice','DialogProgressPanel','PrerequisiteActivity','PrerequisiteStatus','DialogAccept','DialogCancel','DialogContextExpander','DialogContextDetails','DialogAlert','DialogAlertText')){$dialog[$name]=$window.FindName($name)}
    $dialog.DialogHeading.Text=$Heading;$dialog.DialogDescription.Text=$Description
    if(Get-Command Set-SetupDialogOwner -ErrorAction SilentlyContinue){Set-SetupDialogOwner $window}
    $interop=New-Object Windows.Interop.WindowInteropHelper($window)
    if($interop.Owner -ne [IntPtr]::Zero){$window.ShowInTaskbar=$false;$window.WindowStartupLocation='CenterOwner'}
    return $dialog
}

function Select-SetupManagedPolicy {
    param($Initial,$Schema,[string]$Browser='edge',[bool]$Microsoft365=$false,[switch]$PreviewOnly)
    if(-not $script:SetupGuidedUi){return $Initial}
    $dialog=New-SetupDialog -Heading 'Organization settings' -Description 'Choose the settings your organization manages. Unchecked settings remain employee choices. Capture and AI sharing are never enabled here. Existing privacy defaults are preserved until you change them.'
    $window=$dialog.Window;$dialog.DialogInputSection.Visibility='Collapsed';$dialog.DialogAccept.Content='Review these settings'
    $panel=New-Object Windows.Controls.StackPanel
    $dialog.DialogDetailsCard.Child=$panel
    $intro=New-Object Windows.Controls.TextBlock;$intro.Text='Microsoft 365 connection identifiers are filled in by setup. Save behavior and file format controls set transcript export preferences; they do not prohibit other explicit export actions. Custom locations are subfolders of browser Downloads, not arbitrary filesystem paths.';$intro.TextWrapping='Wrap';$intro.Margin='0,0,0,16';$null=$panel.Children.Add($intro)
    $groups=@{}
    foreach($name in @('Privacy and sharing','History and destinations','Transcript export and appearance')){
        $section=New-Object Windows.Controls.Expander;$section.Header=$name;$section.IsExpanded=$false;$section.Margin='0,8,0,12'
        $section.SetResourceReference([Windows.Controls.Control]::ForegroundProperty,'InkBrush')
        $content=New-Object Windows.Controls.StackPanel;$section.Content=$content;$groups[$name]=$content;$null=$panel.Children.Add($section)
    }
    $fields=@{}
    foreach($key in $Schema.properties.Keys){
        if($key -cin @('enableGraphTranscriptImport','graphTenantId','graphClientId')){continue}
        $definition=$Schema.properties[$key]
        $group=if($key -cin @('defaultSaveFormat','saveAsType','saveLocation','timestampFormat','filenamePattern','uiTheme','webmailDestination','forceUiLocale')){'Transcript export and appearance'}elseif($definition.type -ceq 'boolean'){'Privacy and sharing'}else{'History and destinations'}
        $row=New-Object Windows.Controls.StackPanel;$row.Margin='0,8,0,12'
        $manage=New-Object Windows.Controls.CheckBox;$manage.Content='Manage: '+$definition.title;$manage.IsChecked=$Initial.Contains($key);$manage.FontWeight='SemiBold';$manage.Margin='0,0,0,7';$null=$row.Children.Add($manage)
        $manage.SetResourceReference([Windows.Controls.Control]::ForegroundProperty,'InkBrush')
        if($definition.type -ceq 'boolean' -or $definition.Contains('enum')){
            $valueControl=New-Object Windows.Controls.ComboBox;$valueControl.MinHeight=44
            $choices=if($definition.type -ceq 'boolean'){@('true','false')}else{@($definition.enum)}
            foreach($choice in $choices){$null=$valueControl.Items.Add([string]$choice)}
            $valueControl.SelectedIndex=0
            if($Initial.Contains($key)){$valueControl.SelectedItem=([string]$Initial[$key]).ToLowerInvariant();if($definition.type -cne 'boolean'){$valueControl.SelectedItem=[string]$Initial[$key]}}
        }else{
            $valueControl=New-Object Windows.Controls.TextBox
            if($definition.type -ceq 'array'){$valueControl.AcceptsReturn=$true;$valueControl.MinHeight=72;$valueControl.Text=if($Initial.Contains($key)){@($Initial[$key]) -join "`n"}else{''}}
            else{$valueControl.Text=if($Initial.Contains($key)){[string]$Initial[$key]}else{''}}
        }
        $valueControl.IsEnabled=[bool]$manage.IsChecked
        $valueControl.SetResourceReference([Windows.Controls.Control]::ForegroundProperty,'InkBrush')
        [Windows.Automation.AutomationProperties]::SetName($valueControl,[string]$definition.title)
        $manage.Add_Checked(({$valueControl.IsEnabled=$true}).GetNewClosure());$manage.Add_Unchecked(({$valueControl.IsEnabled=$false}).GetNewClosure())
        $null=$row.Children.Add($valueControl)
        if($definition.type -ceq 'boolean'){$hint=New-Object Windows.Controls.TextBlock;$hint.Text='true enforces this protection; false leaves this protection to the employee.';$hint.TextWrapping='Wrap';$hint.FontSize=12;$hint.SetResourceReference([Windows.Controls.TextBlock]::ForegroundProperty,'MutedBrush');$null=$row.Children.Add($hint)}
        $null=$groups[$group].Children.Add($row);$fields[$key]=@{Manage=$manage;Input=$valueControl;Definition=$definition}
    }
    $state=@{Policy=$null}
    $dialog.DialogAccept.Add_Click(({
        try{
            $policy=@{}
            foreach($key in $fields.Keys){
                $field=$fields[$key];if(-not $field.Manage.IsChecked){continue}
                $definition=$field.Definition;$valueControl=$field.Input
                switch($definition.type){
                    'boolean' {$policy[$key]=([string]$valueControl.SelectedItem -ceq 'true')}
                    'integer' {$number=0;if(-not [int]::TryParse($valueControl.Text,[ref]$number)){throw "Enter a whole number for $($definition.title)."};$policy[$key]=$number}
                    'array' {$policy[$key]=@($valueControl.Text -split '\r?\n'|Where-Object {$_ -ne ''})}
                    'string' {$policy[$key]=if($definition.Contains('enum')){[string]$valueControl.SelectedItem}else{$valueControl.Text.Trim()}}
                }
            }
            Assert-ManagedSetupPolicy $policy $Schema;Assert-ManagedSetupEnvelope $policy $Browser $Microsoft365
            $state.Policy=$policy;$window.DialogResult=$true
        }catch{$dialog.DialogAlert.Visibility='Visible';$dialog.DialogAlertText.Text=$_.Exception.Message}
    }).GetNewClosure())
    $dialog.DialogCancel.Add_Click(({$window.DialogResult=$false}).GetNewClosure())
    # Allows the real control tree to be measured/rendered without opening a
    # window, signing in or sending deployment requests.
    if($PreviewOnly){$dialog.PolicyFields=$fields;return $dialog}
    try{if($window.ShowDialog() -ne $true){throw [OperationCanceledException]::new('Setup cancelled before Microsoft 365 changes.')};return $state.Policy}
    finally{if($window.IsVisible){$window.Close()}}
}

function Read-SetupAnswer {
    param([Parameter(Position=0)][string]$Prompt)
    if(-not $script:SetupGuidedUi){return Read-Host $Prompt}
    $approvedAnswer=$null;$acceptText='Continue';$heading='Continue Microsoft 365 setup';$description=$Prompt
    if($Prompt -like 'Type INSTALL*'){$approvedAnswer='INSTALL';$acceptText='Install Microsoft prerequisites';$heading='Install Microsoft prerequisites';$description='Review the local tools setup needs before continuing.'}
    elseif($Prompt -like 'Type APPROVE*'){
        $approvedAnswer='APPROVE';$heading='Review requested changes';$description='Check the organization and requested access below. Continue only if you are authorized to approve these changes.'
        $acceptText=if($Prompt -like '*sign-in*'){'Continue to Microsoft sign-in'}else{'Approve these changes'}
    }
    elseif($Prompt -like 'Type DEPLOY*'){$approvedAnswer='DEPLOY';$acceptText='Deploy to selected group';$heading='Deploy to your pilot group';$description='Review the selected organization, browsers and group before applying this deployment.'}
    elseif($Prompt -like 'Type SWITCH SIGNER*'){$approvedAnswer='SWITCH SIGNER';$acceptText='Use Azure Artifact Signing';$heading='Review signing provider change';$description='Review the existing Azure account, profile, permissions and paid signing effects below. Change the saved signing provider only if you approve these effects.'}
    $options=@($script:SetupDialogMessages | Where-Object{$_ -match '^\d+\. '})
    $useChoice=-not $approvedAnswer -and $options.Count -and $Prompt -match 'Choose|number'
    if($useChoice){$heading='Choose a setup option'}
    $dialog=New-SetupDialog -Heading $heading -Description $description
    $window=$dialog.Window
    $dialog.DialogDetails.Text=(@($script:SetupDialogMessages | Where-Object{-not $useChoice -or $_ -notmatch '^\d+\. '}) -join "`r`n`r`n")
    if(-not $dialog.DialogDetails.Text){$dialog.DialogDetailsCard.Visibility='Collapsed'}
    $dialog.DialogAccept.Content=$acceptText
    $dialog.DialogAnswerLabel.Text=if($useChoice){'Your selection'}else{$Prompt}
    [Windows.Automation.AutomationProperties]::SetName($dialog.DialogAnswerInput,$Prompt)
    [Windows.Automation.AutomationProperties]::SetName($dialog.DialogAnswerChoice,$Prompt)
    if($approvedAnswer){$dialog.DialogInputSection.Visibility='Collapsed'}
    elseif($useChoice){
        $dialog.DialogAnswerInput.Visibility='Collapsed';$dialog.DialogAnswerChoice.Visibility='Visible'
        foreach($option in $options){$null=$dialog.DialogAnswerChoice.Items.Add($option)}
        if($Prompt -like 'Certificate number*'){$null=$dialog.DialogAnswerChoice.Items.Add('UNSIGNED - unsigned pilot only (requires explicit approval)')}
        $dialog.DialogAnswerChoice.SelectedIndex=0
    }
    $dialog.DialogAccept.Add_Click(({$window.DialogResult=$true}).GetNewClosure())
    $dialog.DialogCancel.Add_Click(({$window.DialogResult=$false}).GetNewClosure())
    $window.Add_ContentRendered(({
        if($approvedAnswer){$null=$dialog.DialogAccept.Focus()}
        elseif($useChoice){$null=$dialog.DialogAnswerChoice.Focus()}
        else{$null=$dialog.DialogAnswerInput.Focus()}
    }).GetNewClosure())
    try{
        if($window.ShowDialog() -ne $true){throw [OperationCanceledException]::new('Setup cancelled by the administrator.')}
        if($approvedAnswer){return $approvedAnswer}
        if($useChoice){if([string]$dialog.DialogAnswerChoice.SelectedItem -like 'UNSIGNED*'){return 'UNSIGNED'};return ([string]$dialog.DialogAnswerChoice.SelectedItem -split '\. ',2)[0]}
        return $dialog.DialogAnswerInput.Text
    }finally{if($window.IsVisible){$window.Close()};$script:SetupDialogMessages.Clear()}
}

function Invoke-SetupPrerequisiteWork {
    param([string]$Title,[string]$Detail,[scriptblock]$Work,[object[]]$Arguments=@())
    $dialog=New-SetupDialog -Heading $Title -Description 'Setup is preparing the local Microsoft tools. Downloads can take several minutes.'
    $window=$dialog.Window;$window.Name='BckPrerequisiteProgress'
    $dialog.DialogDetails.Text='Only local prerequisites are installed here. Cancelling waits for the current module to finish; modules already installed remain on this PC.'
    $dialog.DialogInputSection.Visibility='Collapsed';$dialog.DialogProgressPanel.Visibility='Visible'
    $dialog.PrerequisiteStatus.Text=$Detail;$dialog.DialogAccept.Visibility='Collapsed'
    $dialog.DialogCancel.Content='Cancel after current module';$dialog.DialogCancel.IsCancel=$false
    $state=[hashtable]::Synchronized(@{CancelRequested=$false;Status=$Detail;AsyncResult=$null;Finished=$false})
    $worker=[PowerShell]::Create()
    $null=$worker.AddScript($Work.ToString()).AddArgument($state).AddArgument($Arguments)
    $requestCancel={
        $state.CancelRequested=$true;$dialog.DialogCancel.IsEnabled=$false
        $dialog.PrerequisiteStatus.Text='Cancelling after the current module finishes. Installed prerequisites remain; Microsoft 365 setup will not continue.'
    }.GetNewClosure()
    $dialog.DialogCancel.Add_Click($requestCancel)
    $window.Add_PreviewKeyDown(({param($sender,$eventArgs);if($eventArgs.Key -eq [Windows.Input.Key]::Escape){$eventArgs.Handled=$true;& $requestCancel}}).GetNewClosure())
    $window.Add_Closing(({param($sender,$eventArgs);if(-not $state.Finished){$eventArgs.Cancel=$true;& $requestCancel}}).GetNewClosure())
    $timer=New-Object Windows.Threading.DispatcherTimer
    $timer.Interval=[TimeSpan]::FromMilliseconds(100)
    $timer.Add_Tick(({
        if(-not $state.CancelRequested){$dialog.PrerequisiteStatus.Text=[string]$state.Status}
        if($null -ne $state.AsyncResult -and $state.AsyncResult.IsCompleted){$state.Finished=$true;$timer.Stop();$window.DialogResult=$true}
    }).GetNewClosure())
    $window.Add_ContentRendered(({$state.AsyncResult=$worker.BeginInvoke();$timer.Start()}).GetNewClosure())
    try{
        $null=$window.ShowDialog()
        try{$workResult=$worker.EndInvoke($state.AsyncResult)}
        catch{
            if($state.CancelRequested){throw [OperationCanceledException]::new('Setup cancelled before Microsoft 365 changes. Some prerequisites may already be installed; they were not removed.')}
            throw [InvalidOperationException]::new('Microsoft prerequisites could not be installed. Some modules may already be installed. No Microsoft 365 changes were started. Check network access to PowerShell Gallery and try setup again.')
        }
        if($state.CancelRequested){throw [OperationCanceledException]::new('Setup cancelled before Microsoft 365 changes. Some prerequisites may already be installed; they were not removed.')}
        if($worker.HadErrors){throw [InvalidOperationException]::new('Microsoft prerequisites could not be installed. Some modules may already be installed. No Microsoft 365 changes were started. Check network access to PowerShell Gallery and try setup again.')}
        return $workResult
    }finally{$timer.Stop();if($window.IsVisible){$window.Close()};$worker.Dispose()}
}

function Install-SetupModulesWithProgress {
    param([Parameter(Mandatory=$true)][string[]]$ModuleNames)
    if(-not $ModuleNames.Count -or @($ModuleNames | Where-Object{$_ -notmatch '^[A-Za-z0-9][A-Za-z0-9._-]*$'}).Count){throw 'The approved prerequisite module list is invalid.'}
    $work={
        param($ProgressState,$Names)
        $ErrorActionPreference='Stop'
        foreach($name in $Names){
            if($ProgressState.CancelRequested){return}
            $ProgressState.Status='Installing '+$name+' from Microsoft PowerShell Gallery...'
            Install-Module -Name $name -Repository PSGallery -Scope CurrentUser -Force -Confirm:$false -ErrorAction Stop
        }
    }
    Invoke-SetupPrerequisiteWork -Title 'Installing Microsoft prerequisites' -Detail ('Preparing '+($ModuleNames -join ', ')) -Work $work -Arguments $ModuleNames | Out-Null
}

function Show-SetupOutcome {
    param([string]$Message,[switch]$Failure)
    if(-not $script:SetupGuidedUi){Write-SetupMessage $Message;return}
    $heading=if($Failure){'Setup needs attention'}else{'Setup result'}
    $description=$Message
    $authenticationIncomplete=$Failure -and $Message -match '(?i)authenticat|sign.in|WAM' -and $Message -match '(?i)cancel(?:l)?ed|timed?\s*out|timeout'
    if($authenticationIncomplete){
        $heading='Microsoft sign-in was not completed'
        $description='Microsoft sign-in closed or timed out before setup could continue. The Microsoft window may have been hidden or left waiting. Return to the setup window. If no deployment receipt was created, choose Set up Microsoft 365 to start a fresh sign-in attempt.'
        $guidance=@($Message -split '\r?\n' | Where-Object{$_ -match '^(No deployment receipt|Preserve your receipt|Use Continue saved setup|Close this result)'}) -join "`r`n"
        if($guidance){$description+="`r`n`r`n"+$guidance}
        else{$description+="`r`n`r`nIf a deployment receipt exists, use Continue saved setup with that receipt before starting another copy."}
    }
    $dialog=New-SetupDialog -Heading $heading -Description $description
    $window=$dialog.Window
    $dialog.DialogDetailsCard.Visibility='Collapsed';$dialog.DialogInputSection.Visibility='Collapsed'
    $dialog.DialogCancel.Visibility='Collapsed'
    $returnToOwner=$Failure -and (New-Object Windows.Interop.WindowInteropHelper($window)).Owner -ne [IntPtr]::Zero
    $dialog.DialogAccept.Content=if($returnToOwner){'Return to setup'}else{'Close'}
    if($Failure){$dialog.DialogAlert.Visibility='Visible';$dialog.DialogAlertText.Text='Setup stopped - review the result below'}
    if($authenticationIncomplete){
        $dialog.DialogAlertText.Text='Microsoft sign-in did not finish'
        $dialog.DialogContextExpander.Visibility='Visible';$dialog.DialogContextExpander.Header='Technical details'
        $dialog.DialogContextDetails.Text=(@($Message)+@($script:SetupDialogMessages)) -join "`r`n`r`n"
    }
    elseif($script:SetupDialogMessages.Count){$dialog.DialogContextExpander.Visibility='Visible';$dialog.DialogContextDetails.Text=$script:SetupDialogMessages -join "`r`n`r`n"}
    $dialog.DialogAccept.Add_Click(({$window.DialogResult=$true}).GetNewClosure())
    $window.Add_ContentRendered(({$null=$dialog.DialogHeading.Focus()}).GetNewClosure())
    try{
        $null=$window.ShowDialog()
        if($returnToOwner -and (Get-Command Show-SetupOwnerWindow -ErrorAction SilentlyContinue)){$null=Show-SetupOwnerWindow}
    }
    finally{if($window.IsVisible){$window.Close()};$script:SetupDialogMessages.Clear()}
}

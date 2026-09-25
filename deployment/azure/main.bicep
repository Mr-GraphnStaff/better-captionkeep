targetScope = 'subscription'

@description('Azure region for the private release environment.')
param location string = 'centralus'

@description('Resource group containing the private release environment.')
param resourceGroupName string = 'rg-bck-release-cus'

@description('Microsoft Entra object ID for the human recovery administrator.')
param administratorObjectId string

@description('SSH public key used only as a fallback if Entra SSH is unavailable.')
param administratorSshPublicKey string

@description('Local administrator name for the Linux release VM.')
param administratorUsername string = 'bckadmin'

module environment 'environment.bicep' = {
  name: 'better-captionkeep-private-release'
  scope: resourceGroup(resourceGroupName)
  params: {
    location: location
    administratorObjectId: administratorObjectId
    administratorSshPublicKey: administratorSshPublicKey
    administratorUsername: administratorUsername
  }
  dependsOn: [
    releaseResourceGroup
  ]
}

resource releaseResourceGroup 'Microsoft.Resources/resourceGroups@2024-03-01' = {
  name: resourceGroupName
  location: location
  tags: {
    application: 'Better CaptionKeep'
    purpose: 'Private release runner and secret storage'
    managedBy: 'Bicep'
  }
}

output resourceGroupName string = releaseResourceGroup.name
output keyVaultName string = environment.outputs.keyVaultName
output releaseVmName string = environment.outputs.releaseVmName
output virtualNetworkName string = environment.outputs.virtualNetworkName

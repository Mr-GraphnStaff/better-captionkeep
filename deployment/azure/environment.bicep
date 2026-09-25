param location string
param administratorObjectId string
param administratorSshPublicKey string
param administratorUsername string

var applicationTag = 'Better CaptionKeep'
var virtualNetworkName = 'vnet-bck-release-cus'
var releaseVmName = 'vm-bck-release-cus'
var keyVaultName = 'bck-release-kv-daftech'
var privateDnsZoneName = 'privatelink.vaultcore.azure.net'

resource virtualNetwork 'Microsoft.Network/virtualNetworks@2024-05-01' = {
  name: virtualNetworkName
  location: location
  tags: {
    application: applicationTag
    purpose: 'Private release network'
  }
  properties: {
    addressSpace: {
      addressPrefixes: [
        '10.41.0.0/16'
      ]
    }
    subnets: [
      {
        name: 'snet-release-agent'
        properties: {
          addressPrefix: '10.41.1.0/24'
          defaultOutboundAccess: true
        }
      }
      {
        name: 'snet-private-endpoints'
        properties: {
          addressPrefix: '10.41.2.0/24'
          privateEndpointNetworkPolicies: 'Disabled'
          defaultOutboundAccess: false
        }
      }
    ]
  }
}

resource agentSubnet 'Microsoft.Network/virtualNetworks/subnets@2024-05-01' existing = {
  name: 'snet-release-agent'
  parent: virtualNetwork
}

resource privateEndpointSubnet 'Microsoft.Network/virtualNetworks/subnets@2024-05-01' existing = {
  name: 'snet-private-endpoints'
  parent: virtualNetwork
}

resource privateDnsZone 'Microsoft.Network/privateDnsZones@2024-06-01' = {
  name: privateDnsZoneName
  location: 'global'
  tags: {
    application: applicationTag
  }
}

resource privateDnsLink 'Microsoft.Network/privateDnsZones/virtualNetworkLinks@2024-06-01' = {
  name: 'link-bck-release-vnet'
  parent: privateDnsZone
  location: 'global'
  properties: {
    registrationEnabled: false
    virtualNetwork: {
      id: virtualNetwork.id
    }
  }
}

resource keyVault 'Microsoft.KeyVault/vaults@2024-11-01' = {
  name: keyVaultName
  location: location
  tags: {
    application: applicationTag
    purpose: 'Browser Store publication credentials'
  }
  properties: {
    tenantId: tenant().tenantId
    sku: {
      family: 'A'
      name: 'standard'
    }
    enableRbacAuthorization: true
    enablePurgeProtection: true
    enableSoftDelete: true
    softDeleteRetentionInDays: 90
    publicNetworkAccess: 'Disabled'
    networkAcls: {
      bypass: 'None'
      defaultAction: 'Deny'
    }
  }
}

resource keyVaultPrivateEndpoint 'Microsoft.Network/privateEndpoints@2024-05-01' = {
  name: 'pep-bck-release-kv'
  location: location
  tags: {
    application: applicationTag
  }
  properties: {
    subnet: {
      id: privateEndpointSubnet.id
    }
    privateLinkServiceConnections: [
      {
        name: 'bck-release-kv-connection'
        properties: {
          privateLinkServiceId: keyVault.id
          groupIds: [
            'vault'
          ]
        }
      }
    ]
  }
}

resource privateDnsZoneGroup 'Microsoft.Network/privateEndpoints/privateDnsZoneGroups@2024-05-01' = {
  name: 'default'
  parent: keyVaultPrivateEndpoint
  properties: {
    privateDnsZoneConfigs: [
      {
        name: 'key-vault-private-dns'
        properties: {
          privateDnsZoneId: privateDnsZone.id
        }
      }
    ]
  }
}

resource releaseVmNic 'Microsoft.Network/networkInterfaces@2024-05-01' = {
  name: 'nic-bck-release-cus'
  location: location
  tags: {
    application: applicationTag
  }
  properties: {
    ipConfigurations: [
      {
        name: 'ipconfig1'
        properties: {
          privateIPAllocationMethod: 'Dynamic'
          subnet: {
            id: agentSubnet.id
          }
        }
      }
    ]
  }
}

resource releaseVm 'Microsoft.Compute/virtualMachines@2024-07-01' = {
  name: releaseVmName
  location: location
  tags: {
    application: applicationTag
    purpose: 'Private Azure Pipelines release agent'
  }
  identity: {
    type: 'SystemAssigned'
  }
  properties: {
    hardwareProfile: {
      vmSize: 'Standard_B1s'
    }
    osProfile: {
      computerName: 'bck-release'
      adminUsername: administratorUsername
      linuxConfiguration: {
        disablePasswordAuthentication: true
        provisionVMAgent: true
        patchSettings: {
          assessmentMode: 'AutomaticByPlatform'
          patchMode: 'AutomaticByPlatform'
        }
        ssh: {
          publicKeys: [
            {
              path: '/home/${administratorUsername}/.ssh/authorized_keys'
              keyData: administratorSshPublicKey
            }
          ]
        }
      }
    }
    storageProfile: {
      imageReference: {
        publisher: 'Canonical'
        offer: 'ubuntu-24_04-lts'
        sku: 'server'
        version: 'latest'
      }
      osDisk: {
        name: 'osdisk-bck-release-cus'
        createOption: 'FromImage'
        caching: 'ReadWrite'
        managedDisk: {
          storageAccountType: 'Standard_LRS'
        }
        diskSizeGB: 30
        deleteOption: 'Delete'
      }
    }
    networkProfile: {
      networkInterfaces: [
        {
          id: releaseVmNic.id
          properties: {
            deleteOption: 'Delete'
          }
        }
      ]
    }
    diagnosticsProfile: {
      bootDiagnostics: {
        enabled: true
      }
    }
  }
}

resource keyVaultAdministratorRole 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(keyVault.id, administratorObjectId, 'Key Vault Administrator')
  scope: keyVault
  properties: {
    principalId: administratorObjectId
    principalType: 'User'
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', '00482a5a-887f-4fb3-b363-3b7fe8e74483')
  }
}

resource releaseVmKeyVaultSecretsRole 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(keyVault.id, releaseVm.id, 'Key Vault Secrets User')
  scope: keyVault
  properties: {
    principalId: releaseVm.identity.principalId
    principalType: 'ServicePrincipal'
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', '4633458b-17de-408a-b874-0445c86b69e6')
  }
}

output keyVaultName string = keyVault.name
output releaseVmName string = releaseVm.name
output releaseVmPrincipalId string = releaseVm.identity.principalId
output virtualNetworkName string = virtualNetwork.name

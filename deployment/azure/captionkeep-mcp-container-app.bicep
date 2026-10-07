targetScope = 'resourceGroup'

@description('Name of the customer-owned Azure Container App.')
param name string = 'captionkeep-mcp'

@description('Azure region for the Container App resource.')
param location string = resourceGroup().location

@description('Resource ID of an existing customer-owned Container Apps managed environment.')
param managedEnvironmentId string

@description('Customer-owned container image containing Better CaptionKeep MCP.')
param image string

@description('Public HTTPS origin already routed to this Container App, without a trailing path.')
param publicOrigin string

@description('Expected Host header hostname, normally the hostname from publicOrigin.')
param allowedHostname string

@description('Existing Container Apps environment storage name containing approved evidence.')
param evidenceStorageName string

@description('Exact OIDC issuer for the customer tenant.')
param issuer string

@description('Exact MCP API audience.')
param audience string

@description('Exact customer tenant GUID.')
param tenantId string

@description('HTTPS JWKS endpoint for the configured issuer.')
param jwksUri string

@description('Comma-separated client GUID allowlist.')
param allowedClientIds string

@description('Space- or comma-separated required delegated scopes or application roles.')
param requiredScopes string = 'CaptionKeep.Evidence.Read'

@minValue(1)
@maxValue(10)
param maxReplicas int = 3

resource app 'Microsoft.App/containerApps@2024-03-01' = {
  name: name
  location: location
  tags: {
    component: 'captionkeep-mcp'
    dataBoundary: 'customer-owned'
  }
  properties: {
    managedEnvironmentId: managedEnvironmentId
    configuration: {
      activeRevisionsMode: 'Single'
      ingress: {
        external: true
        targetPort: 3333
        transport: 'http'
        allowInsecure: false
      }
    }
    template: {
      containers: [
        {
          name: 'captionkeep-mcp'
          image: image
          env: [
            { name: 'CAPTIONKEEP_EVIDENCE_DIR', value: '/evidence' }
            { name: 'CAPTIONKEEP_MCP_HOST', value: '0.0.0.0' }
            { name: 'CAPTIONKEEP_MCP_PORT', value: '3333' }
            { name: 'CAPTIONKEEP_MCP_PATH', value: '/mcp' }
            { name: 'CAPTIONKEEP_MCP_PUBLIC_ORIGIN', value: publicOrigin }
            { name: 'CAPTIONKEEP_MCP_ALLOWED_HOSTS', value: allowedHostname }
            { name: 'CAPTIONKEEP_MCP_ALLOWED_ORIGINS', value: allowedHostname }
            { name: 'CAPTIONKEEP_MCP_ISSUER', value: issuer }
            { name: 'CAPTIONKEEP_MCP_AUDIENCE', value: audience }
            { name: 'CAPTIONKEEP_MCP_TENANT_ID', value: tenantId }
            { name: 'CAPTIONKEEP_MCP_JWKS_URI', value: jwksUri }
            { name: 'CAPTIONKEEP_MCP_ALLOWED_CLIENT_IDS', value: allowedClientIds }
            { name: 'CAPTIONKEEP_MCP_REQUIRED_SCOPES', value: requiredScopes }
          ]
          resources: {
            cpu: json('0.5')
            memory: '1Gi'
          }
          volumeMounts: [
            {
              volumeName: 'approved-evidence'
              mountPath: '/evidence'
            }
          ]
        }
      ]
      scale: {
        minReplicas: 1
        maxReplicas: maxReplicas
        rules: [
          {
            name: 'http-concurrency'
            http: {
              metadata: {
                concurrentRequests: '25'
              }
            }
          }
        ]
      }
      volumes: [
        {
          name: 'approved-evidence'
          storageType: 'AzureFile'
          storageName: evidenceStorageName
        }
      ]
    }
  }
}

output containerAppId string = app.id
output defaultFqdn string = app.properties.configuration.ingress.fqdn
output mcpEndpoint string = '${publicOrigin}/mcp'

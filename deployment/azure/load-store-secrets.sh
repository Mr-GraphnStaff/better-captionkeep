#!/usr/bin/env bash
set -euo pipefail

store="${1:-all}"
vault_name="${BCK_VAULT_NAME:-bck-release-kv-daftech}"

case "$store" in
  chrome)
    mappings=(
      'CHROME_CLIENT_ID:chrome-client-id'
      'CHROME_CLIENT_SECRET:chrome-client-secret'
      'CHROME_REFRESH_TOKEN:chrome-refresh-token'
    )
    ;;
  edge)
    mappings=(
      'EDGE_CLIENT_ID:edge-client-id'
      'EDGE_API_KEY:edge-api-key'
    )
    ;;
  all)
    mappings=(
      'CHROME_CLIENT_ID:chrome-client-id'
      'CHROME_CLIENT_SECRET:chrome-client-secret'
      'CHROME_REFRESH_TOKEN:chrome-refresh-token'
      'EDGE_CLIENT_ID:edge-client-id'
      'EDGE_API_KEY:edge-api-key'
    )
    ;;
  *)
    echo 'Store must be chrome, edge, or all.' >&2
    exit 2
    ;;
esac

az login --identity --allow-no-subscriptions --output none
for mapping in "${mappings[@]}"; do
  variable_name="${mapping%%:*}"
  secret_name="${mapping#*:}"
  secret_value="$(az keyvault secret show \
    --vault-name "$vault_name" \
    --name "$secret_name" \
    --query value \
    --output tsv)"
  if [[ -z "$secret_value" ]]; then
    echo "Key Vault secret $secret_name is empty." >&2
    exit 1
  fi
  secret_value="${secret_value//'%'/'%AZP25'}"
  secret_value="${secret_value//$'\n'/'%0A'}"
  secret_value="${secret_value//$'\r'/'%0D'}"
  printf '##vso[task.setvariable variable=%s;issecret=true]%s\n' \
    "$variable_name" "$secret_value"
  unset secret_value
done
echo "Loaded $store Store credentials from private Key Vault."

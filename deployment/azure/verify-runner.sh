#!/usr/bin/env bash
set -euo pipefail

printf 'VAULT_DNS='
getent ahostsv4 bck-release-kv-daftech.vault.azure.net | awk 'NR == 1 { print $1 }'

printf 'VAULT_HTTPS='
curl --silent --show-error --output /dev/null --write-out '%{http_code}\n' \
  'https://bck-release-kv-daftech.vault.azure.net/secrets?api-version=7.4'

printf 'AZURE_DEVOPS_HTTPS='
curl --silent --show-error --output /dev/null --write-out '%{http_code}\n' \
  'https://dev.azure.com/daf-tech/'

printf 'CHROME_API_HTTPS='
curl --silent --show-error --output /dev/null --write-out '%{http_code}\n' \
  'https://chromewebstore.googleapis.com/'

printf 'EDGE_API_HTTPS='
curl --silent --show-error --output /dev/null --write-out '%{http_code}\n' \
  'https://api.addons.microsoftedge.microsoft.com/'

printf 'METADATA_IDENTITY='
curl --silent --show-error --output /dev/null --write-out '%{http_code}\n' \
  --header 'Metadata:true' \
  'http://169.254.169.254/metadata/identity/oauth2/token?api-version=2018-02-01&resource=https%3A%2F%2Fvault.azure.net'

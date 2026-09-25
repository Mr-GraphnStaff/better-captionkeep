#!/usr/bin/env bash
set -euo pipefail

resource_group='rg-bck-release-cus'
vm_name='vm-bck-release-cus'
vault_name='bck-release-kv-daftech'
keep_running=false
force_deallocate=false
mode='command'

usage() {
  cat <<'EOF'
Usage:
  bck-azure-admin --status
  bck-azure-admin --verify [--keep-running]
  bck-azure-admin [--keep-running] -- <remote shell command>
  bck-azure-admin --deallocate

The VM is deallocated automatically only when this helper started it.
EOF
}

while (($#)); do
  case "$1" in
    --status)
      mode='status'
      shift
      ;;
    --verify)
      mode='verify'
      shift
      ;;
    --keep-running)
      keep_running=true
      shift
      ;;
    --deallocate)
      force_deallocate=true
      shift
      ;;
    --)
      shift
      break
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      break
      ;;
  esac
done

power_state() {
  az vm get-instance-view \
    --resource-group "$resource_group" \
    --name "$vm_name" \
    --query "instanceView.statuses[?starts_with(code, 'PowerState/')].displayStatus | [0]" \
    --output tsv \
    | tr -d '\r'
}

if $force_deallocate; then
  printf 'Deallocating %s...\n' "$vm_name"
  az vm deallocate --resource-group "$resource_group" --name "$vm_name" --output none
  printf 'POWER_STATE=%s\n' "$(power_state)"
  exit 0
fi

if [[ "$mode" == 'status' ]]; then
  printf 'POWER_STATE=%s\n' "$(power_state)"
  exit 0
fi

remote_script=''
if [[ "$mode" == 'verify' ]]; then
  read -r -d '' remote_script <<EOF || true
set -euo pipefail
vault_name='$vault_name'
vault_host="\${vault_name}.vault.azure.net"
vault_ip="\$(getent ahostsv4 "\$vault_host" | awk 'NR == 1 { print \$1 }')"
token="\$(curl --fail --silent --show-error \
  --header 'Metadata:true' \
  'http://169.254.169.254/metadata/identity/oauth2/token?api-version=2018-02-01&resource=https%3A%2F%2Fvault.azure.net' \
  | jq --raw-output '.access_token')"
vault_status="\$(curl --silent --show-error --output /dev/null --write-out '%{http_code}' \
  --header "Authorization: Bearer \$token" \
  "https://\$vault_host/secrets?api-version=7.4")"
printf 'HOST=%s\n' "\$(hostname)"
printf 'VAULT_DNS=%s\n' "\$vault_ip"
printf 'VAULT_API=%s\n' "\$vault_status"
printf 'PIPELINE_AGENT=%s\n' "\$(systemctl is-active 'vsts.agent.*' 2>/dev/null || true)"
EOF
else
  if (($# == 0)); then
    usage >&2
    exit 2
  fi
  remote_script="$*"
fi

initial_state="$(power_state)"
started_here=false
if [[ "$initial_state" != 'VM running' ]]; then
  printf 'Starting %s...\n' "$vm_name"
  az vm start --resource-group "$resource_group" --name "$vm_name" --output none
  started_here=true
fi

cleanup() {
  if $started_here && ! $keep_running; then
    printf 'Deallocating %s...\n' "$vm_name"
    az vm deallocate --resource-group "$resource_group" --name "$vm_name" --output none
  fi
}
trap cleanup EXIT

encoded_script="$(printf '%s' "$remote_script" | base64 --wrap=0)"
run_command="printf '%s' '$encoded_script' | base64 --decode | bash"

az vm run-command invoke \
  --resource-group "$resource_group" \
  --name "$vm_name" \
  --command-id RunShellScript \
  --scripts "$run_command" \
  --query 'value[0].message' \
  --output tsv

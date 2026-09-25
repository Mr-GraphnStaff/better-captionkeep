#!/usr/bin/env bash
set -euo pipefail

export DEBIAN_FRONTEND=noninteractive
apt-get update
apt-get install --yes ca-certificates curl git gnupg jq lsb-release unzip zip

if ! command -v node >/dev/null 2>&1 || [ "$(node --version | cut -d. -f1 | tr -d v)" -lt 20 ]; then
  curl --fail --silent --show-error --location https://deb.nodesource.com/setup_22.x | bash -
  apt-get install --yes nodejs
fi

if ! command -v az >/dev/null 2>&1; then
  curl --fail --silent --show-error --location https://aka.ms/InstallAzureCLIDeb | bash
fi

if ! id azdo >/dev/null 2>&1; then
  useradd --create-home --shell /bin/bash azdo
fi

agent_root=/opt/azdo-agent
agent_package_url='https://download.agent.dev.azure.com/agent/5.279.0/vsts-agent-linux-x64-5.279.0.tar.gz'
mkdir --parents "$agent_root"

if [ ! -f "$agent_root/config.sh" ]; then
  curl --fail --silent --show-error --location "$agent_package_url" --output /tmp/azdo-agent.tar.gz
  tar --extract --gzip --file /tmp/azdo-agent.tar.gz --directory "$agent_root"
  rm --force /tmp/azdo-agent.tar.gz
fi

chown --recursive azdo:azdo "$agent_root"

identity_token="$(
  curl --fail --silent --show-error \
    --header Metadata:true \
    'http://169.254.169.254/metadata/identity/oauth2/token?api-version=2018-02-01&resource=https%3A%2F%2Fvault.azure.net' \
    | jq --raw-output .access_token
)"

for attempt in {1..12}; do
  registration_pat="$(
    curl --fail --silent --show-error \
      --header "Authorization: Bearer $identity_token" \
      'https://bck-release-kv-daftech.vault.azure.net/secrets/agent-registration?api-version=7.4' \
      | jq --raw-output .value
  )" && break
  sleep 10
done

if [ -z "${registration_pat:-}" ] || [ "$registration_pat" = null ]; then
  echo 'The one-time Azure Pipelines registration token could not be retrieved.' >&2
  exit 1
fi

if [ ! -f "$agent_root/.agent" ]; then
  runuser --user azdo -- \
    "$agent_root/config.sh" \
      --unattended \
      --acceptTeeEula \
      --url 'https://dev.azure.com/daf-tech' \
      --auth pat \
      --token "$registration_pat" \
      --pool 'Better CaptionKeep Private' \
      --agent 'vm-bck-release-cus' \
      --work '_work' \
      --replace
fi

registration_pat=''
identity_token=''
unset registration_pat identity_token

cd "$agent_root"
if ! systemctl list-unit-files | grep --quiet '^vsts\.agent\.'; then
  ./svc.sh install azdo
fi
./svc.sh start

node --version
npm --version
az version --query '"azure-cli"' --output tsv
./svc.sh status

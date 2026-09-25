#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
source_script="$script_dir/bck-azure-admin.sh"
install_dir="$HOME/.local/bin"
install_path="$install_dir/bck-azure-admin"

mkdir -p "$install_dir"
ln -sfn "$source_script" "$install_path"
chmod +x "$source_script"

case ":$PATH:" in
  *":$install_dir:"*) ;;
  *)
    printf 'Add this line to your WSL shell profile:\n'
    printf 'export PATH="$HOME/.local/bin:$PATH"\n'
    ;;
esac

printf 'Installed %s -> %s\n' "$install_path" "$source_script"

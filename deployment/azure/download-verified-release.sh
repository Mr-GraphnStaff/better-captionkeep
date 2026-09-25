#!/usr/bin/env bash
set -euo pipefail

release_tag="${1:-}"
output_root="${2:-}"
require_store_metadata="${3:-false}"
repository='Mr-GraphnStaff/better-captionkeep'

if [[ ! "$release_tag" =~ ^v[0-9]+\.[0-9]+\.[0-9]+(\.[0-9]+)?$ ]]; then
  echo 'Release tag must be v<manifest version>.' >&2
  exit 2
fi
if [[ -z "$output_root" ]]; then
  echo 'An output directory is required.' >&2
  exit 2
fi

version="${release_tag#v}"
rm -rf -- "$output_root"
mkdir -p "$output_root/store"

release_json="$(curl --fail --silent --show-error \
  "https://api.github.com/repos/$repository/releases/tags/$release_tag")"
if [[ "$(jq -r '.draft' <<<"$release_json")" != 'false' ]] || \
   [[ "$(jq -r '.prerelease' <<<"$release_json")" != 'false' ]]; then
  echo "Release $release_tag must be published and non-prerelease." >&2
  exit 1
fi

source_url="https://github.com/$repository.git"
temporary_source="$(mktemp -d)"
trap 'rm -rf -- "$temporary_source"' EXIT
git clone --quiet --depth 1 --branch "$release_tag" "$source_url" "$temporary_source/repository"

node "$temporary_source/repository/scripts/check-release-ref.mjs" "$release_tag"
if [[ -f "$temporary_source/repository/scripts/check-store-metadata.mjs" ]]; then
  (
    cd "$temporary_source/repository"
    node scripts/check-store-metadata.mjs
  )
elif [[ "$require_store_metadata" == 'true' ]]; then
  echo "Release $release_tag predates the required Store disclosure contract and cannot be uploaded to Chrome." >&2
  exit 1
fi

for filename in \
  "better_captionkeep-$version.zip" \
  "better_captionkeep-chrome-$version.zip" \
  'release-provenance.json' \
  'SHA256SUMS.txt'; do
  curl --fail --silent --show-error --location \
    "https://github.com/$repository/releases/download/$release_tag/$filename" \
    --output "$output_root/store/$filename"
done

(
  cd "$output_root/store"
  sha256sum --check SHA256SUMS.txt
)
node "$temporary_source/repository/scripts/verify-release-assets.mjs" \
  "$output_root/store" "$release_tag"

provenance_commit="$(jq -r '.commit' "$output_root/store/release-provenance.json")"
tag_commit="$(git -C "$temporary_source/repository" rev-parse HEAD)"
if [[ "$provenance_commit" != "$tag_commit" ]]; then
  echo "Release provenance commit $provenance_commit does not match tag commit $tag_commit." >&2
  exit 1
fi

printf '%s\n' "$release_tag" > "$output_root/RELEASE_TAG"
printf '%s\n' "$tag_commit" > "$output_root/RELEASE_COMMIT"
printf 'Verified %s at %s\n' "$release_tag" "$tag_commit"

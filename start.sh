#!/usr/bin/env bash
set -Eeuo pipefail

# Resolve the repository even when invoked from another working directory.
cd -- "$(dirname -- "${BASH_SOURCE[0]}")"

trap 'printf "\nAccessDeck setup failed. Fix the error above and rerun ./start.sh.\n" >&2' ERR

for tool in node npm; do
  if ! command -v "$tool" >/dev/null 2>&1; then
    printf 'Missing prerequisite: %s. See README.md for installation instructions.\n' "$tool" >&2
    exit 1
  fi
done

if ! node -e 'const [major, minor] = process.versions.node.split(".").map(Number); process.exit(major >= 24 || (major === 22 && minor >= 13) ? 0 : 1)'; then
  printf 'Missing prerequisite: Node.js 24+ or 22.13+ on the 22.x line (24 LTS recommended). See README.md.\n' >&2
  exit 1
fi

node scripts/preflight.mjs

printf '\nInstalling locked project dependencies...\n'
npm ci --include=dev --no-audit --no-fund

printf '\nBuilding the React frontend and Express API...\n'
npm run build

printf '\nPreparing the database and starting AccessDeck...\n'
exec node scripts/start.mjs

#!/usr/bin/env bash
set -Eeuo pipefail

# Task 3: run on your laptop, after setup-ec2.sh has prepared the server.
usage() {
  printf 'Usage: ./deploy/deploy.sh -h PUBLIC_IP_OR_DNS -i /path/to/key.pem [-u ubuntu]\n'
}

die() { printf 'Cannot deploy AccessDeck: %s\n' "$1" >&2; exit 1; }

host=
identity=
ssh_user=ubuntu
if [[ ${1:-} == --help ]]; then usage; exit 0; fi
while getopts ':h:i:u:' option; do
  case "$option" in
    h) host=$OPTARG ;;
    i) identity=$OPTARG ;;
    u) ssh_user=$OPTARG ;;
    :) usage >&2; die "-$OPTARG needs a value." ;;
    \?) usage >&2; die "Unknown option: -$OPTARG" ;;
  esac
done
shift $((OPTIND - 1))
[[ $# -eq 0 && -n $host && -n $identity ]] || { usage >&2; exit 1; }
[[ $host =~ ^[[:alnum:]][[:alnum:].-]*$ ]] || die 'Use a public IPv4 address or DNS name without http:// or a port.'
[[ $ssh_user =~ ^[a-z_][a-z0-9_-]*$ ]] || die 'Invalid SSH login user.'
[[ -f $identity && -r $identity ]] || die 'The SSH key file does not exist or is not readable.'
[[ $EUID -ne 0 ]] || die 'Run this script locally as your normal user, without sudo.'

for tool in node npm ssh rsync curl realpath; do
  command -v "$tool" >/dev/null 2>&1 || die "Missing local tool: $tool. See README.md."
done
node -e 'const [major, minor] = process.versions.node.split(".").map(Number); process.exit(process.platform === "linux" && (major >= 24 || (major === 22 && minor >= 13)) ? 0 : 1)' \
  || die 'Use Linux Node.js 24+ or 22.13+ on the 22.x line. In WSL, load nvm and run nvm use 24.'
npm --version >/dev/null || die 'Use Linux npm in Ubuntu/WSL. Load nvm and run nvm use 24.'

root=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)
cd "$root"
identity=$(realpath -- "$identity")
target=$ssh_user@$host
ssh_options=(-i "$identity" -o IdentitiesOnly=yes -o BatchMode=yes -o ConnectTimeout=10)
local_tmp=
remote_stage=
phase='local checks'

cleanup() {
  local status=$?
  if [[ -n $remote_stage ]]; then
    # remote_stage is validated below before it is ever used in a shell command.
    # shellcheck disable=SC2029
    ssh "${ssh_options[@]}" "$target" "rm -rf -- '$remote_stage'" </dev/null || true
  fi
  if [[ -n $local_tmp ]]; then rm -rf -- "$local_tmp"; fi
  return "$status"
}
trap cleanup EXIT
trap 'printf "\nDeployment failed during %s. See the error above.\n" "$phase" >&2' ERR

printf '\nInstalling locked local dependencies and checking the project...\n'
npm ci --include=dev --no-audit --no-fund
npm run lint
npm test
npm run build

phase='server prerequisite checks'
printf '\nChecking Task 2 setup on %s...\n' "$target"
ssh "${ssh_options[@]}" "$target" 'bash -s' <<'REMOTE'
set -Eeuo pipefail
export PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
if [[ ! -w /opt/accessdeck || ! -f /etc/systemd/system/accessdeck.service ]]; then
  printf 'Task 2 setup is missing or this SSH user cannot upload to /opt/accessdeck.\n' >&2
  exit 1
fi
sudo -n true
command -v rsync >/dev/null
/usr/local/bin/node -e 'process.exit(Number(process.versions.node.split(".")[0]) === 24 ? 0 : 1)'
/usr/local/bin/npm --version
sudo -n -u accessdeck test -w /opt/accessdeck/.env
sudo -n -u accessdeck test -w /opt/accessdeck/.local
sudo -n nginx -t
REMOTE

phase='upload'
stage_candidate=$(ssh "${ssh_options[@]}" "$target" 'mktemp -d /tmp/accessdeck-deploy.XXXXXX')
[[ $stage_candidate =~ ^/tmp/accessdeck-deploy\.[[:alnum:]]{6}$ ]] || die 'The server returned an unexpected staging directory.'
remote_stage=$stage_candidate
local_tmp=$(mktemp -d /tmp/accessdeck-deploy-local.XXXXXX)

# A wrapper passes the key as an argument, including paths with spaces or quotes.
export ACCESSDECK_DEPLOY_KEY=$identity
cat > "$local_tmp/ssh" <<'SSH'
#!/usr/bin/env bash
exec ssh -i "$ACCESSDECK_DEPLOY_KEY" -o IdentitiesOnly=yes -o BatchMode=yes -o ConnectTimeout=10 "$@"
SSH
chmod 0700 "$local_tmp/ssh"

printf '\nUploading application source to a temporary directory on EC2...\n'
# Copy the app and its build inputs from the working directory, including
# uncommitted changes. Keep local secrets, database files, and reference docs out.
rsync -rlptz --safe-links --chmod=u+rwX,go+rX \
  --exclude='.env*' --exclude='*.pem' --exclude='*.key' \
  --exclude='node_modules/' --exclude='dist/' --exclude='.local/' \
  --include='/package.json' --include='/package-lock.json' \
  --include='/tsconfig*.json' --include='/vite.config.ts' --include='/vitest.config.ts' \
  --include='/eslint.config.mjs' \
  --include='/README.md' --include='/start.sh' \
  --include='/client/***' --include='/server/***' --include='/scripts/***' \
  --include='/db/***' --include='/tests/***' --include='/deploy/***' \
  --exclude='*' -e "$local_tmp/ssh" ./ "$target:$remote_stage/"

phase='server build and restart'
printf '\nInstalling and building on EC2, then restarting AccessDeck...\n'
# This argument deliberately expands locally; only the validated mktemp path is sent.
# shellcheck disable=SC2029
ssh "${ssh_options[@]}" "$target" "bash -s -- '$remote_stage'" <<'REMOTE'
set -Eeuo pipefail
export PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
stage=$1
trap 'printf "\nServer deployment failed. Check: sudo journalctl -u accessdeck -n 50 --no-pager\n" >&2' ERR
cd "$stage"
npm ci --include=dev --no-audit --no-fund
npm run build
npm prune --omit=dev --no-audit --no-fund

# Build before stopping the current app. Excludes also protect the server's
# environment and database from --delete during repeat deployments.
sudo -n systemctl stop accessdeck.service
rsync -rlpt --delete --safe-links --chmod=u+rwX,go+rX \
  --exclude='/.env*' --exclude='/.local/' "$stage/" /opt/accessdeck/
sudo -n chmod 2750 /opt/accessdeck
sudo -n -u accessdeck test -r /opt/accessdeck/dist/server/main.js
sudo -n systemctl restart accessdeck.service

printf '\nWaiting for the app and database...\n'
healthy=false
for attempt in {1..30}; do
  if curl --fail --silent --show-error --max-time 3 http://127.0.0.1:3000/api/health > "$stage/health.json" 2>/dev/null \
    && node -e 'const h=JSON.parse(require("node:fs").readFileSync(process.argv[1],"utf8")); process.exit(h.status === "ok" && h.database === "connected" ? 0 : 1)' "$stage/health.json" 2>/dev/null; then
    healthy=true
    break
  fi
  if (( attempt % 5 == 0 )); then printf 'Still waiting for AccessDeck (%s/30)...\n' "$attempt"; fi
  sleep 2
done
if [[ $healthy != true ]]; then
  sudo -n systemctl status accessdeck --no-pager || true
  sudo -n journalctl -u accessdeck -n 50 --no-pager || true
  printf 'AccessDeck did not become healthy. See the service logs above.\n' >&2
  exit 1
fi
sudo -n systemctl is-active --quiet accessdeck.service
REMOTE

phase='public HTTP checks'
printf '\nChecking the public health endpoint and landing page...\n'
if ! curl --fail --location --silent --show-error --max-time 10 "http://$host/api/health" > "$local_tmp/health.json"; then
  die 'The app passed its server health check, but public HTTP failed. Check the EC2 security group allows TCP port 80.'
fi
node -e 'const h=JSON.parse(require("node:fs").readFileSync(process.argv[1],"utf8")); process.exit(h.status === "ok" && h.database === "connected" ? 0 : 1)' "$local_tmp/health.json"
curl --fail --location --silent --show-error --max-time 10 "http://$host/" >/dev/null
printf '\nAccessDeck deployed successfully. Open http://%s/\n' "$host"

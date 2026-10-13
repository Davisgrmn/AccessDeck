#!/usr/bin/env bash
set -Eeuo pipefail

# Task 2: copy deploy/ to an Ubuntu 24.04 EC2 instance, then run:
# sudo bash ~/deploy/setup-ec2.sh
export PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
script_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
node_tmp=
trap 'printf "\nAccessDeck server setup failed. Fix the error above and rerun this script.\n" >&2' ERR
trap 'if [[ -n "$node_tmp" ]]; then rm -rf -- "$node_tmp"; fi' EXIT

if [[ $EUID -ne 0 ]]; then
  printf 'Run this script on EC2 with sudo bash deploy/setup-ec2.sh.\n' >&2
  exit 1
fi

# shellcheck disable=SC1091
source /etc/os-release
if [[ $ID != ubuntu || $VERSION_ID != 24.04 ]]; then
  printf 'This setup script supports Ubuntu 24.04. Detected: %s\n' "$PRETTY_NAME" >&2
  exit 1
fi

case "$(uname -m)" in
  x86_64) node_arch=x64 ;;
  aarch64) node_arch=arm64 ;;
  *) printf 'Unsupported CPU architecture. Use an x86_64 or ARM64 instance.\n' >&2; exit 1 ;;
esac

for config in accessdeck.service nginx-accessdeck.conf; do
  if [[ ! -f "$script_dir/$config" ]]; then
    printf 'Missing %s. Copy the entire deploy/ directory to EC2.\n' "$config" >&2
    exit 1
  fi
done

deploy_user=${SUDO_USER:-ubuntu}
if ! id -u "$deploy_user" >/dev/null 2>&1; then
  printf 'Deployment user %s does not exist. Run setup with sudo from your EC2 login account.\n' "$deploy_user" >&2
  exit 1
fi

printf '\nInstalling server packages...\n'
export DEBIAN_FRONTEND=noninteractive
apt-get update
apt-get install -y ca-certificates curl xz-utils git rsync nginx postgresql postgresql-contrib

# Install an official Node.js 24 binary and check its published SHA-256 checksum.
# Use a system-wide path so systemd does not depend on an interactive shell or nvm.
if [[ ! -x /usr/local/bin/node ]] || ! /usr/local/bin/node -e 'process.exit(Number(process.versions.node.split(".")[0]) === 24 ? 0 : 1)'; then
  printf '\nInstalling Node.js 24...\n'
  node_tmp=$(mktemp -d /tmp/accessdeck-node.XXXXXX)
  curl --fail --silent --show-error --location \
    https://nodejs.org/dist/latest-v24.x/SHASUMS256.txt -o "$node_tmp/SHASUMS256.txt"
  read -r node_hash node_archive < <(awk -v arch="$node_arch" \
    '$2 ~ ("^node-v24\\.[0-9]+\\.[0-9]+-linux-" arch "\\.tar\\.xz$") {print; exit}' \
    "$node_tmp/SHASUMS256.txt")
  if [[ ! $node_hash =~ ^[a-f0-9]{64}$ || ! $node_archive =~ ^node-v24\.[0-9]+\.[0-9]+-linux-(x64|arm64)\.tar\.xz$ ]]; then
    printf 'Could not find a valid Node.js 24 download checksum.\n' >&2
    exit 1
  fi
  node_directory=${node_archive%.tar.xz}
  node_version=${node_directory#node-}
  node_version=${node_version%-linux-*}
  curl --fail --silent --show-error --location \
    "https://nodejs.org/dist/$node_version/$node_archive" -o "$node_tmp/$node_archive"
  (cd "$node_tmp" && printf '%s  %s\n' "$node_hash" "$node_archive" | sha256sum --check -)
  install -d -m 0755 /usr/local/lib/nodejs
  tar -xJf "$node_tmp/$node_archive" -C /usr/local/lib/nodejs --no-same-owner
  for tool in node npm npx; do
    ln -sfn "/usr/local/lib/nodejs/$node_directory/bin/$tool" "/usr/local/bin/$tool"
  done
fi
/usr/local/bin/node --version
/usr/local/bin/npm --version

printf '\nCreating the application account and directories...\n'
if ! id -u accessdeck >/dev/null 2>&1; then
  useradd --system --user-group --home-dir /opt/accessdeck --shell /usr/sbin/nologin accessdeck
fi
install -d -m 2750 -o "$deploy_user" -g accessdeck /opt/accessdeck
install -d -m 0700 -o accessdeck -g accessdeck /opt/accessdeck/.local
# The launcher writes credentials here; preserve any existing environment file.
if [[ ! -e /opt/accessdeck/.env ]]; then
  install -m 0600 -o accessdeck -g accessdeck /dev/null /opt/accessdeck/.env
fi

printf '\nInstalling the systemd service...\n'
install -m 0644 "$script_dir/accessdeck.service" /etc/systemd/system/accessdeck.service
systemctl daemon-reload
systemctl enable accessdeck.service

printf '\nConfiguring Nginx...\n'
install -m 0644 "$script_dir/nginx-accessdeck.conf" /etc/nginx/sites-available/accessdeck
ln -sfn /etc/nginx/sites-available/accessdeck /etc/nginx/sites-enabled/accessdeck
rm -f /etc/nginx/sites-enabled/default
nginx -t
systemctl enable --now nginx
systemctl reload nginx

# Preserve the current firewall policy; add HTTP/SSH only if UFW is already active.
if command -v ufw >/dev/null 2>&1 && ufw status | grep -q '^Status: active'; then
  ufw allow OpenSSH
  ufw allow 'Nginx HTTP'
fi

printf '\nTask 2 server setup is complete.\n'
printf 'App directory: /opt/accessdeck (code owned by %s; data owned by accessdeck)\n' "$deploy_user"
printf 'Nginx forwards HTTP port 80 to 127.0.0.1:3000.\n'
printf 'The accessdeck service is enabled for boot. Task 3 deploys and builds the app, then starts it.\n'
printf 'A 502 response is expected until the app is deployed and running.\n'
printf 'In AWS, allow inbound HTTP (TCP 80) in this instance\047s security group.\n'

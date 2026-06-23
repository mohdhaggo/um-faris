#!/usr/bin/env bash
# One-time setup on a fresh OCI VM (Ubuntu 22.04). Run from the deploy/ folder.
set -euo pipefail

cd "$(dirname "$0")"

if [ ! -f .env ]; then
  echo "❌ deploy/.env غير موجود. انسخ .env.example إلى .env واملأ القيم أولاً:"
  echo "   cp .env.example .env && nano .env"
  exit 1
fi

# install Docker + compose plugin
if ! command -v docker >/dev/null 2>&1; then
  echo "📦 تثبيت Docker..."
  curl -fsSL https://get.docker.com | sh
  sudo usermod -aG docker "$USER" || true
fi

# open OS firewall for 80/443 (Ubuntu/iptables on OCI images)
echo "🔓 فتح المنافذ 80 و443 في جدار النظام..."
sudo iptables -I INPUT -p tcp --dport 80 -j ACCEPT || true
sudo iptables -I INPUT -p tcp --dport 443 -j ACCEPT || true
sudo netfilter-persistent save 2>/dev/null || true

echo "🚀 بناء وتشغيل الحاويات..."
sudo docker compose --env-file .env up -d --build

echo "✅ تم. تحقّق: sudo docker compose ps   |   السجلات: sudo docker compose logs -f"
echo "   تذكير: افتح المنفذين 80 و443 أيضاً في Security List/NSG على لوحة OCI."

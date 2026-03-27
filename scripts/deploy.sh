#!/bin/bash
# 一键部署脚本 - 多人协作版
# 使用方式: bash scripts/deploy.sh
set -e

SERVER="root@120.79.156.190"
PASS="9sp@uYoKMu"
REMOTE_DIR="/home/www/qianchuan-monitor"

echo "=== 1. Git推送后端代码 ==="
GIT_SSH_COMMAND="sshpass -p '$PASS' ssh -o StrictHostKeyChecking=no" git push origin main 2>&1

echo "=== 2. 构建前端 ==="
cd "$(dirname "$0")/../frontend" && npm run build

echo "=== 3. 打包并上传前端 ==="
cd dist && tar czf /tmp/dist.tar.gz .
sshpass -p "$PASS" scp -o StrictHostKeyChecking=no /tmp/dist.tar.gz $SERVER:/tmp/dist.tar.gz

echo "=== 4. 服务器原子部署前端 ==="
sshpass -p "$PASS" ssh -o StrictHostKeyChecking=no $SERVER "
  rm -rf /tmp/dist_new && mkdir -p /tmp/dist_new
  tar xzf /tmp/dist.tar.gz -C /tmp/dist_new
  rm -rf ${REMOTE_DIR}/frontend/dist
  mv /tmp/dist_new ${REMOTE_DIR}/frontend/dist
  rm -f /tmp/dist.tar.gz

  # 注销旧Service Worker
  cat > ${REMOTE_DIR}/frontend/dist/sw.js << 'SWEOF'
self.addEventListener('install', () => { self.skipWaiting(); });
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then(names => Promise.all(names.map(n => caches.delete(n))))
    .then(() => self.clients.matchAll())
    .then(clients => { clients.forEach(c => c.navigate(c.url)); return self.registration.unregister(); })
  );
});
SWEOF
  cat > ${REMOTE_DIR}/frontend/dist/registerSW.js << 'REGEOF'
if('serviceWorker' in navigator){navigator.serviceWorker.getRegistrations().then(r=>r.forEach(r=>r.unregister()));caches.keys().then(n=>n.forEach(n=>caches.delete(n)))}
REGEOF

  nginx -s reload
  echo 'DEPLOY SUCCESS'
"
rm -f /tmp/dist.tar.gz
echo "=== 部署完成! ==="

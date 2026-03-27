#!/bin/bash
# 原子化部署脚本 - 避免空白页
set -e

SERVER="root@120.79.156.190"
REMOTE_DIR="/home/www/qianchuan-monitor/frontend/dist"
LOCAL_DIR="/Users/xlfzlb/logs/qianchuan-monitor/frontend/dist"
PASS="9sp@uYoKMu"

echo "=== 1. 构建前端 ==="
cd /Users/xlfzlb/logs/qianchuan-monitor/frontend && npm run build

echo "=== 2. 打包dist ==="
cd "$LOCAL_DIR" && tar czf /tmp/dist.tar.gz .

echo "=== 3. 上传到服务器 ==="
sshpass -p "$PASS" scp -o StrictHostKeyChecking=no /tmp/dist.tar.gz $SERVER:/tmp/dist.tar.gz

echo "=== 4. 原子替换（先解压到临时目录，再一次性切换）==="
sshpass -p "$PASS" ssh -o StrictHostKeyChecking=no $SERVER "
  rm -rf /tmp/dist_new && mkdir -p /tmp/dist_new
  tar xzf /tmp/dist.tar.gz -C /tmp/dist_new
  # 验证关键文件存在
  if [ ! -f /tmp/dist_new/index.html ]; then echo 'ERROR: index.html missing'; exit 1; fi
  JS_COUNT=\$(ls /tmp/dist_new/assets/*.js 2>/dev/null | wc -l)
  if [ \$JS_COUNT -lt 5 ]; then echo 'ERROR: JS files incomplete ('\$JS_COUNT')'; exit 1; fi
  # 原子替换
  mv ${REMOTE_DIR} ${REMOTE_DIR}.bak 2>/dev/null || true
  mv /tmp/dist_new ${REMOTE_DIR}
  rm -rf ${REMOTE_DIR}.bak
  rm -f /tmp/dist.tar.gz
  echo 'DEPLOY_SUCCESS: '\$JS_COUNT' JS files deployed'
"

rm -f /tmp/dist.tar.gz
echo "=== 部署完成 ==="

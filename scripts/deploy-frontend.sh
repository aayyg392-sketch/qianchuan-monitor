#!/bin/bash
# Deploy frontend to server
# Usage: SERVER=user@your-server-ip ./scripts/deploy-frontend.sh

SERVER=${SERVER:-"root@your-server-ip"}
REMOTE_DIR="/home/www/qianchuan-monitor/frontend"

echo "=== Syncing frontend source to $SERVER ==="

rsync -avz --progress \
  --exclude node_modules \
  --exclude dist \
  --exclude .git \
  /Users/xlfzlb/logs/qianchuan-monitor/frontend/ \
  "$SERVER:$REMOTE_DIR/"

echo "=== Installing dependencies and building ==="

ssh "$SERVER" "cd $REMOTE_DIR && npm install && npm run build"

echo "=== Build complete. Nginx will serve from $REMOTE_DIR/dist ==="

#!/bin/bash
# 打包插件为 zip，放到服务器 ai-images 目录供下载
set -e
cd "$(dirname "$0")"
OUTPUT="/home/www/qianchuan-monitor/ai-images/snefe-collector.zip"

echo "打包 Chrome 插件..."
zip -r /tmp/snefe-collector.zip manifest.json content.js inject-loader.js
mv /tmp/snefe-collector.zip "$OUTPUT"
echo "完成：$OUTPUT"

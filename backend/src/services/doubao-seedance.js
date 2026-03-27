/**
 * 豆包 Seedance 2.0 Pro 视频生成服务
 * 基于火山方舟 API
 * 文档: https://www.volcengine.com/docs/82379/1520757
 */
const axios = require('axios');
const logger = require('../logger');

const ARK_BASE_URL = 'https://ark.cn-beijing.volces.com/api/v3';
const MODEL_ID = 'doubao-seedance-2-0-pro-260215';

function getApiKey() {
  return process.env.DOUBAO_ARK_API_KEY;
}

/**
 * 提交文生视频任务
 */
async function submitText2Video(prompt, opts = {}) {
  const apiKey = getApiKey();
  if (!apiKey) throw new Error('未配置 DOUBAO_ARK_API_KEY');

  const duration = opts.duration || 5;
  const ratio = opts.ratio || '9:16';

  const resp = await axios.post(`${ARK_BASE_URL}/videos/generations`, {
    model: MODEL_ID,
    prompt: prompt,
    duration: duration,
    aspect_ratio: ratio,
    resolution: '1080p',
  }, {
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    timeout: 30000,
  });

  const taskId = resp.data?.id || resp.data?.task_id;
  if (!taskId) throw new Error('No task_id: ' + JSON.stringify(resp.data));
  logger.info('[Doubao Seedance] 任务已提交', { taskId });
  return taskId;
}

/**
 * 提交图生视频任务
 */
async function submitImage2Video(imageUrl, prompt, opts = {}) {
  const apiKey = getApiKey();
  if (!apiKey) throw new Error('未配置 DOUBAO_ARK_API_KEY');

  const duration = opts.duration || 5;
  const ratio = opts.ratio || '9:16';

  const content = [
    { type: 'text', text: prompt },
    { type: 'image_url', image_url: { url: imageUrl } },
  ];

  const resp = await axios.post(`${ARK_BASE_URL}/videos/generations`, {
    model: MODEL_ID,
    content: content,
    prompt: prompt,
    duration: duration,
    aspect_ratio: ratio,
    resolution: '1080p',
  }, {
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    timeout: 30000,
  });

  const taskId = resp.data?.id || resp.data?.task_id;
  if (!taskId) throw new Error('No task_id: ' + JSON.stringify(resp.data));
  logger.info('[Doubao Seedance] 图生视频任务已提交', { taskId });
  return taskId;
}

/**
 * 查询任务状态
 */
async function queryTask(taskId) {
  const apiKey = getApiKey();
  const resp = await axios.get(`${ARK_BASE_URL}/videos/generations/${taskId}`, {
    headers: { 'Authorization': `Bearer ${apiKey}` },
    timeout: 15000,
  });

  const d = resp.data || {};
  const status = (d.status || '').toLowerCase();
  const statusMap = {
    'queued': 'pending',
    'processing': 'processing',
    'running': 'processing',
    'succeeded': 'done',
    'completed': 'done',
    'failed': 'failed',
    'cancelled': 'failed',
  };

  let videoUrl = null;
  // 尝试多种响应格式
  if (d.video_url) {
    videoUrl = d.video_url;
  } else if (d.output) {
    videoUrl = typeof d.output === 'string' ? d.output : (d.output[0]?.url || d.output[0]);
  } else if (d.content && d.content.length) {
    const videoItem = d.content.find(c => c.type === 'video_url' || c.video_url);
    if (videoItem) videoUrl = videoItem.video_url?.url || videoItem.url || videoItem.video_url;
  } else if (d.data?.video_url) {
    videoUrl = d.data.video_url;
  }

  return {
    status: statusMap[status] || 'pending',
    videoUrl,
    raw: d,
  };
}

/**
 * 等待视频生成完成
 */
async function waitForVideo(taskId, maxMs = 180000) {
  const t0 = Date.now();
  while (Date.now() - t0 < maxMs) {
    await new Promise(r => setTimeout(r, 5000));
    const r = await queryTask(taskId);
    logger.info('[Doubao Seedance] 轮询状态', { taskId, status: r.status });
    if (r.status === 'done' && r.videoUrl) return r.videoUrl;
    if (r.status === 'failed') throw new Error('豆包视频生成失败: ' + JSON.stringify(r.raw));
  }
  throw new Error('豆包视频生成超时');
}

module.exports = { submitText2Video, submitImage2Video, queryTask, waitForVideo };

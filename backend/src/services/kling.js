/**
 * 可灵AI视频生成服务
 * API: https://api.klingai.com
 * Auth: JWT (Access Key + Secret Key)
 */
const jwt = require('jsonwebtoken');
const axios = require('axios');
const logger = require('../logger');

const API_BASE = 'https://api.klingai.com/v1/videos';
const AK = process.env.KLING_ACCESS_KEY || 'ATCCr9mrynfkb3R4BLgkNmyhYTbtg9hp';
const SK = process.env.KLING_SECRET_KEY || 'BEpCgQDKHNNM3BA4pH8RnTA9nYQ4RQCT';

function getToken() {
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    iss: AK,
    exp: now + 1800, // 30分钟有效
    nbf: now - 5,
    iat: now,
  };
  return jwt.sign(payload, SK, { algorithm: 'HS256', header: { alg: 'HS256', typ: 'JWT' } });
}

function headers() {
  return {
    'Authorization': 'Bearer ' + getToken(),
    'Content-Type': 'application/json',
  };
}

async function submitText2Video(prompt, opts = {}) {
  const body = {
    prompt,
    negative_prompt: opts.negativePrompt || '',
    model_name: opts.model || 'kling-v2',
    mode: opts.mode || 'standard',
    duration: String(opts.duration || 5),
    aspect_ratio: opts.ratio || '9:16',
    cfg_scale: opts.cfgScale || 0.5,
  };
  const resp = await axios.post(API_BASE + '/text2video', body, {
    headers: headers(),
    timeout: 30000,
  });
  const d = resp.data;
  if (d.code !== 0) throw new Error('可灵提交失败: code=' + d.code + ' ' + (d.message || ''));
  const taskId = d.data?.task_id;
  if (!taskId) throw new Error('No task_id: ' + JSON.stringify(d));
  logger.info('[Kling] 文生视频任务提交', { taskId });
  return taskId;
}

async function submitImage2Video(imageUrl, prompt, opts = {}) {
  const body = {
    model_name: opts.model || 'kling-v2',
    mode: opts.mode || 'standard',
    duration: String(opts.duration || 5),
    image: imageUrl,
    prompt: prompt || '',
    negative_prompt: opts.negativePrompt || '',
    cfg_scale: opts.cfgScale || 0.5,
  };
  const resp = await axios.post(API_BASE + '/image2video', body, {
    headers: headers(),
    timeout: 30000,
  });
  const d = resp.data;
  if (d.code !== 0) throw new Error('可灵i2v提交失败: code=' + d.code + ' ' + (d.message || ''));
  const taskId = d.data?.task_id;
  if (!taskId) throw new Error('No task_id: ' + JSON.stringify(d));
  logger.info('[Kling] 图生视频任务提交', { taskId });
  return taskId;
}

async function queryTask(taskId) {
  const resp = await axios.get(API_BASE + '/text2video/' + taskId, {
    headers: headers(),
    timeout: 15000,
  });
  const d = resp.data;
  if (d.code !== 0) throw new Error('可灵查询失败: ' + d.message);
  const task = d.data || {};
  const statusMap = {
    'submitted': 'pending',
    'processing': 'processing',
    'succeed': 'done',
    'failed': 'failed',
  };
  let videoUrl = null;
  if (task.task_result?.videos?.[0]?.url) {
    videoUrl = task.task_result.videos[0].url;
  }
  return {
    status: statusMap[task.task_status] || 'pending',
    videoUrl,
    raw: task,
  };
}

async function waitForVideo(taskId, maxMs = 600000) {
  const t0 = Date.now();
  while (Date.now() - t0 < maxMs) {
    await new Promise(r => setTimeout(r, 10000));
    const r = await queryTask(taskId);
    logger.info('[Kling] poll', { taskId, status: r.status });
    if (r.status === 'done' && r.videoUrl) return r.videoUrl;
    if (r.status === 'failed') throw new Error('可灵生成失败: ' + JSON.stringify(r.raw));
  }
  throw new Error('可灵生成超时(10分钟)');
}

module.exports = { submitText2Video, submitImage2Video, queryTask, waitForVideo };

/**
 * 即梦 3.0 Pro 视频生成服务
 * 基于火山引擎 Visual API，使用 V4 签名认证
 * 文档: https://www.volcengine.com/docs/6791/1397048
 */
const crypto = require('crypto');
const axios = require('axios');
const logger = require('../logger');

const HOST = 'visual.volcengineapi.com';
const BASE_URL = `https://${HOST}`;
const SERVICE = 'cv';
const REGION = 'cn-north-1';
const VERSION = '2022-08-31';

// 即梦 3.0 Pro 模型 req_key
const REQ_KEYS = {
  t2v: 'jimeng_vgfm_t2v_l30',      // 文生视频
  i2v: 'jimeng_vgfm_i2v_l30',      // 图生视频
};

function getCredentials() {
  const ak = process.env.JIMENG_ACCESS_KEY_ID;
  const sk = process.env.JIMENG_SECRET_ACCESS_KEY;
  if (!ak || !sk) throw new Error('未配置 JIMENG_ACCESS_KEY_ID / JIMENG_SECRET_ACCESS_KEY');
  return { ak, sk };
}

// ======================== V4 签名 ========================
function hmacSHA256(key, data) {
  return crypto.createHmac('sha256', key).update(data).digest();
}

function sha256Hex(data) {
  return crypto.createHash('sha256').update(data).digest('hex');
}

function signRequest(method, path, query, headers, body, ak, sk) {
  const now = new Date();
  const isoDate = now.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const shortDate = isoDate.substring(0, 8);

  // Canonical headers
  const signedHeaderKeys = Object.keys(headers).map(k => k.toLowerCase()).sort();
  const canonicalHeaders = signedHeaderKeys.map(k => `${k}:${headers[k].trim()}`).join('\n');
  const signedHeadersStr = signedHeaderKeys.join(';');

  // Canonical query string
  const canonicalQS = Object.keys(query).sort()
    .map(k => `${encodeURIComponent(k)}=${encodeURIComponent(query[k])}`)
    .join('&');

  const payloadHash = sha256Hex(body);

  const canonicalRequest = [
    method, path, canonicalQS,
    canonicalHeaders + '\n',
    signedHeadersStr,
    payloadHash,
  ].join('\n');

  // String to sign
  const credentialScope = `${shortDate}/${REGION}/${SERVICE}/request`;
  const stringToSign = [
    'HMAC-SHA256',
    isoDate,
    credentialScope,
    sha256Hex(canonicalRequest),
  ].join('\n');

  // Signing key
  const kDate = hmacSHA256(sk, shortDate);
  const kRegion = hmacSHA256(kDate, REGION);
  const kService = hmacSHA256(kRegion, SERVICE);
  const kSigning = hmacSHA256(kService, 'request');

  const signature = crypto.createHmac('sha256', kSigning).update(stringToSign).digest('hex');

  return {
    authorization: `HMAC-SHA256 Credential=${ak}/${credentialScope}, SignedHeaders=${signedHeadersStr}, Signature=${signature}`,
    xDate: isoDate,
  };
}

async function callVisualAPI(action, bodyObj) {
  const { ak, sk } = getCredentials();
  const bodyStr = JSON.stringify(bodyObj);

  const query = { Action: action, Version: VERSION };
  const now = new Date();
  const xDate = now.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const xContentSha256 = sha256Hex(bodyStr);

  const headers = {
    'host': HOST,
    'content-type': 'application/json',
    'x-date': xDate,
    'x-content-sha256': xContentSha256,
  };

  const { authorization } = signRequest('POST', '/', query, headers, bodyStr, ak, sk);

  const url = `${BASE_URL}?${Object.keys(query).map(k => `${k}=${encodeURIComponent(query[k])}`).join('&')}`;

  const resp = await axios.post(url, bodyStr, {
    headers: {
      ...headers,
      'Authorization': authorization,
    },
    timeout: 30000,
  });

  return resp.data;
}

// ======================== 提交文生视频 ========================
async function submitText2Video(prompt, opts = {}) {
  const duration = String(opts.duration || 5);
  const ratio = opts.ratio || '9:16';

  const body = {
    req_key: REQ_KEYS.t2v,
    prompt: prompt,
    seed: -1,
    duration: duration,
    resolution: '1080p',
    aspect_ratio: ratio,
  };

  logger.info('[Jimeng] 提交文生视频', { prompt: prompt.substring(0, 60), duration, ratio });

  const result = await callVisualAPI('CVSync2AsyncSubmitTask', body);

  if (result.code !== 10000 && result.code !== 0) {
    throw new Error(`即梦提交失败: code=${result.code} msg=${result.message || JSON.stringify(result).substring(0, 200)}`);
  }

  const taskId = result.data?.task_id;
  if (!taskId) throw new Error('即梦无task_id: ' + JSON.stringify(result).substring(0, 300));

  logger.info('[Jimeng] 文生视频任务已提交', { taskId });
  return taskId;
}

// ======================== 提交图生视频 ========================
async function submitImage2Video(imageUrl, prompt, opts = {}) {
  const duration = String(opts.duration || 5);
  const ratio = opts.ratio || '9:16';

  // 下载图片转base64
  let imageBase64;
  if (imageUrl.startsWith('data:')) {
    imageBase64 = imageUrl.split(',')[1];
  } else {
    const imgResp = await axios.get(imageUrl, { responseType: 'arraybuffer', timeout: 15000 });
    imageBase64 = Buffer.from(imgResp.data).toString('base64');
  }

  const body = {
    req_key: REQ_KEYS.i2v,
    prompt: prompt,
    binary_data_base64: [imageBase64],
    seed: -1,
    duration: duration,
    resolution: '1080p',
    aspect_ratio: ratio,
  };

  logger.info('[Jimeng] 提交图生视频', { prompt: prompt.substring(0, 60), duration });

  const result = await callVisualAPI('CVSync2AsyncSubmitTask', body);

  if (result.code !== 10000 && result.code !== 0) {
    throw new Error(`即梦图生视频提交失败: code=${result.code} msg=${result.message || JSON.stringify(result).substring(0, 200)}`);
  }

  const taskId = result.data?.task_id;
  if (!taskId) throw new Error('即梦无task_id: ' + JSON.stringify(result).substring(0, 300));

  logger.info('[Jimeng] 图生视频任务已提交', { taskId });
  return taskId;
}

// ======================== 查询任务 ========================
async function queryTask(taskId, reqKey) {
  const body = {
    req_key: reqKey || REQ_KEYS.t2v,
    task_id: taskId,
  };

  const result = await callVisualAPI('CVSync2AsyncGetResult', body);

  if (result.code !== 10000 && result.code !== 0) {
    // 某些错误码表示任务还在执行中
    if (result.code === 20000 || result.code === 20001) {
      return { status: 'processing', videoUrl: null, raw: result };
    }
    throw new Error(`即梦查询失败: code=${result.code} msg=${result.message || ''}`);
  }

  const taskData = result.data || {};
  const taskStatus = (taskData.status || '').toLowerCase();

  const statusMap = {
    'not_start': 'pending',
    'running': 'processing',
    'submit': 'processing',
    'queue': 'processing',
    'done': 'done',
    'failed': 'failed',
    'timeout': 'failed',
  };

  let videoUrl = null;
  if (taskStatus === 'done') {
    // 尝试从 resp_data 中提取视频URL
    try {
      const respData = typeof taskData.resp_data === 'string'
        ? JSON.parse(taskData.resp_data)
        : taskData.resp_data;

      if (respData?.video_urls?.length) {
        videoUrl = respData.video_urls[0];
      } else if (respData?.video_url) {
        videoUrl = respData.video_url;
      } else if (respData?.output_video_urls?.length) {
        videoUrl = respData.output_video_urls[0];
      }
    } catch (e) {
      logger.warn('[Jimeng] 解析resp_data失败', { taskId, raw: JSON.stringify(taskData).substring(0, 200) });
    }

    // 备选: 直接从 data 层级找
    if (!videoUrl) {
      videoUrl = taskData.video_url || taskData.video_urls?.[0] || taskData.output_url;
    }
  }

  return {
    status: statusMap[taskStatus] || 'processing',
    videoUrl,
    raw: result,
  };
}

// ======================== 等待视频完成 ========================
async function waitForVideo(taskId, maxMs = 300000, reqKey) {
  const rk = reqKey || REQ_KEYS.t2v;
  // 根据req_key名称判断是i2v还是t2v
  const actualReqKey = rk.includes('i2v') ? REQ_KEYS.i2v : REQ_KEYS.t2v;

  const t0 = Date.now();
  let attempt = 0;

  while (Date.now() - t0 < maxMs) {
    // 前30秒每5秒查一次，之后每10秒
    const interval = attempt < 6 ? 5000 : 10000;
    await new Promise(r => setTimeout(r, interval));
    attempt++;

    try {
      const r = await queryTask(taskId, actualReqKey);
      logger.info('[Jimeng] 轮询状态', { taskId, status: r.status, attempt });

      if (r.status === 'done' && r.videoUrl) {
        logger.info('[Jimeng] 视频生成成功', { taskId, videoUrl: r.videoUrl.substring(0, 100) });
        return r.videoUrl;
      }
      if (r.status === 'failed') {
        throw new Error('即梦视频生成失败: ' + JSON.stringify(r.raw).substring(0, 300));
      }
    } catch (e) {
      if (e.message.includes('即梦视频生成失败')) throw e;
      logger.warn('[Jimeng] 查询异常，继续重试', { taskId, error: e.message });
    }
  }

  throw new Error(`即梦视频生成超时 (${Math.round(maxMs / 1000)}s)`);
}

module.exports = { submitText2Video, submitImage2Video, queryTask, waitForVideo };

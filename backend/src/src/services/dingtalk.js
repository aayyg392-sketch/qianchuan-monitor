/**
 * 钉钉消息发送模块
 * 使用机器人单聊模式（独立聊天窗口）
 */
const axios = require('axios');
const logger = require('../logger');

const APP_KEY = process.env.DINGTALK_APP_KEY || '';
const APP_SECRET = process.env.DINGTALK_APP_SECRET || '';

// Token缓存
let tokenCache = { token: '', exp: 0 };

async function getAccessToken() {
  if (tokenCache.token && Date.now() < tokenCache.exp) return tokenCache.token;
  const res = await axios.get('https://oapi.dingtalk.com/gettoken', {
    params: { appkey: APP_KEY, appsecret: APP_SECRET },
    timeout: 10000
  });
  if (res.data.errcode !== 0) throw new Error('获取钉钉token失败: ' + res.data.errmsg);
  tokenCache = { token: res.data.access_token, exp: Date.now() + 6000000 };
  return tokenCache.token;
}

/**
 * 发送机器人单聊消息（独立聊天窗口）
 * @param {string} userId - 钉钉userId
 * @param {string} title - 消息标题
 * @param {string} mdText - markdown内容
 */
async function sendRobotMessage(userId, title, mdText) {
  if (!APP_KEY || !APP_SECRET) throw new Error('钉钉应用未配置');

  const token = await getAccessToken();
  const robotCode = APP_KEY; // 机器人单聊用AppKey作为robotCode

  const res = await axios.post(
    'https://api.dingtalk.com/v1.0/robot/oToMessages/batchSend',
    {
      robotCode,
      userIds: [userId],
      msgKey: 'sampleMarkdown',
      msgParam: JSON.stringify({ title, text: mdText })
    },
    {
      headers: {
        'x-acs-dingtalk-access-token': token,
        'Content-Type': 'application/json'
      },
      timeout: 10000
    }
  );

  if (res.data.processQueryKey) {
    logger.info(`[DingTalk] 机器人单聊发送成功: ${userId}`);
    return true;
  }

  // 有些情况返回不同格式，检查是否有错误
  if (res.data.code && res.data.code !== '0') {
    throw new Error(res.data.message || JSON.stringify(res.data));
  }

  return true;
}

/**
 * 批量发送机器人单聊消息
 * @param {string[]} userIds - 钉钉userId数组
 * @param {string} title - 消息标题
 * @param {string} mdText - markdown内容
 */
async function sendRobotBatch(userIds, title, mdText) {
  if (!userIds.length) return;
  const token = await getAccessToken();
  const robotCode = APP_KEY;

  const res = await axios.post(
    'https://api.dingtalk.com/v1.0/robot/oToMessages/batchSend',
    {
      robotCode,
      userIds,
      msgKey: 'sampleMarkdown',
      msgParam: JSON.stringify({ title, text: mdText })
    },
    {
      headers: {
        'x-acs-dingtalk-access-token': token,
        'Content-Type': 'application/json'
      },
      timeout: 10000
    }
  );

  logger.info(`[DingTalk] 批量机器人单聊发送: ${userIds.length}人`);
  return true;
}

/**
 * 发送群机器人Webhook消息（markdown格式）
 * @param {string} webhookUrl - 完整的webhook地址
 * @param {string} title - 消息标题
 * @param {string} mdText - markdown内容
 */
async function sendWebhookMessage(webhookUrl, title, mdText) {
  const res = await axios.post(webhookUrl, {
    msgtype: 'markdown',
    markdown: { title, text: mdText }
  }, { timeout: 10000 });
  if (res.data.errcode !== 0) throw new Error('群机器人发送失败: ' + res.data.errmsg);
  logger.info(`[DingTalk] 群机器人发送成功: ${title}`);
  return true;
}

module.exports = { getAccessToken, sendRobotMessage, sendRobotBatch, sendWebhookMessage };

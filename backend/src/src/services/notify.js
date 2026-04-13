const axios = require('axios');
const logger = require('../logger');

async function sendDingTalk(webhook, content) {
  if (!webhook) return;
  try {
    await axios.post(webhook, {
      msgtype: 'markdown',
      markdown: { title: '⚠️ 千川监控告警', text: content }
    }, { timeout: 5000 });
    logger.info('[Notify] 钉钉通知发送成功');
  } catch (e) {
    logger.error('[Notify] 钉钉发送失败', { error: e.message });
  }
}

async function sendFeishu(webhook, content) {
  if (!webhook) return;
  try {
    await axios.post(webhook, {
      msg_type: 'interactive',
      card: {
        header: { title: { tag: 'plain_text', content: '⚠️ 千川监控告警' }, template: 'red' },
        elements: [{ tag: 'div', text: { tag: 'lark_md', content } }]
      }
    }, { timeout: 5000 });
    logger.info('[Notify] 飞书通知发送成功');
  } catch (e) {
    logger.error('[Notify] 飞书发送失败', { error: e.message });
  }
}

async function sendAlert(rule, entity, actualValue) {
  const metricLabels = {
    ctr: 'CTR点击率', convert_rate: '转化率', cost: '消耗(元)',
    convert_cost: '转化成本', cpc: '点击单价', cpm: 'CPM千次展示费用'
  };
  const opLabels = { gt: '大于', lt: '小于', gte: '大于等于', lte: '小于等于' };
  const content = [
    `**告警规则**: ${rule.name}`,
    `**监控对象**: ${entity?.name || entity?.entity_id}`,
    `**指标**: ${metricLabels[rule.metric] || rule.metric}`,
    `**条件**: ${opLabels[rule.operator]} ${rule.threshold}`,
    `**当前值**: ${actualValue}`,
    `**时间**: ${new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })}`
  ].join('\n\n');

  if (rule.notify_type === 'dingtalk' || rule.notify_type === 'both') {
    await sendDingTalk(rule.notify_webhook, content);
  }
  if (rule.notify_type === 'feishu' || rule.notify_type === 'both') {
    await sendFeishu(rule.notify_webhook, content);
  }
}

module.exports = { sendDingTalk, sendFeishu, sendAlert };

/**
 * 抖音数据服务 - 真实数据抓取
 * 使用抖音网页版公开API + 开放平台认证
 */
const axios = require('axios');
const logger = require('../logger');

const CLIENT_KEY = process.env.DOUYIN_CLIENT_KEY || 'awa4cxchsjlm0m4q';
const CLIENT_SECRET = process.env.DOUYIN_CLIENT_SECRET || '20330183b8800a36f5da2bcf3a042144';

let cachedToken = null;
let tokenExpiry = 0;

// 获取开放平台 client_token
async function getClientToken() {
  if (cachedToken && Date.now() < tokenExpiry - 60000) return cachedToken;
  try {
    const resp = await axios.post('https://open.douyin.com/oauth/client_token/', {
      client_key: CLIENT_KEY, client_secret: CLIENT_SECRET, grant_type: 'client_credential',
    }, { headers: { 'Content-Type': 'application/json' }, timeout: 10000 });
    const data = resp.data?.data || resp.data;
    if (data.error_code && data.error_code !== 0) throw new Error('Douyin auth: ' + data.description);
    cachedToken = data.access_token;
    tokenExpiry = Date.now() + (data.expires_in || 7200) * 1000;
    logger.info('[Douyin] token获取成功');
    return cachedToken;
  } catch (e) {
    logger.error('[Douyin] token获取失败', { error: e.message });
    throw e;
  }
}

const WEB_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Referer': 'https://www.douyin.com/',
};

// 获取抖音实时热搜榜（真实数据）
async function getHotSearchList() {
  try {
    const resp = await axios.get('https://www.iesdouyin.com/web/api/v2/hotsearch/billboard/word/', {
      headers: WEB_HEADERS, timeout: 10000,
    });
    const list = resp.data?.word_list || [];
    return list.map((item, idx) => ({
      rank: idx + 1,
      title: item.word,
      hotValue: item.hot_value,
      label: item.label, // 0=普通, 1=新, 2=热, 3=推荐
      sentence_id: item.sentence_id,
    }));
  } catch (e) {
    logger.error('[Douyin] 热搜获取失败', { error: e.message });
    return [];
  }
}

// 获取抖音热门视频榜单（真实数据）
async function getHotVideos() {
  try {
    const resp = await axios.get('https://www.iesdouyin.com/web/api/v2/hotsearch/billboard/aweme/', {
      headers: WEB_HEADERS, timeout: 10000,
    });
    const list = resp.data?.aweme_list || [];
    return list.map((item, idx) => ({
      rank: idx + 1,
      title: item.aweme_info?.desc || '',
      author: item.aweme_info?.author?.nickname || '',
      authorFans: item.aweme_info?.author?.follower_count || 0,
      likes: item.aweme_info?.statistics?.digg_count || 0,
      comments: item.aweme_info?.statistics?.comment_count || 0,
      shares: item.aweme_info?.statistics?.share_count || 0,
      duration: item.aweme_info?.duration || 0,
      cover: item.aweme_info?.video?.cover?.url_list?.[0] || '',
      hotValue: item.hot_value || 0,
    }));
  } catch (e) {
    logger.error('[Douyin] 热门视频获取失败', { error: e.message });
    return [];
  }
}

// 获取品类相关热搜（从全站热搜中筛选 + AI补充）
async function getCategoryHotSearch(category = '洁面') {
  const allHot = await getHotSearchList();
  // 筛选与品类相关的
  const keywords = ['洁面', '护肤', '洗脸', '控油', '氨基酸', '卸妆', '清洁', '毛孔', '黑头', '敏感肌', '美白', '补水', '保湿', '精华', '面膜', '防晒'];
  const related = allHot.filter(h => keywords.some(kw => h.title.includes(kw)));
  return { allHot, categoryHot: related };
}

module.exports = {
  getClientToken,
  getHotSearchList,
  getHotVideos,
  getCategoryHotSearch,
};

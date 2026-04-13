/**
 * 抖音真实视频搜索 - 使用 Puppeteer + Chromium
 * 搜索竞品品牌关键词，抓取真实视频数据
 */
const puppeteer = require('puppeteer-core');
const logger = require('../logger');

const CHROME_PATH = '/usr/bin/chromium-browser';

let browserInstance = null;

async function getBrowser() {
  if (browserInstance && browserInstance.connected) return browserInstance;
  browserInstance = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: 'new',
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
      '--disable-extensions',
      '--disable-software-rasterizer',
      '--lang=zh-CN',
      '--window-size=1280,800',
    ],
    timeout: 30000,
  });
  logger.info('[DouyinScraper] 浏览器启动成功');
  return browserInstance;
}

/**
 * 搜索抖音视频
 * @param {string} keyword - 搜索关键词 (如 "buv洗面奶")
 * @param {number} count - 需要的视频数量
 * @returns {Array} 视频列表
 */
async function searchVideos(keyword, count = 10) {
  let page;
  try {
    const browser = await getBrowser();
    page = await browser.newPage();

    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
    await page.setViewport({ width: 1280, height: 800 });

    // 设置请求拦截 - 屏蔽不需要的资源加快速度
    await page.setRequestInterception(true);
    page.on('request', req => {
      const type = req.resourceType();
      if (['image', 'font', 'media', 'stylesheet'].includes(type)) {
        req.abort();
      } else {
        req.continue();
      }
    });

    // 拦截搜索API响应
    let searchData = [];
    page.on('response', async response => {
      const url = response.url();
      if (url.includes('/web/search/item/') || url.includes('/web/general/search/')) {
        try {
          const json = await response.json();
          const list = json.data || [];
          for (const item of list) {
            const aw = item.aweme_info || item;
            if (aw && aw.desc) {
              searchData.push({
                aweme_id: aw.aweme_id || '',
                title: aw.desc || '',
                author: aw.author?.nickname || '',
                author_fans: formatFans(aw.author?.follower_count),
                uid: aw.author?.uid || '',
                likes: aw.statistics?.digg_count || 0,
                comments: aw.statistics?.comment_count || 0,
                shares: aw.statistics?.share_count || 0,
                duration: formatDuration(aw.video?.duration || aw.duration || 0),
                cover_url: aw.video?.cover?.url_list?.[0] || aw.video?.origin_cover?.url_list?.[0] || '',
                video_url: aw.video?.play_addr?.url_list?.[0] || '',
                publish_date: formatDate(aw.create_time),
                tags: extractTags(aw),
              });
            }
          }
          logger.info('[DouyinScraper] 拦截到搜索数据', { count: list.length, total: searchData.length });
        } catch (e) { /* 不是JSON */ }
      }
    });

    // 访问抖音搜索页
    const searchUrl = `https://www.douyin.com/search/${encodeURIComponent(keyword)}?type=video`;
    logger.info('[DouyinScraper] 开始搜索', { keyword, url: searchUrl });

    await page.goto(searchUrl, { waitUntil: 'networkidle2', timeout: 30000 });

    // 等待搜索结果加载
    await new Promise(r => setTimeout(r, 3000));

    // 如果API拦截没有数据，从DOM提取
    if (searchData.length === 0) {
      logger.info('[DouyinScraper] API拦截无数据，尝试DOM提取');

      // 滚动页面触发加载
      await autoScroll(page);
      await new Promise(r => setTimeout(r, 2000));

      // 从页面DOM提取数据
      searchData = await page.evaluate(() => {
        const results = [];
        // 尝试多种选择器
        const cards = document.querySelectorAll('[class*="search-result-card"], [class*="video-card"], [class*="result-item"], li[class*="search"]');

        cards.forEach(card => {
          try {
            const titleEl = card.querySelector('[class*="title"], h3, a[title]');
            const authorEl = card.querySelector('[class*="author"], [class*="nickname"], [class*="user-name"]');
            const likeEl = card.querySelector('[class*="like"], [class*="digg"]');
            const link = card.querySelector('a[href*="/video/"]');

            const title = titleEl?.textContent?.trim() || titleEl?.getAttribute('title') || '';
            if (!title) return;

            results.push({
              title,
              author: authorEl?.textContent?.trim() || '',
              likes: parseCount(likeEl?.textContent?.trim()),
              video_url: link?.href || '',
              aweme_id: link?.href?.match(/\/video\/(\d+)/)?.[1] || '',
            });
          } catch (e) {}
        });

        function parseCount(str) {
          if (!str) return 0;
          str = str.replace(/[^\d.万w]/g, '');
          if (str.includes('万') || str.includes('w')) return Math.round(parseFloat(str) * 10000);
          return parseInt(str) || 0;
        }

        return results;
      });
    }

    // 如果还是没有数据，尝试从RENDER_DATA提取
    if (searchData.length === 0) {
      const renderData = await page.evaluate(() => {
        const scripts = document.querySelectorAll('script#RENDER_DATA');
        for (const s of scripts) {
          try {
            return JSON.parse(decodeURIComponent(s.textContent));
          } catch (e) {}
        }
        return null;
      });

      if (renderData) {
        for (const key of Object.keys(renderData)) {
          const val = renderData[key];
          const awemeList = val?.awemeList || val?.data || [];
          if (Array.isArray(awemeList) && awemeList.length > 0) {
            for (const aw of awemeList) {
              if (aw.desc) {
                searchData.push({
                  aweme_id: aw.awemeId || aw.aweme_id || '',
                  title: aw.desc,
                  author: aw.authorInfo?.nickname || aw.author?.nickname || '',
                  author_fans: formatFans(aw.authorInfo?.followerCount || aw.author?.follower_count),
                  likes: aw.stats?.diggCount || aw.statistics?.digg_count || 0,
                  comments: aw.stats?.commentCount || aw.statistics?.comment_count || 0,
                  shares: aw.stats?.shareCount || aw.statistics?.share_count || 0,
                  duration: formatDuration(aw.video?.duration || aw.duration || 0),
                  cover_url: aw.video?.cover || '',
                  video_url: '',
                  publish_date: formatDate(aw.createTime || aw.create_time),
                  tags: [],
                });
              }
            }
          }
        }
      }
    }

    logger.info('[DouyinScraper] 搜索完成', { keyword, results: searchData.length });
    return searchData.slice(0, count);

  } catch (e) {
    logger.error('[DouyinScraper] 搜索失败', { keyword, error: e.message });
    return [];
  } finally {
    if (page) await page.close().catch(() => {});
  }
}

async function autoScroll(page) {
  await page.evaluate(async () => {
    await new Promise(resolve => {
      let totalHeight = 0;
      const distance = 400;
      const timer = setInterval(() => {
        window.scrollBy(0, distance);
        totalHeight += distance;
        if (totalHeight >= 3000) { clearInterval(timer); resolve(); }
      }, 300);
    });
  });
}

function formatFans(count) {
  if (!count) return '';
  if (count >= 10000) return (count / 10000).toFixed(1) + '万';
  return count.toString();
}

function formatDuration(ms) {
  if (!ms) return '';
  const sec = Math.round(ms / 1000);
  if (sec < 60) return sec + 's';
  return Math.floor(sec / 60) + 'min' + (sec % 60 ? (sec % 60) + 's' : '');
}

function formatDate(ts) {
  if (!ts) return '';
  const d = new Date(ts * 1000);
  if (isNaN(d.getTime())) return '';
  return d.toISOString().split('T')[0];
}

function extractTags(aw) {
  const tags = [];
  if (aw.text_extra) {
    aw.text_extra.forEach(t => { if (t.hashtag_name) tags.push(t.hashtag_name); });
  }
  return tags.slice(0, 5);
}

// 关闭浏览器
async function closeBrowser() {
  if (browserInstance) {
    await browserInstance.close().catch(() => {});
    browserInstance = null;
  }
}

module.exports = { searchVideos, closeBrowser };

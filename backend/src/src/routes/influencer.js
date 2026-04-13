const express = require('express');
const router = express.Router();
const db = require('../db');
const auth = require('../middleware/auth');
const logger = require('../logger');
const path = require('path');
const fs = require('fs');
const { execSync } = require('child_process');
const dayjs = require('dayjs');
const { syncInfluencerPromotion } = require('../services/influencer-sync');

// 注意：需要安装 multer —— npm install multer
const multer = require('multer');
const upload = multer({
  dest: path.join(__dirname, '../../uploads/influencer'),
  limits: { fileSize: 20 * 1024 * 1024 }, // 20MB
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (['.xls', '.xlsx'].includes(ext)) cb(null, true);
    else cb(new Error('仅支持 xls/xlsx 文件'));
  }
});

// ===================== 自动建表 =====================
(async () => {
  try {
    await db.query(`
      CREATE TABLE IF NOT EXISTS qc_influencers (
        id INT AUTO_INCREMENT PRIMARY KEY,
        batch_id VARCHAR(20) NOT NULL COMMENT '导入批次',
        nickname VARCHAR(200) COMMENT '达人昵称',
        douyin_id VARCHAR(100) COMMENT '抖音ID',
        profile_url VARCHAR(500) COMMENT '达人链接',
        intro TEXT COMMENT '达人简介',
        mcn VARCHAR(200) COMMENT 'MCN机构',
        industry VARCHAR(200) COMMENT '达人行业',
        video_tags VARCHAR(500) COMMENT '视频标签',
        live_tags VARCHAR(200) COMMENT '直播标签',
        daren_index DECIMAL(10,1) DEFAULT 0 COMMENT '达人指数',
        fans_count BIGINT DEFAULT 0 COMMENT '粉丝数',
        fans_increment INT DEFAULT 0 COMMENT '粉丝增量',
        total_videos INT DEFAULT 0,
        total_likes BIGINT DEFAULT 0,
        sales_range VARCHAR(50) COMMENT '销量区间',
        sales_amount_range VARCHAR(50) COMMENT '销售额区间',
        avg_play BIGINT DEFAULT 0 COMMENT '平均播放',
        avg_likes INT DEFAULT 0 COMMENT '视频平均点赞',
        live_count INT DEFAULT 0 COMMENT '直播数',
        live_avg_viewers INT DEFAULT 0 COMMENT '场均观看',
        live_peak INT DEFAULT 0 COMMENT '场均人气峰值',
        live_sales_range VARCHAR(50),
        conversion_rate VARCHAR(50) COMMENT '带货转化率',
        uv_value VARCHAR(50) COMMENT '人均UV价值',
        score_total INT DEFAULT 0 COMMENT '总分(0-100)',
        score_audience DECIMAL(5,1) DEFAULT 0 COMMENT '人群匹配分',
        score_influence DECIMAL(5,1) DEFAULT 0 COMMENT '影响力分',
        score_commerce DECIMAL(5,1) DEFAULT 0 COMMENT '带货能力分',
        score_content DECIMAL(5,1) DEFAULT 0 COMMENT '内容匹配分',
        score_cost DECIMAL(5,1) DEFAULT 0 COMMENT '性价比分',
        score_detail JSON COMMENT '评分明细',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_batch (batch_id),
        INDEX idx_score (score_total)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);
    logger.info('[Influencer] qc_influencers 表结构就绪');

    // 添加 aweme_id_link 字段（如果不存在）
    try {
      await db.query(`ALTER TABLE qc_influencers ADD COLUMN aweme_id_link VARCHAR(50) COMMENT '关联千川抖音号' AFTER douyin_id`);
      logger.info('[Influencer] 已添加 aweme_id_link 字段');
    } catch (_) { /* 字段已存在则忽略 */ }

    // 创建达人推广数据统计表
    await db.query(`
      CREATE TABLE IF NOT EXISTS qc_influencer_promotion_stats (
        id INT AUTO_INCREMENT PRIMARY KEY,
        advertiser_id VARCHAR(30) NOT NULL,
        aweme_id VARCHAR(50) NOT NULL COMMENT '抖音号',
        aweme_name VARCHAR(200) COMMENT '达人昵称',
        stat_date DATE NOT NULL,
        cost DECIMAL(14,2) DEFAULT 0 COMMENT '消耗',
        pay_amount DECIMAL(14,2) DEFAULT 0 COMMENT '推广销售额',
        convert_count INT DEFAULT 0 COMMENT '转化数',
        convert_cost DECIMAL(14,2) DEFAULT 0 COMMENT '转化成本',
        show_count BIGINT DEFAULT 0 COMMENT '曝光',
        click_count BIGINT DEFAULT 0 COMMENT '点击',
        ctr DECIMAL(8,4) DEFAULT 0 COMMENT 'CTR',
        roi DECIMAL(8,4) DEFAULT 0 COMMENT 'ROI',
        fetched_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE KEY uk_adv_aweme_date (advertiser_id, aweme_id, stat_date),
        KEY idx_aweme (aweme_id),
        KEY idx_date (stat_date)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);
    logger.info('[Influencer] qc_influencer_promotion_stats 表结构就绪');
  } catch (e) {
    logger.error('[Influencer] 建表失败', { error: e.message });
  }
})();

// ===================== 数值解析工具函数 =====================

/**
 * 解析粉丝数：支持 14624470、"1462万"、"146.2万"、"1.5亿" 等格式
 */
function parseFansCount(val) {
  if (val === null || val === undefined || val === '') return 0;
  if (typeof val === 'number') return Math.floor(val);
  const str = String(val).trim();
  const yiMatch = str.match(/([\d.]+)\s*亿/);
  if (yiMatch) return Math.floor(parseFloat(yiMatch[1]) * 100000000);
  const wanMatch = str.match(/([\d.]+)\s*[万w]/i);
  if (wanMatch) return Math.floor(parseFloat(wanMatch[1]) * 10000);
  const num = parseFloat(str.replace(/,/g, ''));
  return isNaN(num) ? 0 : Math.floor(num);
}

/**
 * 解析销售额区间字符串，返回中位数（万为单位）
 * 支持："100w-250w"、"50万-100万"、">250w"、"100w+"
 */
function parseSalesAmount(val) {
  if (!val || val === '-') return 0;
  const str = String(val).trim().toLowerCase();
  // 匹配 "100w-250w" 或 "100万-250万"
  const rangeMatch = str.match(/([\d.]+)\s*[w万]\s*[-~到]\s*([\d.]+)\s*[w万]/);
  if (rangeMatch) return (parseFloat(rangeMatch[1]) + parseFloat(rangeMatch[2])) / 2;
  // 匹配 ">250w" 或 "250w+"
  const gtMatch = str.match(/[>＞]?\s*([\d.]+)\s*[w万]\+?/);
  if (gtMatch) return parseFloat(gtMatch[1]);
  const num = parseFloat(str.replace(/[w万,]/gi, ''));
  return isNaN(num) ? 0 : num;
}

/**
 * 解析百分比字符串："3.5%"、"3.5"
 */
function parsePercent(val) {
  if (val === null || val === undefined || val === '' || val === '-') return 0;
  const str = String(val).trim().replace('%', '');
  const num = parseFloat(str);
  return isNaN(num) ? 0 : num;
}

/**
 * 解析通用数值
 */
function safeNum(val) {
  if (val === null || val === undefined || val === '' || val === '-') return 0;
  if (typeof val === 'number') return val;
  const str = String(val).trim();
  const yiMatch = str.match(/([\d.]+)\s*亿/);
  if (yiMatch) return parseFloat(yiMatch[1]) * 100000000;
  const wanMatch = str.match(/([\d.]+)\s*[万w]/i);
  if (wanMatch) return parseFloat(wanMatch[1]) * 10000;
  const num = parseFloat(str.replace(/,/g, ''));
  return isNaN(num) ? 0 : num;
}

// ===================== Excel列名映射 =====================
// 将各种可能的Excel列名映射到数据库字段
const COLUMN_MAP = {
  '达人昵称': 'nickname', '昵称': 'nickname', 'nickname': 'nickname',
  '抖音号': 'douyin_id', '抖音ID': 'douyin_id', 'douyin_id': 'douyin_id',
  '达人链接': 'profile_url', '主页链接': 'profile_url',
  '达人简介': 'intro', '简介': 'intro',
  'MCN机构': 'mcn', 'MCN': 'mcn', 'mcn': 'mcn',
  '达人行业': 'industry', '行业': 'industry',
  '视频标签': 'video_tags', '标签': 'video_tags',
  '直播标签': 'live_tags',
  '达人指数': 'daren_index',
  '粉丝数': 'fans_count', '粉丝量': 'fans_count', '粉丝': 'fans_count',
  '粉丝增量': 'fans_increment', '近30天粉丝增量': 'fans_increment',
  '作品数': 'total_videos', '视频数': 'total_videos', '总作品数': 'total_videos',
  '获赞数': 'total_likes', '总获赞': 'total_likes', '累计获赞': 'total_likes',
  '销量区间': 'sales_range', '带货销量': 'sales_range',
  '销售额区间': 'sales_amount_range', '带货销售额': 'sales_amount_range', '销售额': 'sales_amount_range',
  '平均播放': 'avg_play', '视频平均播放': 'avg_play',
  '平均点赞': 'avg_likes', '视频平均点赞': 'avg_likes',
  '直播数': 'live_count', '近期直播数': 'live_count',
  '场均观看': 'live_avg_viewers', '直播场均观看': 'live_avg_viewers',
  '场均人气峰值': 'live_peak', '人气峰值': 'live_peak',
  '直播销售额': 'live_sales_range', '直播带货销售额': 'live_sales_range',
  '带货转化率': 'conversion_rate', '转化率': 'conversion_rate',
  'UV价值': 'uv_value', '人均UV价值': 'uv_value', 'uv价值': 'uv_value',
};

/**
 * 将Excel行数据映射到数据库字段
 */
function mapRowToFields(row) {
  const mapped = {};
  for (const [excelCol, dbField] of Object.entries(COLUMN_MAP)) {
    if (row[excelCol] !== undefined && row[excelCol] !== '') {
      mapped[dbField] = row[excelCol];
    }
  }
  // 如果直接匹配不到，尝试模糊匹配
  for (const key of Object.keys(row)) {
    const trimKey = key.trim();
    if (COLUMN_MAP[trimKey]) {
      if (!mapped[COLUMN_MAP[trimKey]]) mapped[COLUMN_MAP[trimKey]] = row[key];
    }
  }
  return mapped;
}

// ===================== 评分系统 =====================

/**
 * 对单条达人数据进行评分（基于规则）
 * @param {Object} data - 达人数据（已映射到db字段）
 * @returns {Object} 评分结果
 */
function scoreInfluencer(data) {
  const detail = {};
  let scoreAudience = 0;
  let scoreInfluence = 0;
  let scoreCommerce = 0;
  let scoreContent = 0;
  let scoreCost = 0;

  // === 1. 人群匹配度 (20分) ===
  const industry = String(data.industry || '').toLowerCase();
  const videoTags = String(data.video_tags || '').toLowerCase();
  const liveTags = String(data.live_tags || '').toLowerCase();
  const intro = String(data.intro || '').toLowerCase();

  const industryKeywords = ['美妆', '护肤', '时尚', '穿搭', '颜值'];
  const videoTagKeywords = ['护肤', '美妆', '洗面', '洁面', '美白', '控油', '保湿', '面膜', '精华', '水乳'];

  // 行业匹配
  const industryMatch = industryKeywords.some(kw => industry.includes(kw));
  if (industryMatch) {
    scoreAudience += 5;
    detail.industry_match = '行业匹配+5';
  }

  // 视频标签匹配（标签越多分越高，最高5分）
  let videoTagCount = 0;
  const matchedVideoTags = [];
  for (const kw of videoTagKeywords) {
    if (videoTags.includes(kw)) {
      videoTagCount++;
      matchedVideoTags.push(kw);
    }
  }
  if (videoTagCount > 0) {
    const tagScore = Math.min(5, videoTagCount * 1.5);
    scoreAudience += tagScore;
    detail.video_tag_match = `视频标签匹配(${matchedVideoTags.join('/')})+${tagScore.toFixed(1)}`;
  }

  // 直播标签含电商
  if (liveTags.includes('电商')) {
    scoreAudience += 3;
    detail.live_tag_match = '直播电商标签+3';
  }

  // 简介含护肤关键词
  const introKeywords = ['护肤', '美妆', '美白', '洁面', '洗面', '保湿', '控油', '面膜', '精华', '成分'];
  if (introKeywords.some(kw => intro.includes(kw))) {
    scoreAudience += 2;
    detail.intro_match = '简介匹配+2';
  }

  // 行业完全不匹配扣分
  if (!industryMatch && videoTagCount === 0 && !introKeywords.some(kw => intro.includes(kw))) {
    scoreAudience = 0;
    detail.no_match = '行业标签完全不匹配护肤';
  }

  scoreAudience = Math.min(20, scoreAudience);

  // === 2. 影响力 (20分) ===
  const fans = parseFansCount(data.fans_count);
  const darenIdx = safeNum(data.daren_index);
  const avgPlay = safeNum(data.avg_play);
  const fansIncrement = safeNum(data.fans_increment);

  // 粉丝数
  let fansScore = 0;
  if (fans > 10000000) fansScore = 8;
  else if (fans > 5000000) fansScore = 6;
  else if (fans > 1000000) fansScore = 5;
  else if (fans > 500000) fansScore = 4;
  else if (fans > 100000) fansScore = 3;
  else fansScore = 2;
  scoreInfluence += fansScore;
  detail.fans_score = `粉丝${formatFans(fans)}+${fansScore}`;

  // 达人指数
  let indexScore = 0;
  if (darenIdx > 1000) indexScore = 5;
  else if (darenIdx > 800) indexScore = 4;
  else if (darenIdx > 600) indexScore = 3;
  else if (darenIdx > 0) indexScore = 1;
  scoreInfluence += indexScore;
  if (indexScore > 0) detail.daren_index_score = `达人指数${darenIdx}+${indexScore}`;

  // 播放/粉丝比
  if (fans > 0 && avgPlay > 0) {
    const playRatio = avgPlay / fans * 100;
    let ratioScore = 0;
    if (playRatio > 10) ratioScore = 4;
    else if (playRatio > 5) ratioScore = 3;
    else if (playRatio > 2) ratioScore = 2;
    else if (playRatio > 0) ratioScore = 1;
    scoreInfluence += ratioScore;
    if (ratioScore > 0) detail.play_ratio = `播粉比${playRatio.toFixed(1)}%+${ratioScore}`;
  }

  // 粉丝正增长
  if (fansIncrement > 0) {
    scoreInfluence += 3;
    detail.fans_growth = `粉丝正增长+3`;
  }

  scoreInfluence = Math.min(20, scoreInfluence);

  // === 3. 带货能力 (20分) ===
  const salesAmount = parseSalesAmount(data.sales_amount_range);
  const convRate = parsePercent(data.conversion_rate);
  const uvVal = parsePercent(data.uv_value);
  const liveCount = safeNum(data.live_count);

  // 销售额区间
  let salesScore = 0;
  if (salesAmount > 250) salesScore = 7;
  else if (salesAmount > 100) salesScore = 6;
  else if (salesAmount > 50) salesScore = 5;
  else if (salesAmount > 25) salesScore = 4;
  else if (salesAmount > 10) salesScore = 3;
  else if (salesAmount > 0) salesScore = 1;
  scoreCommerce += salesScore;
  if (salesScore > 0) detail.sales_score = `销售额${data.sales_amount_range || salesAmount + 'w'}+${salesScore}`;

  // 转化率
  let convScore = 0;
  if (convRate > 5) convScore = 5;
  else if (convRate > 3) convScore = 4;
  else if (convRate > 1) convScore = 3;
  else if (convRate > 0) convScore = 1;
  scoreCommerce += convScore;
  if (convScore > 0) detail.conv_score = `转化率${convRate}%+${convScore}`;

  // UV价值
  let uvScore = 0;
  if (uvVal > 5) uvScore = 5;
  else if (uvVal > 3) uvScore = 4;
  else if (uvVal > 1) uvScore = 3;
  else if (uvVal > 0) uvScore = 1;
  scoreCommerce += uvScore;
  if (uvScore > 0) detail.uv_score = `UV价值${uvVal}+${uvScore}`;

  // 有直播带货
  if (liveCount > 0) {
    scoreCommerce += 3;
    detail.live_commerce = `有直播带货+3`;
  }

  scoreCommerce = Math.min(20, scoreCommerce);

  // === 4. 内容质量 (20分) ===
  const avgLikes = safeNum(data.avg_likes);
  const totalVideos = safeNum(data.total_videos);

  // 平均播放量
  let playScore = 0;
  if (avgPlay > 1000000) playScore = 6;
  else if (avgPlay > 500000) playScore = 5;
  else if (avgPlay > 100000) playScore = 4;
  else if (avgPlay > 50000) playScore = 3;
  else if (avgPlay > 10000) playScore = 2;
  scoreContent += playScore;
  if (playScore > 0) detail.avg_play_score = `平均播放${formatFans(avgPlay)}+${playScore}`;

  // 平均点赞
  let likeScore = 0;
  if (avgLikes > 50000) likeScore = 5;
  else if (avgLikes > 10000) likeScore = 4;
  else if (avgLikes > 5000) likeScore = 3;
  else if (avgLikes > 1000) likeScore = 2;
  scoreContent += likeScore;
  if (likeScore > 0) detail.avg_likes_score = `平均点赞${formatFans(avgLikes)}+${likeScore}`;

  // 赞评比（使用点赞/播放近似）
  if (avgPlay > 0 && avgLikes > 0) {
    const likePlayRatio = avgLikes / avgPlay * 100;
    let ratioScore = 0;
    if (likePlayRatio > 20) ratioScore = 4;
    else if (likePlayRatio > 10) ratioScore = 3;
    else if (likePlayRatio > 5) ratioScore = 2;
    scoreContent += ratioScore;
    if (ratioScore > 0) detail.like_ratio = `赞播比${likePlayRatio.toFixed(1)}%+${ratioScore}`;
  }

  // 累计视频数
  if (totalVideos > 100) {
    scoreContent += 3;
    detail.video_count = `作品${totalVideos}+3`;
  } else if (totalVideos > 50) {
    scoreContent += 2;
    detail.video_count = `作品${totalVideos}+2`;
  }

  // 视频内容与护肤相关加分
  if (videoTagCount > 0 && playScore > 0) {
    const contentBonus = Math.min(2, videoTagCount);
    scoreContent += contentBonus;
    detail.content_relevance = `护肤内容+${contentBonus}`;
  }

  scoreContent = Math.min(20, scoreContent);

  // === 5. 性价比 (20分) ===

  // 粉丝50w-500w中腰部最优
  let costFansScore = 0;
  if (fans >= 500000 && fans <= 5000000) {
    costFansScore = 6;
    detail.cost_fans = '中腰部(50w-500w)+6';
  } else if (fans > 5000000 && fans <= 10000000) {
    costFansScore = 3;
    detail.cost_fans = '头部偏贵+3';
  } else if (fans >= 100000 && fans < 500000) {
    costFansScore = 4;
    detail.cost_fans = '小腰部(10w-50w)+4';
  } else if (fans > 10000000) {
    costFansScore = 1;
    detail.cost_fans = '超头部成本高+1';
  } else {
    costFansScore = 2;
    detail.cost_fans = '小号量不足+2';
  }
  scoreCost += costFansScore;

  // 粉丝增长正向
  if (fansIncrement > 0) {
    scoreCost += 4;
    detail.cost_growth = '粉丝正增长+4';
  }

  // 播放/粉丝活跃度
  if (fans > 0 && avgPlay > 0) {
    const activeRatio = avgPlay / fans * 100;
    if (activeRatio > 5) {
      scoreCost += 4;
      detail.cost_active = `活跃度${activeRatio.toFixed(1)}%+4`;
    } else if (activeRatio > 2) {
      scoreCost += 2;
      detail.cost_active = `活跃度${activeRatio.toFixed(1)}%+2`;
    }
  }

  // 护肤相关标签的中腰部达人
  if (videoTagCount > 0 && fans >= 100000 && fans <= 5000000) {
    scoreCost += 6;
    detail.cost_niche = '护肤标签中腰部+6';
  } else if (videoTagCount > 0) {
    scoreCost += 2;
    detail.cost_niche = '有护肤标签+2';
  }

  scoreCost = Math.min(20, scoreCost);

  // === 总分 ===
  const total = Math.min(100, scoreAudience + scoreInfluence + scoreCommerce + scoreContent + scoreCost);

  return {
    score_total: total,
    score_audience: scoreAudience,
    score_influence: scoreInfluence,
    score_commerce: scoreCommerce,
    score_content: scoreContent,
    score_cost: scoreCost,
    score_detail: detail,
  };
}

/**
 * 格式化粉丝数显示
 */
function formatFans(num) {
  if (num >= 100000000) return (num / 100000000).toFixed(1) + '亿';
  if (num >= 10000) return (num / 10000).toFixed(1) + '万';
  return String(num);
}

// ===================== POST /upload — 上传Excel文件 =====================
router.post('/upload', auth(), upload.single('file'), async (req, res) => {
  let filePath = null;
  try {
    if (!req.file) return res.json({ code: 400, msg: '请上传文件' });
    filePath = req.file.path;
    const originalName = req.file.originalname;
    const ext = path.extname(originalName).toLowerCase();

    logger.info(`[Influencer] 上传文件: ${originalName}, 大小: ${req.file.size}`);

    let rows;

    if (ext === '.xls') {
      // 使用Python脚本解析xls（处理UTF-16编码问题）
      const parseScript = path.join(__dirname, '../../scripts/parse_xls.py');
      const parseCmd = `python3 "${parseScript}" "${filePath}"`;
      try {
        const jsonStr = execSync(parseCmd, { timeout: 60000, maxBuffer: 50 * 1024 * 1024 }).toString();
        rows = JSON.parse(jsonStr);
      } catch (pyErr) {
        logger.error('[Influencer] Python解析xls失败', { error: pyErr.message });
        return res.json({ code: 500, msg: 'xls文件解析失败: ' + pyErr.message });
      }
    } else {
      // xlsx使用xlsx库解析
      let XLSX;
      try {
        XLSX = require('xlsx');
      } catch (e) {
        return res.json({ code: 500, msg: '缺少xlsx库，请安装: npm install xlsx' });
      }
      const workbook = XLSX.readFile(filePath);
      const sheetName = workbook.SheetNames[0];
      rows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { defval: '' });
    }

    if (!rows || rows.length === 0) {
      return res.json({ code: 400, msg: '文件无数据' });
    }

    logger.info(`[Influencer] 解析到 ${rows.length} 行数据, 列: ${Object.keys(rows[0]).join(', ')}`);

    // 生成批次ID
    const batchId = dayjs().format('YYYYMMDDHHmmss');

    // 批量处理
    let total = 0;
    let qualified = 0;

    for (const row of rows) {
      const mapped = mapRowToFields(row);
      if (!mapped.nickname && !mapped.douyin_id) continue; // 跳过空行

      // 解析数值
      const fans = parseFansCount(mapped.fans_count);
      const fansIncr = safeNum(mapped.fans_increment);
      const darenIdx = safeNum(mapped.daren_index);
      const totalVideos = safeNum(mapped.total_videos);
      const totalLikes = safeNum(mapped.total_likes);
      const avgPlay = safeNum(mapped.avg_play);
      const avgLikes = safeNum(mapped.avg_likes);
      const liveCount = safeNum(mapped.live_count);
      const liveAvg = safeNum(mapped.live_avg_viewers);
      const livePeak = safeNum(mapped.live_peak);

      // 评分
      const scores = scoreInfluencer({
        ...mapped,
        fans_count: fans,
        fans_increment: fansIncr,
        daren_index: darenIdx,
        avg_play: avgPlay,
        avg_likes: avgLikes,
        total_videos: totalVideos,
        live_count: liveCount,
      });

      // 写入数据库
      await db.query(`
        INSERT INTO qc_influencers (
          batch_id, nickname, douyin_id, profile_url, intro, mcn, industry,
          video_tags, live_tags, daren_index, fans_count, fans_increment,
          total_videos, total_likes, sales_range, sales_amount_range,
          avg_play, avg_likes, live_count, live_avg_viewers, live_peak,
          live_sales_range, conversion_rate, uv_value,
          score_total, score_audience, score_influence, score_commerce,
          score_content, score_cost, score_detail
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        batchId,
        mapped.nickname || '',
        mapped.douyin_id || '',
        mapped.profile_url || '',
        mapped.intro || '',
        mapped.mcn || '',
        mapped.industry || '',
        mapped.video_tags || '',
        mapped.live_tags || '',
        darenIdx,
        fans,
        fansIncr,
        totalVideos,
        safeNum(mapped.total_likes),
        mapped.sales_range || '',
        mapped.sales_amount_range || '',
        avgPlay,
        avgLikes,
        liveCount,
        liveAvg,
        livePeak,
        mapped.live_sales_range || '',
        mapped.conversion_rate || '',
        mapped.uv_value || '',
        scores.score_total,
        scores.score_audience,
        scores.score_influence,
        scores.score_commerce,
        scores.score_content,
        scores.score_cost,
        JSON.stringify(scores.score_detail),
      ]);

      total++;
      if (scores.score_total >= 70) qualified++;
    }

    logger.info(`[Influencer] 批次${batchId} 导入完成: 共${total}条, 合格${qualified}条(>=70分)`);

    res.json({
      code: 0,
      data: { batch_id: batchId, total, qualified },
      msg: `导入成功 ${total} 条, 其中 ${qualified} 条达人评分>=70分`
    });

  } catch (e) {
    logger.error('[Influencer] /upload 错误', { error: e.message, stack: e.stack });
    res.json({ code: 500, msg: '上传处理失败: ' + e.message });
  } finally {
    // 清理临时文件
    if (filePath) {
      try { fs.unlinkSync(filePath); } catch (_) {}
    }
  }
});

// ===================== GET /list — 达人列表(带筛选) =====================
router.get('/list', auth(), async (req, res) => {
  try {
    const {
      batch_id,
      min_score = 70,
      page = 1,
      page_size = 30,
      sort_by = 'score_total',
      sort_order = 'desc',
      keyword,
      industry,
    } = req.query;

    let where = "WHERE 1=1 AND i.nickname NOT LIKE '%旗舰店%'";
    const params = [];

    if (batch_id) {
      where += ' AND i.batch_id = ?';
      params.push(batch_id);
    }

    if (min_score !== undefined && min_score !== '') {
      where += ' AND i.score_total >= ?';
      params.push(Number(min_score));
    }

    if (keyword) {
      where += ' AND (i.nickname LIKE ? OR i.douyin_id LIKE ? OR i.intro LIKE ?)';
      const kw = `%${keyword}%`;
      params.push(kw, kw, kw);
    }

    if (industry) {
      where += ' AND i.industry LIKE ?';
      params.push(`%${industry}%`);
    }

    // 排序
    const allowedSorts = ['score_total', 'fans_count', 'daren_index', 'avg_play', 'score_audience', 'score_influence', 'score_commerce', 'score_content', 'score_cost', 'created_at', 'promo_cost', 'promo_pay_amount', 'promo_roi'];
    const orderBy = allowedSorts.includes(sort_by) ? sort_by : 'score_total';
    const order = sort_order === 'asc' ? 'ASC' : 'DESC';

    const offset = (Number(page) - 1) * Number(page_size);

    const [[{ total }]] = await db.query(
      `SELECT COUNT(*) AS total FROM qc_influencers i ${where}`, params
    );

    // LEFT JOIN 推广数据汇总（近30天）
    const promoJoin = `LEFT JOIN (
      SELECT aweme_id,
        SUM(cost) AS promo_cost,
        SUM(pay_amount) AS promo_pay_amount,
        SUM(convert_count) AS promo_convert_count,
        CASE WHEN SUM(convert_count) > 0 THEN ROUND(SUM(cost) / SUM(convert_count), 2) ELSE 0 END AS promo_convert_cost,
        SUM(show_count) AS promo_show_count,
        SUM(click_count) AS promo_click_count,
        CASE WHEN SUM(show_count) > 0 THEN ROUND(SUM(click_count) / SUM(show_count) * 100, 2) ELSE 0 END AS promo_ctr,
        CASE WHEN SUM(cost) > 0 THEN ROUND(SUM(pay_amount) / SUM(cost), 2) ELSE 0 END AS promo_roi
      FROM qc_influencer_promotion_stats
      WHERE stat_date >= DATE_SUB(CURDATE(), INTERVAL 30 DAY)
      GROUP BY aweme_id
    ) p ON i.aweme_id_link = p.aweme_id`;

    const [rows] = await db.query(
      `SELECT i.*, COALESCE(p.promo_cost, 0) AS promo_cost, COALESCE(p.promo_pay_amount, 0) AS promo_pay_amount,
        COALESCE(p.promo_convert_count, 0) AS promo_convert_count, COALESCE(p.promo_convert_cost, 0) AS promo_convert_cost,
        COALESCE(p.promo_show_count, 0) AS promo_show_count, COALESCE(p.promo_click_count, 0) AS promo_click_count,
        COALESCE(p.promo_ctr, 0) AS promo_ctr, COALESCE(p.promo_roi, 0) AS promo_roi
       FROM qc_influencers i ${promoJoin} ${where.replace(/WHERE/g, 'WHERE')} ORDER BY ${orderBy} ${order} LIMIT ? OFFSET ?`,
      [...params, Number(page_size), offset]
    );

    // 解析score_detail JSON
    for (const row of rows) {
      if (row.score_detail && typeof row.score_detail === 'string') {
        try { row.score_detail = JSON.parse(row.score_detail); } catch (_) {}
      }
    }

    res.json({
      code: 0,
      data: {
        list: rows,
        total,
        page: Number(page),
        page_size: Number(page_size),
      }
    });
  } catch (e) {
    logger.error('[Influencer] /list 错误', { error: e.message });
    res.json({ code: 500, msg: e.message });
  }
});

// ===================== GET /batches — 获取导入批次列表 =====================
router.get('/batches', auth(), async (req, res) => {
  try {
    const [rows] = await db.query(`
      SELECT
        batch_id,
        COUNT(*) AS total,
        SUM(CASE WHEN score_total >= 70 THEN 1 ELSE 0 END) AS qualified,
        AVG(score_total) AS avg_score,
        MAX(score_total) AS max_score,
        MIN(score_total) AS min_score,
        MIN(created_at) AS created_at
      FROM qc_influencers
      GROUP BY batch_id
      ORDER BY batch_id DESC
    `);

    for (const row of rows) {
      row.avg_score = row.avg_score ? +Number(row.avg_score).toFixed(1) : 0;
      row.qualified = Number(row.qualified) || 0;
    }

    res.json({ code: 0, data: rows });
  } catch (e) {
    logger.error('[Influencer] /batches 错误', { error: e.message });
    res.json({ code: 500, msg: e.message });
  }
});

// ===================== GET /audience-profile — 获取产品人群画像 =====================
router.get('/audience-profile', auth(), async (req, res) => {
  try {
    const today = dayjs().format('YYYY-MM-DD');
    const thirtyDaysAgo = dayjs().subtract(30, 'day').format('YYYY-MM-DD');

    const [cached] = await db.query(`
      SELECT dimension, dimension_key,
        SUM(pay_order_count) AS pay_order_count
      FROM qc_audience_stats
      WHERE stat_date BETWEEN ? AND ?
      GROUP BY dimension, dimension_key
    `, [thirtyDaysAgo, today]);

    const grouped = {};
    for (const row of cached) {
      if (!grouped[row.dimension]) grouped[row.dimension] = [];
      grouped[row.dimension].push({ key: row.dimension_key, count: Number(row.pay_order_count) });
    }

    const calcPct = (items) => {
      const total = items.reduce((s, v) => s + v.count, 0) || 1;
      return items.map(d => ({ ...d, pct: +(d.count / total * 100).toFixed(1) })).sort((a, b) => b.count - a.count);
    };

    // 评分说明
    const scoringRules = {
      dimensions: [
        { name: '人群匹配度', weight: 20, desc: '达人行业、视频标签、直播标签与护肤品类的匹配程度' },
        { name: '影响力', weight: 20, desc: '粉丝数、达人指数、播粉比、粉丝增长' },
        { name: '带货能力', weight: 20, desc: '销售额、转化率、UV价值、直播带货' },
        { name: '内容质量', weight: 20, desc: '平均播放、平均点赞、赞播比、作品数' },
        { name: '性价比', weight: 20, desc: '中腰部优先、粉丝增长、活跃度、护肤标签' },
      ],
      qualifyThreshold: 70,
      productCategory: '洁面/护肤品',
    };

    res.json({
      code: 0,
      data: {
        gender: calcPct(grouped.gender || []),
        age: calcPct(grouped.age || []),
        region: calcPct(grouped.region || []).slice(0, 10),
        scoringRules,
      }
    });
  } catch (e) {
    logger.error('[Influencer] /audience-profile 错误', { error: e.message });
    res.json({ code: 500, msg: e.message });
  }
});

// ===================== GET /promotion-stats — 达人推广数据汇总 =====================
router.get('/promotion-stats', auth(), async (req, res) => {
  try {
    const { aweme_id, days = 30 } = req.query;
    if (!aweme_id) return res.json({ code: 400, msg: '缺少 aweme_id 参数' });

    const [rows] = await db.query(`
      SELECT
        SUM(cost) AS total_cost,
        SUM(pay_amount) AS total_pay_amount,
        SUM(convert_count) AS total_convert_count,
        CASE WHEN SUM(convert_count) > 0 THEN ROUND(SUM(cost) / SUM(convert_count), 2) ELSE 0 END AS avg_convert_cost,
        SUM(show_count) AS total_show_count,
        SUM(click_count) AS total_click_count,
        CASE WHEN SUM(show_count) > 0 THEN ROUND(SUM(click_count) / SUM(show_count) * 100, 2) ELSE 0 END AS avg_ctr,
        CASE WHEN SUM(cost) > 0 THEN ROUND(SUM(pay_amount) / SUM(cost), 2) ELSE 0 END AS avg_roi
      FROM qc_influencer_promotion_stats
      WHERE aweme_id = ? AND stat_date >= DATE_SUB(CURDATE(), INTERVAL ? DAY)
    `, [aweme_id, Number(days)]);

    // 日趋势数据
    const [daily] = await db.query(`
      SELECT stat_date, cost, pay_amount, convert_count, convert_cost, show_count, click_count, ctr, roi
      FROM qc_influencer_promotion_stats
      WHERE aweme_id = ? AND stat_date >= DATE_SUB(CURDATE(), INTERVAL ? DAY)
      ORDER BY stat_date
    `, [aweme_id, Number(days)]);

    res.json({ code: 0, data: { summary: rows[0] || {}, daily } });
  } catch (e) {
    logger.error('[Influencer] /promotion-stats 错误', { error: e.message });
    res.json({ code: 500, msg: e.message });
  }
});

// ===================== GET /promotion-ranking — 达人推广排行 =====================
router.get('/promotion-ranking', auth(), async (req, res) => {
  try {
    const { days = 30, sort_by = 'cost', page = 1, page_size = 30 } = req.query;

    const allowedSorts = { cost: 'total_cost', pay_amount: 'total_pay_amount', roi: 'avg_roi', convert_count: 'total_convert_count' };
    const orderField = allowedSorts[sort_by] || 'total_cost';
    const offset = (Number(page) - 1) * Number(page_size);

    const [[{ total }]] = await db.query(`
      SELECT COUNT(DISTINCT aweme_id) AS total
      FROM qc_influencer_promotion_stats
      WHERE stat_date >= DATE_SUB(CURDATE(), INTERVAL ? DAY)
    `, [Number(days)]);

    const [rows] = await db.query(`
      SELECT
        p.aweme_id, p.aweme_name,
        SUM(p.cost) AS total_cost,
        SUM(p.pay_amount) AS total_pay_amount,
        SUM(p.convert_count) AS total_convert_count,
        CASE WHEN SUM(p.convert_count) > 0 THEN ROUND(SUM(p.cost) / SUM(p.convert_count), 2) ELSE 0 END AS avg_convert_cost,
        SUM(p.show_count) AS total_show_count,
        SUM(p.click_count) AS total_click_count,
        CASE WHEN SUM(p.show_count) > 0 THEN ROUND(SUM(p.click_count) / SUM(p.show_count) * 100, 2) ELSE 0 END AS avg_ctr,
        CASE WHEN SUM(p.cost) > 0 THEN ROUND(SUM(p.pay_amount) / SUM(p.cost), 2) ELSE 0 END AS avg_roi,
        i.nickname, i.score_total, i.score_audience, i.score_influence, i.score_commerce, i.score_content, i.score_cost,
        i.fans_count, i.industry, i.profile_url
      FROM qc_influencer_promotion_stats p
      LEFT JOIN qc_influencers i ON i.aweme_id_link = p.aweme_id
      WHERE p.stat_date >= DATE_SUB(CURDATE(), INTERVAL ? DAY)
      GROUP BY p.aweme_id, p.aweme_name
      ORDER BY ${orderField} DESC
      LIMIT ? OFFSET ?
    `, [Number(days), Number(page_size), offset]);

    res.json({ code: 0, data: { list: rows, total, page: Number(page), page_size: Number(page_size) } });
  } catch (e) {
    logger.error('[Influencer] /promotion-ranking 错误', { error: e.message });
    res.json({ code: 500, msg: e.message });
  }
});

// ===================== GET /similar — 找相似达人 =====================
router.get('/similar', auth(), async (req, res) => {
  try {
    const { influencer_id } = req.query;
    if (!influencer_id) return res.json({ code: 400, msg: '缺少 influencer_id 参数' });

    // 获取目标达人的评分
    const [[target]] = await db.query(
      `SELECT id, nickname, score_total, score_audience, score_influence, score_commerce, score_content, score_cost FROM qc_influencers WHERE id = ?`,
      [influencer_id]
    );
    if (!target) return res.json({ code: 404, msg: '未找到该达人' });

    // 基于五维评分欧几里得距离计算相似度
    // 最大距离 = sqrt(5 * 20^2) = sqrt(2000) ≈ 44.72
    const [rows] = await db.query(`
      SELECT i.*,
        ROUND((1 - SQRT(
          POW(i.score_audience - ?, 2) + POW(i.score_influence - ?, 2) +
          POW(i.score_commerce - ?, 2) + POW(i.score_content - ?, 2) + POW(i.score_cost - ?, 2)
        ) / 44.72) * 100) AS similarity,
        COALESCE(p.promo_cost, 0) AS promo_cost,
        COALESCE(p.promo_pay_amount, 0) AS promo_pay_amount,
        COALESCE(p.promo_roi, 0) AS promo_roi
      FROM qc_influencers i
      LEFT JOIN (
        SELECT aweme_id, SUM(cost) AS promo_cost, SUM(pay_amount) AS promo_pay_amount,
          CASE WHEN SUM(cost) > 0 THEN ROUND(SUM(pay_amount) / SUM(cost), 2) ELSE 0 END AS promo_roi
        FROM qc_influencer_promotion_stats WHERE stat_date >= DATE_SUB(CURDATE(), INTERVAL 30 DAY) GROUP BY aweme_id
      ) p ON i.aweme_id_link = p.aweme_id
      WHERE i.id != ? AND i.score_total > 0
      ORDER BY similarity DESC
      LIMIT 20
    `, [target.score_audience, target.score_influence, target.score_commerce, target.score_content, target.score_cost, influencer_id]);

    // 解析score_detail
    for (const row of rows) {
      if (row.score_detail && typeof row.score_detail === 'string') {
        try { row.score_detail = JSON.parse(row.score_detail); } catch (_) {}
      }
    }

    res.json({ code: 0, data: { target, similar: rows } });
  } catch (e) {
    logger.error('[Influencer] /similar 错误', { error: e.message });
    res.json({ code: 500, msg: e.message });
  }
});

// ===================== POST /sync-promotion — 手动同步达人推广数据 =====================
router.post('/sync-promotion', auth(), async (req, res) => {
  try {
    const { start_date, end_date } = req.body || {};
    const targetDate = start_date || dayjs().subtract(1, 'day').format('YYYY-MM-DD');

    logger.info(`[Influencer] 手动触发推广数据同步: ${targetDate}`);

    // 如果指定了日期范围，逐天同步
    if (start_date && end_date) {
      let current = dayjs(start_date);
      const endDay = dayjs(end_date);
      let totalAll = 0;
      while (current.isBefore(endDay) || current.isSame(endDay)) {
        const result = await syncInfluencerPromotion(current.format('YYYY-MM-DD'));
        totalAll += result.total;
        current = current.add(1, 'day');
      }
      return res.json({ code: 0, data: { total: totalAll }, msg: `同步完成，共 ${totalAll} 条数据` });
    }

    const result = await syncInfluencerPromotion(targetDate);
    res.json({ code: 0, data: result, msg: `同步完成，共 ${result.total} 条数据` });
  } catch (e) {
    logger.error('[Influencer] /sync-promotion 错误', { error: e.message });
    res.json({ code: 500, msg: '同步失败: ' + e.message });
  }
});

module.exports = router;

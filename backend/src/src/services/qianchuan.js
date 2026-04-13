const axios = require('axios');
const logger = require('../logger');

const BASE_URL = 'https://ad.oceanengine.com/open_api';

// 全域推广报表指标（SITE_PROMOTION_PRODUCT_AD data_topic）
const UNI_METRICS = [
  'stat_cost',
  'total_pay_order_count_for_roi2',
  'total_pay_order_gmv_for_roi2',
  'total_pay_order_gmv_include_coupon_for_roi2',
  'total_cost_per_pay_order_for_roi2',
  'total_prepay_and_pay_order_roi2'
];

// 全域推广-视频素材维度指标
const VIDEO_MATERIAL_METRICS = [
  'stat_cost_for_roi2',
  'product_show_count_for_roi2',
  'product_click_count_for_roi2',
  'product_cvr_rate_for_roi2',
  'product_convert_rate_for_roi2',
  'total_pay_order_count_for_roi2',
  'total_pay_order_gmv_for_roi2',
  'total_cost_per_pay_order_for_roi2',
  'total_prepay_and_pay_order_roi2',
  'total_pay_order_gmv_include_coupon_for_roi2',
  'video_play_count_for_roi2_v2',
  'video_play_finish_rate_for_roi2_v2'
];


// 直播全域推广-视频素材维度指标 (SITE_PROMOTION_POST_DATA_VIDEO)
const LIVE_VIDEO_MATERIAL_METRICS = [
  'stat_cost_for_roi2',
  'live_show_count_for_roi2_v2',
  'live_watch_count_for_roi2_v2',
  'live_cvr_rate_for_roi2_v2',
  'live_convert_rate_for_roi2_v2',
  'total_pay_order_count_for_roi2',
  'total_pay_order_gmv_for_roi2',
  'total_cost_per_pay_order_for_roi2',
  'total_prepay_and_pay_order_roi2',
  'total_pay_order_gmv_include_coupon_for_roi2',
  'video_play_count_for_roi2_v2',
  'video_play_finish_rate_for_roi2_v2'
];

class QianChuanAPI {
  constructor(accessToken) {
    this.accessToken = accessToken;
    this.client = axios.create({
      baseURL: BASE_URL,
      timeout: 30000,
      headers: { 'Access-Token': accessToken, 'Content-Type': 'application/json' }
    });
    this.client.interceptors.response.use(
      res => res.data,
      err => {
        logger.error('[QC API] 请求失败', { url: err.config?.url, msg: err.message });
        throw err;
      }
    );
  }

  async _getQS(path, params) {
    const qs = Object.entries(params)
      .map(([k, v]) => encodeURIComponent(k) + '=' + encodeURIComponent(String(v)))
      .join('&');
    return this.client.get(path + '?' + qs);
  }

  async getAdvertiserInfo(advertiserIds) {
    return this.client.get('/2/advertiser/info/', {
      params: { advertiser_ids: JSON.stringify(advertiserIds) }
    });
  }

  async getUniPromotionReport({ advertiserId, startDate, endDate, page = 1, pageSize = 100 }) {
    const startTime = startDate + ' 00:00:00';
    const endTime = endDate + ' 23:59:59';
    const validPS = [10, 20, 50, 100, 200];
    const ps = validPS.includes(pageSize) ? pageSize : 100;
    try {
      const res = await this._getQS('/v1.0/qianchuan/report/uni_promotion/data/get/', {
        advertiser_id: parseInt(advertiserId),
        start_time: startTime,
        end_time: endTime,
        data_topic: 'SITE_PROMOTION_PRODUCT_AD',
        dimensions: JSON.stringify(['stat_time_day', 'ad_id']),
        metrics: JSON.stringify(UNI_METRICS),
        filters: JSON.stringify([]),
        order_by: JSON.stringify([{ field: 'stat_cost', type: 0 }]),
        page: String(page),
        page_size: String(ps)
      });
      if (res.code === 0 && res.data) return res;
      logger.warn('[QC] getUniPromotionReport error', { code: res.code, msg: res.message });
      return { code: res.code, data: { rows: [], page_info: { total_number: 0 } } };
    } catch (e) {
      logger.warn('[QC] getUniPromotionReport failed', { error: e.message });
      return { code: -1, data: { rows: [], page_info: { total_number: 0 } } };
    }
  }

  async getUniPromotionDailySummary({ advertiserId, startDate, endDate }) {
    const startTime = startDate + ' 00:00:00';
    const endTime = endDate + ' 23:59:59';
    try {
      const res = await this._getQS('/v1.0/qianchuan/report/uni_promotion/data/get/', {
        advertiser_id: parseInt(advertiserId),
        start_time: startTime,
        end_time: endTime,
        data_topic: 'SITE_PROMOTION_PRODUCT_AD',
        dimensions: JSON.stringify(['stat_time_day']),
        metrics: JSON.stringify(UNI_METRICS),
        filters: JSON.stringify([]),
        order_by: JSON.stringify([{ field: 'stat_cost', type: 0 }]),
        page: '1',
        page_size: '200'
      });
      if (res.code === 0 && res.data) return res;
      return { code: res.code, data: { rows: [] } };
    } catch (e) {
      return { code: -1, data: { rows: [] } };
    }
  }

  /**
   * 全域推广 - 视频素材维度报表
   * data_topic: SITE_PROMOTION_PRODUCT_POST_DATA_VIDEO
   * 必填维度: material_id, roi2_material_video_name
   * 可用指标: total_pay_order_count_for_roi2, total_pay_order_gmv_for_roi2,
   *           total_cost_per_pay_order_for_roi2, total_prepay_and_pay_order_roi2,
   *           total_pay_order_gmv_include_coupon_for_roi2
   */
  async getVideoMaterialReport({ advertiserId, startDate, endDate, page = 1, pageSize = 100 }) {
    const startTime = startDate + ' 00:00:00';
    const endTime = endDate + ' 23:59:59';
    const validPS = [10, 20, 50, 100, 200];
    const ps = validPS.includes(pageSize) ? pageSize : 100;
    try {
      const res = await this._getQS('/v1.0/qianchuan/report/uni_promotion/data/get/', {
        advertiser_id: parseInt(advertiserId),
        start_time: startTime,
        end_time: endTime,
        data_topic: 'SITE_PROMOTION_PRODUCT_POST_DATA_VIDEO',
        dimensions: JSON.stringify(['material_id', 'roi2_material_video_name']),
        metrics: JSON.stringify(VIDEO_MATERIAL_METRICS),
        filters: JSON.stringify([]),
        order_by: JSON.stringify([{ field: 'stat_cost_for_roi2', type: 0 }]),
        page: String(page),
        page_size: String(ps)
      });
      if (res.code === 0 && res.data) return res;
      logger.warn('[QC] getVideoMaterialReport error', { code: res.code, msg: res.message });
      return { code: res.code, data: { rows: [], page_info: { total_number: 0 } } };
    } catch (e) {
      logger.warn('[QC] getVideoMaterialReport failed', { error: e.message });
      return { code: -1, data: { rows: [], page_info: { total_number: 0 } } };
    }
  }


  /**
   * 获取授权抖音号列表
   */
  async getAuthorizedAweme(advertiserId) {
    try {
      const res = await this._getQS('/v1.0/qianchuan/aweme/authorized/get/', {
        advertiser_id: parseInt(advertiserId),
        page: '1',
        page_size: '50'
      });
      if (res.code === 0 && res.data && res.data.aweme_id_list) {
        return res.data.aweme_id_list;
      }
      return [];
    } catch (e) {
      logger.warn('[QC] getAuthorizedAweme failed', { error: e.message });
      return [];
    }
  }

  /**
   * 直播全域推广 - 视频素材维度报表
   * data_topic: SITE_PROMOTION_POST_DATA_VIDEO
   * 必填维度: material_id, roi2_material_video_name, roi2_material_video_type
   * 必填筛选: anchor_id, aggregate_smart_bid_type, ecp_app_id
   */
  async getLiveVideoMaterialReport({ advertiserId, startDate, endDate, anchorId, smartBidType = '0', ecpAppId = '1', page = 1, pageSize = 100 }) {
    const startTime = startDate + ' 00:00:00';
    const endTime = endDate + ' 23:59:59';
    const validPS = [10, 20, 50, 100, 200];
    const ps = validPS.includes(pageSize) ? pageSize : 100;
    try {
      const res = await this._getQS('/v1.0/qianchuan/report/uni_promotion/data/get/', {
        advertiser_id: parseInt(advertiserId),
        start_time: startTime,
        end_time: endTime,
        data_topic: 'SITE_PROMOTION_POST_DATA_VIDEO',
        dimensions: JSON.stringify(['material_id', 'roi2_material_video_type', 'roi2_material_video_name']),
        metrics: JSON.stringify(LIVE_VIDEO_MATERIAL_METRICS),
        filters: JSON.stringify([
          { field: 'aggregate_smart_bid_type', operator: 7, values: [smartBidType] },
          { field: 'anchor_id', operator: 7, values: [String(anchorId)] },
          { field: 'ecp_app_id', operator: 7, values: [ecpAppId] }
        ]),
        order_by: JSON.stringify([{ field: 'stat_cost_for_roi2', type: 0 }]),
        page: String(page),
        page_size: String(ps)
      });
      if (res.code === 0 && res.data) return res;
      logger.warn('[QC] getLiveVideoMaterialReport error', { code: res.code, msg: res.message, anchorId });
      return { code: res.code, data: { rows: [], page_info: { total_number: 0 } } };
    } catch (e) {
      logger.warn('[QC] getLiveVideoMaterialReport failed', { error: e.message });
      return { code: -1, data: { rows: [], page_info: { total_number: 0 } } };
    }
  }

  async getAccountBalance(advertiserId) {
    try {
      return await this._getQS('/v1.0/qianchuan/account/balance/get/', {
        advertiser_id: String(advertiserId)
      });
    } catch (e) {
      return null;
    }
  }

  async getFinanceDetail({ advertiserId, startDate, endDate }) {
    try {
      return await this._getQS('/v1.0/qianchuan/finance/detail/get/', {
        advertiser_id: parseInt(advertiserId),
        start_date: startDate,
        end_date: endDate,
        page: '1',
        page_size: '50'
      });
    } catch (e) {
      return null;
    }
  }

  async getAdReport({ advertiserId, startDate, endDate, page = 1, pageSize = 100 }) {
    return this.getUniPromotionReport({ advertiserId, startDate, endDate, page, pageSize });
  }
  async getCreativeReport() {
    return { code: 0, data: { rows: [], list: [] } };
  }
  async getReport({ advertiserId, startDate, endDate, page = 1, pageSize = 100 }) {
    return this.getUniPromotionReport({ advertiserId, startDate, endDate, page, pageSize });
  }


  /**
   * 全域推广 - 推广列表（含直播数据）
   * 用于获取直播全域账户的推广计划级别数据
   */
  async getLivePromotionList({ advertiserId, startDate, endDate, marketingGoal = "LIVE_PROM_GOODS", page = 1, pageSize = 100 }) {
    const startTime = startDate + " 00:00:00";
    const endTime = endDate + " 23:59:59";
    const validPS = [10, 20, 50, 100, 200];
    pageSize = validPS.includes(pageSize) ? pageSize : 100;
    const fields = [
      "stat_cost",
      "total_pay_order_count_for_roi2",
      "total_pay_order_gmv_for_roi2",
      "total_pay_order_gmv_include_coupon_for_roi2",
      "total_cost_per_pay_order_for_roi2",
      "total_prepay_and_pay_order_roi2"
    ];
    try {
      const res = await this._getQS("/v1.0/qianchuan/uni_promotion/list/", {
        advertiser_id: parseInt(advertiserId),
        start_time: startTime,
        end_time: endTime,
        marketing_goal: marketingGoal,
        fields: JSON.stringify(fields),
        page: String(page),
        page_size: String(pageSize)
      });
      if (res.code === 0 && res.data) return res;
      logger.warn("[QC] getLivePromotionList error", { code: res.code, msg: res.message });
      return { code: res.code, data: { ad_list: [], page_info: { total_number: 0 } } };
    } catch (e) {
      logger.warn("[QC] getLivePromotionList failed", { error: e.message });
      return { code: -1, data: { ad_list: [], page_info: { total_number: 0 } } };
    }
  }

  static async refreshToken(appId, appSecret, refreshToken) {
    try {
      const res = await axios.post(BASE_URL + '/oauth2/refresh_token/', {
        appid: appId, secret: appSecret,
        grant_type: 'refresh_token', refresh_token: refreshToken
      }, { headers: { 'Content-Type': 'application/json' } });
      return res.data;
    } catch (e) {
      logger.error('[QC] Token 刷新失败', { error: e.message });
      throw e;
    }
  }

  /**
   * 获取视频素材详情（含封面图、播放地址）
   * 需要 /file/video/ad/get/ 授权
   */
  async getVideoDetails(advertiserId, videoIds) {
    try {
      const res = await this.client.get('/2/file/video/ad/get/', {
        params: {
          advertiser_id: parseInt(advertiserId),
          video_ids: JSON.stringify(videoIds.slice(0, 20))
        }
      });
      if (res.code === 0 && res.data && res.data.list) return res.data.list;
      logger.warn('[QC] getVideoDetails error', { code: res.code, msg: res.message });
      return [];
    } catch (e) {
      logger.warn('[QC] getVideoDetails failed', { error: e.message });
      return [];
    }
  }

  /**
   * 获取视频素材列表（含下载URL）
   * 通过 /v1.0/qianchuan/video/get/ 接口
   * @param {string} advertiserId
   * @param {string[]} materialIds - 需要获取的material_id列表
   * @returns {Array} [{material_id, url, poster_url, ...}]
   */
  async getVideoList(advertiserId, materialIds, maxVideos = 10) {
    const axios = require('axios');
    const results = [];
    let page = 1;

    while (page <= 5 && results.length < maxVideos) {
      try {
        const res = await axios.get('https://ad.oceanengine.com/open_api/v1.0/qianchuan/video/get/', {
          params: { advertiser_id: parseInt(advertiserId), page, page_size: 20 },
          headers: { 'Access-Token': this.accessToken },
          transformResponse: [data => data],
          timeout: 30000
        });

        const rawJson = res.data;
        const parsed = JSON.parse(rawJson);
        if (parsed.code !== 0 || !parsed.data || !parsed.data.list) break;

        const list = parsed.data.list;
        const midMatches = rawJson.match(/material_id:\s*(\d+)/g) || [];

        for (let i = 0; i < list.length; i++) {
          const url = list[i].url || '';
          if (!url) continue;
          const rawMid = (i < midMatches.length) ? midMatches[i].replace(/material_id:\s*/, '') : String(i);
          results.push({
            material_id: rawMid,
            title: list[i].filename || '',
            url: url,
            poster_url: list[i].poster_url || ''
          });
          if (results.length >= maxVideos) break;
        }

        page++;
        await new Promise(r => setTimeout(r, 300));
      } catch (e) {
        logger.warn('[QC] getVideoList page ' + page + ' failed', { error: e.message });
        break;
      }
    }
    return results;
  }



  /**
   * 上传视频素材到千川账户
   * POST /2/file/video/ad/
   * Content-Type: multipart/form-data
   * @param {string} advertiserId - 广告主ID
   * @param {string} filePath - 本地视频文件路径
   * @param {string} filename - 文件名（可选）
   * @returns {object} { video_id, size, width, height, url, ... }
   */
  async uploadVideo(advertiserId, filePath, filename) {
    const fs = require('fs');
    const path = require('path');
    const crypto = require('crypto');
    const FormData = require('form-data');

    if (!fs.existsSync(filePath)) {
      throw new Error('视频文件不存在: ' + filePath);
    }

    // 计算文件 MD5 签名
    const fileBuffer = fs.readFileSync(filePath);
    const md5 = crypto.createHash('md5').update(fileBuffer).digest('hex');

    const fname = filename || path.basename(filePath);

    const form = new FormData();
    form.append('advertiser_id', String(advertiserId));
    form.append('video_signature', md5);
    form.append('filename', fname);
    form.append('video_file', fs.createReadStream(filePath), { filename: fname });

    try {
      const res = await axios.post(BASE_URL + '/2/file/video/ad/', form, {
        headers: {
          ...form.getHeaders(),
          'Access-Token': this.accessToken
        },
        timeout: 120000,
        maxContentLength: 500 * 1024 * 1024,
        maxBodyLength: 500 * 1024 * 1024
      });
      const data = res.data;
      if (data.code === 0 && data.data) {
        logger.info('[QC] uploadVideo success', { advertiserId, filename: fname, videoId: data.data.video_id });
        return data.data;
      }
      logger.warn('[QC] uploadVideo error', { code: data.code, msg: data.message });
      throw new Error(data.message || '上传失败，code=' + data.code);
    } catch (e) {
      if (e.response && e.response.data) {
        const d = e.response.data;
        logger.error('[QC] uploadVideo failed', { code: d.code, msg: d.message, advertiserId });
        throw new Error(d.message || '上传失败');
      }
      logger.error('[QC] uploadVideo failed', { error: e.message, advertiserId });
      throw e;
    }
  }

  /**
   * 获取账户视频列表（全量分页遍历）
   * 按create_time过滤出指定日期的新素材
   */
  async getVideoListByDate(advertiserId, targetDate) {
    const allVideos = [];
    let page = 1;
    const pageSize = 20;
    const maxPages = 50; // 最多遍历50页 = 1000条

    while (page <= maxPages) {
      try {
        // 用原始字符串响应，避免JSON.parse导致大数字精度丢失
        const rawRes = await axios.get(BASE_URL + '/v1.0/qianchuan/video/get/', {
          params: {
            advertiser_id: String(advertiserId),
            page: page,
            page_size: pageSize
          },
          headers: { 'Access-Token': this.accessToken },
          timeout: 30000,
          transformResponse: [data => data] // 保持原始字符串
        });

        const rawJson = rawRes.data;
        // 将16位以上的大数字转为字符串，避免JSON.parse丢失精度
        const safeJson = rawJson.replace(/:\s*(\d{16,})/g, ':"$1"');
        const parsed = JSON.parse(safeJson);
        if (parsed.code !== 0) {
          if (page === 1) logger.info(`[QC] getVideoListByDate 账户${advertiserId} API返回 code=${parsed.code}`);
          break;
        }

        const data = parsed.data || {};
        const list = data.list || data.video_list || [];
        if (!list.length) {
          if (page === 1) {
            logger.info(`[QC] getVideoListByDate 账户${advertiserId} 返回空列表, keys=${Object.keys(data).join(',')}`);
          }
          break;
        }

        // 首页记录第一条数据以便调试
        if (page === 1) {
          const sample = list[0];
          logger.info(`[QC] getVideoListByDate 账户${advertiserId} 首条视频: create_time=${sample.create_time}, id=${sample.id}, material_id=${sample.material_id}, filename=${sample.filename}, 总数=${data.page_info?.total_number || '?'}`);
        }

        for (const v of list) {
          // 兼容多种 create_time 格式
          let createDate = '';
          const ct = v.create_time || v.create_date || '';
          if (typeof ct === 'number') {
            createDate = new Date(ct * 1000).toISOString().slice(0, 10);
          } else if (typeof ct === 'string' && ct.length >= 10) {
            createDate = ct.slice(0, 10);
          }

          if (createDate === targetDate) {
            // id和material_id都已经是精确的字符串（通过safeJson替换保持精度）
            const vid = String(v.id || v.video_id || v.material_id || '');
            const mid = String(v.material_id || vid);
            allVideos.push({
              video_id: vid,
              material_id: mid,
              filename: v.filename || v.video_name || '',
              duration: v.duration || 0,
              width: v.width || 0,
              height: v.height || 0,
              poster_url: v.poster_url || '',
              url: v.url || '',
              create_time: ct
            });
          }
          // 如果遍历到更早的日期，可以提前终止（列表默认按时间倒序）
          if (createDate && createDate < targetDate && page > 3) {
            return allVideos;
          }
        }

        const totalPage = Math.ceil((data.page_info?.total_number || 0) / pageSize);
        if (page >= totalPage) break;
        page++;
        await new Promise(r => setTimeout(r, 200)); // 限流
      } catch (e) {
        logger.warn('[QC] getVideoListByDate page ' + page + ' failed', { error: e.message });
        break;
      }
    }
    logger.info(`[QC] getVideoListByDate 账户${advertiserId} 日期${targetDate} 找到${allVideos.length}个视频`);
    return allVideos;
  }

  /**
   * 添加素材到全域推广计划
   * POST /v1.0/qianchuan/uni_promotion/ad/material/add/
   */
  async addMaterialToUniPromotion(advertiserId, adId, materialIds) {
    try {
      // materialIds 是精确的字符串数字（从原始JSON提取，不丢精度）
      const idsArr = materialIds.map(id => String(id).trim()).filter(Boolean);
      // 手动拼JSON，保持大数字精度（不经过parseInt）
      // video_ids 参数实际需要传 material_id 值（int64数字）
      const bodyStr = `{"advertiser_id":${String(advertiserId)},"ad_id":${String(adId)},"video_ids":[${idsArr.join(',')}]}`;
      logger.info('[QC] addMaterial request', { adId, sampleIds: idsArr.slice(0, 5), totalIds: idsArr.length, idLengths: idsArr.slice(0, 3).map(s => s.length), bodyPreview: bodyStr.slice(0, 300) });

      const res = await axios.post(BASE_URL + '/v1.0/qianchuan/uni_promotion/ad/material/add/', bodyStr, {
        headers: {
          'Access-Token': this.accessToken,
          'Content-Type': 'application/json'
        },
        timeout: 30000,
        transformResponse: [data => data] // 保留原始响应字符串
      });

      let data;
      try { data = JSON.parse(res.data); } catch { data = { code: -2, message: 'JSON parse error' }; }

      // 记录完整响应以便调试
      logger.info('[QC] addMaterial response', { code: data.code, msg: data.message, body: String(res.data).slice(0, 500) });

      if (data.code === 0) {
        return { code: 0, data: data.data };
      }
      logger.warn('[QC] addMaterialToUniPromotion error', { code: data.code, msg: data.message, advertiserId, adId });
      return { code: data.code, msg: data.message };
    } catch (e) {
      logger.error('[QC] addMaterialToUniPromotion failed', { error: e.message, advertiserId, adId });
      return { code: -1, msg: e.message };
    }
  }

  /**
   * 获取全域推广计划下的素材列表（含投放数据）
   * GET /v1.0/qianchuan/uni_promotion/ad/material/get/
   * @param {string} advertiserId - 广告主ID
   * @param {string} adId - 计划ID
   * @returns {Array} 素材列表，每个素材包含 material_id, video_name, stats 等
   */
  async getMaterialsInPlan(advertiserId, adId) {
    const allMaterials = [];
    let page = 1;
    const pageSize = 100;
    const maxPages = 20;

    while (page <= maxPages) {
      try {
        // 用原始字符串响应避免大数字丢精度
        const qs = new URLSearchParams({
          advertiser_id: String(advertiserId),
          ad_id: String(adId),
          filtering: JSON.stringify({
            material_type: 'VIDEO',
            material_status: 'DELIVERY_OK'
          }),
          fields: JSON.stringify([
            'stat_cost_for_roi2',
            'total_prepay_and_pay_order_roi2',
            'total_pay_order_count_for_roi2'
          ]),
          page: String(page),
          page_size: String(pageSize)
        });

        const rawRes = await axios.get(BASE_URL + '/v1.0/qianchuan/uni_promotion/ad/material/get/?' + qs.toString(), {
          headers: { 'Access-Token': this.accessToken },
          timeout: 30000,
          transformResponse: [data => data]
        });

        const rawJson = rawRes.data;

        // 从原始JSON提取精确的 material_id
        const materialIdMap = {};
        let midIdx = 0;
        for (const m of rawJson.matchAll(/"material_id"\s*:\s*(\d+)/g)) {
          materialIdMap[midIdx] = m[1];
          midIdx++;
        }

        const parsed = JSON.parse(rawJson);
        if (parsed.code !== 0 || !parsed.data) {
          logger.warn('[QC] getMaterialsInPlan error', { code: parsed.code, msg: parsed.message, advertiserId, adId });
          break;
        }

        const list = parsed.data.materials || parsed.data.list || [];
        if (!list.length) break;

        for (let i = 0; i < list.length; i++) {
          const item = list[i];
          const dims = item.dimensions || item;
          const mets = item.metrics || item.stat || item;

          const parseVal = (v) => {
            if (v === null || v === undefined) return 0;
            if (typeof v === 'object' && v.Value !== undefined) return v.Value;
            if (typeof v === 'object' && v.ValueStr !== undefined) return v.ValueStr;
            return v;
          };

          // 优先用从原始JSON提取的精确material_id
          const exactMid = materialIdMap[i] || String(parseVal(dims.material_id) || item.material_id || '');

          allMaterials.push({
            material_id: exactMid,
            video_name: String(parseVal(dims.roi2_material_video_name) || item.video_name || item.filename || ''),
            video_id: String(parseVal(dims.video_id) || item.video_id || ''),
            cost: parseFloat(parseVal(mets.stat_cost_for_roi2) || 0),
            roi: parseFloat(parseVal(mets.total_prepay_and_pay_order_roi2) || 0),
            orders: parseInt(parseVal(mets.total_pay_order_count_for_roi2) || 0),
            show_count: parseInt(parseVal(mets.show_count) || parseVal(mets.product_show_count_for_roi2) || 0),
            click_count: parseInt(parseVal(mets.click_count) || parseVal(mets.product_click_count_for_roi2) || 0),
            raw: item
          });
        }

        const totalNum = parsed.data.page_info?.total_number || parsed.data.page_info?.total_num || 0;
        if (page * pageSize >= totalNum) break;
        page++;
        await new Promise(r => setTimeout(r, 200));
      } catch (e) {
        logger.warn('[QC] getMaterialsInPlan page ' + page + ' failed', { error: e.message, advertiserId, adId });
        break;
      }
    }

    return allMaterials;
  }

  /**
   * 删除全域推广计划下的素材
   * POST /v1.0/qianchuan/uni_promotion/ad/material/delete/
   * @param {string} advertiserId - 广告主ID
   * @param {string} adId - 计划ID
   * @param {string[]} materialIds - 要删除的素材ID列表
   * @returns {object} { code, data, msg }
   */
  async deleteMaterialFromPlan(advertiserId, adId, materialIds) {
    try {
      // 手动拼JSON保持大数字精度
      const idsArr = materialIds.map(id => String(id).trim()).filter(Boolean);
      const bodyStr = `{"advertiser_id":${String(advertiserId)},"ad_id":${String(adId)},"material_ids":[${idsArr.join(',')}]}`;

      const res = await axios.post(BASE_URL + '/v1.0/qianchuan/uni_promotion/ad/material/delete/', bodyStr, {
        headers: {
          'Access-Token': this.accessToken,
          'Content-Type': 'application/json'
        },
        timeout: 30000,
        transformResponse: [data => data]
      });
      let data;
      try { data = JSON.parse(res.data); } catch { data = { code: -2, message: 'JSON parse error' }; }
      if (data.code === 0) {
        logger.info('[QC] deleteMaterialFromPlan success', { advertiserId, adId, count: idsArr.length });
        return { code: 0, data: data.data };
      }
      logger.warn('[QC] deleteMaterialFromPlan error', { code: data.code, msg: data.message, advertiserId, adId });
      return { code: data.code, msg: data.message };
    } catch (e) {
      logger.error('[QC] deleteMaterialFromPlan failed', { error: e.message, advertiserId, adId });
      return { code: -1, msg: e.message };
    }
  }


  // ========== AI金牌投手 - 新增API ==========

  // 获取全域推广计划列表（含预算/出价/状态）
  async getUniPromotionAdList({ advertiserId, marketingGoal = 'LIVE_PROM_GOODS', page = 1, pageSize = 100 }) {
    const validPS = [10, 20, 50, 100, 200];
    pageSize = validPS.includes(pageSize) ? pageSize : 100;
    try {
      const fields = [
        'stat_cost', 'total_pay_order_count_for_roi2', 'total_pay_order_gmv_for_roi2',
        'total_pay_order_gmv_include_coupon_for_roi2', 'total_cost_per_pay_order_for_roi2',
        'total_prepay_and_pay_order_roi2'
      ];
      const today = new Date().toISOString().slice(0, 10);
      const res = await this._getQS('/v1.0/qianchuan/uni_promotion/list/', {
        advertiser_id: parseInt(advertiserId),
        start_time: today + ' 00:00:00',
        end_time: today + ' 23:59:59',
        marketing_goal: marketingGoal,
        fields: JSON.stringify(fields),
        page: String(page),
        page_size: String(pageSize)
      });
      if (res.code === 0 && res.data) return res;
      logger.warn('[QC] getUniPromotionAdList error', { code: res.code, msg: res.message });
      return { code: res.code, data: { ad_list: [], page_info: { total_number: 0 } } };
    } catch (e) {
      logger.error('[QC] getUniPromotionAdList failed', { error: e.message });
      return { code: -1, data: { ad_list: [], page_info: { total_number: 0 } } };
    }
  }


  // 修改全域推广计划目标ROI（全域推广的核心调控参数）
  // 正确接口: /v1.0/qianchuan/uni_promotion/ad/roi2_goal/update/
  async updateUniPromotionRoiGoal(advertiserId, adId, roiGoal) {
    try {
      const res = await axios.post(BASE_URL + '/v1.0/qianchuan/uni_promotion/ad/roi2_goal/update/', {
        advertiser_id: parseInt(advertiserId),
        update_roi2_infos: [{
          ad_id: parseInt(adId),
          roi2_goal: parseFloat(roiGoal.toFixed(2))
        }]
      }, {
        headers: { 'Access-Token': this.accessToken, 'Content-Type': 'application/json' },
        timeout: 30000
      });
      const data = res.data;
      if (data.code === 0) {
        logger.info('[QC] updateRoiGoal success', { advertiserId, adId, roiGoal });
        return { code: 0 };
      }
      logger.warn('[QC] updateRoiGoal error', { code: data.code, msg: data.message, advertiserId, adId, roiGoal });
      return { code: data.code, msg: data.message };
    } catch (e) {
      logger.error('[QC] updateRoiGoal failed', { error: e.message, advertiserId, adId });
      return { code: -1, msg: e.message };
    }
  }

  // 修改全域推广计划预算
  // 正确接口: /v1.0/qianchuan/uni_aweme/ad/update/
  async updateAdBudget(advertiserId, adId, budget) {
    try {
      const res = await axios.post(BASE_URL + '/v1.0/qianchuan/uni_aweme/ad/update/', {
        advertiser_id: parseInt(advertiserId),
        ad_id: parseInt(adId),
        budget: parseFloat(budget.toFixed(2))
      }, {
        headers: { 'Access-Token': this.accessToken, 'Content-Type': 'application/json' },
        timeout: 30000
      });
      const data = res.data;
      if (data.code === 0) {
        logger.info('[QC] updateAdBudget success', { advertiserId, adId, budget });
        return { code: 0 };
      }
      logger.warn('[QC] updateAdBudget error', { code: data.code, msg: data.message });
      return { code: data.code, msg: data.message };
    } catch (e) {
      logger.error('[QC] updateAdBudget failed', { error: e.message });
      return { code: -1, msg: e.message };
    }
  }

  // 修改全域推广计划出价
  // 正确接口: /v1.0/qianchuan/uni_aweme/ad/update/
  async updateAdBid(advertiserId, adId, bid) {
    try {
      const res = await axios.post(BASE_URL + '/v1.0/qianchuan/uni_aweme/ad/update/', {
        advertiser_id: parseInt(advertiserId),
        ad_id: parseInt(adId),
        cpa_bid: parseFloat(bid.toFixed(2))
      }, {
        headers: { 'Access-Token': this.accessToken, 'Content-Type': 'application/json' },
        timeout: 30000
      });
      const data = res.data;
      if (data.code === 0) {
        logger.info('[QC] updateAdBid success', { advertiserId, adId, bid });
        return { code: 0 };
      }
      logger.warn('[QC] updateAdBid error', { code: data.code, msg: data.message });
      return { code: data.code, msg: data.message };
    } catch (e) {
      logger.error('[QC] updateAdBid failed', { error: e.message });
      return { code: -1, msg: e.message };
    }
  }

  // ===== 全域推广 - 智能调控（一键调速） =====

  /**
   * 创建智能调控任务（开启一键调速）
   * @param {string} advertiserId
   * @param {string|number} adId - 计划ID
   * @param {number} budget - 调速预算（元）
   * @param {number} [duration] - 调速时长（小时，0.5~24）
   */
  async createSmartControl(advertiserId, adId, budget, duration) {
    try {
      const body = {
        advertiser_id: parseInt(advertiserId),
        ad_id: parseInt(adId),
        budget: parseFloat(budget)
      };
      if (duration) body.duration = parseFloat(duration);
      const res = await axios.post(BASE_URL + '/v1.0/qianchuan/uni_promotion/ad/control_task/smart_control/create/', body, {
        headers: { 'Access-Token': this.accessToken, 'Content-Type': 'application/json' },
        timeout: 30000
      });
      const data = res.data;
      if (data.code === 0) {
        logger.info('[QC] createSmartControl success', { advertiserId, adId, budget, duration, taskId: data.data?.task_id });
        return { code: 0, data: data.data };
      }
      logger.warn('[QC] createSmartControl error', { code: data.code, msg: data.message });
      return { code: data.code, msg: data.message };
    } catch (e) {
      logger.error('[QC] createSmartControl failed', { error: e.message });
      return { code: -1, msg: e.message };
    }
  }

  /**
   * 关闭智能调控（停止一键调速）
   */
  async disableSmartControl(advertiserId, adId) {
    try {
      const res = await axios.post(BASE_URL + '/v1.0/qianchuan/uni_promotion/ad/control_task/smart_control/status/update/', {
        advertiser_id: parseInt(advertiserId),
        ad_id: parseInt(adId),
        opt_type: 'DISABLE'
      }, {
        headers: { 'Access-Token': this.accessToken, 'Content-Type': 'application/json' },
        timeout: 30000
      });
      const data = res.data;
      if (data.code === 0) {
        logger.info('[QC] disableSmartControl success', { advertiserId, adId });
        return { code: 0 };
      }
      logger.warn('[QC] disableSmartControl error', { code: data.code, msg: data.message });
      return { code: data.code, msg: data.message };
    } catch (e) {
      logger.error('[QC] disableSmartControl failed', { error: e.message });
      return { code: -1, msg: e.message };
    }
  }


  // ===== 通用工具 - 一键起量（商品全域/直播全域均支持） =====

  /**
   * 开启一键起量
   * @param {string} advertiserId
   * @param {string|number} adId - 计划ID
   * @param {number} budget - 起量预算（元）
   */
  /**
   * 全域推广 - 创建一键起量任务（商品全域+直播全域通用）
   * @param {string} advertiserId
   * @param {string|number} adId - 计划ID
   * @param {number} budget - 起量预算（元）
   * @param {number} [duration=6] - 起量时长（小时）
   * @param {string} [name='自动起量'] - 任务名称
   */
  async createBoostTask(advertiserId, adId, budget, duration = 6, name = '自动起量') {
    try {
      const body = {
        advertiser_id: parseInt(advertiserId),
        ad_id: parseInt(adId),
        budget: parseFloat(budget),
        scene: 'SMART_BOOST',
        name,
        duration: parseFloat(duration)
      };
      const res = await axios.post(BASE_URL + '/v1.0/qianchuan/uni_promotion/ad/control_task/create/', body, {
        headers: { 'Access-Token': this.accessToken, 'Content-Type': 'application/json' },
        timeout: 30000
      });
      const data = res.data;
      if (data.code === 0) {
        logger.info('[QC] createBoostTask success', { advertiserId, adId, budget, duration, taskId: data.data?.id });
        return { code: 0, data: data.data };
      }
      logger.warn('[QC] createBoostTask error', { code: data.code, msg: data.message });
      return { code: data.code, msg: data.message };
    } catch (e) {
      logger.error('[QC] createBoostTask failed', { error: e.message });
      return { code: -1, msg: e.message };
    }
  }

  /**
   * 全域推广 - 停止起量任务
   * @param {string} advertiserId
   * @param {number} taskId - 任务ID（createBoostTask返回的id）
   */
  async stopBoostTask(advertiserId, taskId) {
    try {
      const body = {
        advertiser_id: parseInt(advertiserId),
        task_ids: [parseInt(taskId)],
        opt_type: 'DISABLE'
      };
      const res = await axios.post(BASE_URL + '/v1.0/qianchuan/uni_promotion/ad/control_task/status/update/', body, {
        headers: { 'Access-Token': this.accessToken, 'Content-Type': 'application/json' },
        timeout: 30000
      });
      const data = res.data;
      if (data.code === 0) {
        logger.info('[QC] stopBoostTask success', { advertiserId, taskId });
        return { code: 0 };
      }
      logger.warn('[QC] stopBoostTask error', { code: data.code, msg: data.message });
      return { code: data.code, msg: data.message };
    } catch (e) {
      logger.error('[QC] stopBoostTask failed', { error: e.message });
      return { code: -1, msg: e.message };
    }
  }

  /**
   * 全域推广 - 查询起量任务列表
   * @param {string} advertiserId
   * @param {string|number} adId
   */
  async listBoostTasks(advertiserId, adId) {
    try {
      const res = await axios.get(BASE_URL + '/v1.0/qianchuan/uni_promotion/ad/control_task/list/', {
        params: { advertiser_id: parseInt(advertiserId), ad_id: parseInt(adId) },
        headers: { 'Access-Token': this.accessToken },
        timeout: 30000
      });
      const data = res.data;
      if (data.code === 0) {
        return { code: 0, data: data.data };
      }
      logger.warn('[QC] listBoostTasks error', { code: data.code, msg: data.message });
      return { code: data.code, msg: data.message };
    } catch (e) {
      logger.error('[QC] listBoostTasks failed', { error: e.message });
      return { code: -1, msg: e.message };
    }
  }

}

QianChuanAPI.UNI_METRICS = UNI_METRICS;
QianChuanAPI.VIDEO_MATERIAL_METRICS = VIDEO_MATERIAL_METRICS;
QianChuanAPI.LIVE_VIDEO_MATERIAL_METRICS = LIVE_VIDEO_MATERIAL_METRICS;
module.exports = QianChuanAPI;

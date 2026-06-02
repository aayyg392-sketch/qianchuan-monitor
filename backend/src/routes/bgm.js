// BGM 音乐库 - 上传/列表/分类/删除/流式播放
const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const { execSync } = require('child_process');
const db = require('../db');
const auth = require('../middleware/auth');

const BGM_DIR = '/home/www/qianchuan-monitor/bgm';
try { if (!fs.existsSync(BGM_DIR)) fs.mkdirSync(BGM_DIR, { recursive: true }); } catch (e) {}

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, BGM_DIR),
  filename: (req, file, cb) => {
    const ext = (path.extname(file.originalname) || '.mp3').toLowerCase();
    cb(null, 'bgm_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8) + ext);
  }
});
const upload = multer({ storage, limits: { fileSize: 200 * 1024 * 1024 } });
const VIDEO_EXTS = ['.mp4', '.mov', '.webm', '.avi', '.mkv', '.flv', '.m4v', '.ts'];

(async () => {
  try {
    await db.query(`CREATE TABLE IF NOT EXISTS bgm_library (
      id INT AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(200) NOT NULL,
      url VARCHAR(500) NOT NULL,
      category VARCHAR(50) DEFAULT '其它',
      duration FLOAT DEFAULT 0,
      file_size INT DEFAULT 0,
      uploaded_at DATETIME DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
  } catch (e) { console.error('[bgm] ensure table:', e.message); }
})();

router.get('/list', auth(), async (req, res) => {
  try {
    const { category } = req.query;
    let sql = "SELECT id, name, url, category, duration, file_size, uploaded_at FROM bgm_library";
    const params = [];
    if (category) { sql += " WHERE category=?"; params.push(category); }
    sql += " ORDER BY id DESC";
    const [rows] = await db.query(sql, params);
    res.json({ code: 0, data: rows });
  } catch (e) { res.json({ code: 500, msg: e.message }); }
});

router.get('/categories', auth(), async (req, res) => {
  try {
    const [rows] = await db.query("SELECT category, COUNT(*) AS cnt FROM bgm_library GROUP BY category ORDER BY cnt DESC");
    res.json({ code: 0, data: rows });
  } catch (e) { res.json({ code: 500, msg: e.message }); }
});

router.post('/upload', auth(), (req, res, next) => {
  // 确保目录存在（每次请求前检查）
  try { if (!fs.existsSync(BGM_DIR)) fs.mkdirSync(BGM_DIR, { recursive: true }); } catch (e) {}
  // 用回调包裹 multer，确保错误返回 JSON 而非 HTML
  upload.single('file')(req, res, (err) => {
    if (err) {
      const msg = err.code === 'LIMIT_FILE_SIZE' ? '文件超过200MB限制' : ('文件接收失败: ' + (err.message || String(err)));
      return res.json({ code: 500, msg });
    }
    next();
  });
}, async (req, res) => {
  let videoTmpPath = null;
  try {
    if (!req.file) return res.json({ code: 400, msg: '未收到文件' });
    const { name, category = '其它' } = req.body || {};

    const ext = (path.extname(req.file.filename) || '').toLowerCase();
    let finalFilename = req.file.filename;
    let finalFsPath = req.file.path;
    let extracted = false;

    // 如果是视频，提音轨为 mp3，删原视频
    if (VIDEO_EXTS.includes(ext)) {
      const mp3Filename = req.file.filename.replace(ext, '.mp3');
      const mp3Path = path.join(BGM_DIR, mp3Filename);
      try {
        execSync(`nice -n 19 taskset -c 0 ffmpeg -y -loglevel error -i ${JSON.stringify(req.file.path)} -vn -acodec libmp3lame -q:a 4 ${JSON.stringify(mp3Path)}`, { timeout: 180000 });
        if (!fs.existsSync(mp3Path) || fs.statSync(mp3Path).size < 1000) throw new Error('提音失败：输出文件异常');
        videoTmpPath = req.file.path;  // 标记待删
        finalFilename = mp3Filename;
        finalFsPath = mp3Path;
        extracted = true;
      } catch (e) {
        try { fs.unlinkSync(req.file.path); } catch (e2) {}
        try { if (fs.existsSync(mp3Path)) fs.unlinkSync(mp3Path); } catch (e2) {}
        return res.json({ code: 500, msg: '视频提取音频失败：' + e.message.slice(-200) });
      }
    }

    const fsize = fs.statSync(finalFsPath).size;
    const finalName = ((name && name.trim()) || (req.file.originalname || req.file.filename).replace(/\.[^.]+$/, '')).slice(0, 200);
    const url = '/api/bgm/file/' + finalFilename;
    let duration = 0;
    try {
      const out = execSync(`ffprobe -v error -show_entries format=duration -of csv=p=0 ${JSON.stringify(finalFsPath)}`, { encoding: 'utf-8' }).trim();
      duration = parseFloat(out) || 0;
    } catch (e) {}
    const [r] = await db.query(
      "INSERT INTO bgm_library (name, url, category, duration, file_size) VALUES (?,?,?,?,?)",
      [finalName, url, String(category || '其它').slice(0, 50), duration, fsize]
    );
    res.json({ code: 0, data: { id: r.insertId, url, name: finalName, category, duration, file_size: fsize, extracted } });
  } catch (e) {
    res.json({ code: 500, msg: e.message });
  } finally {
    // 删原视频(已成功提音)
    if (videoTmpPath) { try { fs.unlinkSync(videoTmpPath); } catch (e) {} }
  }
});

router.put('/:id', auth(), async (req, res) => {
  try {
    const { name, category } = req.body || {};
    const sets = [], params = [];
    if (name !== undefined) { sets.push('name=?'); params.push(String(name).slice(0, 200)); }
    if (category !== undefined) { sets.push('category=?'); params.push(String(category).slice(0, 50)); }
    if (!sets.length) return res.json({ code: 400, msg: '无更新字段' });
    params.push(req.params.id);
    await db.query(`UPDATE bgm_library SET ${sets.join(',')} WHERE id=?`, params);
    res.json({ code: 0, msg: '已保存' });
  } catch (e) { res.json({ code: 500, msg: e.message }); }
});

router.delete('/:id', auth(), async (req, res) => {
  try {
    const [rows] = await db.query("SELECT url FROM bgm_library WHERE id=?", [req.params.id]);
    await db.query("DELETE FROM bgm_library WHERE id=?", [req.params.id]);
    if (rows[0] && rows[0].url) {
      try { fs.unlinkSync(path.join(BGM_DIR, path.basename(rows[0].url))); } catch (e) {}
    }
    res.json({ code: 0, msg: '已删除' });
  } catch (e) { res.json({ code: 500, msg: e.message }); }
});

// 流式播放 mp3（不加auth，让 <audio> 标签能直接播）
router.get('/file/:filename', (req, res) => {
  const fp = path.join(BGM_DIR, path.basename(req.params.filename));
  if (!fs.existsSync(fp)) return res.status(404).end();
  const stat = fs.statSync(fp);
  res.setHeader('Content-Type', 'audio/mpeg');
  res.setHeader('Content-Length', stat.size);
  res.setHeader('Accept-Ranges', 'bytes');
  res.setHeader('Cache-Control', 'public, max-age=3600');
  fs.createReadStream(fp).pipe(res);
});

module.exports = router;
module.exports.BGM_DIR = BGM_DIR;

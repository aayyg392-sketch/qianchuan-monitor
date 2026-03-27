# 实施计划

## 任务一：AudienceProfile.vue 修复

### 1.1 去除账户选择
- 删除 `selectedAccount` 状态和 `loadAccounts()` 调用
- `/audience/profile` 后端改为不依赖 `advertiser_id` 参数，自动聚合所有账户数据（品牌级画像）
- 保存时也不再传 `advertiser_id`

### 1.2 日期切换按钮对齐
- `.preset-tabs` 按钮高度和字号统一，添加 `align-items: center` 确保垂直居中
- 调整 `.filter-bar` 间距使布局更紧凑整齐

## 任务二：新增「达人合作筛选」页面

### 2.1 路由 & 菜单
- `router/index.js` 添加 `/influencer-match` 路由
- `AppLayout.vue` 在达人管理下添加子菜单「达人合作筛选」
- `pageMap` 添加对应标题

### 2.2 InfluencerMatch.vue 页面设计
**功能说明**：根据产品人群画像数据，设置筛选条件，系统匹配符合条件的达人

**页面结构**：
1. **筛选条件区**（卡片）
   - 达人粉丝量范围（万）：min ~ max
   - 达人分类/行业：美妆/护肤/日用百货等（多选）
   - 合作模式：纯佣/混合/坑位费（多选）
   - 粉丝画像匹配度：性别匹配（如女性占比≥X%）、年龄匹配、地域匹配
   - 达人评级：S/A/B/C（多选）
   - 搜索按钮

2. **画像匹配参考区**（折叠卡片）
   - 自动读取当前产品人群画像数据
   - 显示：核心人群是 XX性别、XX年龄段、XX地域
   - 一键将画像作为筛选条件

3. **达人列表区**
   - 表格/卡片展示匹配达人
   - 字段：达人昵称、粉丝量、带货品类、平均GPM、合作模式、画像匹配度、操作
   - 操作：查看详情、加入合作意向单
   - 分页

4. **合作意向单**（侧边抽屉）
   - 已选达人列表
   - 导出Excel

**数据来源**：
- 初期：手动录入/导入达人数据（类似画像导入方式）
- 后期：对接巨量星图API（如有权限）或第三方达人数据平台

### 2.3 后端 API
- `GET /api/influencer/list` — 带筛选条件查询达人
- `POST /api/influencer/import` — 批量导入达人数据
- `GET /api/influencer/shortlist` — 合作意向单
- `POST /api/influencer/shortlist` — 添加/移除意向单

### 2.4 数据库表
```sql
CREATE TABLE qc_influencers (
  id INT AUTO_INCREMENT PRIMARY KEY,
  nickname VARCHAR(100),          -- 达人昵称
  douyin_id VARCHAR(50),          -- 抖音号
  avatar_url VARCHAR(500),        -- 头像
  follower_count INT DEFAULT 0,   -- 粉丝数
  category VARCHAR(100),          -- 分类（美妆/护肤等）
  cooperation_mode VARCHAR(50),   -- 合作模式
  avg_gpm DECIMAL(10,2),          -- 平均GPM
  rating CHAR(1),                 -- 评级 S/A/B/C
  gender_female_pct DECIMAL(5,2), -- 女性粉丝占比
  age_main VARCHAR(30),           -- 主要年龄段
  region_main VARCHAR(30),        -- 主要地域
  contact VARCHAR(200),           -- 联系方式
  notes TEXT,                     -- 备注
  is_shortlisted TINYINT DEFAULT 0, -- 是否在意向单
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);
```

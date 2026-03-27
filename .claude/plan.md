# 计划管理页面改版方案

## 目标
按照千川后台截图的布局，将计划管理页面改造为：
1. 顶部数据概览卡片（带趋势百分比和迷你折线图）
2. 标签页切换（按账户/全域投放分类）
3. 搜索筛选栏（搜索框 + 筛选按钮）
4. 数据表格展示计划列表（表头列 + 汇总行 + 明细行）

## 数据映射
根据 `qc_daily_stats` 表可用字段：
| 截图指标 | 对应字段 | 计算方式 |
|---------|---------|---------|
| 整体消耗 | cost | SUM(cost) |
| 整体支付ROI | - | SUM(cpm)/SUM(cost) |
| 整体成交金额 | cpm | SUM(cpm) |
| 整体成交订单数 | convert_cnt | SUM(convert_cnt) |
| 整体成交单价 | - | SUM(cpm)/SUM(convert_cnt) |
| 用户实际支付金额 | - | ≈ SUM(cpm)（无独立字段） |
| 展示量 | show_cnt | SUM(show_cnt) |
| 点击量 | click_cnt | SUM(click_cnt) |
| 点击率 | ctr | AVG(ctr) |
| 转化成本 | convert_cost | AVG(convert_cost) |

## 实现步骤

### 1. 后端 - 修改 campaigns.js API
- **GET /campaigns** 增强：
  - 支持 `date` 查询参数（默认今天）
  - 支持 `account_type` 筛选（product/live）
  - 支持 `keyword` 搜索
  - 支持分页 `page`, `page_size`
  - 返回带汇总行的数据
- **GET /campaigns/overview** 新增：
  - 今日汇总数据 + 昨日对比
  - 返回：整体消耗、ROI、成交金额、成交订单数、成交单价、展示量、点击量、点击率、转化成本、千次展示费用
  - 每项带 `value` + `change`（环比百分比）
  - 近7天趋势数据（用于迷你折线图）

### 2. 前端 - 重写 Campaigns.vue
- **数据概览区域**（2行×5列 grid）
  - 每个卡片：标签 + 数值 + 环比百分比（涨绿跌红）+ 迷你SVG折线图
- **标签页**（全部 / 商品推广 / 直播推广）
- **筛选栏**（搜索输入框 + 更多筛选按钮）
- **数据表格**：
  - 表头列：计划信息、消耗、成交金额、订单数、ROI、转化成本、点击率
  - 汇总行（第一行显示总计）
  - 明细行（每条计划）
  - 支持排序点击

### 3. 部署
- 上传后端 campaigns.js → 重启 PM2
- 上传前端 Campaigns.vue → npm run build

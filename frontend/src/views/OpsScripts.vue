<template>
  <div class="ops-scripts">
    <div class="page-header">
      <h2 class="page-title">话术库</h2>
    </div>

    <a-tabs v-model:activeKey="activeTab" class="ops-tabs">
      <!-- Tab 1: Comment Scripts -->
      <a-tab-pane key="comment" tab="评论话术">
        <div class="tab-content">
          <div class="tab-toolbar">
            <a-button type="primary" @click="openScriptModal('comment')">
              <template #icon><PlusOutlined /></template>
              添加话术
            </a-button>
            <a-button @click="openAiModal('comment')">
              <template #icon><RobotOutlined /></template>
              AI生成话术
            </a-button>
            <a-select v-model:value="commentGroupFilter" placeholder="筛选分组" allow-clear style="width: 150px" @change="loadScripts('comment')">
              <a-select-option v-for="g in commentGroups" :key="g" :value="g">{{ g }}</a-select-option>
            </a-select>
          </div>
          <a-spin :spinning="commentLoading">
            <div v-if="commentScriptsGrouped.length" class="script-groups">
              <div v-for="group in commentScriptsGrouped" :key="group.name" class="script-group">
                <div class="script-group__header">
                  <span class="script-group__name">{{ group.name }}</span>
                  <a-tag>{{ group.items.length }} 条</a-tag>
                </div>
                <div class="script-list">
                  <div v-for="script in group.items" :key="script.id" class="script-card">
                    <div class="script-card__content">{{ script.content }}</div>
                    <div class="script-card__footer">
                      <div class="script-card__tags">
                        <a-tag :color="script.type === 'positive' ? 'green' : script.type === 'question' ? 'blue' : 'default'" size="small">
                          {{ scriptTypeText(script.type) }}
                        </a-tag>
                        <span class="script-card__stat">权重: {{ script.weight }}</span>
                        <span class="script-card__stat">使用 {{ script.use_count ?? 0 }} 次 · 成功率 {{ script.success_rate != null ? script.success_rate + '%' : '-' }}</span>
                      </div>
                      <div class="script-card__actions">
                        <a-button type="link" size="small" @click="openScriptModal('comment', script)">编辑</a-button>
                        <a-button type="link" size="small" danger @click="deleteScript(script.id, 'comment')">删除</a-button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
            <a-empty v-else description="暂无评论话术" />
          </a-spin>
        </div>
      </a-tab-pane>

      <!-- Tab 2: Reply Templates -->
      <a-tab-pane key="reply" tab="回复模板">
        <div class="tab-content">
          <div class="tab-toolbar">
            <a-button type="primary" @click="openScriptModal('reply')">
              <template #icon><PlusOutlined /></template>
              添加模板
            </a-button>
            <a-button @click="openAiModal('reply')">
              <template #icon><RobotOutlined /></template>
              AI生成话术
            </a-button>
            <a-select v-model:value="replyGroupFilter" placeholder="筛选分组" allow-clear style="width: 150px" @change="loadScripts('reply')">
              <a-select-option v-for="g in replyGroups" :key="g" :value="g">{{ g }}</a-select-option>
            </a-select>
          </div>
          <a-spin :spinning="replyLoading">
            <div v-if="replyScriptsGrouped.length" class="script-groups">
              <div v-for="group in replyScriptsGrouped" :key="group.name" class="script-group">
                <div class="script-group__header">
                  <span class="script-group__name">{{ group.name }}</span>
                  <a-tag>{{ group.items.length }} 条</a-tag>
                </div>
                <div class="script-list">
                  <div v-for="script in group.items" :key="script.id" class="script-card">
                    <div class="script-card__content">{{ script.content }}</div>
                    <div class="script-card__footer">
                      <div class="script-card__tags">
                        <a-tag :color="script.type === 'positive' ? 'green' : script.type === 'question' ? 'blue' : script.type === 'negative' ? 'red' : 'default'" size="small">
                          {{ scriptTypeText(script.type) }}
                        </a-tag>
                        <span class="script-card__stat">权重: {{ script.weight }}</span>
                        <span class="script-card__stat">使用 {{ script.use_count ?? 0 }} 次 · 成功率 {{ script.success_rate != null ? script.success_rate + '%' : '-' }}</span>
                      </div>
                      <div class="script-card__actions">
                        <a-button type="link" size="small" @click="openScriptModal('reply', script)">编辑</a-button>
                        <a-button type="link" size="small" danger @click="deleteScript(script.id, 'reply')">删除</a-button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
            <a-empty v-else description="暂无回复模板" />
          </a-spin>
        </div>
      </a-tab-pane>

      <!-- Tab 3: Product Knowledge Base -->
      <a-tab-pane key="knowledge" tab="产品知识库">
        <div class="tab-content">
          <div class="knowledge-section">
            <div class="knowledge-hint">
              <InfoCircleOutlined style="color:#1677ff" />
              <span>用户画像（性别/年龄/地域/偏好）已自动从「产品人群画像」读取，以下只需配置品牌和产品信息</span>
            </div>

            <a-spin :spinning="kbLoading">
              <div class="knowledge-form">
                <div class="knowledge-group">
                  <div class="knowledge-group__title">品牌信息</div>
                  <div class="knowledge-row">
                    <label>品牌名称</label>
                    <a-input v-model:value="kb.brand_name" placeholder="如：雪玲妃" />
                  </div>
                  <div class="knowledge-row">
                    <label>品牌口号</label>
                    <a-input v-model:value="kb.brand_slogan" placeholder="如：天然植萃护肤专家" />
                  </div>
                </div>

                <div class="knowledge-group" style="background:#f6ffed;border:1px solid #b7eb8f">
                  <div class="knowledge-group__title" style="color:#52c41a">
                    用户画像（自动读取）
                  </div>
                  <div style="font-size:13px;color:#595959;line-height:1.8">
                    系统已自动从「产品人群画像」读取真实数据：<br/>
                    · 性别/年龄/地域分布<br/>
                    · 购买偏好和消费行为<br/>
                    AI回复时会自动参考这些数据，无需手动填写。
                  </div>
                  <div class="knowledge-row" style="margin-top:10px">
                    <label>补充用户痛点（可选）</label>
                    <a-textarea v-model:value="kb.audience_pain_points" :rows="2" placeholder="如：油皮出油严重、毛孔粗大、黑头多、痘痘反复、卸妆不干净" />
                  </div>
                </div>

                <div class="knowledge-group">
                  <div class="knowledge-group__title">
                    产品列表
                    <a-button type="link" size="small" @click="addProduct">
                      <template #icon><PlusOutlined /></template>
                      添加产品
                    </a-button>
                  </div>
                  <div v-for="(p, idx) in kb.products" :key="idx" class="product-card">
                    <div class="product-card__header">
                      <span class="product-card__num">产品 {{ idx + 1 }}</span>
                      <a-button type="link" size="small" danger @click="kb.products.splice(idx, 1)">删除</a-button>
                    </div>
                    <div class="knowledge-row">
                      <label>产品名称</label>
                      <a-input v-model:value="p.name" placeholder="如：雪玲妃百合洗面奶" />
                    </div>
                    <div class="knowledge-row">
                      <label>产品功效</label>
                      <a-textarea v-model:value="p.efficacy" :rows="2" placeholder="如：深层清洁、控油祛痘、收缩毛孔、温和卸妆" />
                    </div>
                    <div class="knowledge-row">
                      <label>核心卖点</label>
                      <a-textarea v-model:value="p.selling_points" :rows="2" placeholder="如：氨基酸配方、百合精华、洗卸合一、孕妇可用、60天见效" />
                    </div>
                    <div class="knowledge-row">
                      <label>价格区间</label>
                      <a-input v-model:value="p.price" placeholder="如：39.9-69.9元" />
                    </div>
                  </div>
                </div>

                <div class="knowledge-group">
                  <div class="knowledge-group__title">AI回复设置</div>
                  <div class="knowledge-row">
                    <label>回复人设</label>
                    <a-textarea v-model:value="kb.reply_personality" :rows="2" placeholder="如：你是雪玲妃品牌的贴心护肤顾问，专业但亲切，像闺蜜一样给建议" />
                  </div>
                  <div class="knowledge-row">
                    <label>回复规则</label>
                    <a-textarea v-model:value="kb.reply_rules" :rows="3" placeholder="如：1.好评要感谢并推荐搭配使用&#10;2.差评要先道歉再给解决方案&#10;3.咨询肤质问题要推荐对应产品&#10;4.不要过度营销" />
                  </div>
                </div>

                <div class="knowledge-actions">
                  <a-button type="primary" :loading="kbSaving" @click="saveKnowledge">
                    保存知识库
                  </a-button>
                  <span v-if="kbLastSaved" class="knowledge-saved-time">
                    上次保存: {{ kbLastSaved }}
                  </span>
                </div>
              </div>
            </a-spin>
          </div>
        </div>
      </a-tab-pane>
    </a-tabs>

    <!-- Blocked Words Section -->
    <div class="blocked-section">
      <div class="blocked-section__header" @click="blockedExpanded = !blockedExpanded">
        <div class="blocked-section__title-row">
          <span class="section-title">屏蔽词管理</span>
          <a-badge :count="blockedWords.length" :number-style="{ backgroundColor: '#8c8c8c' }" />
          <span class="blocked-section__toggle">
            <DownOutlined v-if="!blockedExpanded" />
            <UpOutlined v-else />
          </span>
        </div>
        <a-button v-if="blockedExpanded" type="dashed" size="small" @click.stop="showAddBlockedWord = true">
          <template #icon><PlusOutlined /></template>
          添加
        </a-button>
      </div>
      <template v-if="blockedExpanded">
        <a-spin :spinning="blockedLoading">
          <div v-if="blockedWords.length" class="blocked-tags">
            <a-tag
              v-for="word in blockedWords"
              :key="word.id"
              closable
              @close="removeBlockedWord(word.id)"
            >
              {{ word.word }}
            </a-tag>
          </div>
          <a-empty v-else description="暂无屏蔽词" :image-style="{ height: '40px' }" />
        </a-spin>

        <!-- Add Blocked Word Inline -->
        <div v-if="showAddBlockedWord" class="blocked-add-row">
          <a-input
            v-model:value="newBlockedWord"
            placeholder="输入屏蔽词，多个用逗号分隔"
            style="flex: 1"
            @pressEnter="addBlockedWords"
          />
          <a-button type="primary" size="small" @click="addBlockedWords" :loading="blockedSubmitting">添加</a-button>
          <a-button size="small" @click="showAddBlockedWord = false; newBlockedWord = ''">取消</a-button>
        </div>
      </template>
    </div>

    <!-- AI Generate Modal -->
    <a-modal
      v-model:open="showAiModal"
      title="AI生成话术"
      :width="isMobile ? '95%' : 600"
      :footer="null"
    >
      <a-form layout="vertical" style="margin-top: 16px">
        <a-form-item label="产品关键词" required>
          <a-input v-model:value="aiForm.keywords" placeholder="例如：雪玲妃 洗面奶 氨基酸" />
        </a-form-item>
        <a-form-item label="话术类型">
          <a-select v-model:value="aiForm.script_type" style="width: 100%">
            <a-select-option value="comment">评论</a-select-option>
            <a-select-option value="reply_positive">正面回复</a-select-option>
            <a-select-option value="reply_inquiry">咨询回复</a-select-option>
            <a-select-option value="reply_negative">差评回复</a-select-option>
            <a-select-option value="reply_question">问题回复</a-select-option>
          </a-select>
        </a-form-item>
        <a-form-item label="生成数量">
          <a-select v-model:value="aiForm.count" style="width: 100%">
            <a-select-option :value="3">3 条</a-select-option>
            <a-select-option :value="5">5 条</a-select-option>
            <a-select-option :value="10">10 条</a-select-option>
          </a-select>
        </a-form-item>
        <a-button type="primary" block :loading="aiGenerating" @click="generateAiScripts">AI生成</a-button>
      </a-form>

      <!-- AI Results Preview -->
      <div v-if="aiResults.length" class="ai-results">
        <div class="ai-results__title">生成结果</div>
        <div v-for="(item, idx) in aiResults" :key="idx" class="ai-result-card">
          <div class="ai-result-card__content">{{ item.content }}</div>
          <a-button type="link" size="small" @click="addAiScriptToLib(item)">添加到话术库</a-button>
        </div>
      </div>
    </a-modal>

    <!-- Script Add/Edit Modal -->
    <a-modal
      v-model:open="showScriptModal"
      :title="editingScript ? '编辑话术' : '添加话术'"
      :width="isMobile ? '95%' : 560"
      @ok="submitScript"
      :confirm-loading="scriptSubmitting"
      ok-text="保存"
      cancel-text="取消"
    >
      <a-form :model="scriptForm" layout="vertical" style="margin-top: 16px">
        <a-form-item label="分组名称" required>
          <a-select
            v-model:value="scriptForm.group_name"
            placeholder="选择或输入新分组"
            allow-clear
            mode="tags"
            :max-tag-count="1"
          >
            <a-select-option v-for="g in currentTabGroups" :key="g" :value="g">{{ g }}</a-select-option>
          </a-select>
        </a-form-item>
        <a-form-item label="类型">
          <a-select v-model:value="scriptForm.type" placeholder="选择类型">
            <a-select-option value="general">通用</a-select-option>
            <a-select-option value="positive">好评</a-select-option>
            <a-select-option value="question">咨询</a-select-option>
            <a-select-option value="negative">差评</a-select-option>
            <a-select-option value="promotion">推广</a-select-option>
          </a-select>
        </a-form-item>
        <a-form-item label="话术内容" required>
          <a-textarea
            v-model:value="scriptForm.content"
            placeholder="输入话术内容，支持使用变量"
            :rows="4"
          />
          <div class="variable-buttons">
            <a-button
              v-for="v in variables"
              :key="v"
              type="dashed"
              size="small"
              @click="insertVariable(v)"
            >{{ v }}</a-button>
          </div>
        </a-form-item>
        <a-form-item label="权重">
          <a-slider v-model:value="scriptForm.weight" :min="1" :max="100" :marks="{ 1: '1', 50: '50', 100: '100' }" />
        </a-form-item>
      </a-form>
    </a-modal>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted, onBeforeUnmount } from 'vue'
import { message, Modal } from 'ant-design-vue'
import { PlusOutlined, RobotOutlined, DownOutlined, UpOutlined, InfoCircleOutlined } from '@ant-design/icons-vue'
import request from '@/utils/request'

const isMobile = ref(window.innerWidth < 768)
const onResize = () => { isMobile.value = window.innerWidth < 768 }
onMounted(() => {
  window.addEventListener('resize', onResize)
  loadScripts('comment')
  loadScripts('reply')
  loadBlockedWords()
  loadKnowledge()
})
onBeforeUnmount(() => { window.removeEventListener('resize', onResize) })

const activeTab = ref('comment')
const variables = ['{产品名}', '{品牌}', '{价格}', '{链接}', '{用户名}', '{日期}']

// ===== Scripts =====
const commentLoading = ref(false)
const replyLoading = ref(false)
const commentScripts = ref([])
const replyScripts = ref([])
const commentGroupFilter = ref(undefined)
const replyGroupFilter = ref(undefined)

const commentGroups = computed(() => {
  const set = new Set(commentScripts.value.map(s => s.group_name).filter(Boolean))
  return Array.from(set)
})
const replyGroups = computed(() => {
  const set = new Set(replyScripts.value.map(s => s.group_name).filter(Boolean))
  return Array.from(set)
})
const currentTabGroups = computed(() => {
  return scriptModalCategory.value === 'comment' ? commentGroups.value : replyGroups.value
})

function groupScripts(scripts, filter) {
  let list = scripts
  if (filter) list = list.filter(s => s.group_name === filter)
  const map = {}
  list.forEach(s => {
    const g = s.group_name || '未分组'
    if (!map[g]) map[g] = { name: g, items: [] }
    map[g].items.push(s)
  })
  return Object.values(map)
}

const commentScriptsGrouped = computed(() => groupScripts(commentScripts.value, commentGroupFilter.value))
const replyScriptsGrouped = computed(() => groupScripts(replyScripts.value, replyGroupFilter.value))

async function loadScripts(category) {
  const loadingRef = category === 'comment' ? commentLoading : replyLoading
  const dataRef = category === 'comment' ? commentScripts : replyScripts
  loadingRef.value = true
  try {
    const res = await request.get('/operations/scripts', { params: { category } })
    dataRef.value = res.data || []
  } catch (e) { console.error(e) }
  finally { loadingRef.value = false }
}

function scriptTypeText(t) {
  const map = { general: '通用', positive: '好评', question: '咨询', negative: '差评', promotion: '推广' }
  return map[t] || t
}

// Script Modal
const showScriptModal = ref(false)
const editingScript = ref(null)
const scriptModalCategory = ref('comment')
const scriptSubmitting = ref(false)
const scriptForm = reactive({
  group_name: undefined,
  type: 'general',
  content: '',
  weight: 50,
})

function openScriptModal(category, script = null) {
  scriptModalCategory.value = category
  editingScript.value = script
  if (script) {
    scriptForm.group_name = script.group_name ? [script.group_name] : undefined
    scriptForm.type = script.type || 'general'
    scriptForm.content = script.content || ''
    scriptForm.weight = script.weight ?? 50
  } else {
    scriptForm.group_name = undefined
    scriptForm.type = 'general'
    scriptForm.content = ''
    scriptForm.weight = 50
  }
  showScriptModal.value = true
}

function insertVariable(v) {
  scriptForm.content += v
}

async function submitScript() {
  if (!scriptForm.content) { message.warning('请输入话术内容'); return }
  scriptSubmitting.value = true
  try {
    const payload = {
      category: scriptModalCategory.value,
      group_name: Array.isArray(scriptForm.group_name) ? scriptForm.group_name[0] : scriptForm.group_name,
      type: scriptForm.type,
      content: scriptForm.content,
      weight: scriptForm.weight,
    }
    if (editingScript.value) {
      await request.put(`/operations/scripts/${editingScript.value.id}`, payload)
      message.success('话术已更新')
    } else {
      await request.post('/operations/scripts', payload)
      message.success('话术已添加')
    }
    showScriptModal.value = false
    loadScripts(scriptModalCategory.value)
  } catch (e) { console.error(e) }
  finally { scriptSubmitting.value = false }
}

function deleteScript(id, category) {
  Modal.confirm({
    title: '确认删除',
    content: '确定要删除该话术吗？',
    okText: '删除',
    okType: 'danger',
    cancelText: '取消',
    async onOk() {
      try {
        await request.delete(`/operations/scripts/${id}`)
        message.success('已删除')
        loadScripts(category)
      } catch (e) { console.error(e) }
    },
  })
}

// ===== AI Generation =====
const showAiModal = ref(false)
const aiModalCategory = ref('comment')
const aiGenerating = ref(false)
const aiResults = ref([])
const aiForm = reactive({
  keywords: '',
  script_type: 'comment',
  count: 5,
})

function openAiModal(category) {
  aiModalCategory.value = category
  aiForm.keywords = ''
  aiForm.script_type = category === 'comment' ? 'comment' : 'reply_positive'
  aiForm.count = 5
  aiResults.value = []
  showAiModal.value = true
}

async function generateAiScripts() {
  if (!aiForm.keywords.trim()) { message.warning('请输入产品关键词'); return }
  aiGenerating.value = true
  aiResults.value = []
  try {
    const res = await request.post('/operations/scripts/ai-generate', {
      keywords: aiForm.keywords,
      script_type: aiForm.script_type,
      count: aiForm.count,
    })
    aiResults.value = res.data || []
    if (!aiResults.value.length) message.info('未生成结果，请尝试调整关键词')
  } catch (e) {
    console.error(e)
    message.info('AI生成功能即将上线')
  } finally {
    aiGenerating.value = false
  }
}

async function addAiScriptToLib(item) {
  try {
    await request.post('/operations/scripts', {
      category: aiModalCategory.value,
      group_name: 'AI生成',
      type: 'general',
      content: item.content,
      weight: 50,
    })
    message.success('已添加到话术库')
    loadScripts(aiModalCategory.value)
  } catch (e) { console.error(e) }
}

// ===== Product Knowledge Base =====
const kbLoading = ref(false)
const kbSaving = ref(false)
const kbLastSaved = ref('')
const kb = reactive({
  brand_name: '',
  brand_slogan: '',
  target_audience: '',
  audience_pain_points: '',
  audience_preferences: '',
  products: [],
  reply_personality: '',
  reply_rules: '',
})

function addProduct() {
  kb.products.push({ name: '', efficacy: '', selling_points: '', price: '' })
}

async function loadKnowledge() {
  kbLoading.value = true
  try {
    const res = await request.get('/api/operations/product-knowledge')
    if (res.data?.code === 0 && res.data.data) {
      const d = res.data.data
      kb.brand_name = d.brand_name || ''
      kb.brand_slogan = d.brand_slogan || ''
      kb.target_audience = d.target_audience || ''
      kb.audience_pain_points = d.audience_pain_points || ''
      kb.audience_preferences = d.audience_preferences || ''
      kb.products = d.products || []
      kb.reply_personality = d.reply_personality || ''
      kb.reply_rules = d.reply_rules || ''
      if (d.updated_at) kbLastSaved.value = d.updated_at
    }
  } catch (e) {
    console.error(e)
  } finally {
    kbLoading.value = false
  }
}

async function saveKnowledge() {
  kbSaving.value = true
  try {
    const res = await request.post('/api/operations/product-knowledge', {
      brand_name: kb.brand_name,
      brand_slogan: kb.brand_slogan,
      target_audience: kb.target_audience,
      audience_pain_points: kb.audience_pain_points,
      audience_preferences: kb.audience_preferences,
      products: kb.products,
      reply_personality: kb.reply_personality,
      reply_rules: kb.reply_rules,
    })
    if (res.data?.code === 0) {
      message.success('产品知识库保存成功')
      kbLastSaved.value = new Date().toLocaleString()
    } else {
      message.error(res.data?.msg || '保存失败')
    }
  } catch (e) {
    message.error('保存失败')
  } finally {
    kbSaving.value = false
  }
}

// ===== Blocked Words =====
const blockedExpanded = ref(false)
const blockedLoading = ref(false)
const blockedWords = ref([])
const showAddBlockedWord = ref(false)
const newBlockedWord = ref('')
const blockedSubmitting = ref(false)

async function loadBlockedWords() {
  blockedLoading.value = true
  try {
    const res = await request.get('/operations/blocked-words')
    blockedWords.value = res.data || []
  } catch (e) { console.error(e) }
  finally { blockedLoading.value = false }
}

async function addBlockedWords() {
  if (!newBlockedWord.value.trim()) { message.warning('请输入屏蔽词'); return }
  blockedSubmitting.value = true
  try {
    const words = newBlockedWord.value.split(/[,，]/).map(w => w.trim()).filter(Boolean)
    await request.post('/operations/blocked-words', { words })
    message.success(`已添加 ${words.length} 个屏蔽词`)
    newBlockedWord.value = ''
    showAddBlockedWord.value = false
    loadBlockedWords()
  } catch (e) { console.error(e) }
  finally { blockedSubmitting.value = false }
}

async function removeBlockedWord(id) {
  try {
    await request.delete(`/operations/blocked-words/${id}`)
    message.success('已移除')
    loadBlockedWords()
  } catch (e) { console.error(e) }
}
</script>

<style scoped>
.ops-scripts {
  padding: 16px;
  max-width: 1200px;
  margin: 0 auto;
}
.page-header {
  margin-bottom: 16px;
}
.page-title {
  font-size: 20px;
  font-weight: 600;
  color: #1a1a1a;
  margin: 0;
}
.ops-tabs :deep(.ant-tabs-nav) {
  margin-bottom: 0;
}
.tab-content {
  padding-top: 16px;
}
.tab-toolbar {
  display: flex;
  gap: 8px;
  margin-bottom: 16px;
  flex-wrap: wrap;
}

/* Script Groups */
.script-groups {
  display: flex;
  flex-direction: column;
  gap: 20px;
}
.script-group__header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 10px;
  padding-bottom: 8px;
  border-bottom: 1px solid #f0f0f0;
}
.script-group__name {
  font-size: 15px;
  font-weight: 600;
  color: #1a1a1a;
}
.script-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.script-card {
  background: #fff;
  border-radius: 12px;
  padding: 14px 16px;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.06);
}
.script-card__content {
  font-size: 14px;
  color: #1a1a1a;
  line-height: 1.6;
  margin-bottom: 10px;
  word-break: break-word;
}
.script-card__footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
}
.script-card__tags {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}
.script-card__stat {
  font-size: 12px;
  color: #8c8c8c;
}
.script-card__actions {
  display: flex;
  gap: 4px;
}

/* Variable Buttons */
.variable-buttons {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 8px;
}

/* AI Results */
.ai-results {
  margin-top: 16px;
  border-top: 1px solid #f0f0f0;
  padding-top: 12px;
}
.ai-results__title {
  font-size: 14px;
  font-weight: 600;
  color: #1a1a1a;
  margin-bottom: 10px;
}
.ai-result-card {
  background: #fafafa;
  border-radius: 8px;
  padding: 12px;
  margin-bottom: 8px;
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 8px;
}
.ai-result-card__content {
  font-size: 14px;
  color: #1a1a1a;
  line-height: 1.6;
  flex: 1;
  word-break: break-word;
}

/* Blocked Words Section */
.blocked-section {
  margin-top: 24px;
  background: #fff;
  border-radius: 12px;
  padding: 16px;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.06);
}
.blocked-section__header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  cursor: pointer;
}
.blocked-section__title-row {
  display: flex;
  align-items: center;
  gap: 8px;
}
.blocked-section__toggle {
  color: #8c8c8c;
  font-size: 12px;
  margin-left: 4px;
}
.section-title {
  font-size: 16px;
  font-weight: 600;
  color: #1a1a1a;
}
.blocked-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 12px;
}
.blocked-add-row {
  display: flex;
  gap: 8px;
  margin-top: 12px;
  align-items: center;
}

/* Knowledge Base */
.knowledge-hint {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 14px;
  background: #e6f4ff;
  border-radius: 8px;
  font-size: 13px;
  color: #1677ff;
  margin-bottom: 16px;
}
.knowledge-form {
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.knowledge-group {
  background: #fff;
  border-radius: 10px;
  padding: 16px;
  box-shadow: 0 1px 3px rgba(0,0,0,0.06);
}
.knowledge-group__title {
  font-size: 15px;
  font-weight: 600;
  color: #1a1a1a;
  margin-bottom: 12px;
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.knowledge-row {
  margin-bottom: 12px;
}
.knowledge-row label {
  display: block;
  font-size: 13px;
  color: #595959;
  margin-bottom: 4px;
  font-weight: 500;
}
.product-card {
  background: #fafafa;
  border: 1px solid #f0f0f0;
  border-radius: 8px;
  padding: 12px;
  margin-bottom: 10px;
}
.product-card__header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
}
.product-card__num {
  font-size: 13px;
  font-weight: 600;
  color: #1677ff;
}
.knowledge-actions {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 8px 0;
}
.knowledge-saved-time {
  font-size: 12px;
  color: #8c8c8c;
}

@media (min-width: 768px) {
  .ops-scripts {
    padding: 24px;
  }
  .script-list {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 12px;
  }
}
</style>

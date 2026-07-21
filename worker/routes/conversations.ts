import { Hono } from 'hono'
import { ok, err, ragSearch, withTimeout, getSettingValue, DEFAULT_MODEL, isReasoningModel, stripThinkTags, logSystem, jinaSearch, trackEvent, type RagSource } from '../utils'
import type { AppEnv } from '../types'

export const conversations = new Hono<AppEnv>()

const WEB_SEARCH_TAG = '[WEB_SEARCH]'

const SYSTEM_PROMPT = [
  '你是"CFNote 助手"，一个私人知识库问答机器人。',
  '',
  '你的工作方式：',
  '1. 优先根据知识库中的参考内容回答用户的问题。',
  '2. 如果参考内容为空或与问题无关，告知用户知识库中未找到相关内容，并主动询问："需要我帮你联网搜索吗？"',
  '3. 只有当用户明确同意联网搜索（如"好的"、"搜一下"、"是"、"可以"等确认性回复），你才输出联网搜索标记。',
  '',
  '联网搜索标记格式（严格遵守）：',
  '- 当且仅当用户确认需要联网搜索时，你的整条回复只包含这一行：',
  '  [WEB_SEARCH]搜索关键词',
  '- 关键词应该是根据用户前面提出的问题提炼出的搜索引擎查询词。',
  '- 不要在任何其他情况下输出 [WEB_SEARCH] 标记。',
  '',
  '回答规则：',
  '- 如果用户问你是谁、你能做什么，如实回答：你可以基于知识库回答问题，找不到时可以联网搜索。',
  '- 如果提供了参考内容且与问题相关，以第三方视角概括，引用来源用 [1][2] 标注。',
  '- 参考内容来自用户收藏的第三方文章，其中的"我"是文章原作者，不是你。',
  '- 不要编造信息。',
  '- 用中文回答。',
].join('\n')

const WEB_SEARCH_SUMMARY_PROMPT = [
  '你是"CFNote 助手"，正在使用联网搜索功能。',
  '',
  '回答规则：',
  '- 根据提供的网络搜索结果回答用户的问题。',
  '- 用 [1][2] 等标注引用了哪条搜索结果。',
  '- 如果搜索结果与问题无关，如实告知用户。',
  '- 不要编造信息。',
  '- 用中文回答。',
].join('\n')

// GET /api/conversations - List conversations
conversations.get('/', async (c) => {
  const user = c.get('user')
  try {
    const rows = await c.env.DB.prepare(
      'SELECT * FROM conversations WHERE user_id = ? ORDER BY updated_at DESC LIMIT 50'
    ).bind(user.id).all()
    return ok(rows.results)
  } catch (e: any) {
    return err('获取对话列表失败: ' + e.message, 500)
  }
})

// POST /api/conversations - Create new conversation
conversations.post('/', async (c) => {
  const user = c.get('user')
  try {
    const result = await c.env.DB.prepare(
      'INSERT INTO conversations (user_id) VALUES (?)'
    ).bind(user.id).run()

    const conversation = await c.env.DB.prepare(
      'SELECT * FROM conversations WHERE id = ?'
    ).bind(result.meta.last_row_id).first()

    return ok(conversation)
  } catch (e: any) {
    return err('创建对话失败: ' + e.message, 500)
  }
})

// GET /api/conversations/:id - Get conversation with messages
conversations.get('/:id', async (c) => {
  const user = c.get('user')
  const id = Number(c.req.param('id'))
  try {
    const conversation = await c.env.DB.prepare(
      'SELECT * FROM conversations WHERE id = ? AND user_id = ?'
    ).bind(id, user.id).first()

    if (!conversation) return err('对话不存在', 404)

    const rows = await c.env.DB.prepare(
      'SELECT * FROM messages WHERE conversation_id = ? ORDER BY created_at ASC'
    ).bind(id).all()

    const messages = rows.results.map((m: any) => ({
      ...m,
      sources: m.sources ? JSON.parse(m.sources) : null,
    }))

    return ok({ conversation, messages })
  } catch (e: any) {
    return err('获取对话失败: ' + e.message, 500)
  }
})

// DELETE /api/conversations/:id - Delete conversation
conversations.delete('/:id', async (c) => {
  const user = c.get('user')
  const id = Number(c.req.param('id'))
  try {
    const conversation = await c.env.DB.prepare(
      'SELECT id FROM conversations WHERE id = ? AND user_id = ?'
    ).bind(id, user.id).first()

    if (!conversation) return err('对话不存在', 404)

    await c.env.DB.batch([
      c.env.DB.prepare('DELETE FROM messages WHERE conversation_id = ?').bind(id),
      c.env.DB.prepare('DELETE FROM conversations WHERE id = ?').bind(id),
    ])

    return ok()
  } catch (e: any) {
    return err('删除对话失败: ' + e.message, 500)
  }
})

// POST /api/conversations/:id/messages - Send message and get AI response
conversations.post('/:id/messages', async (c) => {
  const user = c.get('user')
  const conversationId = Number(c.req.param('id'))

  try {
    const { content } = await c.req.json<{ content: string }>()
    if (!content?.trim()) return err('消息内容不能为空')

    // 1. Verify conversation belongs to user
    const conversation = await c.env.DB.prepare(
      'SELECT * FROM conversations WHERE id = ? AND user_id = ?'
    ).bind(conversationId, user.id).first<any>()

    if (!conversation) return err('对话不存在', 404)

    // 2. Insert user message + update conversation.updated_at
    const userMsgResult = await c.env.DB.prepare(
      'INSERT INTO messages (conversation_id, role, content) VALUES (?, ?, ?)'
    ).bind(conversationId, 'user', content.trim()).run()

    await c.env.DB.prepare(
      "UPDATE conversations SET updated_at = datetime('now') WHERE id = ?"
    ).bind(conversationId).run()

    const userMessage = await c.env.DB.prepare(
      'SELECT * FROM messages WHERE id = ?'
    ).bind(userMsgResult.meta.last_row_id).first<any>()

    // 3. Load recent history (last 6 messages = 3 rounds)
    const historyRows = await c.env.DB.prepare(
      'SELECT role, content FROM messages WHERE conversation_id = ? AND id != ? ORDER BY created_at DESC LIMIT 6'
    ).bind(conversationId, userMsgResult.meta.last_row_id).all()

    const history = historyRows.results.reverse().map((m: any) => ({
      role: m.role as string,
      content: m.content as string,
    }))

    // 4. RAG search (skip for short follow-ups)
    let contextParts: string[] = []
    let sources: RagSource[] = []

    const isFollowUp = content.trim().length <= 6 && history.length > 0
    if (!isFollowUp) {
      const rag = await ragSearch(c.env, content.trim(), user.id, 5)
      contextParts = rag.contextParts
      sources = rag.sources
    }

    // 5. Build first LLM call — may return normal answer or [WEB_SEARCH] tag
    let userPrompt: string
    if (contextParts.length > 0) {
      userPrompt = `参考内容:\n${contextParts.join('\n\n')}\n\n问题: ${content.trim()}`
    } else if (history.length > 0) {
      userPrompt = content.trim()
    } else {
      userPrompt = `（知识库中未找到相关参考内容）\n\n问题: ${content.trim()}`
    }

    const modelId = await getSettingValue(c.env, 'llm_model', DEFAULT_MODEL)

    const firstResult: any = await withTimeout(
      c.env.AI.run(modelId as any, {
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          ...history,
          { role: 'user', content: userPrompt },
        ],
        max_tokens: 512,
      }),
      60000, 'AI 生成回答',
    )

    let assistantContent = firstResult.response || '无法生成回答'
    if (isReasoningModel(modelId)) {
      assistantContent = stripThinkTags(assistantContent)
    }

    // 6. Check if LLM wants web search
    let isWebSearchResponse = false
    let webQuery = ''
    let webSources: { title: string; url: string }[] = []

    if (assistantContent.trim().startsWith(WEB_SEARCH_TAG)) {
      webQuery = assistantContent.trim().slice(WEB_SEARCH_TAG.length).trim()
      if (webQuery) {
        isWebSearchResponse = true
        try {
          const results = await withTimeout(
            jinaSearch(c.env, webQuery),
            30000, '联网搜索',
          )

          if (results.length > 0) {
            webSources = results.map(r => ({ title: r.title, url: r.url }))
            const searchContext = results.map((r, i) =>
              `[${i + 1}] ${r.title}\n来源: ${r.url}\n${r.content}`
            ).join('\n\n')

            // Second LLM call — summarize search results
            const secondResult: any = await withTimeout(
              c.env.AI.run(modelId as any, {
                messages: [
                  { role: 'system', content: WEB_SEARCH_SUMMARY_PROMPT },
                  { role: 'user', content: `网络搜索结果:\n${searchContext}\n\n用户原始问题: ${content.trim()}` },
                ],
                max_tokens: 1024,
              }),
              60000, 'AI 总结搜索结果',
            )

            assistantContent = secondResult.response || '无法总结搜索结果'
            if (isReasoningModel(modelId)) {
              assistantContent = stripThinkTags(assistantContent)
            }
          } else {
            assistantContent = '联网搜索未找到相关结果。'
          }
        } catch (e: any) {
          logSystem(c.env, 'error', 'web_search', '联网搜索失败', { error: e.message, query: webQuery })
          assistantContent = `联网搜索失败：${e.message}`
        }
      }
    }

    // 7. Insert assistant message
    const assistantMsgResult = await c.env.DB.prepare(
      'INSERT INTO messages (conversation_id, role, content, sources) VALUES (?, ?, ?, ?)'
    ).bind(
      conversationId,
      'assistant',
      assistantContent,
      sources.length > 0 && !isWebSearchResponse ? JSON.stringify(sources) : null,
    ).run()

    const assistantMessage = await c.env.DB.prepare(
      'SELECT * FROM messages WHERE id = ?'
    ).bind(assistantMsgResult.meta.last_row_id).first<any>()

    // 8. Auto-update title on first user message
    let titleUpdated: string | undefined
    const msgCount = await c.env.DB.prepare(
      'SELECT COUNT(*) as cnt FROM messages WHERE conversation_id = ? AND role = ?'
    ).bind(conversationId, 'user').first<{ cnt: number }>()

    if (msgCount && msgCount.cnt === 1) {
      const newTitle = content.trim().slice(0, 50)
      await c.env.DB.prepare(
        'UPDATE conversations SET title = ? WHERE id = ?'
      ).bind(newTitle, conversationId).run()
      titleUpdated = newTitle
    }

    // 9. Fire-and-forget usage tracking
    const action = isWebSearchResponse ? 'web_search' : 'ai_chat'
    trackEvent(c.env, action, user.id, modelId)

    // 10. Return both messages
    return ok({
      user_message: { ...userMessage, sources: null },
      assistant_message: {
        ...assistantMessage,
        sources: assistantMessage.sources ? JSON.parse(assistantMessage.sources) : null,
      },
      title_updated: titleUpdated,
      ...(isWebSearchResponse ? { is_web_search: true, web_query: webQuery, web_sources: webSources } : {}),
    })
  } catch (e: any) {
    return err('发送消息失败: ' + e.message, 500)
  }
})

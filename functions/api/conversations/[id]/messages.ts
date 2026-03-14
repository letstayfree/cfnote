import { ok, err, ragSearch, withTimeout } from '../../_utils'
import type { Env } from '../../../../src/types'

// POST /api/conversations/:id/messages - Send message and get AI response
export const onRequestPost: PagesFunction<Env> = async ({ params, request, env, data }) => {
  const user = (data as any).user
  const conversationId = Number(params.id)

  try {
    const { content } = await request.json<{ content: string }>()
    if (!content?.trim()) return err('消息内容不能为空')

    // 1. Verify conversation belongs to user
    const conversation = await env.DB.prepare(
      'SELECT * FROM conversations WHERE id = ? AND user_id = ?'
    ).bind(conversationId, user.id).first<any>()

    if (!conversation) return err('对话不存在', 404)

    // 2. Insert user message + update conversation.updated_at
    const userMsgResult = await env.DB.prepare(
      'INSERT INTO messages (conversation_id, role, content) VALUES (?, ?, ?)'
    ).bind(conversationId, 'user', content.trim()).run()

    await env.DB.prepare(
      "UPDATE conversations SET updated_at = datetime('now') WHERE id = ?"
    ).bind(conversationId).run()

    const userMessage = await env.DB.prepare(
      'SELECT * FROM messages WHERE id = ?'
    ).bind(userMsgResult.meta.last_row_id).first<any>()

    // 3. Load recent history (last 6 messages = 3 rounds)
    const historyRows = await env.DB.prepare(
      'SELECT role, content FROM messages WHERE conversation_id = ? AND id != ? ORDER BY created_at DESC LIMIT 6'
    ).bind(conversationId, userMsgResult.meta.last_row_id).all()

    const history = historyRows.results.reverse().map((m: any) => ({
      role: m.role as string,
      content: m.content as string,
    }))

    // 4. Decide whether to do RAG search
    // Short messages (≤ 6 chars) with existing history are likely follow-ups
    // (e.g. "继续", "详细说说", "好的") — skip RAG to avoid injecting irrelevant noise
    const isFollowUp = content.trim().length <= 6 && history.length > 0
    let contextParts: string[] = []
    let sources: import('../../_utils').RagSource[] = []

    if (!isFollowUp) {
      const rag = await ragSearch(env, content.trim(), user.id, 5)
      contextParts = rag.contextParts
      sources = rag.sources
    }

    // 5. Build LLM messages
    const systemPrompt = [
      '你是一个私人知识库助手，名叫"CFNote 助手"。',
      '重要规则：',
      '- 你的身份始终是"CFNote 助手"，绝对不要把参考内容中出现的人名、身份、"我"等当作你自己的身份。',
      '- 参考内容来自用户收藏的第三方文章，其中的"我"指的是文章原作者，不是你。',
      '- 回答时以第三方视角概括参考内容，例如"该文章提到..."、"根据这篇笔记..."。',
      '- 仅使用参考内容和对话历史中的信息，不要编造。',
      '- 引用来源时用 [1][2] 标注。',
      '- 若无相关信息请说明。',
      '- 用中文回答。',
    ].join('\n')

    let userPrompt: string
    if (contextParts.length > 0) {
      userPrompt = `参考内容:\n${contextParts.join('\n\n')}\n\n问题: ${content.trim()}`
    } else if (history.length > 0) {
      userPrompt = content.trim()
    } else {
      userPrompt = `（知识库中未找到相关参考内容）\n\n问题: ${content.trim()}`
    }

    const llmMessages = [
      { role: 'system', content: systemPrompt },
      ...history,
      { role: 'user', content: userPrompt },
    ]

    // 6. Call Workers AI
    const llmResult: any = await withTimeout(
      env.AI.run('@cf/meta/llama-3.1-8b-instruct' as any, {
        messages: llmMessages,
        max_tokens: 512,
      }),
      60000, 'AI 生成回答',
    )

    const assistantContent = llmResult.response || '无法生成回答'

    // 7. Insert assistant message
    const assistantMsgResult = await env.DB.prepare(
      'INSERT INTO messages (conversation_id, role, content, sources) VALUES (?, ?, ?, ?)'
    ).bind(
      conversationId,
      'assistant',
      assistantContent,
      sources.length > 0 ? JSON.stringify(sources) : null,
    ).run()

    const assistantMessage = await env.DB.prepare(
      'SELECT * FROM messages WHERE id = ?'
    ).bind(assistantMsgResult.meta.last_row_id).first<any>()

    // 8. Auto-update title on first user message
    let titleUpdated: string | undefined
    const msgCount = await env.DB.prepare(
      'SELECT COUNT(*) as cnt FROM messages WHERE conversation_id = ? AND role = ?'
    ).bind(conversationId, 'user').first<{ cnt: number }>()

    if (msgCount && msgCount.cnt === 1) {
      const newTitle = content.trim().slice(0, 50)
      await env.DB.prepare(
        'UPDATE conversations SET title = ? WHERE id = ?'
      ).bind(newTitle, conversationId).run()
      titleUpdated = newTitle
    }

    // 9. Fire-and-forget usage log
    env.DB.prepare('INSERT INTO usage_logs (user_id, action) VALUES (?, ?)')
      .bind(user.id, 'ai_chat').run().catch(() => {})

    // 10. Return both messages
    return ok({
      user_message: { ...userMessage, sources: null },
      assistant_message: {
        ...assistantMessage,
        sources: assistantMessage.sources ? JSON.parse(assistantMessage.sources) : null,
      },
      title_updated: titleUpdated,
    })
  } catch (e: any) {
    return err('发送消息失败: ' + e.message, 500)
  }
}

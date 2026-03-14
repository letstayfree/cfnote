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

    // 3. RAG search for context
    const { contextParts, sources } = await ragSearch(env, content.trim(), user.id, 5)

    // 4. Load recent history (last 6 messages = 3 rounds)
    const historyRows = await env.DB.prepare(
      'SELECT role, content FROM messages WHERE conversation_id = ? AND id != ? ORDER BY created_at DESC LIMIT 6'
    ).bind(conversationId, userMsgResult.meta.last_row_id).all()

    const history = historyRows.results.reverse().map((m: any) => ({
      role: m.role as string,
      content: m.content as string,
    }))

    // 5. Build LLM messages — context goes in user message (small models follow it better)
    const systemPrompt = '你是知识库助手。根据参考内容简洁回答问题。仅使用参考内容中的信息，不要编造。引用来源时用 [1][2] 标注。若无相关信息请说明。用中文回答。'

    let userPrompt: string
    if (contextParts.length > 0) {
      userPrompt = `参考内容:\n${contextParts.join('\n\n')}\n\n问题: ${content.trim()}`
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
      20000, 'AI 生成回答',
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

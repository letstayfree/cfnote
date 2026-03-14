import { ok, err, ragSearch } from '../_utils'
import type { Env } from '../../../src/types'

// POST /api/search/ai - AI-powered Q&A search (vector search + LLM)
export const onRequestPost: PagesFunction<Env> = async ({ request, env, data }) => {
  const user = (data as any).user
  try {
    const { query } = await request.json<{ query: string }>()
    if (!query?.trim()) return err('搜索内容不能为空')

    const { contextParts, sources } = await ragSearch(env, query.trim(), user.id, 5)

    if (sources.length === 0) {
      return ok({ answer: '未在知识库中找到相关内容。', sources: [] })
    }

    // Generate answer with LLM
    const prompt = `参考内容:\n${contextParts.join('\n\n')}\n\n问题: ${query.trim()}`
    const llmResult: any = await env.AI.run('@cf/meta/llama-3.1-8b-instruct' as any, {
      messages: [
        {
          role: 'system',
          content: '你是知识库助手。根据以下参考内容简洁回答问题。仅使用参考内容中的信息，不要编造。若无法回答请说明。用中文回答。',
        },
        { role: 'user', content: prompt },
      ],
      max_tokens: 300,
    })

    // Fire-and-forget usage log
    env.DB.prepare('INSERT INTO usage_logs (user_id, action) VALUES (?, ?)').bind(user.id, 'ai_qa').run().catch(() => {})

    return ok({
      answer: llmResult.response || '无法生成回答',
      sources,
    })
  } catch (e: any) {
    return err('AI搜索失败: ' + e.message, 500)
  }
}

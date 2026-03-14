import { ok, err, ragSearch, withTimeout, getSettingValue, DEFAULT_MODEL, isReasoningModel, stripThinkTags } from '../_utils'
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
    const modelId = await getSettingValue(env, 'llm_model', DEFAULT_MODEL)
    const prompt = `参考内容:\n${contextParts.join('\n\n')}\n\n问题: ${query.trim()}`
    const llmResult: any = await withTimeout(
      env.AI.run(modelId as any, {
        messages: [
          {
            role: 'system',
            content: '你是"CFNote 助手"，一个私人知识库问答机器人。你只能根据用户知识库中已有的文章回答问题，不能联网搜索。参考内容来自用户收藏的第三方文章，其中的"我"是文章原作者，不是你。回答时以第三方视角概括，例如"该文章提到..."。若参考内容与问题无关则忽略并说明。不要编造。用中文回答。',
          },
          { role: 'user', content: prompt },
        ],
        max_tokens: 300,
      }),
      60000, 'AI 生成回答',
    )

    let answer = llmResult.response || '无法生成回答'
    if (isReasoningModel(modelId)) {
      answer = stripThinkTags(answer)
    }

    // Fire-and-forget usage log
    env.DB.prepare('INSERT INTO usage_logs (user_id, action, model) VALUES (?, ?, ?)').bind(user.id, 'ai_qa', modelId).run().catch(() => {})

    return ok({
      answer,
      sources,
    })
  } catch (e: any) {
    return err('AI搜索失败: ' + e.message, 500)
  }
}

import { ok, err } from '../_utils'
import type { Env } from '../../../src/types'

// POST /api/search/ai - AI-powered Q&A search (vector search + LLM)
export const onRequestPost: PagesFunction<Env> = async ({ request, env, data }) => {
  const user = (data as any).user
  try {
    const { query, notebook_id } = await request.json<{ query: string; notebook_id?: number }>()
    if (!query?.trim()) return err('搜索内容不能为空')

    // 1. Embed the query
    const embedResult: any = await env.AI.run('@cf/baai/bge-m3' as any, { text: [query.trim()] })
    const queryVector = embedResult.data[0] as number[]

    // 2. Search Vectorize
    const filter: VectorizeVectorMetadataFilter = { user_id: user.id }
    if (notebook_id) {
      (filter as any).notebook_id = notebook_id
    }

    const matches = await env.VECTORIZE.query(queryVector, {
      topK: 5,
      filter,
      returnMetadata: 'all',
    })

    if (!matches.matches || matches.matches.length === 0) {
      return ok({ answer: '未在知识库中找到相关内容。', sources: [] })
    }

    // 3. Fetch chunk texts for context
    const sources = []
    const contextParts: string[] = []

    for (let i = 0; i < matches.matches.length; i++) {
      const match = matches.matches[i]
      const articleId = match.metadata?.article_id as number
      const chunkIndex = match.metadata?.chunk_index as number

      const article = await env.DB.prepare(
        `SELECT a.id, a.title, n.name as notebook_name
         FROM articles a LEFT JOIN notebooks n ON a.notebook_id = n.id
         WHERE a.id = ?`
      ).bind(articleId).first<any>()

      const chunk = await env.DB.prepare(
        'SELECT chunk_text FROM chunks WHERE article_id = ? AND chunk_index = ?'
      ).bind(articleId, chunkIndex).first<{ chunk_text: string }>()

      if (article && chunk) {
        contextParts.push(`[${i + 1}] ${chunk.chunk_text}`)
        sources.push({
          article_id: article.id,
          article_title: article.title,
          notebook_name: article.notebook_name || '',
          chunk_text: chunk.chunk_text,
          score: match.score,
        })
      }
    }

    // 4. Generate answer with LLM
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

    return ok({
      answer: llmResult.response || '无法生成回答',
      sources,
    })
  } catch (e: any) {
    return err('AI搜索失败: ' + e.message, 500)
  }
}

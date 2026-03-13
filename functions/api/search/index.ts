import { ok, err } from '../_utils'
import type { Env } from '../../../src/types'

// POST /api/search - Semantic search (vector only, no LLM)
export const onRequestPost: PagesFunction<Env> = async ({ request, env, data }) => {
  const user = (data as any).user
  try {
    const { query, notebook_id } = await request.json<{ query: string; notebook_id?: number }>()
    if (!query?.trim()) return err('搜索内容不能为空')

    // Embed the query
    const embedResult: any = await env.AI.run('@cf/baai/bge-m3' as any, { text: [query.trim()] })
    const queryVector = embedResult?.data?.[0] as number[] | undefined

    if (!queryVector || queryVector.length === 0) {
      return err(`查询向量生成失败, response keys: ${Object.keys(embedResult || {}).join(',')}`, 500)
    }

    // Search Vectorize — try with filter, fallback to no filter
    const filter: Record<string, number> = { user_id: user.id }
    if (notebook_id) filter.notebook_id = notebook_id

    let matches = await env.VECTORIZE.query(queryVector, {
      topK: 10,
      filter,
      returnMetadata: 'all',
    })

    // Fallback: if filter returned nothing, retry without filter (metadata index may not exist)
    let usedFallback = false
    if (!matches.matches || matches.matches.length === 0) {
      matches = await env.VECTORIZE.query(queryVector, {
        topK: 10,
        returnMetadata: 'all',
      })
      usedFallback = true
    }

    if (!matches.matches || matches.matches.length === 0) {
      return ok({ results: [], debug: { usedFallback, vectorDims: queryVector.length } })
    }

    // Fetch article info and chunk texts
    const results = []
    for (const match of matches.matches) {
      const articleId = match.metadata?.article_id as number
      const chunkIndex = match.metadata?.chunk_index as number
      if (!articleId && articleId !== 0) continue

      const article = await env.DB.prepare(
        `SELECT a.id, a.title, a.notebook_id, n.name as notebook_name
         FROM articles a LEFT JOIN notebooks n ON a.notebook_id = n.id
         WHERE a.id = ?`
      ).bind(articleId).first<any>()

      const chunk = await env.DB.prepare(
        'SELECT chunk_text FROM chunks WHERE article_id = ? AND chunk_index = ?'
      ).bind(articleId, chunkIndex).first<{ chunk_text: string }>()

      if (article && chunk) {
        // Post-filter by notebook if we used fallback
        if (usedFallback && notebook_id && article.notebook_id !== notebook_id) continue

        results.push({
          article_id: article.id,
          article_title: article.title,
          notebook_id: article.notebook_id,
          notebook_name: article.notebook_name || '',
          chunk_text: chunk.chunk_text,
          score: match.score,
        })
      }
    }

    // Deduplicate by article_id, keep highest score
    const seen = new Map<number, typeof results[0]>()
    for (const r of results) {
      const existing = seen.get(r.article_id)
      if (!existing || r.score > existing.score) {
        seen.set(r.article_id, r)
      }
    }

    return ok({
      results: [...seen.values()].sort((a, b) => b.score - a.score),
      debug: { usedFallback, vectorDims: queryVector.length },
    })
  } catch (e: any) {
    return err('搜索失败: ' + e.message, 500)
  }
}

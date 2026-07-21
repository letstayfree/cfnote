import { Hono } from 'hono'
import { ok, err, ragSearch, withTimeout, getSettingValue, DEFAULT_MODEL, isReasoningModel, stripThinkTags, trackEvent } from '../utils'
import type { AppEnv } from '../types'

export const search = new Hono<AppEnv>()

// POST /api/search - Semantic search (vector only, no LLM)
search.post('/', async (c) => {
  const user = c.get('user')
  try {
    const { query, notebook_id } = await c.req.json<{ query: string; notebook_id?: number }>()
    if (!query?.trim()) return err('搜索内容不能为空')

    // Embed the query
    const embedResult: any = await c.env.AI.run('@cf/baai/bge-m3' as any, { text: [query.trim()] })
    const queryVector = embedResult?.data?.[0] as number[] | undefined

    if (!queryVector || queryVector.length === 0) {
      return err(`查询向量生成失败, response keys: ${Object.keys(embedResult || {}).join(',')}`, 500)
    }

    // Search Vectorize — try with filter, fallback to no filter
    const filter: Record<string, number> = { user_id: user.id }
    if (notebook_id) filter.notebook_id = notebook_id

    let matches = await c.env.VECTORIZE.query(queryVector, {
      topK: 10,
      filter,
      returnMetadata: 'all',
    })

    // Fallback: if filter returned nothing, retry without filter (metadata index may not exist)
    let usedFallback = false
    if (!matches.matches || matches.matches.length === 0) {
      matches = await c.env.VECTORIZE.query(queryVector, {
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

      const article = await c.env.DB.prepare(
        `SELECT a.id, a.title, a.notebook_id, n.name as notebook_name
         FROM articles a LEFT JOIN notebooks n ON a.notebook_id = n.id
         WHERE a.id = ?`
      ).bind(articleId).first<any>()

      const chunk = await c.env.DB.prepare(
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

    // Fire-and-forget usage tracking
    trackEvent(c.env, 'search', user.id)

    return ok({
      results: [...seen.values()].sort((a, b) => b.score - a.score),
      debug: { usedFallback, vectorDims: queryVector.length },
    })
  } catch (e: any) {
    return err('搜索失败: ' + e.message, 500)
  }
})

// POST /api/search/debug - Diagnostic endpoint to trace search pipeline
search.post('/debug', async (c) => {
  const user = c.get('user')
  const steps: Record<string, any> = {}

  try {
    const { query } = await c.req.json<{ query: string }>()
    steps.query = query

    // Step 1: Check D1 data
    const chunkCount = await c.env.DB.prepare('SELECT COUNT(*) as c FROM chunks').first<{ c: number }>()
    const articleCount = await c.env.DB.prepare('SELECT COUNT(*) as c FROM articles WHERE is_vectorized = 1').first<{ c: number }>()
    steps.d1 = {
      vectorized_articles: articleCount?.c ?? 0,
      total_chunks: chunkCount?.c ?? 0,
    }

    // Step 2: Show a sample vector_id from D1
    const sampleChunk = await c.env.DB.prepare('SELECT vector_id, chunk_text, article_id FROM chunks LIMIT 1').first<any>()
    steps.sample_chunk = sampleChunk ?? 'NO CHUNKS FOUND'

    // Step 3: Embed the query
    const embedResult: any = await c.env.AI.run('@cf/baai/bge-m3' as any, { text: [query.trim()] })
    const queryVector = embedResult.data?.[0] as number[] | undefined
    steps.embedding = {
      success: !!queryVector,
      dimensions: queryVector?.length ?? 0,
      first_5_values: queryVector?.slice(0, 5) ?? null,
      raw_keys: Object.keys(embedResult ?? {}),
    }

    if (!queryVector) {
      steps.error = 'Embedding failed - no vector returned'
      return ok(steps)
    }

    // Step 4: Query Vectorize WITHOUT filter
    const matchesNoFilter = await c.env.VECTORIZE.query(queryVector, {
      topK: 5,
      returnMetadata: 'all',
    })
    steps.vectorize_no_filter = {
      count: matchesNoFilter.matches?.length ?? 0,
      matches: matchesNoFilter.matches?.map(m => ({
        id: m.id,
        score: m.score,
        metadata: m.metadata,
      })) ?? [],
    }

    // Step 5: Query Vectorize WITH user_id filter
    try {
      const matchesWithFilter = await c.env.VECTORIZE.query(queryVector, {
        topK: 5,
        filter: { user_id: user.id },
        returnMetadata: 'all',
      })
      steps.vectorize_with_filter = {
        filter_used: { user_id: user.id },
        count: matchesWithFilter.matches?.length ?? 0,
        matches: matchesWithFilter.matches?.map(m => ({
          id: m.id,
          score: m.score,
          metadata: m.metadata,
        })) ?? [],
      }
    } catch (e: any) {
      steps.vectorize_with_filter = { error: e.message }
    }

    // Step 6: Try to fetch a vector by known ID
    if (sampleChunk?.vector_id) {
      try {
        const ids = await c.env.VECTORIZE.getByIds([sampleChunk.vector_id])
        steps.vectorize_get_by_id = {
          queried_id: sampleChunk.vector_id,
          found: ids.length,
          dimensions: ids[0]?.values?.length ?? 'N/A',
        }
      } catch (e: any) {
        steps.vectorize_get_by_id = { error: e.message }
      }
    }

    return ok(steps)
  } catch (e: any) {
    steps.fatal_error = e.message
    return ok(steps)
  }
})

// POST /api/search/ai - AI-powered Q&A search (vector search + LLM)
search.post('/ai', async (c) => {
  const user = c.get('user')
  try {
    const { query } = await c.req.json<{ query: string }>()
    if (!query?.trim()) return err('搜索内容不能为空')

    const { contextParts, sources } = await ragSearch(c.env, query.trim(), user.id, 5)

    if (sources.length === 0) {
      return ok({ answer: '未在知识库中找到相关内容。', sources: [] })
    }

    // Generate answer with LLM
    const modelId = await getSettingValue(c.env, 'llm_model', DEFAULT_MODEL)
    const prompt = `参考内容:\n${contextParts.join('\n\n')}\n\n问题: ${query.trim()}`
    const llmResult: any = await withTimeout(
      c.env.AI.run(modelId as any, {
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

    // Fire-and-forget usage tracking
    trackEvent(c.env, 'ai_qa', user.id, modelId)

    return ok({
      answer,
      sources,
    })
  } catch (e: any) {
    return err('AI搜索失败: ' + e.message, 500)
  }
})

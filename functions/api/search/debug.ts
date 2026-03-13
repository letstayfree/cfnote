import { ok, err, getUser } from '../_utils'
import type { Env } from '../../../src/types'

// POST /api/search/debug - Diagnostic endpoint to trace search pipeline
export const onRequestPost: PagesFunction<Env> = async ({ request, env, data }) => {
  const user = (data as any).user
  const steps: Record<string, any> = {}

  try {
    const { query } = await request.json<{ query: string }>()
    steps.query = query

    // Step 1: Check D1 data
    const chunkCount = await env.DB.prepare('SELECT COUNT(*) as c FROM chunks').first<{ c: number }>()
    const articleCount = await env.DB.prepare('SELECT COUNT(*) as c FROM articles WHERE is_vectorized = 1').first<{ c: number }>()
    steps.d1 = {
      vectorized_articles: articleCount?.c ?? 0,
      total_chunks: chunkCount?.c ?? 0,
    }

    // Step 2: Show a sample vector_id from D1
    const sampleChunk = await env.DB.prepare('SELECT vector_id, chunk_text, article_id FROM chunks LIMIT 1').first<any>()
    steps.sample_chunk = sampleChunk ?? 'NO CHUNKS FOUND'

    // Step 3: Embed the query
    const embedResult: any = await env.AI.run('@cf/baai/bge-m3' as any, { text: [query.trim()] })
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
    const matchesNoFilter = await env.VECTORIZE.query(queryVector, {
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
      const matchesWithFilter = await env.VECTORIZE.query(queryVector, {
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
        const ids = await env.VECTORIZE.getByIds([sampleChunk.vector_id])
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
}

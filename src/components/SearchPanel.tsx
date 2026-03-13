import { useState, useRef, useEffect } from 'react'
import { useApi } from '../hooks/useApi'
import type { SearchResult, AiSearchResult } from '../types'

interface Props {
  token: string
  onClose: () => void
  onOpenArticle: (id: number) => void
}

export default function SearchPanel({ token, onClose, onOpenArticle }: Props) {
  const api = useApi(token)
  const [query, setQuery] = useState('')
  const [mode, setMode] = useState<'semantic' | 'ai'>('semantic')
  const [loading, setLoading] = useState(false)
  const [results, setResults] = useState<SearchResult[]>([])
  const [aiAnswer, setAiAnswer] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  const handleSearch = async () => {
    if (!query.trim()) return
    setLoading(true)
    setResults([])
    setAiAnswer('')

    if (mode === 'ai') {
      const res = await api.post<AiSearchResult>('/search/ai', { query: query.trim() })
      if (res.ok && res.data) {
        setAiAnswer(res.data.answer)
        setResults(res.data.sources)
      }
    } else {
      const res = await api.post<{ results: SearchResult[] }>('/search', { query: query.trim() })
      if (res.ok && res.data) {
        setResults(res.data.results)
      }
    }
    setLoading(false)
  }

  const scorePercent = (score: number) => Math.round(score * 100)

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[10vh]" onClick={onClose}>
      <div className="absolute inset-0 bg-black/40" />
      <div
        className="relative bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[70vh] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Search input */}
        <div className="p-4 border-b border-gray-100">
          <div className="flex items-center gap-2">
            <svg className="w-5 h-5 text-gray-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
              placeholder="输入自然语言搜索..."
              className="flex-1 text-base outline-none bg-transparent placeholder:text-gray-400"
            />
            <div className="flex items-center gap-1 shrink-0">
              <button
                onClick={() => setMode('semantic')}
                className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
                  mode === 'semantic' ? 'bg-emerald-100 text-emerald-700' : 'text-gray-500 hover:bg-gray-100'
                }`}
              >
                语义搜索
              </button>
              <button
                onClick={() => setMode('ai')}
                className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
                  mode === 'ai' ? 'bg-blue-100 text-blue-700' : 'text-gray-500 hover:bg-gray-100'
                }`}
              >
                AI 问答
              </button>
            </div>
          </div>
          <p className="text-xs text-gray-400 mt-2 ml-7">
            {mode === 'semantic' ? '语义搜索：快速查找相关文章，不消耗AI额度' : 'AI问答：基于知识库内容生成回答（消耗少量AI额度）'}
          </p>
        </div>

        {/* Results */}
        <div className="flex-1 overflow-y-auto p-4">
          {loading && (
            <div className="text-center py-8">
              <div className="inline-block w-6 h-6 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
              <p className="text-sm text-gray-500 mt-2">{mode === 'ai' ? 'AI 正在思考...' : '搜索中...'}</p>
            </div>
          )}

          {!loading && aiAnswer && (
            <div className="mb-4 bg-blue-50 rounded-xl p-4">
              <div className="flex items-center gap-2 mb-2">
                <svg className="w-4 h-4 text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                </svg>
                <span className="text-sm font-medium text-blue-700">AI 回答</span>
              </div>
              <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">{aiAnswer}</p>
            </div>
          )}

          {!loading && results.length > 0 && (
            <div>
              <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">
                {aiAnswer ? '参考来源' : '搜索结果'} ({results.length})
              </h3>
              <div className="space-y-2">
                {results.map((r, i) => (
                  <button
                    key={`${r.article_id}-${i}`}
                    onClick={() => onOpenArticle(r.article_id)}
                    className="w-full text-left bg-gray-50 hover:bg-gray-100 rounded-xl p-3 transition-colors"
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-medium text-sm text-gray-900">{r.article_title}</span>
                      <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700">
                        {scorePercent(r.score)}%
                      </span>
                    </div>
                    <p className="text-xs text-gray-400 mb-1">{r.notebook_name}</p>
                    <p className="text-xs text-gray-500 line-clamp-2">{r.chunk_text}</p>
                  </button>
                ))}
              </div>
            </div>
          )}

          {!loading && query && results.length === 0 && !aiAnswer && (
            <div className="text-center py-8 text-gray-400">
              <p className="text-sm">未找到相关内容</p>
            </div>
          )}

          {!loading && !query && (
            <div className="text-center py-8 text-gray-400">
              <p className="text-sm">输入关键词或自然语言问题开始搜索</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

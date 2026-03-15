import { useState, useEffect, useCallback } from 'react'
import { useApi } from '../hooks/useApi'
import type { SystemLogsResponse, SystemLog } from '../types'

interface Props {
  token: string
  onClose: () => void
}

const LEVELS = ['', 'error', 'warn', 'info'] as const
const LEVEL_LABELS: Record<string, string> = { '': '全部', error: 'Error', warn: 'Warn', info: 'Info' }
const LEVEL_COLORS: Record<string, string> = {
  error: 'bg-red-100 text-red-700',
  warn: 'bg-amber-100 text-amber-700',
  info: 'bg-blue-100 text-blue-700',
}

const PAGE_SIZE = 30

export default function SystemLogsPanel({ token, onClose }: Props) {
  const api = useApi(token)
  const [logs, setLogs] = useState<SystemLog[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(0)
  const [level, setLevel] = useState('')
  const [source, setSource] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [expandedId, setExpandedId] = useState<number | null>(null)
  const [cleaning, setCleaning] = useState(false)

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  const fetchLogs = useCallback(async () => {
    setLoading(true)
    setError('')
    const params = new URLSearchParams({ limit: String(PAGE_SIZE), offset: String(page * PAGE_SIZE) })
    if (level) params.set('level', level)
    if (source) params.set('source', source)
    const res = await api.get<SystemLogsResponse>(`/system-logs?${params}`)
    if (res.ok && res.data) {
      setLogs(res.data.logs)
      setTotal(res.data.total)
    } else {
      setError(res.error || '加载失败')
    }
    setLoading(false)
  }, [api, page, level, source])

  useEffect(() => { fetchLogs() }, [fetchLogs])

  // Reset page when filters change
  useEffect(() => { setPage(0) }, [level, source])

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  const handleClean = async () => {
    setCleaning(true)
    const res = await api.del<{ deleted: number }>('/system-logs')
    if (res.ok) {
      fetchLogs()
    }
    setCleaning(false)
  }

  const fmtTime = (t: string) => {
    // "2026-03-15 12:34:56" → "03-15 12:34"
    const m = t.match(/(\d{2}-\d{2}) (\d{2}:\d{2})/)
    return m ? `${m[1]} ${m[2]}` : t.slice(5, 16)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[5vh]" onClick={onClose}>
      <div className="absolute inset-0 bg-black/40" />
      <div
        className="relative bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-4 border-b border-gray-100 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <svg className="w-5 h-5 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
            </svg>
            <span className="font-semibold text-gray-900">系统日志</span>
            <span className="text-xs text-gray-400">共 {total} 条</span>
          </div>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Filters */}
        <div className="px-4 py-2 border-b border-gray-100 flex items-center gap-3">
          <select
            value={level}
            onChange={(e) => setLevel(e.target.value)}
            className="text-xs border border-gray-200 rounded-lg px-2 py-1.5 bg-white text-gray-700 focus:outline-none focus:border-emerald-400"
          >
            {LEVELS.map((l) => (
              <option key={l} value={l}>{LEVEL_LABELS[l]}</option>
            ))}
          </select>
          <input
            type="text"
            placeholder="来源筛选..."
            value={source}
            onChange={(e) => setSource(e.target.value)}
            className="text-xs border border-gray-200 rounded-lg px-2 py-1.5 w-32 focus:outline-none focus:border-emerald-400"
          />
          <div className="ml-auto">
            <button
              onClick={handleClean}
              disabled={cleaning}
              className="text-xs text-gray-400 hover:text-red-500 transition-colors disabled:opacity-50"
            >
              {cleaning ? '清理中...' : '清理30天前日志'}
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto">
          {loading && (
            <div className="text-center py-12">
              <div className="inline-block w-6 h-6 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
              <p className="text-sm text-gray-500 mt-2">加载日志...</p>
            </div>
          )}

          {error && (
            <div className="text-center py-12 text-red-500 text-sm">{error}</div>
          )}

          {!loading && !error && logs.length === 0 && (
            <div className="text-center py-12 text-gray-400 text-sm">暂无日志</div>
          )}

          {!loading && logs.length > 0 && (
            <div className="divide-y divide-gray-100">
              {logs.map((log) => (
                <div key={log.id} className="px-4 py-2.5 hover:bg-gray-50 transition-colors">
                  <div
                    className="flex items-center gap-2 cursor-pointer"
                    onClick={() => setExpandedId(expandedId === log.id ? null : log.id)}
                  >
                    <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium shrink-0 ${LEVEL_COLORS[log.level] ?? 'bg-gray-100 text-gray-600'}`}>
                      {log.level.toUpperCase()}
                    </span>
                    <span className="text-xs text-emerald-600 font-mono shrink-0 w-16">{log.source}</span>
                    <span className="text-xs text-gray-700 truncate flex-1">{log.message}</span>
                    <span className="text-[10px] text-gray-400 shrink-0">{fmtTime(log.created_at)}</span>
                    {log.detail && (
                      <svg className={`w-3.5 h-3.5 text-gray-400 transition-transform shrink-0 ${expandedId === log.id ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                      </svg>
                    )}
                  </div>
                  {expandedId === log.id && log.detail && (
                    <pre className="mt-2 ml-8 text-[11px] text-gray-500 bg-gray-50 rounded-lg p-2.5 overflow-x-auto whitespace-pre-wrap break-all">
                      {(() => {
                        try { return JSON.stringify(JSON.parse(log.detail), null, 2) }
                        catch { return log.detail }
                      })()}
                    </pre>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="px-4 py-2.5 border-t border-gray-100 flex items-center justify-between">
            <button
              onClick={() => setPage(Math.max(0, page - 1))}
              disabled={page === 0}
              className="text-xs text-gray-500 hover:text-emerald-600 disabled:opacity-30 disabled:cursor-not-allowed"
            >
              上一页
            </button>
            <span className="text-xs text-gray-400">{page + 1} / {totalPages}</span>
            <button
              onClick={() => setPage(Math.min(totalPages - 1, page + 1))}
              disabled={page >= totalPages - 1}
              className="text-xs text-gray-500 hover:text-emerald-600 disabled:opacity-30 disabled:cursor-not-allowed"
            >
              下一页
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

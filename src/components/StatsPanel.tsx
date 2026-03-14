import { useState, useEffect } from 'react'
import { useApi } from '../hooks/useApi'
import type { Stats } from '../types'

interface Props {
  token: string
  onClose: () => void
}

export default function StatsPanel({ token, onClose }: Props) {
  const api = useApi(token)
  const [stats, setStats] = useState<Stats | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  useEffect(() => {
    (async () => {
      const res = await api.get<Stats>('/stats')
      if (res.ok && res.data) {
        setStats(res.data)
      } else {
        setError(res.error || '加载失败')
      }
      setLoading(false)
    })()
  }, [api])

  const fmtModel = (id: string) => {
    const short = id.replace(/^@cf\//, '').replace(/^.*\//, '')
    return short
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
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
            </svg>
            <span className="font-semibold text-gray-900">使用统计</span>
          </div>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4 space-y-5">
          {loading && (
            <div className="text-center py-12">
              <div className="inline-block w-6 h-6 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
              <p className="text-sm text-gray-500 mt-2">加载统计数据...</p>
            </div>
          )}

          {error && (
            <div className="text-center py-12 text-red-500 text-sm">{error}</div>
          )}

          {stats && (
            <>
              {/* Section 1: Overview cards */}
              <div className="grid grid-cols-4 gap-3">
                <StatCard label="笔记本" value={stats.notebooks} color="emerald" />
                <StatCard label="文章" value={stats.articles} color="blue" />
                <StatCard label="已索引" value={stats.articles_vectorized} color="violet" />
                <StatCard label="向量存储" value={`${stats.vector_usage_percent}%`} color="amber" sub={`${stats.vectors_count} / ${stats.vectors_limit}`} />
              </div>

              {/* Section 2: Workers AI usage */}
              <section>
                <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Workers AI 额度</h3>
                {stats.ai_usage ? (
                  <div className="bg-gray-50 rounded-xl p-4 space-y-3">
                    {/* Progress bar */}
                    <div>
                      <div className="flex justify-between text-sm mb-1">
                        <span className="text-gray-600">今日 Neurons</span>
                        <span className="font-medium text-gray-900">
                          {stats.ai_usage.neurons_today.toLocaleString()} / {stats.ai_usage.neurons_limit.toLocaleString()}
                        </span>
                      </div>
                      <div className="h-2.5 bg-gray-200 rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all"
                          style={{
                            width: `${Math.min(100, (stats.ai_usage.neurons_today / stats.ai_usage.neurons_limit) * 100)}%`,
                            backgroundColor: stats.ai_usage.neurons_today / stats.ai_usage.neurons_limit > 0.8 ? '#ef4444' : '#10b981',
                          }}
                        />
                      </div>
                    </div>

                    {/* Model breakdown */}
                    {stats.ai_usage.models.length > 0 && (
                      <div className="space-y-1.5">
                        {stats.ai_usage.models.map((m) => (
                          <div key={m.modelId} className="flex items-center justify-between text-xs">
                            <span className="text-gray-500 font-mono">{fmtModel(m.modelId)}</span>
                            <div className="flex items-center gap-3">
                              <span className="text-gray-400">{m.count} 次</span>
                              <span className="font-medium text-gray-700">{m.neurons.toLocaleString()} neurons</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Daily neuron trend */}
                    {stats.ai_usage.daily.length > 0 && (
                      <div>
                        <p className="text-xs text-gray-400 mb-2">近7天 Neurons 趋势</p>
                        <MiniBarChart
                          data={stats.ai_usage.daily.map((d) => ({ label: d.date.slice(5), value: d.neurons }))}
                          color="#10b981"
                        />
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="bg-gray-50 rounded-xl p-4 text-sm text-gray-500">
                    <p>未配置 CF API Token，无法获取 Workers AI 精确用量。</p>
                    <p className="text-xs text-gray-400 mt-1">
                      请在 Cloudflare Pages 设置中添加环境变量 <code className="bg-gray-200 px-1 rounded">CF_API_TOKEN</code> 和 <code className="bg-gray-200 px-1 rounded">CF_ACCOUNT_ID</code>。
                    </p>
                  </div>
                )}
              </section>

              {/* Section 3: Usage stats */}
              <section>
                <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">使用量统计</h3>
                <div className="bg-gray-50 rounded-xl p-4 space-y-3">
                  {/* Usage table */}
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-gray-400 text-xs">
                        <th className="text-left font-medium pb-2">功能</th>
                        <th className="text-right font-medium pb-2">今日</th>
                        <th className="text-right font-medium pb-2">7天</th>
                        <th className="text-right font-medium pb-2">累计</th>
                      </tr>
                    </thead>
                    <tbody className="text-gray-700">
                      <tr>
                        <td className="py-1">语义搜索</td>
                        <td className="text-right">{stats.usage.search_today}</td>
                        <td className="text-right">{stats.usage.search_7d}</td>
                        <td className="text-right font-medium">{stats.usage.search_total}</td>
                      </tr>
                      <tr>
                        <td className="py-1">AI 问答</td>
                        <td className="text-right">{stats.usage.ai_qa_today}</td>
                        <td className="text-right">{stats.usage.ai_qa_7d}</td>
                        <td className="text-right font-medium">{stats.usage.ai_qa_total}</td>
                      </tr>
                      <tr>
                        <td className="py-1">AI 对话</td>
                        <td className="text-right">{stats.usage.ai_chat_today}</td>
                        <td className="text-right">{stats.usage.ai_chat_7d}</td>
                        <td className="text-right font-medium">{stats.usage.ai_chat_total}</td>
                      </tr>
                      <tr className="border-t border-gray-200">
                        <td className="py-1">向量化</td>
                        <td className="text-right" colSpan={2} />
                        <td className="text-right font-medium">{stats.usage.vectorize_total}</td>
                      </tr>
                      <tr>
                        <td className="py-1">导入</td>
                        <td className="text-right" colSpan={2} />
                        <td className="text-right font-medium">{stats.usage.import_total}</td>
                      </tr>
                    </tbody>
                  </table>

                  {/* 7-day trend chart */}
                  {stats.daily_trend.length > 0 && (
                    <div>
                      <p className="text-xs text-gray-400 mb-2">近7天调用趋势</p>
                      <StackedBarChart data={stats.daily_trend} />
                    </div>
                  )}

                  {/* Per-model usage */}
                  {stats.usage.model_usage && stats.usage.model_usage.length > 0 && (
                    <div>
                      <p className="text-xs text-gray-400 mb-2">模型调用统计</p>
                      <div className="space-y-1.5">
                        {stats.usage.model_usage.map((m) => (
                          <div key={m.model} className="flex items-center justify-between text-xs">
                            <span className="text-gray-500 font-mono truncate max-w-[200px]">{fmtModel(m.model)}</span>
                            <div className="flex items-center gap-3">
                              <span className="text-gray-400">今日 {m.today}</span>
                              <span className="font-medium text-gray-700">7天 {m.week}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </section>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

// ---- Sub-components ----

function StatCard({ label, value, color, sub }: { label: string; value: string | number; color: string; sub?: string }) {
  const colorMap: Record<string, string> = {
    emerald: 'bg-emerald-50 text-emerald-700',
    blue: 'bg-blue-50 text-blue-700',
    violet: 'bg-violet-50 text-violet-700',
    amber: 'bg-amber-50 text-amber-700',
  }
  return (
    <div className={`rounded-xl p-3 ${colorMap[color] ?? 'bg-gray-50 text-gray-700'}`}>
      <p className="text-2xl font-bold">{value}</p>
      <p className="text-xs opacity-70 mt-0.5">{label}</p>
      {sub && <p className="text-xs opacity-50 mt-0.5">{sub}</p>}
    </div>
  )
}

function MiniBarChart({ data, color }: { data: { label: string; value: number }[]; color: string }) {
  const max = Math.max(...data.map((d) => d.value), 1)
  return (
    <div className="flex items-end gap-1 h-16">
      {data.map((d, i) => (
        <div key={i} className="flex-1 flex flex-col items-center gap-1">
          <div className="w-full flex items-end justify-center" style={{ height: '48px' }}>
            <div
              className="w-full max-w-[28px] rounded-t transition-all"
              style={{ height: `${Math.max(2, (d.value / max) * 48)}px`, backgroundColor: color }}
              title={`${d.label}: ${d.value}`}
            />
          </div>
          <span className="text-[10px] text-gray-400">{d.label}</span>
        </div>
      ))}
    </div>
  )
}

function StackedBarChart({ data }: { data: { date: string; search: number; ai_qa: number; ai_chat?: number }[] }) {
  const max = Math.max(...data.map((d) => d.search + d.ai_qa + (d.ai_chat ?? 0)), 1)
  return (
    <div className="flex items-end gap-1 h-16">
      {data.map((d, i) => {
        const total = d.search + d.ai_qa + (d.ai_chat ?? 0)
        const searchH = total > 0 ? (d.search / max) * 48 : 0
        const aiH = total > 0 ? (d.ai_qa / max) * 48 : 0
        const chatH = total > 0 ? ((d.ai_chat ?? 0) / max) * 48 : 0
        return (
          <div key={i} className="flex-1 flex flex-col items-center gap-1">
            <div className="w-full flex flex-col items-center justify-end" style={{ height: '48px' }}>
              <div
                className="w-full max-w-[28px] rounded-t"
                style={{ height: `${Math.max(chatH > 0 ? 2 : 0, chatH)}px`, backgroundColor: '#8b5cf6' }}
                title={`AI对话: ${d.ai_chat ?? 0}`}
              />
              <div
                className="w-full max-w-[28px]"
                style={{ height: `${Math.max(aiH > 0 ? 2 : 0, aiH)}px`, backgroundColor: '#3b82f6' }}
                title={`AI问答: ${d.ai_qa}`}
              />
              <div
                className="w-full max-w-[28px]"
                style={{ height: `${Math.max(searchH > 0 ? 2 : 0, searchH)}px`, backgroundColor: '#10b981' }}
                title={`搜索: ${d.search}`}
              />
            </div>
            <span className="text-[10px] text-gray-400">{d.date.slice(5)}</span>
          </div>
        )
      })}
      {/* Legend */}
      <div className="flex flex-col gap-0.5 ml-1 text-[10px] shrink-0 justify-end pb-4">
        <div className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-emerald-500" />搜索</div>
        <div className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-blue-500" />问答</div>
        <div className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-violet-500" />对话</div>
      </div>
    </div>
  )
}

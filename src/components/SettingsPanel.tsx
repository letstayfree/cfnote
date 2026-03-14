import { useState, useEffect } from 'react'
import { useApi } from '../hooks/useApi'
import type { Settings, ModelInfo } from '../types'

const MODELS: ModelInfo[] = [
  { id: '@cf/meta/llama-3.1-8b-instruct', label: 'Llama 3.1 8B', description: '轻量快速，适合简单问答', type: '通用', cost: '~15 neurons' },
  { id: '@cf/meta/llama-3.3-70b-instruct-fp8-fast', label: 'Llama 3.3 70B', description: '大模型，综合能力强', type: '通用', cost: '~88 neurons' },
  { id: '@cf/deepseek-ai/deepseek-r1-distill-qwen-32b', label: 'DeepSeek R1 32B', description: '推理能力强，适合复杂分析', type: '推理', cost: '~178 neurons' },
  { id: '@cf/qwen/qwq-32b', label: 'QwQ 32B', description: '推理型，中文表现优秀', type: '推理', cost: '~87 neurons' },
]

interface Props {
  token: string
  onClose: () => void
}

export default function SettingsPanel({ token, onClose }: Props) {
  const api = useApi(token)
  const [selected, setSelected] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  useEffect(() => {
    (async () => {
      const res = await api.get<Settings>('/settings')
      if (res.ok && res.data) {
        setSelected(res.data.llm_model)
      } else {
        setError(res.error || '加载失败')
      }
      setLoading(false)
    })()
  }, [api])

  const handleSave = async () => {
    setSaving(true)
    setError('')
    const res = await api.put<Settings>('/settings', { llm_model: selected })
    if (res.ok) {
      onClose()
    } else {
      setError(res.error || '保存失败')
    }
    setSaving(false)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[10vh]" onClick={onClose}>
      <div className="absolute inset-0 bg-black/40" />
      <div
        className="relative bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[80vh] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-4 border-b border-gray-100 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <svg className="w-5 h-5 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            <span className="font-semibold text-gray-900">设置</span>
          </div>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {loading && (
            <div className="text-center py-12">
              <div className="inline-block w-6 h-6 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
              <p className="text-sm text-gray-500 mt-2">加载设置...</p>
            </div>
          )}

          {error && (
            <div className="text-sm text-red-500 bg-red-50 rounded-lg px-3 py-2">{error}</div>
          )}

          {!loading && (
            <>
              <div>
                <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">AI 模型</h3>
                <div className="space-y-2">
                  {MODELS.map((model) => {
                    const isSelected = selected === model.id
                    return (
                      <button
                        key={model.id}
                        onClick={() => setSelected(model.id)}
                        className={`w-full text-left rounded-xl border-2 p-3 transition-all ${
                          isSelected
                            ? 'border-emerald-500 bg-emerald-50'
                            : 'border-gray-200 hover:border-gray-300 bg-white'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${
                              isSelected ? 'border-emerald-500' : 'border-gray-300'
                            }`}>
                              {isSelected && <div className="w-2 h-2 rounded-full bg-emerald-500" />}
                            </div>
                            <span className={`font-medium text-sm ${isSelected ? 'text-emerald-700' : 'text-gray-900'}`}>
                              {model.label}
                            </span>
                            <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${
                              model.type === '推理'
                                ? 'bg-violet-100 text-violet-600'
                                : 'bg-blue-100 text-blue-600'
                            }`}>
                              {model.type}
                            </span>
                          </div>
                          <span className="text-xs text-gray-400">{model.cost}</span>
                        </div>
                        <p className="text-xs text-gray-500 mt-1 ml-6">{model.description}</p>
                      </button>
                    )
                  })}
                </div>
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        {!loading && (
          <div className="p-4 border-t border-gray-100 flex justify-end">
            <button
              onClick={handleSave}
              disabled={saving || !selected}
              className="px-4 py-2 bg-emerald-500 text-white text-sm font-medium rounded-lg hover:bg-emerald-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {saving ? '保存中...' : '保存'}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

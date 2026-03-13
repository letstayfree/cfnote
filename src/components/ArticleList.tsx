import type { Article } from '../types'

interface Props {
  articles: Article[]
  activeArticle: Article | null
  notebookName?: string
  onSelect: (article: Article) => void
  onCreate: () => void
  onDelete: (id: number) => Promise<any>
}

export default function ArticleList({ articles, activeArticle, notebookName, onSelect, onCreate, onDelete }: Props) {
  const formatDate = (d: string) => {
    const date = new Date(d + 'Z')
    const now = new Date()
    const diff = now.getTime() - date.getTime()
    if (diff < 60000) return '刚刚'
    if (diff < 3600000) return `${Math.floor(diff / 60000)}分钟前`
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}小时前`
    return date.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' })
  }

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between shrink-0">
        <div>
          <h2 className="font-medium text-gray-900 text-sm">{notebookName || '选择笔记本'}</h2>
          <span className="text-xs text-gray-400">{articles.length} 篇文章</span>
        </div>
        {notebookName && (
          <button
            onClick={onCreate}
            className="p-1.5 rounded-lg hover:bg-emerald-50 text-emerald-600 transition-colors"
            title="新建文章"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
          </button>
        )}
      </div>

      {/* Article list */}
      <div className="flex-1 overflow-y-auto">
        {articles.map((article) => (
          <div
            key={article.id}
            onClick={() => onSelect(article)}
            className={`px-4 py-3 border-b border-gray-50 cursor-pointer transition-colors group ${
              activeArticle?.id === article.id ? 'bg-emerald-50' : 'hover:bg-gray-50'
            }`}
          >
            <div className="flex items-start justify-between">
              <h3 className={`text-sm font-medium truncate flex-1 ${
                activeArticle?.id === article.id ? 'text-emerald-700' : 'text-gray-900'
              }`}>
                {article.title}
              </h3>
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  if (confirm('确定删除此文章？')) onDelete(article.id)
                }}
                className="p-1 rounded opacity-0 group-hover:opacity-100 hover:bg-red-50 text-gray-400 hover:text-red-500 transition-all shrink-0 ml-2"
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
              </button>
            </div>
            <p className="text-xs text-gray-400 mt-1 line-clamp-2">
              {(article as any).summary || article.content?.slice(0, 100) || '空文章'}
            </p>
            <div className="flex items-center gap-2 mt-1.5">
              <span className="text-xs text-gray-300">{formatDate(article.updated_at)}</span>
              {article.is_vectorized ? (
                <span className="text-xs text-emerald-500 flex items-center gap-0.5">
                  <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                  </svg>
                  已索引
                </span>
              ) : null}
            </div>
          </div>
        ))}

        {articles.length === 0 && notebookName && (
          <div className="text-center py-12 text-gray-400">
            <p className="text-sm">暂无文章</p>
            <button onClick={onCreate} className="text-sm text-emerald-500 hover:text-emerald-600 mt-1">
              + 创建第一篇
            </button>
          </div>
        )}

        {!notebookName && (
          <div className="text-center py-12 text-gray-400">
            <p className="text-sm">请先选择笔记本</p>
          </div>
        )}
      </div>
    </div>
  )
}

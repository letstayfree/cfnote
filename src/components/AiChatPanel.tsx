import { useState, useEffect, useRef, useCallback } from 'react'
import { marked } from 'marked'
import { useApi } from '../hooks/useApi'
import type { Conversation, Message, SendMessageResponse } from '../types'

interface Props {
  token: string
  onClose: () => void
  onOpenArticle: (id: number) => void
}

export default function AiChatPanel({ token, onClose, onOpenArticle }: Props) {
  const api = useApi(token)
  const [view, setView] = useState<'list' | 'chat'>('list')
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [activeConversation, setActiveConversation] = useState<Conversation | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [loading, setLoading] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [])

  // Load conversation list
  const loadConversations = useCallback(async () => {
    const res = await api.get<Conversation[]>('/conversations')
    if (res.ok && res.data) setConversations(res.data)
  }, [api])

  useEffect(() => {
    loadConversations()
  }, [loadConversations])

  useEffect(() => {
    scrollToBottom()
  }, [messages, scrollToBottom])

  // Open a conversation
  const openConversation = async (conv: Conversation) => {
    setLoading(true)
    const res = await api.get<{ conversation: Conversation; messages: Message[] }>(`/conversations/${conv.id}`)
    if (res.ok && res.data) {
      setActiveConversation(res.data.conversation)
      setMessages(res.data.messages)
      setView('chat')
    }
    setLoading(false)
    setTimeout(() => inputRef.current?.focus(), 100)
  }

  // Create new conversation and enter chat
  const newConversation = async () => {
    const res = await api.post<Conversation>('/conversations', {})
    if (res.ok && res.data) {
      setActiveConversation(res.data)
      setMessages([])
      setView('chat')
      setTimeout(() => inputRef.current?.focus(), 100)
    }
  }

  // Delete a conversation
  const deleteConversation = async (id: number, e: React.MouseEvent) => {
    e.stopPropagation()
    await api.del(`/conversations/${id}`)
    setConversations((prev) => prev.filter((c) => c.id !== id))
    if (activeConversation?.id === id) {
      setActiveConversation(null)
      setMessages([])
      setView('list')
    }
  }

  // Send message
  const sendMessage = async () => {
    if (!input.trim() || !activeConversation || sending) return
    const content = input.trim()
    setInput('')
    setSending(true)

    // Optimistic user message
    const tempUserMsg: Message = {
      id: -Date.now(),
      conversation_id: activeConversation.id,
      role: 'user',
      content,
      sources: null,
      created_at: new Date().toISOString(),
    }
    setMessages((prev) => [...prev, tempUserMsg])

    const res = await api.post<SendMessageResponse>(`/conversations/${activeConversation.id}/messages`, { content })

    if (res.ok && res.data) {
      // Replace optimistic message with real ones
      setMessages((prev) => [
        ...prev.filter((m) => m.id !== tempUserMsg.id),
        res.data!.user_message,
        res.data!.assistant_message,
      ])
      // Update title if changed
      if (res.data.title_updated) {
        setActiveConversation((prev) => prev ? { ...prev, title: res.data!.title_updated! } : prev)
        setConversations((prev) =>
          prev.map((c) => c.id === activeConversation.id ? { ...c, title: res.data!.title_updated! } : c)
        )
      }
    } else {
      // Replace optimistic message with kept user msg + error msg
      const errorMsg: Message = {
        id: -(Date.now() + 1),
        conversation_id: activeConversation.id,
        role: 'assistant',
        content: `**请求失败**：${res.error || '未知错误'}`,
        sources: null,
        created_at: new Date().toISOString(),
      }
      setMessages((prev) => [
        ...prev.filter((m) => m.id !== tempUserMsg.id),
        { ...tempUserMsg, id: -(Date.now() + 2) },
        errorMsg,
      ])
    }

    setSending(false)
  }

  // Back to list
  const goBack = () => {
    setView('list')
    setActiveConversation(null)
    setMessages([])
    loadConversations()
  }

  const formatTime = (dateStr: string) => {
    const d = new Date(dateStr + 'Z')
    const now = new Date()
    const diff = now.getTime() - d.getTime()
    if (diff < 86400000) {
      return d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
    }
    return d.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' })
  }

  const renderMarkdown = (text: string) => {
    return { __html: marked.parse(text) as string }
  }

  // ---- List View ----
  if (view === 'list') {
    return (
      <div className="h-full flex flex-col bg-gray-50/70">
        {/* Header */}
        <div className="h-13 border-b border-gray-200 flex items-center px-4 shrink-0 bg-white">
          <svg className="w-5 h-5 text-emerald-600 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
          </svg>
          <span className="font-semibold text-sm text-gray-900 flex-1">AI 助手</span>
          <button onClick={onClose} className="p-1 rounded hover:bg-gray-100 text-gray-400 hover:text-gray-600">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* New conversation button */}
        <div className="p-3">
          <button
            onClick={newConversation}
            className="w-full flex items-center justify-center gap-2 bg-emerald-500 hover:bg-emerald-600 text-white rounded-lg py-2 text-sm font-medium transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            新对话
          </button>
        </div>

        {/* Conversation list */}
        <div className="flex-1 overflow-y-auto px-3 pb-3">
          {conversations.length === 0 ? (
            <div className="text-center py-12 text-gray-400">
              <svg className="w-12 h-12 mx-auto mb-3 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
              </svg>
              <p className="text-sm">还没有对话</p>
              <p className="text-xs mt-1">点击上方按钮开始新对话</p>
            </div>
          ) : (
            <div className="space-y-1">
              {conversations.map((conv) => (
                <button
                  key={conv.id}
                  onClick={() => openConversation(conv)}
                  className="group w-full text-left bg-white hover:bg-gray-100 rounded-lg px-3 py-2.5 transition-colors relative"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-gray-900 truncate pr-8">{conv.title}</span>
                    <span className="text-xs text-gray-400 shrink-0">{formatTime(conv.updated_at)}</span>
                  </div>
                  <button
                    onClick={(e) => deleteConversation(conv.id, e)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded hover:bg-red-100 text-gray-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </button>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    )
  }

  // ---- Chat View ----
  return (
    <div className="h-full flex flex-col bg-white">
      {/* Header */}
      <div className="h-13 border-b border-gray-200 flex items-center px-3 shrink-0">
        <button onClick={goBack} className="p-1 rounded hover:bg-gray-100 text-gray-500 mr-2">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <span className="text-sm font-medium text-gray-900 truncate flex-1">
          {activeConversation?.title || '新对话'}
        </span>
        <button onClick={onClose} className="p-1 rounded hover:bg-gray-100 text-gray-400 hover:text-gray-600">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-3 py-4 space-y-3">
        {loading ? (
          <div className="text-center py-8">
            <div className="inline-block w-5 h-5 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : messages.length === 0 ? (
          <div className="text-center py-12 text-gray-400">
            <p className="text-sm">向 AI 助手提问吧</p>
            <p className="text-xs mt-1">基于你的知识库内容回答</p>
          </div>
        ) : (
          messages.map((msg) => (
            <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[85%] ${msg.role === 'user' ? 'order-1' : ''}`}>
                <div
                  className={`rounded-xl px-3 py-2 text-sm ${
                    msg.role === 'user'
                      ? 'bg-emerald-500 text-white'
                      : 'bg-gray-100 text-gray-800'
                  }`}
                >
                  {msg.role === 'assistant' ? (
                    <div
                      className="cfnote-preview prose prose-sm max-w-none [&>*:first-child]:mt-0 [&>*:last-child]:mb-0"
                      dangerouslySetInnerHTML={renderMarkdown(msg.content)}
                    />
                  ) : (
                    <span className="whitespace-pre-wrap">{msg.content}</span>
                  )}
                </div>

                {/* Sources */}
                {msg.sources && msg.sources.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-1.5">
                    {msg.sources.map((s, i) => (
                      <button
                        key={`${s.article_id}-${i}`}
                        onClick={() => onOpenArticle(s.article_id)}
                        className="text-xs bg-emerald-50 hover:bg-emerald-100 text-emerald-700 rounded-md px-2 py-0.5 transition-colors truncate max-w-[180px]"
                        title={s.article_title}
                      >
                        [{i + 1}] {s.article_title}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ))
        )}

        {/* Sending indicator */}
        {sending && (
          <div className="flex justify-start">
            <div className="bg-gray-100 rounded-xl px-4 py-3">
              <div className="flex items-center gap-1.5">
                <div className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce [animation-delay:0ms]" />
                <div className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce [animation-delay:150ms]" />
                <div className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce [animation-delay:300ms]" />
              </div>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="border-t border-gray-200 p-3">
        <div className="flex items-center gap-2">
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && sendMessage()}
            placeholder="输入问题..."
            disabled={sending}
            className="flex-1 text-sm border border-gray-200 rounded-lg px-3 py-2 outline-none focus:border-emerald-400 focus:ring-1 focus:ring-emerald-400 disabled:opacity-50 bg-white"
          />
          <button
            onClick={sendMessage}
            disabled={!input.trim() || sending}
            className="p-2 bg-emerald-500 hover:bg-emerald-600 disabled:opacity-40 disabled:hover:bg-emerald-500 text-white rounded-lg transition-colors shrink-0"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  )
}

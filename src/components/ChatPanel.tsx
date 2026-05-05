import React, { useState, useRef, useEffect } from 'react';
import { Sparkles, Trash2, ArrowDown, CornerDownRight, X, Square } from 'lucide-react';
import { Book, ChatMessage } from '../types';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '../lib/utils';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

interface ChatPanelProps {
  book: Book;
  messages: ChatMessage[];
  onSendMessage: (text: string) => void;
  onStopGenerate: () => void;
  onSummarize: () => void;
  isLoading: boolean;
  aiStatus: 'checking' | 'ready' | 'error';
  aiStatusMessage?: string;
  onRetryHealth?: () => void;
  onClear: () => void;
  pendingQuote?: string | null;
  onClearQuote?: () => void;
  theme: 'paper' | 'light' | 'dark' | 'eye';
}

export function ChatPanel({ messages, onSendMessage, onStopGenerate, onSummarize, isLoading, aiStatus, aiStatusMessage, onRetryHealth, onClear, pendingQuote, onClearQuote, theme }: ChatPanelProps) {
  const [input, setInput] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const isDark = theme === 'dark';

  const shellClasses = {
    light: 'bg-[#F3F4F6] text-[#1A1A1A]',
    paper: 'bg-[#F4F1EA] text-[#1A1A1A]',
    dark: 'bg-[#131313] text-[#D5D5D5]',
    eye: 'bg-[#042f38] text-[#ccefe8]',
  } as const;
  const accentClasses = { light: 'text-blue-600', paper: 'text-indigo-600', dark: 'text-sky-300', eye: 'text-[#24c6ad]' } as const;
  const toolBtnClasses = {
    light: 'border border-black/15 hover:bg-black/[0.04]',
    paper: 'border editorial-border hover:bg-white',
    dark: 'border border-white/15 hover:bg-white/8',
    eye: 'border border-[#1cb29b]/35 hover:bg-[#0a4b53]',
  } as const;
  const emptyCardClasses = {
    light: 'bg-white border border-black/10',
    paper: 'bg-white border editorial-border ai-glow',
    dark: 'bg-[#1B1B1B] border border-white/10',
    eye: 'bg-[#0a424b] border border-[#1fb39b]/28',
  } as const;
  const userMsgClasses = {
    light: 'bg-[#F7F8FA] border border-black/10',
    paper: 'bg-[#FDFCF8] border editorial-border',
    dark: 'bg-[#202020] border border-white/10',
    eye: 'bg-[#0c4851] border border-[#1fb39b]/30',
  } as const;
  const modelMsgClasses = {
    light: 'bg-white border border-black/12',
    paper: 'bg-white border editorial-border ai-glow',
    dark: 'bg-[#171717] border border-white/12',
    eye: 'bg-[#0a424b] border border-[#1fb39b]/28',
  } as const;
  const modelTextClasses = { light: 'text-gray-700', paper: 'text-gray-700', dark: 'text-[#C8C8C8]', eye: 'text-[#bde8de]' } as const;
  const quoteBlockClasses = { light: 'border-black/25 text-black/55', paper: 'border-gray-300 text-gray-500', dark: 'border-white/20 text-white/60', eye: 'border-[#25c8ad]/35 text-[#8ccfc2]' } as const;
  const loadingCardClasses = {
    light: 'bg-white border border-black/10',
    paper: 'bg-white border editorial-border',
    dark: 'bg-[#1B1B1B] border border-white/10',
    eye: 'bg-[#0a424b] border border-[#1fb39b]/28',
  } as const;
  const composerClasses = {
    light: 'border border-black/15 bg-white shadow-sm',
    paper: 'border editorial-border bg-white shadow-sm',
    dark: 'border border-white/15 bg-[#1A1A1A]',
    eye: 'border border-[#1fb39b]/35 bg-[#093f48] shadow-sm',
  } as const;
  const quotePanelClasses = {
    light: 'bg-black/[0.02] border-b border-black/10',
    paper: 'bg-[#F9F8F6] border-b editorial-border',
    dark: 'bg-white/5 border-b border-white/10',
    eye: 'bg-[#0b4b54]/55 border-b border-[#20b39b]/22',
  } as const;
  const quoteTextClasses = { light: 'text-black/60', paper: 'text-gray-500', dark: 'text-white/70', eye: 'text-[#8ccfc2]' } as const;
  const quoteDismissClasses = { light: 'hover:bg-black/8', paper: 'hover:bg-gray-200', dark: 'hover:bg-white/10', eye: 'hover:bg-[#0e5962]' } as const;
  const inputClasses = {
    light: 'bg-white text-[#1A1A1A] placeholder:text-black/30',
    paper: 'bg-white text-[#1A1A1A] placeholder:opacity-30',
    dark: 'bg-[#1A1A1A] text-[#E0E0E0] placeholder:text-white/30',
    eye: 'bg-[#083f48] text-[#d7f5ee] placeholder:text-[#8ecfc3]/65',
  } as const;
  const sendBtnClasses = {
    light: 'bg-[#1A1A1A] text-white hover:bg-black',
    paper: 'bg-black text-white',
    dark: 'bg-[#E2E2E2] text-[#161616] hover:bg-white',
    eye: 'bg-[#1db69e] text-[#05323b] hover:bg-[#29ccb2]',
  } as const;

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isLoading]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (input.trim() && !isLoading) {
      const finalMessage = pendingQuote ? `> ${pendingQuote}\n\n${input.trim()}` : input.trim();
      onSendMessage(finalMessage);
      setInput('');
      if (onClearQuote) onClearQuote();
    }
  };

  return (
    <div className={cn('w-full h-full p-8 flex flex-col overflow-hidden', shellClasses[theme])}>
      <div className="flex-1 flex flex-col gap-6 overflow-hidden">
        <div className="flex flex-col gap-2 shrink-0">
          <span className={cn('text-[10px] font-bold uppercase tracking-widest', accentClasses[theme])}>AI Assistant Context</span>
          <div className="flex items-center justify-between">
            <h3 className="serif text-2xl font-bold">深度逻辑分析</h3>
            <div className="flex gap-2">
              <button onClick={onSummarize} className={cn('p-1.5 transition-colors', toolBtnClasses[theme])} title="全书总结"><Sparkles className="w-3.5 h-3.5" /></button>
              <button onClick={onClear} className={cn('p-1.5 transition-colors', toolBtnClasses[theme])} title="清空对话"><Trash2 className="w-3.5 h-3.5" /></button>
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto space-y-6 pr-2 custom-scrollbar">
          <AnimatePresence initial={false}>
            {messages.length === 0 && (
              <div key="empty-state" className={cn('p-6', emptyCardClasses[theme])}>
                <p className="text-sm italic leading-relaxed opacity-70">你可以询问全书关联、逻辑矛盾或章节细节，例如“第二章的观点如何在后文被验证？”</p>
              </div>
            )}
            {messages.map((msg, i) => (
              <motion.div key={`${msg.timestamp || 'no-ts'}-${msg.role}-${i}`} initial={{ opacity: 0, x: msg.role === 'user' ? 20 : -20 }} animate={{ opacity: 1, x: 0 }} className={cn('flex flex-col gap-2', msg.role === 'user' ? 'items-end' : 'items-start')}>
                <div className={cn('p-6 max-w-[90%] relative', msg.role === 'user' ? userMsgClasses[theme] : modelMsgClasses[theme])}>
                  <div className="flex gap-3">
                    <div className={cn('w-2 h-2 rounded-full mt-2 shrink-0', msg.role === 'user' ? (isDark ? 'bg-white/80' : 'bg-black') : (isDark ? 'bg-sky-300' : 'bg-indigo-500'))}></div>
                    <div>
                      <p className={cn('text-[9px] font-bold uppercase mb-2', msg.role === 'user' ? (isDark ? 'text-white/90' : 'text-black') : accentClasses[theme])}>{msg.role === 'user' ? 'Query' : 'AI Insight'}</p>
                      <div className={cn('text-sm leading-relaxed', msg.role === 'user' ? 'font-semibold italic whitespace-pre-wrap' : modelTextClasses[theme])}>
                        {msg.role === 'user' && msg.content.startsWith('> ') ? (
                          <div className="space-y-4">
                            <div className={cn('border-l-2 pl-4 py-1 font-normal non-italic', quoteBlockClasses[theme])}>{msg.content.split('\n\n')[0].replace('> ', '')}</div>
                            <div>{msg.content.split('\n\n').slice(1).join('\n\n')}</div>
                          </div>
                        ) : msg.role === 'model' ? (
                          <div className="markdown-body">
                            <ReactMarkdown remarkPlugins={[remarkGfm]}>{msg.content}</ReactMarkdown>
                            {isLoading && i === messages.length - 1 && (
                              <span className="inline-block w-[2px] h-[1.05em] ml-1 align-[-2px] bg-current animate-pulse opacity-80" />
                            )}
                          </div>
                        ) : msg.content}
                      </div>
                    </div>
                  </div>
                </div>
              </motion.div>
            ))}
            {isLoading && (
              <div key="loading-state" className="flex justify-start">
                <div className={cn('p-4 flex items-center gap-3', loadingCardClasses[theme])}>
                  <div className={cn('w-1.5 h-1.5 animate-pulse', isDark ? 'bg-sky-300' : 'bg-indigo-500')}></div>
                  <span className="text-[10px] font-bold uppercase tracking-widest opacity-50">正在分析整本书...</span>
                </div>
              </div>
            )}
          </AnimatePresence>
          <div ref={messagesEndRef} />
        </div>

        <div className="shrink-0 mt-auto pt-6">
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-tighter opacity-70">
              <span className="flex items-center gap-2">
                <span className={cn('w-1.5 h-1.5 rounded-full', aiStatus === 'ready' ? 'bg-green-500' : aiStatus === 'checking' ? 'bg-amber-400 animate-pulse' : 'bg-red-500')} />
                {aiStatus === 'ready' ? '全书逻辑引擎已就绪' : aiStatus === 'checking' ? '模型连通性检测中' : `模型连接异常${aiStatusMessage ? `：${aiStatusMessage}` : ''}`}
              </span>
              <span>Gemini 3.1 Pro</span>
            </div>
            {aiStatus === 'error' && (
              <div className="text-[10px] opacity-70">
                <button type="button" onClick={onRetryHealth} className="underline underline-offset-2 hover:opacity-100 opacity-80">
                  重新检测模型连接
                </button>
              </div>
            )}
            <form onSubmit={handleSubmit} className={cn('relative flex flex-col gap-0 overflow-hidden', composerClasses[theme])}>
              <AnimatePresence>
                {pendingQuote && (
                  <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className={cn('p-4 relative group', quotePanelClasses[theme])}>
                    <div className="flex gap-3">
                      <CornerDownRight className={cn('w-4 h-4 mt-1 shrink-0', isDark ? 'text-sky-300' : 'text-indigo-400')} />
                      <p className={cn('text-xs italic leading-relaxed line-clamp-3 pr-6', quoteTextClasses[theme])}>{pendingQuote}</p>
                    </div>
                    <button type="button" onClick={onClearQuote} className={cn('absolute top-2 right-2 p-1 rounded-full opacity-0 group-hover:opacity-100 transition-opacity', quoteDismissClasses[theme])}><X className="w-3 h-3" /></button>
                  </motion.div>
                )}
              </AnimatePresence>
              <div className="relative flex items-center">
                <input type="text" value={input} onChange={(e) => setInput(e.target.value)} placeholder="询问关于整本书的问题..." className={cn('w-full p-4 pr-12 text-sm rounded-none focus:outline-none', inputClasses[theme])} />
                {isLoading ? (
                  <button
                    type="button"
                    onClick={onStopGenerate}
                    className={cn('absolute right-4 w-8 h-8 flex items-center justify-center transition-all hover:scale-105 active:scale-95', sendBtnClasses[theme])}
                    title="停止生成"
                  >
                    <Square className="w-3.5 h-3.5" />
                  </button>
                ) : (
                  <button
                    type="submit"
                    disabled={!input.trim()}
                    className={cn('absolute right-4 w-8 h-8 flex items-center justify-center transition-all hover:scale-105 active:scale-95 disabled:opacity-20', sendBtnClasses[theme])}
                    title="发送"
                  >
                    <ArrowDown className="w-4 h-4 rotate-[270deg]" />
                  </button>
                )}
              </div>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}

import React, { useState, useRef, useEffect } from 'react';
import { Sparkles, Trash2, ArrowDown, CornerDownRight, X } from 'lucide-react';
import { Book, ChatMessage } from '../types';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '../lib/utils';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

interface ChatPanelProps {
  book: Book;
  messages: ChatMessage[];
  onSendMessage: (text: string) => void;
  onSummarize: () => void;
  isLoading: boolean;
  onClear: () => void;
  pendingQuote?: string | null;
  onClearQuote?: () => void;
}

export function ChatPanel({ messages, onSendMessage, onSummarize, isLoading, onClear, pendingQuote, onClearQuote }: ChatPanelProps) {
  const [input, setInput] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

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
    <div className="w-full h-full bg-[#F4F1EA] p-8 flex flex-col overflow-hidden">
      <div className="flex-1 flex flex-col gap-6 overflow-hidden">
        <div className="flex flex-col gap-2 shrink-0">
          <span className="text-[10px] font-bold uppercase tracking-widest text-indigo-600">AI Assistant Context</span>
          <div className="flex items-center justify-between">
            <h3 className="serif text-2xl font-bold">深度逻辑分析</h3>
            <div className="flex gap-2">
              <button onClick={onSummarize} className="p-1.5 border editorial-border hover:bg-white transition-colors" title="全书总结"><Sparkles className="w-3.5 h-3.5" /></button>
              <button onClick={onClear} className="p-1.5 border editorial-border hover:bg-white transition-colors" title="清空对话"><Trash2 className="w-3.5 h-3.5" /></button>
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto space-y-6 pr-2 custom-scrollbar">
          <AnimatePresence initial={false}>
            {messages.length === 0 && (
              <div key="empty-state" className="bg-white p-6 border editorial-border ai-glow">
                <p className="text-sm italic leading-relaxed opacity-70">你可以询问全书关联、逻辑矛盾或章节细节，例如“第二章的观点如何在后文被验证？”</p>
              </div>
            )}
            {messages.map((msg, i) => (
              <motion.div key={`${msg.timestamp || 'no-ts'}-${msg.role}-${i}`} initial={{ opacity: 0, x: msg.role === 'user' ? 20 : -20 }} animate={{ opacity: 1, x: 0 }} className={cn('flex flex-col gap-2', msg.role === 'user' ? 'items-end' : 'items-start')}>
                <div className={cn('p-6 border editorial-border max-w-[90%] relative', msg.role === 'user' ? 'bg-[#FDFCF8]' : 'bg-white ai-glow')}>
                  <div className="flex gap-3">
                    <div className={cn('w-2 h-2 rounded-full mt-2 shrink-0', msg.role === 'user' ? 'bg-black' : 'bg-indigo-500')}></div>
                    <div>
                      <p className={cn('text-[9px] font-bold uppercase mb-2', msg.role === 'user' ? 'text-black' : 'text-indigo-600')}>{msg.role === 'user' ? 'Query' : 'AI Insight'}</p>
                      <div className={cn('text-sm leading-relaxed', msg.role === 'user' ? 'font-semibold italic whitespace-pre-wrap' : 'text-gray-700')}>
                        {msg.role === 'user' && msg.content.startsWith('> ') ? (
                          <div className="space-y-4">
                            <div className="border-l-2 border-gray-300 pl-4 py-1 text-gray-500 font-normal non-italic">{msg.content.split('\n\n')[0].replace('> ', '')}</div>
                            <div>{msg.content.split('\n\n').slice(1).join('\n\n')}</div>
                          </div>
                        ) : msg.role === 'model' ? (
                          <div className="markdown-body"><ReactMarkdown remarkPlugins={[remarkGfm]}>{msg.content}</ReactMarkdown></div>
                        ) : msg.content}
                      </div>
                    </div>
                  </div>
                </div>
              </motion.div>
            ))}
            {isLoading && (
              <div key="loading-state" className="flex justify-start">
                <div className="bg-white border editorial-border p-4 flex items-center gap-3">
                  <div className="w-1.5 h-1.5 bg-indigo-500 animate-pulse"></div>
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
              <span className="flex items-center gap-2"><span className="w-1.5 h-1.5 bg-green-500 rounded-full"></span>全书逻辑引擎已就绪</span>
              <span>Gemini 3.1 Pro</span>
            </div>
            <form onSubmit={handleSubmit} className="relative flex flex-col gap-0 border editorial-border bg-white shadow-sm overflow-hidden">
              <AnimatePresence>
                {pendingQuote && (
                  <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="bg-[#F9F8F6] p-4 border-b editorial-border relative group">
                    <div className="flex gap-3">
                      <CornerDownRight className="w-4 h-4 text-indigo-400 mt-1 shrink-0" />
                      <p className="text-xs italic leading-relaxed text-gray-500 line-clamp-3 pr-6">{pendingQuote}</p>
                    </div>
                    <button type="button" onClick={onClearQuote} className="absolute top-2 right-2 p-1 hover:bg-gray-200 rounded-full opacity-0 group-hover:opacity-100 transition-opacity"><X className="w-3 h-3" /></button>
                  </motion.div>
                )}
              </AnimatePresence>
              <div className="relative flex items-center">
                <input type="text" value={input} onChange={(e) => setInput(e.target.value)} placeholder="询问关于整本书的问题..." className="w-full bg-white p-4 pr-12 text-sm rounded-none focus:outline-none placeholder:opacity-30" />
                <button type="submit" disabled={!input.trim() || isLoading} className="absolute right-4 w-8 h-8 bg-black flex items-center justify-center text-white transition-all hover:scale-105 active:scale-95 disabled:opacity-20">
                  <ArrowDown className="w-4 h-4 rotate-[270deg]" />
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}

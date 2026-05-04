import React, { useEffect, useState } from 'react';
import { cn } from './lib/utils';
import { Book, ChatMessage } from './types';
import { Sidebar } from './components/Sidebar';
import { ReaderPanel } from './components/ReaderPanel';
import { ChatPanel } from './components/ChatPanel';
import { UploadZone } from './components/UploadZone';
import { Bookshelf } from './components/Bookshelf';
import { askAboutBook, summarizeBook } from './services/geminiService';
import { buildChatContext } from './engines/chatContextEngine';
import { importBookFile } from './engines/bookImportEngine';
import { AnimatePresence } from 'motion/react';
import { Loader2, Sparkles } from 'lucide-react';
const BOOKS_KEY = 'ai-reader-books';
const CHATS_KEY = 'ai-reader-chats';
const PROGRESS_KEY = 'ai-reader-progress';

export default function App() {
  const [isLoading, setIsLoading] = useState(true);
  const [books, setBooks] = useState<Book[]>([]);
  const [activeBookId, setActiveBookId] = useState<string | null>(null);
  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [chats, setChats] = useState<Record<string, ChatMessage[]>>({});
  const [isAiLoading, setIsAiLoading] = useState(false);
  const [progress, setProgress] = useState<Record<string, number>>({});
  const [pendingQuote, setPendingQuote] = useState<string | null>(null);
  const [isOverviewOpen, setIsOverviewOpen] = useState(false);
  const [view, setView] = useState<'bookshelf' | 'reader'>('bookshelf');
  const [readerWidth, setReaderWidth] = useState(60);
  const [isResizing, setIsResizing] = useState(false);

  useEffect(() => {
    const load = async () => {
      try {
        if (window.electronAPI?.getLibraryData) {
          const data = await window.electronAPI.getLibraryData();
          setBooks(data.books || []);
          setChats(data.chats || {});
          setProgress(data.progress || {});
        } else {
          const savedBooks = JSON.parse(localStorage.getItem(BOOKS_KEY) || '[]') as Book[];
          const savedChats = JSON.parse(localStorage.getItem(CHATS_KEY) || '{}') as Record<string, ChatMessage[]>;
          const savedProgress = JSON.parse(localStorage.getItem(PROGRESS_KEY) || '{}') as Record<string, number>;
          setBooks(savedBooks);
          setChats(savedChats);
          setProgress(savedProgress);
        }
      } finally {
        setIsLoading(false);
      }
    };
    load();
  }, []);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizing) return;
      const newWidth = (e.clientX / window.innerWidth) * 100;
      if (newWidth > 20 && newWidth < 80) {
        setReaderWidth(newWidth);
      }
    };

    const handleMouseUp = () => {
      setIsResizing(false);
      document.body.style.cursor = 'default';
    };

    if (isResizing) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = 'col-resize';
    }

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isResizing]);

  const handleUpload = async (file: File) => {
    setIsUploading(true);
    try {
      const imported = await importBookFile(file);
      const text = imported.text;

      const textSize = new Blob([text]).size;
      if (textSize > 950 * 1024) {
        throw new Error(`提取出的文本内容过大 (${(textSize / 1024 / 1024).toFixed(2)}MB)。请将文本控制在 1MB 以内后重试。`);
      }
      if (!text.trim()) {
        throw new Error('无法从文件中提取有效文本内容，请确认文件未加密且包含可识别文字。');
      }

      const newBook: Book = {
        id: crypto.randomUUID(),
        title: file.name.replace(/\.[^/.]+$/, ''),
        author: '未知作者',
        content: text,
        createdAt: new Date().toISOString(),
        fileType: file.type,
        toc: imported.toc,
        cover: imported.cover,
        pdfPath: imported.pdfPath,
        sourceFileName: file.name,
      };

      setBooks((prev) => [newBook, ...prev]);
      if (window.electronAPI?.saveBook) {
        await window.electronAPI.saveBook(newBook);
      } else {
        const nextBooks = [newBook, ...books];
        localStorage.setItem(BOOKS_KEY, JSON.stringify(nextBooks));
      }
      setActiveBookId(newBook.id);
      setIsUploadOpen(false);
      setView('reader');
    } catch (error: any) {
      alert(error?.message || '上传失败');
    } finally {
      setIsUploading(false);
    }
  };

  const handleSendMessage = async (text: string) => {
    if (!activeBookId) return;
    const book = books.find((b) => b.id === activeBookId);
    if (!book) return;

    const currentHistory = chats[activeBookId] || [];
    const currentPage = progress[activeBookId] || 0;
    const askContent = buildChatContext(book, currentPage);
    const userMsg: ChatMessage = { role: 'user', content: text, timestamp: new Date().toISOString() };
    const nextMsgs = [...currentHistory, userMsg];
    setChats((prev) => ({ ...prev, [activeBookId]: nextMsgs }));
    if (window.electronAPI?.saveChat) {
      await window.electronAPI.saveChat({ bookId: activeBookId, messages: nextMsgs });
    } else {
      const nextChats = { ...chats, [activeBookId]: nextMsgs };
      localStorage.setItem(CHATS_KEY, JSON.stringify(nextChats));
    }
    setIsAiLoading(true);

    try {
      const aiResponse = await askAboutBook(book.title, askContent, currentHistory, text);
      const aiMsg: ChatMessage = { role: 'model', content: aiResponse || '抱歉，我暂时无法回答。', timestamp: new Date().toISOString() };
      const finalMessages = [...nextMsgs, aiMsg];
      setChats((prev) => ({ ...prev, [activeBookId]: finalMessages }));
      if (window.electronAPI?.saveChat) {
        await window.electronAPI.saveChat({ bookId: activeBookId, messages: finalMessages });
      } else {
        const nextChats = { ...chats, [activeBookId]: finalMessages };
        localStorage.setItem(CHATS_KEY, JSON.stringify(nextChats));
      }
    } catch (error: any) {
      const failMsg: ChatMessage = {
        role: 'model',
        content: `当前模型请求失败：${error?.message || '未知错误'}。请稍后重试。`,
        timestamp: new Date().toISOString(),
      };
      const finalMessages = [...nextMsgs, failMsg];
      setChats((prev) => ({ ...prev, [activeBookId]: finalMessages }));
      if (window.electronAPI?.saveChat) {
        await window.electronAPI.saveChat({ bookId: activeBookId, messages: finalMessages });
      } else {
        const nextChats = { ...chats, [activeBookId]: finalMessages };
        localStorage.setItem(CHATS_KEY, JSON.stringify(nextChats));
      }
    } finally {
      setIsAiLoading(false);
    }
  };

  const handleSummarize = async () => {
    if (!activeBookId) return;
    const book = books.find((b) => b.id === activeBookId);
    if (!book) return;
    setIsAiLoading(true);
    try {
      const summary = await summarizeBook(book.title, book.content);
      await handleSendMessage(`请为我总结这本书：${summary}`);
    } finally {
      setIsAiLoading(false);
    }
  };

  const updateProgress = (page: number) => {
    if (!activeBookId) return;
    setProgress((prev) => ({ ...prev, [activeBookId]: page }));
    if (window.electronAPI?.saveProgress) {
      void window.electronAPI.saveProgress({ bookId: activeBookId, currentPage: page });
    } else {
      const nextProgress = { ...progress, [activeBookId]: page };
      localStorage.setItem(PROGRESS_KEY, JSON.stringify(nextProgress));
    }
  };

  if (isLoading) {
    return (
      <div className="h-screen w-full flex items-center justify-center bg-[#F9F8F6]">
        <Loader2 className="w-8 h-8 animate-spin text-[#9A8C73]" />
      </div>
    );
  }

  const activeBook = books.find((b) => b.id === activeBookId) || null;

  return (
    <div className="h-screen w-full flex overflow-hidden bg-[#F4F1EA] text-[#1A1A1A]">
      <Sidebar view={view} setView={setView} activeBook={!!activeBook} activeBookTitle={activeBook?.title} onUpload={() => setIsUploadOpen(true)} />

      <div className="flex-1 flex flex-col overflow-hidden relative">
        <header className="h-20 px-12 flex items-center justify-between border-b border-black/5 bg-[#FDFCF8] shrink-0">
          <div className="flex-1 max-w-xl">
            {view === 'bookshelf' || !activeBook ? (
              <div className="relative group">
                <div className="absolute inset-y-0 left-4 flex items-center pointer-events-none">
                  <span className="text-black/20 group-focus-within:text-black/50 transition-colors">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path></svg>
                  </span>
                </div>
                <input type="text" placeholder="搜索我的书库..." className="w-full bg-[#f9f9fb] border-none rounded-xl py-2.5 pl-12 pr-4 text-xs font-bold tracking-tight focus:ring-1 focus:ring-black/5 placeholder:text-black/10 transition-all outline-none" />
              </div>
            ) : null}
          </div>
          <div className="flex items-center gap-6 ml-8">
            <div className="text-[10px] font-bold uppercase tracking-widest opacity-20 hidden lg:block">{activeBook ? `Current: ${activeBook.title}` : 'No book selected'}</div>
            <button disabled={!activeBook} onClick={() => activeBook && setIsOverviewOpen(true)} className={cn('w-10 h-10 flex items-center justify-center rounded-xl hover:bg-black/5 transition-all', !activeBook && 'opacity-20 cursor-not-allowed')}>
              <Sparkles className="w-5 h-5 opacity-40" />
            </button>
          </div>
        </header>

        <main className={cn('flex-1 relative flex overflow-hidden bg-[#F4F1EA]', isResizing && 'pointer-events-none')}>
          {view === 'bookshelf' || !activeBook ? (
            <Bookshelf
              books={books}
              progress={progress}
              onUploadClick={() => setIsUploadOpen(true)}
              onSelectBook={(book) => {
                setActiveBookId(book.id);
                setView('reader');
              }}
            />
          ) : (
            <div className="flex-1 flex w-full">
              <section style={{ width: `${readerWidth}%` }} className="h-full">
                <ReaderPanel
                  book={activeBook}
                  currentPage={progress[activeBook.id] || 0}
                  onPageChange={updateProgress}
                  onAnnotate={(text) => setPendingQuote(text)}
                  isOverviewOpen={isOverviewOpen}
                  onCloseOverview={() => setIsOverviewOpen(false)}
                />
              </section>

              <div className={cn('w-1 h-full cursor-col-resize hover:bg-indigo-500/50 transition-colors z-[100] flex items-center justify-center group', isResizing ? 'bg-indigo-500' : 'bg-transparent')} onMouseDown={() => setIsResizing(true)}>
                <div className="w-px h-8 bg-gray-300 group-hover:bg-indigo-400" />
              </div>

              <section style={{ width: `${100 - readerWidth}%` }} className="h-full bg-white border-l border-black/5">
                <ChatPanel
                  book={activeBook}
                  messages={chats[activeBookId!] || []}
                  onSendMessage={handleSendMessage}
                  onSummarize={handleSummarize}
                  isLoading={isAiLoading}
                  pendingQuote={pendingQuote}
                  onClearQuote={() => setPendingQuote(null)}
                  onClear={async () => {
                    if (!activeBookId) return;
                    setChats((prev) => ({ ...prev, [activeBookId]: [] }));
                    if (window.electronAPI?.saveChat) {
                      await window.electronAPI.saveChat({ bookId: activeBookId, messages: [] });
                    } else {
                      const nextChats = { ...chats, [activeBookId]: [] };
                      localStorage.setItem(CHATS_KEY, JSON.stringify(nextChats));
                    }
                  }}
                />
              </section>
            </div>
          )}
        </main>
      </div>

      <AnimatePresence>{isUploadOpen && <UploadZone onClose={() => setIsUploadOpen(false)} onUpload={handleUpload} isUploading={isUploading} />}</AnimatePresence>
    </div>
  );
}


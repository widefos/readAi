import React, { useCallback, useEffect, useRef, useState } from 'react';
import { cn } from './lib/utils';
import { Book, ChatMessage } from './types';
import { Sidebar } from './components/Sidebar';
import { ReaderPanel } from './components/ReaderPanel';
import { ChatPanel } from './components/ChatPanel';
import { UploadZone } from './components/UploadZone';
import { Bookshelf } from './components/Bookshelf';
import { askAboutBook, summarizeBook } from './services/geminiService';
import { buildChatContext } from './engines/chatContextEngine';
import { importBookFile, resolvePdfPageCount } from './engines/bookImportEngine';
import { AnimatePresence, motion } from 'motion/react';
import { Loader2, Sparkles, X } from 'lucide-react';
const BOOKS_KEY = 'ai-reader-books';
const CHATS_KEY = 'ai-reader-chats';
const PROGRESS_KEY = 'ai-reader-progress';
const PROGRESS_ANCHOR_KEY = 'ai-reader-progress-anchor';

export default function App() {
  const [isLoading, setIsLoading] = useState(true);
  const [books, setBooks] = useState<Book[]>([]);
  const [activeBookId, setActiveBookId] = useState<string | null>(null);
  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [chats, setChats] = useState<Record<string, ChatMessage[]>>({});
  const [isAiLoading, setIsAiLoading] = useState(false);
  const [progress, setProgress] = useState<Record<string, number>>({});
  const [progressAnchors, setProgressAnchors] = useState<Record<string, number>>({});
  const [pendingQuote, setPendingQuote] = useState<string | null>(null);
  const [isOverviewOpen, setIsOverviewOpen] = useState(false);
  const [pendingDeleteBook, setPendingDeleteBook] = useState<Book | null>(null);
  const [duplicateBook, setDuplicateBook] = useState<Book | null>(null);
  const [view, setView] = useState<'bookshelf' | 'reader'>('bookshelf');
  const [openReaderBookIds, setOpenReaderBookIds] = useState<string[]>([]);
  const [draggingBookId, setDraggingBookId] = useState<string | null>(null);
  const [dragOverTab, setDragOverTab] = useState<{ bookId: string; side: 'left' | 'right' } | null>(null);
  const [tabMenu, setTabMenu] = useState<{ x: number; y: number; bookId: string } | null>(null);
  const [readerWidth, setReaderWidth] = useState(60);
  const [isResizing, setIsResizing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const hydratingBookIdsRef = useRef<Set<string>>(new Set());
  const progressRef = useRef<Record<string, number>>({});

  const buildLegacyFingerprint = async (book: Book) => {
    const raw = `${book.title}|${book.sourceFileName || ''}|${book.fileType}|${book.content}`;
    const bytes = new TextEncoder().encode(raw);
    const digest = await crypto.subtle.digest('SHA-256', bytes);
    return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, '0')).join('');
  };

  const fuzzyScore = (query: string, target: string): number => {
    const q = query.trim().toLowerCase();
    const t = target.toLowerCase();
    if (!q) return 1;
    if (!t) return 0;
    if (t.includes(q)) return 100 + q.length / Math.max(t.length, 1);

    let qi = 0;
    let firstMatch = -1;
    let lastMatch = -1;
    for (let ti = 0; ti < t.length && qi < q.length; ti++) {
      if (t[ti] === q[qi]) {
        if (firstMatch === -1) firstMatch = ti;
        lastMatch = ti;
        qi++;
      }
    }
    if (qi !== q.length) return 0;

    const span = lastMatch - firstMatch + 1;
    const compactness = q.length / Math.max(span, 1);
    const positionBoost = 1 - firstMatch / Math.max(t.length, 1);
    return compactness * 10 + positionBoost;
  };

  const searchedBooks = books
    .map((book) => {
      const score = Math.max(
        fuzzyScore(searchQuery, book.title || ''),
        fuzzyScore(searchQuery, book.author || ''),
        fuzzyScore(searchQuery, book.sourceFileName || ''),
      );
      return { book, score };
    })
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .map((item) => item.book);

  useEffect(() => {
    const load = async () => {
      try {
        if (window.electronAPI?.getLibraryData) {
          const data = await window.electronAPI.getLibraryData();
          const loadedBooks = data.books || [];
          const needsMigration = loadedBooks.filter((b) => !b.fingerprint);
          if (needsMigration.length > 0) {
            const migrated = await Promise.all(
              loadedBooks.map(async (b) => (b.fingerprint ? b : { ...b, fingerprint: await buildLegacyFingerprint(b) })),
            );
            setBooks(migrated);
            for (const b of migrated) {
              if (window.electronAPI?.saveBook) {
                await window.electronAPI.saveBook(b);
              }
            }
          } else {
            setBooks(loadedBooks);
          }
          setChats(data.chats || {});
          setProgress(data.progress || {});
          setProgressAnchors(data.progressAnchors || {});
        } else {
          const savedBooks = JSON.parse(localStorage.getItem(BOOKS_KEY) || '[]') as Book[];
          const needsMigration = savedBooks.filter((b) => !b.fingerprint);
          if (needsMigration.length > 0) {
            const migrated = await Promise.all(
              savedBooks.map(async (b) => (b.fingerprint ? b : { ...b, fingerprint: await buildLegacyFingerprint(b) })),
            );
            setBooks(migrated);
            localStorage.setItem(BOOKS_KEY, JSON.stringify(migrated));
          } else {
            setBooks(savedBooks);
          }
          const savedChats = JSON.parse(localStorage.getItem(CHATS_KEY) || '{}') as Record<string, ChatMessage[]>;
          const savedProgress = JSON.parse(localStorage.getItem(PROGRESS_KEY) || '{}') as Record<string, number>;
          const savedAnchors = JSON.parse(localStorage.getItem(PROGRESS_ANCHOR_KEY) || '{}') as Record<string, number>;
          setChats(savedChats);
          setProgress(savedProgress);
          setProgressAnchors(savedAnchors);
        }
      } finally {
        setIsLoading(false);
      }
    };
    load();
  }, []);

  useEffect(() => {
    progressRef.current = progress;
  }, [progress]);

  useEffect(() => {
    const targets = books.filter(
      (b) => b.fileType === 'application/pdf' && b.pdfPath && (!b.pageCount || b.pageCount <= 0),
    );
    if (targets.length === 0) return;

    for (const book of targets) {
      if (hydratingBookIdsRef.current.has(book.id)) continue;
      hydratingBookIdsRef.current.add(book.id);

      void (async () => {
        try {
          const pageCount = await resolvePdfPageCount(book.pdfPath);
          if (!pageCount || pageCount <= 0) return;

          setBooks((prev) => prev.map((b) => (b.id === book.id ? { ...b, pageCount } : b)));

          if (window.electronAPI?.saveBook) {
            await window.electronAPI.saveBook({ ...book, pageCount });
          } else {
            const nextBooks = books.map((b) => (b.id === book.id ? { ...b, pageCount } : b));
            localStorage.setItem(BOOKS_KEY, JSON.stringify(nextBooks));
          }
        } finally {
          hydratingBookIdsRef.current.delete(book.id);
        }
      })();
    }
  }, [books]);

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

  useEffect(() => {
    if (!tabMenu) return;
    const closeMenu = () => setTabMenu(null);
    window.addEventListener('click', closeMenu);
    return () => window.removeEventListener('click', closeMenu);
  }, [tabMenu]);

  const closeReaderTab = (bookId: string) => {
    setOpenReaderBookIds((prev) => {
      const next = prev.filter((id) => id !== bookId);
      if (bookId === activeBookId) {
        setActiveBookId(next[0] ?? null);
        if (next.length === 0) setView('bookshelf');
      }
      return next;
    });
  };

  const closeOtherTabs = (bookId: string) => {
    setOpenReaderBookIds([bookId]);
    setActiveBookId(bookId);
    setView('reader');
  };

  const closeTabsToRight = (bookId: string) => {
    setOpenReaderBookIds((prev) => {
      const index = prev.indexOf(bookId);
      if (index === -1) return prev;
      const kept = prev.slice(0, index + 1);
      if (activeBookId && !kept.includes(activeBookId)) {
        setActiveBookId(bookId);
      }
      return kept;
    });
  };

  const moveTabRelative = (sourceId: string, targetId: string, side: 'left' | 'right') => {
    if (sourceId === targetId) return;
    setOpenReaderBookIds((prev) => {
      const sourceIndex = prev.indexOf(sourceId);
      const targetIndex = prev.indexOf(targetId);
      if (sourceIndex === -1 || targetIndex === -1) return prev;
      const next = [...prev];
      next.splice(sourceIndex, 1);
      let insertAt = sourceIndex < targetIndex ? targetIndex - 1 : targetIndex;
      if (side === 'right') insertAt += 1;
      next.splice(insertAt, 0, sourceId);
      return next;
    });
  };

  const handleUpload = async (file: File) => {
    setIsUploading(true);
    try {
      const imported = await importBookFile(file);
      const normalizedTitle = file.name.replace(/\.[^/.]+$/, '');
      const duplicated = books.find((b) => {
        if (b.fingerprint && b.fingerprint === imported.fingerprint) return true;
        if (
          file.type === 'application/pdf' &&
          b.fileType === 'application/pdf' &&
          b.title === normalizedTitle &&
          (b.pageCount ?? -1) === (imported.pageCount ?? -1)
        ) {
          return true;
        }
        if (
          file.type !== 'application/pdf' &&
          b.fileType === file.type &&
          b.title === normalizedTitle
        ) {
          if (b.content === imported.text) return true;
          if (
            b.content.length === imported.text.length &&
            b.content.slice(0, 500) === imported.text.slice(0, 500)
          ) {
            return true;
          }
        }
        return false;
      });
      if (duplicated) {
        setDuplicateBook(duplicated);
        return;
      }
      const text = imported.text;

      const textSize = new Blob([text]).size;
      const MAX_EXTRACTED_TEXT_SIZE = 20 * 1024 * 1024;
      if (textSize > MAX_EXTRACTED_TEXT_SIZE) {
        throw new Error(`提取出的文本内容过大 (${(textSize / 1024 / 1024).toFixed(2)}MB)。请将文本控制在 20MB 以内后重试。`);
      }
      if (!text.trim()) {
        throw new Error('无法从文件中提取有效文本内容，请确认文件未加密且包含可识别文字。');
      }

      const newBook: Book = {
        id: crypto.randomUUID(),
        title: normalizedTitle,
        author: '未知作者',
        content: text,
        createdAt: new Date().toISOString(),
        fileType: file.type,
        toc: imported.toc,
        cover: imported.cover,
        pdfPath: imported.pdfPath,
        sourceFileName: file.name,
        pageCount: imported.pageCount,
        fingerprint: imported.fingerprint,
      };

      setBooks((prev) => [newBook, ...prev]);
      if (window.electronAPI?.saveBook) {
        await window.electronAPI.saveBook(newBook);
      } else {
        const nextBooks = [newBook, ...books];
        localStorage.setItem(BOOKS_KEY, JSON.stringify(nextBooks));
      }
      setActiveBookId(newBook.id);
      setOpenReaderBookIds((prev) => (prev.includes(newBook.id) ? prev : [newBook.id, ...prev]));
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

  const updateProgressForBook = useCallback((bookId: string, page: number, paragraphAnchor?: number) => {
    const currentPage = progressRef.current[bookId] ?? 0;
    const currentAnchor = progressAnchors[bookId];
    const pageUnchanged = currentPage === page;
    const anchorUnchanged = paragraphAnchor === undefined || currentAnchor === paragraphAnchor;
    if (pageUnchanged && anchorUnchanged) return;

    setProgress((prev) => (prev[bookId] === page ? prev : { ...prev, [bookId]: page }));
    if (paragraphAnchor !== undefined) {
      setProgressAnchors((prev) => (prev[bookId] === paragraphAnchor ? prev : { ...prev, [bookId]: paragraphAnchor }));
    }
    if (window.electronAPI?.saveProgress) {
      void window.electronAPI.saveProgress({ bookId, currentPage: page, paragraphAnchor });
    } else {
      const nextProgress = { ...progress, [bookId]: page };
      const nextAnchors =
        paragraphAnchor !== undefined ? { ...progressAnchors, [bookId]: paragraphAnchor } : progressAnchors;
      localStorage.setItem(PROGRESS_KEY, JSON.stringify(nextProgress));
      localStorage.setItem(PROGRESS_ANCHOR_KEY, JSON.stringify(nextAnchors));
    }
  }, [progress, progressAnchors]);

  const updateAnchorForBook = useCallback((bookId: string, paragraphAnchor: number) => {
    setProgressAnchors((prev) => (prev[bookId] === paragraphAnchor ? prev : { ...prev, [bookId]: paragraphAnchor }));
    const currentPage = progressRef.current[bookId] ?? 0;
    if (window.electronAPI?.saveProgress) {
      void window.electronAPI.saveProgress({ bookId, currentPage, paragraphAnchor });
    } else {
      const nextAnchors = { ...progressAnchors, [bookId]: paragraphAnchor };
      localStorage.setItem(PROGRESS_ANCHOR_KEY, JSON.stringify(nextAnchors));
      localStorage.setItem(PROGRESS_KEY, JSON.stringify(progressRef.current));
    }
  }, [progressAnchors]);

  const performDeleteBook = async (book: Book) => {
    setBooks((prev) => prev.filter((b) => b.id !== book.id));
    setChats((prev) => {
      const next = { ...prev };
      delete next[book.id];
      return next;
    });
    setProgress((prev) => {
      const next = { ...prev };
      delete next[book.id];
      return next;
    });
    setProgressAnchors((prev) => {
      const next = { ...prev };
      delete next[book.id];
      return next;
    });

    if (activeBookId === book.id) {
      setOpenReaderBookIds((prev) => {
        const next = prev.filter((id) => id !== book.id);
        setActiveBookId(next[0] ?? null);
        if (next.length === 0) setView('bookshelf');
        return next;
      });
    } else {
      setOpenReaderBookIds((prev) => prev.filter((id) => id !== book.id));
    }

    if (window.electronAPI?.deleteBook) {
      await window.electronAPI.deleteBook(book.id);
    } else {
      const nextBooks = books.filter((b) => b.id !== book.id);
      const nextChats = { ...chats };
      const nextProgress = { ...progress };
      const nextAnchors = { ...progressAnchors };
      delete nextChats[book.id];
      delete nextProgress[book.id];
      delete nextAnchors[book.id];
      localStorage.setItem(BOOKS_KEY, JSON.stringify(nextBooks));
      localStorage.setItem(CHATS_KEY, JSON.stringify(nextChats));
      localStorage.setItem(PROGRESS_KEY, JSON.stringify(nextProgress));
      localStorage.setItem(PROGRESS_ANCHOR_KEY, JSON.stringify(nextAnchors));
    }
  };

  const activeBook = books.find((b) => b.id === activeBookId) || null;
  const openReaderBooks = openReaderBookIds
    .map((id) => books.find((b) => b.id === id))
    .filter((b): b is Book => Boolean(b));
  const hasOpenTabs = openReaderBooks.length > 0;
  const displayBook = activeBook || openReaderBooks[0] || null;

  useEffect(() => {
    // Keep reader tabs stable during state races: if we still have open tabs,
    // always recover a valid active tab.
    if (hasOpenTabs && (!activeBookId || !openReaderBooks.some((b) => b.id === activeBookId))) {
      setActiveBookId(openReaderBooks[0].id);
    }
  }, [hasOpenTabs, openReaderBooks, activeBookId]);

  if (isLoading) {
    return (
      <div className="h-screen w-full flex items-center justify-center bg-[#F9F8F6]">
        <Loader2 className="w-8 h-8 animate-spin text-[#9A8C73]" />
      </div>
    );
  }

  return (
    <div className="h-screen w-full flex overflow-hidden bg-[#F4F1EA] text-[#1A1A1A]">
      <Sidebar view={view} setView={setView} hasOpenReaderTabs={hasOpenTabs} onUpload={() => setIsUploadOpen(true)} />

      <div className="flex-1 flex flex-col overflow-hidden relative min-h-0">
        <header className="h-20 px-12 flex items-center justify-between border-b border-black/5 bg-[#FDFCF8] shrink-0 relative z-30">
          <div className="flex-1 max-w-xl">
            {view === 'bookshelf' || !displayBook ? (
              <div className="relative group">
                <div className="absolute inset-y-0 left-4 flex items-center pointer-events-none">
                  <span className="text-black/20 group-focus-within:text-black/50 transition-colors">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path></svg>
                  </span>
                </div>
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="搜索我的书库..."
                  className="w-full bg-[#f9f9fb] border-none rounded-xl py-2.5 pl-12 pr-4 text-xs font-bold tracking-tight focus:ring-1 focus:ring-black/5 placeholder:text-black/10 transition-all outline-none"
                />
              </div>
            ) : null}
          </div>
          <div className="flex items-center gap-6 ml-8">
            <div className="text-[10px] font-bold uppercase tracking-widest opacity-20 hidden lg:block">{displayBook ? `Current: ${displayBook.title}` : 'No book selected'}</div>
            <button disabled={!displayBook} onClick={() => displayBook && setIsOverviewOpen(true)} className={cn('w-10 h-10 flex items-center justify-center rounded-xl hover:bg-black/5 transition-all', !displayBook && 'opacity-20 cursor-not-allowed')}>
              <Sparkles className="w-5 h-5 opacity-40" />
            </button>
          </div>
        </header>

        <main className={cn('flex-1 relative flex overflow-hidden bg-[#F4F1EA] min-h-0', isResizing && 'pointer-events-none')}>
          {view === 'bookshelf' ? (
            <Bookshelf
              books={searchedBooks}
              progress={progress}
              onUploadClick={() => setIsUploadOpen(true)}
              onDeleteBook={(book) => setPendingDeleteBook(book)}
              onSelectBook={(book) => {
                setActiveBookId(book.id);
                setOpenReaderBookIds((prev) => (prev.includes(book.id) ? prev : [book.id, ...prev]));
                setView('reader');
              }}
            />
          ) : (
            <div className="flex-1 flex flex-col w-full min-h-0">
              <div
                className="h-12 shrink-0 border-b border-black/5 bg-[#FDFCF8] flex items-center px-4 gap-2 overflow-x-auto relative z-20"
                onDragOver={(e) => e.preventDefault()}
                onDrop={() => {
                  setDraggingBookId(null);
                  setDragOverTab(null);
                }}
              >
                {openReaderBooks.map((book) => {
                  const isActive = book.id === activeBookId;
                  return (
                    <div
                      key={book.id}
                      className="relative"
                    >
                      {dragOverTab?.bookId === book.id && dragOverTab.side === 'left' && (
                        <div className="absolute -left-1 top-1/2 -translate-y-1/2 h-5 w-0.5 bg-black/60 rounded-full z-20" />
                      )}
                      <div
                      className={cn(
                        'group min-w-0 max-w-[280px] h-8 rounded-t-lg border px-3 flex items-center gap-2 cursor-pointer transition-all',
                        isActive
                          ? 'bg-white border-black/15 border-b-white shadow-sm'
                          : 'bg-[#f3f0e8] border-black/10 hover:bg-[#ece8dd]',
                        draggingBookId === book.id && 'opacity-60',
                      )}
                      draggable
                      onDragStart={() => setDraggingBookId(book.id)}
                      onDragEnd={() => {
                        setDraggingBookId(null);
                        setDragOverTab(null);
                      }}
                      onDragOver={(e) => {
                        e.preventDefault();
                        const rect = (e.currentTarget as HTMLDivElement).getBoundingClientRect();
                        const side = e.clientX - rect.left < rect.width / 2 ? 'left' : 'right';
                        setDragOverTab({ bookId: book.id, side });
                      }}
                      onDrop={(e) => {
                        e.preventDefault();
                        if (draggingBookId && dragOverTab?.bookId === book.id) {
                          moveTabRelative(draggingBookId, book.id, dragOverTab.side);
                        }
                        setDragOverTab(null);
                        setDraggingBookId(null);
                      }}
                      onClick={() => setActiveBookId(book.id)}
                      onContextMenu={(e) => {
                        e.preventDefault();
                        setTabMenu({ x: e.clientX, y: e.clientY, bookId: book.id });
                      }}
                    >
                      <span className="text-[11px] font-semibold truncate">{book.title}</span>
                      <button
                        className="shrink-0 p-0.5 rounded hover:bg-black/10"
                        onClick={(e) => {
                          e.stopPropagation();
                          closeReaderTab(book.id);
                        }}
                        title="关闭"
                      >
                        <X className="w-3.5 h-3.5 opacity-60 group-hover:opacity-90" />
                      </button>
                      </div>
                      {dragOverTab?.bookId === book.id && dragOverTab.side === 'right' && (
                        <div className="absolute -right-1 top-1/2 -translate-y-1/2 h-5 w-0.5 bg-black/60 rounded-full z-20" />
                      )}
                    </div>
                  );
                })}
              </div>
              <AnimatePresence>
                {tabMenu && (
                  <motion.div
                    initial={{ opacity: 0, y: 6, scale: 0.98 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 6, scale: 0.98 }}
                    className="fixed z-[260] w-44 rounded-xl bg-[#FDFCF8] border border-black/10 shadow-2xl overflow-hidden"
                    style={{ left: tabMenu.x, top: tabMenu.y }}
                    onClick={(e) => e.stopPropagation()}
                  >
                    <button
                      className="w-full text-left px-4 py-3 text-xs font-semibold hover:bg-black/[0.04]"
                      onClick={() => {
                        closeOtherTabs(tabMenu.bookId);
                        setTabMenu(null);
                      }}
                    >
                      关闭其他标签
                    </button>
                    <button
                      className="w-full text-left px-4 py-3 text-xs font-semibold hover:bg-black/[0.04]"
                      onClick={() => {
                        closeTabsToRight(tabMenu.bookId);
                        setTabMenu(null);
                      }}
                    >
                      关闭右侧标签
                    </button>
                  </motion.div>
                )}
              </AnimatePresence>

              {!displayBook ? (
                <div className="flex-1 flex items-center justify-center text-sm text-black/40">暂无打开的阅读页</div>
              ) : (
              <div className="flex-1 flex w-full min-h-0 overflow-hidden">
              <section style={{ width: `${readerWidth}%` }} className="h-full min-h-0 overflow-hidden">
                <ReaderPanel
                  book={displayBook}
                  currentPage={progress[displayBook.id] || 0}
                  paragraphAnchor={progressAnchors[displayBook.id]}
                  onPageChange={(page) => updateProgressForBook(displayBook.id, page)}
                  onAnchorChange={(anchor) => updateAnchorForBook(displayBook.id, anchor)}
                  onAnnotate={(text) => setPendingQuote(text)}
                  isOverviewOpen={isOverviewOpen}
                  onCloseOverview={() => setIsOverviewOpen(false)}
                />
              </section>

              <div className={cn('w-1 h-full cursor-col-resize hover:bg-indigo-500/50 transition-colors z-[100] flex items-center justify-center group', isResizing ? 'bg-indigo-500' : 'bg-transparent')} onMouseDown={() => setIsResizing(true)}>
                <div className="w-px h-8 bg-gray-300 group-hover:bg-indigo-400" />
              </div>

              <section style={{ width: `${100 - readerWidth}%` }} className="h-full min-h-0 bg-white border-l border-black/5 overflow-hidden">
                <ChatPanel
                  book={displayBook}
                  messages={chats[displayBook.id] || []}
                  onSendMessage={handleSendMessage}
                  onSummarize={handleSummarize}
                  isLoading={isAiLoading}
                  pendingQuote={pendingQuote}
                  onClearQuote={() => setPendingQuote(null)}
                  onClear={async () => {
                    const bookId = displayBook.id;
                    setChats((prev) => ({ ...prev, [bookId]: [] }));
                    if (window.electronAPI?.saveChat) {
                      await window.electronAPI.saveChat({ bookId, messages: [] });
                    } else {
                      const nextChats = { ...chats, [bookId]: [] };
                      localStorage.setItem(CHATS_KEY, JSON.stringify(nextChats));
                    }
                  }}
                />
              </section>
            </div>
              )}
            </div>
          )}
        </main>
      </div>

      <AnimatePresence>{isUploadOpen && <UploadZone onClose={() => setIsUploadOpen(false)} onUpload={handleUpload} isUploading={isUploading} />}</AnimatePresence>

      <AnimatePresence>
        {pendingDeleteBook && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[300] bg-black/35 backdrop-blur-[2px] flex items-center justify-center p-6"
          >
            <motion.div
              initial={{ opacity: 0, y: 16, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 16, scale: 0.98 }}
              className="w-full max-w-md bg-[#FDFCF8] border border-black/10 rounded-xl shadow-2xl overflow-hidden"
            >
              <div className="px-6 py-5 border-b border-black/5">
                <h3 className="font-serif text-xl font-bold text-[#1A1A1A]">删除书籍</h3>
                <p className="mt-2 text-xs text-black/50 leading-relaxed">
                  确认删除《{pendingDeleteBook.title}》吗？此操作会同时清除阅读进度与聊天记录，且不可撤销。
                </p>
              </div>
              <div className="px-6 py-4 flex items-center justify-end gap-3">
                <button
                  onClick={() => setPendingDeleteBook(null)}
                  className="px-4 py-2 text-[11px] font-bold uppercase tracking-wider border border-black/10 rounded-lg hover:bg-black/[0.03]"
                >
                  取消
                </button>
                <button
                  onClick={async () => {
                    const target = pendingDeleteBook;
                    setPendingDeleteBook(null);
                    if (target) await performDeleteBook(target);
                  }}
                  className="px-4 py-2 text-[11px] font-bold uppercase tracking-wider bg-red-600 text-white rounded-lg hover:bg-red-700"
                >
                  确认删除
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {duplicateBook && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[320] bg-black/30 backdrop-blur-[2px] flex items-center justify-center p-6"
          >
            <motion.div
              initial={{ opacity: 0, y: 16, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 16, scale: 0.98 }}
              className="w-full max-w-md bg-[#FDFCF8] border border-black/10 rounded-xl shadow-2xl overflow-hidden"
            >
              <div className="px-6 py-5 border-b border-black/5">
                <h3 className="font-serif text-xl font-bold text-[#1A1A1A]">重复上传提醒</h3>
                <p className="mt-2 text-xs text-black/50 leading-relaxed">
                  这本书已经在你的书架中。你可以直接打开已有条目继续阅读。
                </p>
              </div>
              <div className="px-6 py-4 flex items-center justify-end gap-3">
                <button
                  onClick={() => {
                    setDuplicateBook(null);
                    setIsUploadOpen(false);
                  }}
                  className="px-4 py-2 text-[11px] font-bold uppercase tracking-wider border border-black/10 rounded-lg hover:bg-black/[0.03]"
                >
                  仅关闭
                </button>
                <button
                  onClick={() => {
                    const target = duplicateBook;
                    setDuplicateBook(null);
                    setIsUploadOpen(false);
                    if (target) {
                      setActiveBookId(target.id);
                      setView('reader');
                    }
                  }}
                  className="px-4 py-2 text-[11px] font-bold uppercase tracking-wider bg-black text-white rounded-lg hover:bg-[#111]"
                >
                  打开已有书籍
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}







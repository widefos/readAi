import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Book, TocItem } from '../types';
import { createReaderEngine } from '../engines/readerEngine';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '../lib/utils';
import { ChevronRight, Settings, List, Sparkles, X as CloseIcon, Clock, FileText, Calendar, Hash, Info } from 'lucide-react';
import { usePdfReaderEngine } from '../engines/pdfReaderEngine';

const textPaginationCache = new Map<string, number[]>();
const TEXT_PAGE_HEIGHT_FACTOR = 1.35;

interface ReaderPanelProps {
  book: Book;
  currentPage: number;
  onPageChange: (page: number) => void;
  theme: 'paper' | 'light' | 'dark';
  onThemeChange: (theme: 'paper' | 'light' | 'dark') => void;
  paragraphAnchor?: number;
  onAnchorChange?: (anchor: number) => void;
  readingDurationSeconds?: number;
  onAnnotate?: (text: string) => void;
  isOverviewOpen: boolean;
  onOpenOverview: () => void;
  onCloseOverview: () => void;
}

export function ReaderPanel({
  book,
  currentPage,
  onPageChange,
  theme,
  onThemeChange,
  paragraphAnchor,
  onAnchorChange,
  readingDurationSeconds = 0,
  onAnnotate,
  isOverviewOpen,
  onOpenOverview,
  onCloseOverview,
}: ReaderPanelProps) {
  const [fontSize, setFontSize] = useState(20);
  const [lineHeight, setLineHeight] = useState(1.8);
  const [fontFamily, setFontFamily] = useState<'sans' | 'serif' | 'mono'>('serif');
  const [animationType, setAnimationType] = useState<'fade' | 'slide' | 'slide-up' | 'none'>('fade');
  const [animationSpeed, setAnimationSpeed] = useState(0.5);
  const [pdfScale, setPdfScale] = useState(1.4);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isTocOpen, setIsTocOpen] = useState(false);
  const [selection, setSelection] = useState<{ text: string; x: number; y: number } | null>(null);
  const [isReadingScrollActive, setIsReadingScrollActive] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);
  const readingScrollHideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const textViewportRef = useRef<HTMLDivElement>(null);
  const pdfCanvasRef = useRef<HTMLCanvasElement>(null);
  const { pdfTotalPages, pdfError, openWithSystemViewer } = usePdfReaderEngine(book, currentPage, pdfScale, pdfCanvasRef);

  const isPdfBook = book.fileType === 'application/pdf';
  const resolvedPdfTotalPages = pdfTotalPages > 0 ? pdfTotalPages : (book.pageCount ?? 0);
  const engine = createReaderEngine(book, resolvedPdfTotalPages);
  const allParagraphs = useMemo(() => book.content.split('\n').filter((p) => p.trim().length > 0), [book.content]);
  const [textPageStarts, setTextPageStarts] = useState<number[]>([0]);
  const textPageStartsRef = useRef<number[]>([0]);
  const prevPageStartsRef = useRef<number[]>([0]);
  const lastEmittedAnchorRef = useRef<number | null>(null);
  const reflowAnchorRef = useRef<number | null>(null);
  const lastAppliedExternalAnchorRef = useRef<number | null>(null);
  const textPaginationReadyRef = useRef<boolean>(isPdfBook);
  const isTypographyAdjustingRef = useRef(false);
  const totalPages = isPdfBook ? engine.totalPages : Math.max(1, textPageStarts.length);
  const cjkCharCount = (book.content.match(/[\u3400-\u9FFF\uF900-\uFAFF]/g) || []).length;
  const latinWordCount = (book.content.match(/[A-Za-z0-9]+(?:[-'][A-Za-z0-9]+)*/g) || []).length;
  const textStatCount = cjkCharCount + latinWordCount;
  const readingTimeLabel = (() => {
    const seconds = Math.max(0, Math.floor(readingDurationSeconds));
    if (seconds <= 0) return '少于 1 分钟';
    const totalMinutes = Math.floor(seconds / 60);
    if (totalMinutes < 60) return `约 ${Math.max(1, totalMinutes)} 分钟`;
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    return minutes > 0 ? `约 ${hours} 小时 ${minutes} 分钟` : `约 ${hours} 小时`;
  })();
  const fileSizeBytes = book.sourceFileSizeBytes ?? new Blob([book.content]).size;
  const fileSize = (fileSizeBytes / 1024).toFixed(1);
  const currentParagraphs = isPdfBook
    ? engine.getParagraphPage(currentPage)
    : (() => {
        const start = textPageStarts[currentPage];
        if (!textPaginationReadyRef.current || start === undefined) return [];
        const end = textPageStarts[currentPage + 1] ?? allParagraphs.length;
        return allParagraphs.slice(start, end);
      })();
  const calcPercent = (page: number, pages: number) => {
    if (pages <= 1) return 100;
    const ratio = page / (pages - 1);
    return Math.round(Math.max(0, Math.min(1, ratio)) * 100);
  };

  const themeClasses = {
    light: 'bg-white text-[#1A1A1A]',
    paper: 'bg-[#FDFCF8] text-[#1A1A1A]',
    dark: 'bg-[#1A1A1A] text-[#D1D1D1]',
  };

  const fontClasses = {
    sans: 'font-sans',
    serif: 'font-serif',
    mono: 'font-mono',
  };

  const fontFamilies: Record<'sans' | 'serif' | 'mono', string> = {
    sans: '-apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif',
    serif: '"Noto Serif SC", "Songti SC", "STSong", "SimSun", serif',
    mono: '"SFMono-Regular", Consolas, "Liberation Mono", Menlo, monospace',
  };

  const findPageByParagraphIndex = (index: number, starts: number[]) => {
    if (!starts.length) return 0;
    let lo = 0;
    let hi = starts.length - 1;
    while (lo < hi) {
      const mid = Math.floor((lo + hi + 1) / 2);
      if (starts[mid] <= index) lo = mid;
      else hi = mid - 1;
    }
    return lo;
  };

  const safePageChange = (nextPage: number) => {
    if (nextPage === currentPage) return;
    onPageChange(nextPage);
  };

  const lockReflowAnchorToCurrentPage = () => {
    if (isPdfBook) return;
    if (reflowAnchorRef.current !== null) return;
    const starts = textPageStartsRef.current;
    reflowAnchorRef.current = starts[Math.min(currentPage, starts.length - 1)] ?? 0;
  };

  const beginTypographyAdjust = () => {
    isTypographyAdjustingRef.current = true;
    lockReflowAnchorToCurrentPage();
  };

  const endTypographyAdjust = () => {
    isTypographyAdjustingRef.current = false;
  };

  useEffect(() => {
    const handleGlobalClick = (e: MouseEvent) => {
      if (selection && !(e.target as HTMLElement).closest('.ai-context-menu')) {
        const sel = window.getSelection();
        if (!sel || sel.toString().trim().length === 0) setSelection(null);
      }
    };
    const handleGlobalPointerUp = () => {
      isTypographyAdjustingRef.current = false;
    };
    document.addEventListener('mousedown', handleGlobalClick);
    window.addEventListener('mouseup', handleGlobalPointerUp);
    window.addEventListener('touchend', handleGlobalPointerUp);
    return () => {
      document.removeEventListener('mousedown', handleGlobalClick);
      window.removeEventListener('mouseup', handleGlobalPointerUp);
      window.removeEventListener('touchend', handleGlobalPointerUp);
    };
  }, [selection]);

  useEffect(() => {
    const container = contentRef.current;
    if (!container) return;

    const delayMs = animationType === 'none' ? 0 : Math.max(0, Math.round(animationSpeed * 1000));
    const timer = window.setTimeout(() => {
      if (contentRef.current) contentRef.current.scrollTop = 0;
    }, delayMs);

    return () => window.clearTimeout(timer);
  }, [currentPage, animationType, animationSpeed]);

  useEffect(() => {
    textPaginationReadyRef.current = isPdfBook;
  }, [book.id, isPdfBook]);

  useEffect(() => {
    textPageStartsRef.current = textPageStarts;
    if (!isPdfBook && textPageStarts.length > 0) {
      textPaginationReadyRef.current = true;
    }
  }, [textPageStarts, isPdfBook]);

  useEffect(() => {
    if (isPdfBook) return;
    const cacheKey = `${book.id}|${fontSize}|${lineHeight}|${fontFamily}`;
    const cached = textPaginationCache.get(cacheKey);
    if (cached && cached.length > 0) {
      setTextPageStarts(cached);
      textPageStartsRef.current = cached;
    }
  }, [book.id, fontSize, lineHeight, fontFamily, isPdfBook]);

  useEffect(() => {
    if (isPdfBook && resolvedPdfTotalPages <= 0) return;
    if (!isPdfBook && !textPaginationReadyRef.current) return;
    if (!isPdfBook && textPageStarts.length <= 1 && allParagraphs.length > 1) return;
    if (totalPages > 0 && currentPage > totalPages - 1) safePageChange(totalPages - 1);
  }, [currentPage, totalPages, onPageChange, isPdfBook, resolvedPdfTotalPages, textPageStarts.length, allParagraphs.length]);

  useEffect(() => {
    if (isPdfBook) return;

    let rafId: number | null = null;
    let timerId: ReturnType<typeof setTimeout> | null = null;

    const recalc = () => {
      const viewport = textViewportRef.current;
      if (!viewport) return;
      const maxHeight = viewport.clientHeight;
      const effectiveMaxHeight = Math.max(1, maxHeight * TEXT_PAGE_HEIGHT_FACTOR);
      const width = viewport.clientWidth;
      if (maxHeight <= 0 || width <= 0 || allParagraphs.length === 0) {
        setTextPageStarts([0]);
        return;
      }

      const measurer = document.createElement('div');
      measurer.style.position = 'absolute';
      measurer.style.visibility = 'hidden';
      measurer.style.pointerEvents = 'none';
      measurer.style.zIndex = '-1';
      measurer.style.left = '-99999px';
      measurer.style.top = '0';
      measurer.style.width = `${width}px`;
      measurer.style.fontSize = `${fontSize}px`;
      measurer.style.lineHeight = String(lineHeight);
      measurer.style.fontFamily = fontFamilies[fontFamily];
      measurer.style.letterSpacing = '0.02em';
      measurer.style.wordBreak = 'break-word';
      measurer.style.textAlign = 'justify';
      document.body.appendChild(measurer);

      const paragraphMeasurer = document.createElement('p');
      paragraphMeasurer.style.margin = '0';
      paragraphMeasurer.style.padding = '0';
      paragraphMeasurer.style.textIndent = '2em';
      measurer.appendChild(paragraphMeasurer);

      const gapPx = 24;
      const starts: number[] = [0];
      let usedHeight = 0;

      for (let i = 0; i < allParagraphs.length; i++) {
        paragraphMeasurer.textContent = allParagraphs[i];
        const paragraphHeight = paragraphMeasurer.getBoundingClientRect().height;

        const nextHeight = usedHeight + (usedHeight > 0 ? gapPx : 0) + paragraphHeight;
        if (usedHeight > 0 && nextHeight > effectiveMaxHeight) {
          starts.push(i);
          usedHeight = paragraphHeight;
        } else {
          usedHeight = nextHeight;
        }
      }

      document.body.removeChild(measurer);
      const cacheKey = `${book.id}|${fontSize}|${lineHeight}|${fontFamily}`;
      textPaginationCache.set(cacheKey, starts);
      setTextPageStarts(starts);
    };

    const scheduleRecalc = (delayMs = 80) => {
      if (timerId) clearTimeout(timerId);
      timerId = setTimeout(() => {
        if (rafId !== null) cancelAnimationFrame(rafId);
        rafId = requestAnimationFrame(() => {
          recalc();
          rafId = null;
        });
      }, delayMs);
    };

    const onWindowResize = () => scheduleRecalc(120);

    scheduleRecalc(0);
    const ro = new ResizeObserver(() => scheduleRecalc(100));
    if (textViewportRef.current) ro.observe(textViewportRef.current);
    window.addEventListener('resize', onWindowResize);
    return () => {
      if (timerId) clearTimeout(timerId);
      if (rafId !== null) cancelAnimationFrame(rafId);
      ro.disconnect();
      window.removeEventListener('resize', onWindowResize);
    };
  }, [isPdfBook, allParagraphs, fontSize, lineHeight, fontFamily, book.id]);

  useEffect(() => {
    if (isPdfBook) return;
    if (!textPaginationReadyRef.current) return;
    if (reflowAnchorRef.current === null) return;
    const prevStarts = prevPageStartsRef.current;
    const prevAnchor =
      reflowAnchorRef.current ?? (prevStarts[Math.min(currentPage, prevStarts.length - 1)] ?? 0);
    const nextPage = findPageByParagraphIndex(prevAnchor, textPageStarts);
    prevPageStartsRef.current = textPageStarts;
    if (nextPage !== currentPage) {
      safePageChange(nextPage);
      return;
    }
    if (isTypographyAdjustingRef.current) return;
    reflowAnchorRef.current = null;
  }, [textPageStarts, isPdfBook, currentPage, onPageChange]);

  useEffect(() => {
    if (isPdfBook || paragraphAnchor === undefined) return;
    if (!textPaginationReadyRef.current) return;
    if (reflowAnchorRef.current !== null) return;
    if (currentPage !== 0) return;
    if (lastAppliedExternalAnchorRef.current === paragraphAnchor) return;
    lastAppliedExternalAnchorRef.current = paragraphAnchor;
    const targetPage = findPageByParagraphIndex(paragraphAnchor, textPageStartsRef.current);
    if (targetPage !== currentPage) safePageChange(targetPage);
  }, [paragraphAnchor, isPdfBook, currentPage, onPageChange]);

  useEffect(() => {
    if (isPdfBook || !onAnchorChange) return;
    if (reflowAnchorRef.current !== null) return;
    const anchor = textPageStarts[Math.min(currentPage, textPageStarts.length - 1)] ?? 0;
    if (lastEmittedAnchorRef.current === anchor) return;
    lastEmittedAnchorRef.current = anchor;
    onAnchorChange(anchor);
  }, [currentPage, textPageStarts, isPdfBook, onAnchorChange]);


  const handleMouseUp = () => {
    const sel = window.getSelection();
    if (sel && sel.toString().trim().length > 0) {
      const range = sel.getRangeAt(0);
      const rects = range.getClientRects();
      const lastRect = rects.length > 0 ? rects[rects.length - 1] : range.getBoundingClientRect();
      setSelection({ text: sel.toString(), x: lastRect.right, y: lastRect.bottom + 8 });
    } else {
      setSelection(null);
    }
  };

  const handleAskAI = () => {
    if (selection && onAnnotate) {
      onAnnotate(selection.text);
      setSelection(null);
      window.getSelection()?.removeAllRanges();
    }
  };

  const handleCtrlWheel = (e: React.WheelEvent<HTMLElement>) => {
    if (!e.ctrlKey) return;
    e.preventDefault();
    const zoomIn = e.deltaY < 0;
    if (isPdfBook) {
      setPdfScale((prev) => {
        const next = zoomIn ? prev + 0.1 : prev - 0.1;
        return Math.max(0.6, Math.min(3, Number(next.toFixed(2))));
      });
      return;
    }
    lockReflowAnchorToCurrentPage();
    setFontSize((prev) => {
      const next = zoomIn ? prev + 1 : prev - 1;
      return Math.max(14, Math.min(40, next));
    });
  };

  const handleReadingScroll = () => {
    setIsReadingScrollActive(true);
    if (readingScrollHideTimerRef.current) clearTimeout(readingScrollHideTimerRef.current);
    readingScrollHideTimerRef.current = setTimeout(() => setIsReadingScrollActive(false), 900);
  };

  const getAnimationProps = () => {
    if (animationType === 'none') return { initial: false, animate: { opacity: 0.9 }, exit: { opacity: 0.9 }, transition: { duration: 0 } };
    const variants = {
      fade: { initial: { opacity: 0 }, animate: { opacity: 0.9 }, exit: { opacity: 0 } },
      slide: { initial: { opacity: 0, x: 20 }, animate: { opacity: 0.9, x: 0 }, exit: { opacity: 0, x: -20 } },
      'slide-up': { initial: { opacity: 0, y: 20 }, animate: { opacity: 0.9, y: 0 }, exit: { opacity: 0, y: -20 } },
    };
    const variant = variants[animationType] || variants.fade;
    return { ...variant, transition: { duration: animationSpeed } };
  };

  const renderTocItem = (item: TocItem, depth = 0) => (
    <div key={item.label + item.href} className="space-y-1">
      <button
        onClick={() => {
          if (item.position !== undefined) {
            const targetPage = findPageByParagraphIndex(item.position, textPageStarts);
            safePageChange(Math.min(targetPage, totalPages - 1));
            setIsTocOpen(false);
          }
        }}
        disabled={item.position === undefined}
        className={cn('w-full text-left py-2 px-3 text-sm transition-all rounded hover:bg-black/5', item.position === undefined ? 'opacity-30 cursor-default' : 'cursor-pointer', depth > 0 && 'ml-4 border-l pl-4 border-gray-100')}
      >
        <span className="font-medium">{item.label}</span>
      </button>
      {item.children && <div className="ml-2">{item.children.map((child) => renderTocItem(child, depth + 1))}</div>}
    </div>
  );

  return (
    <div className={cn('flex-1 flex flex-col h-full min-h-0 overflow-hidden border-r editorial-border transition-colors duration-500 relative', themeClasses[theme])}>
      <header className="px-10 py-4 flex items-center gap-3 shrink-0 border-b border-black/5">
        <button onClick={() => setIsTocOpen(!isTocOpen)} className="p-2 hover:bg-black/5 rounded-full transition-all opacity-40 hover:opacity-100" title="目录">
          <List className="w-5 h-5" />
        </button>
        <button onClick={onOpenOverview} className="p-2 hover:bg-black/5 rounded-full transition-all opacity-40 hover:opacity-100" title="信息">
          <Info className="w-5 h-5" />
        </button>
      </header>

      <AnimatePresence>
        {isOverviewOpen && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[100] bg-white flex flex-col items-center justify-center p-8 overflow-y-auto">
            <button onClick={onCloseOverview} className="absolute top-12 right-12 p-3 hover:bg-black/5 rounded-full transition-all"><CloseIcon className="w-6 h-6" /></button>
            <div className="max-w-5xl w-full grid grid-cols-1 md:grid-cols-12 gap-16 items-center">
              <motion.div initial={{ opacity: 0, x: -50 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.2 }} className="md:col-span-5 aspect-[2/3] bg-[#E8E6E1] relative shadow-2xl group overflow-hidden">
                {book.cover ? <img src={book.cover} alt={book.title} className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105" /> : <div className="w-full h-full flex items-center justify-center border-4 border-black/5 m-4"><span className="font-serif text-3xl opacity-20 italic">No Cover</span></div>}
                <div className="absolute inset-0 border-[20px] border-white/10 pointer-events-none" />
              </motion.div>

              <motion.div initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }} className="md:col-span-7 space-y-10">
                <div>
                  <span className="text-[10px] font-bold uppercase tracking-[0.3em] text-indigo-600 block mb-4">Discovery · Library</span>
                  <h1 className="font-serif text-6xl md:text-7xl font-bold leading-[1.1] mb-6 tracking-tight text-[#1A1A1A]">{book.title}</h1>
                  <p className="text-2xl font-serif italic text-gray-500">by {book.author || 'Anonymous'}</p>
                </div>

                <div className="grid grid-cols-2 gap-8 py-10 border-y editorial-border">
                  <div className="flex gap-4 items-start"><div className="p-2 bg-black/5 rounded-lg"><Clock className="w-4 h-4 opacity-40" /></div><div><p className="text-[9px] font-bold uppercase tracking-widest opacity-40 mb-1">阅读时长</p><p className="text-sm font-bold text-[#1A1A1A]">{readingTimeLabel}</p></div></div>
                  <div className="flex gap-4 items-start"><div className="p-2 bg-black/5 rounded-lg"><FileText className="w-4 h-4 opacity-40" /></div><div><p className="text-[9px] font-bold uppercase tracking-widest opacity-40 mb-1">文件大小</p><p className="text-sm font-bold text-[#1A1A1A]">{fileSize} KB</p></div></div>
                  <div className="flex gap-4 items-start"><div className="p-2 bg-black/5 rounded-lg"><Hash className="w-4 h-4 opacity-40" /></div><div><p className="text-[9px] font-bold uppercase tracking-widest opacity-40 mb-1">字数统计</p><p className="text-sm font-bold text-[#1A1A1A]">{isPdfBook ? '—' : `${textStatCount}（汉字+单词）`}</p></div></div>
                  <div className="flex gap-4 items-start"><div className="p-2 bg-black/5 rounded-lg"><Calendar className="w-4 h-4 opacity-40" /></div><div><p className="text-[9px] font-bold uppercase tracking-widest opacity-40 mb-1">最后阅读</p><p className="text-sm font-bold text-[#1A1A1A]">{new Date().toLocaleDateString()}</p></div></div>
                </div>

                <div className="pt-6"><button onClick={onCloseOverview} className="bg-black text-white px-10 py-4 text-[10px] font-bold uppercase tracking-widest hover:bg-gray-800 transition-all flex items-center gap-3 active:scale-95">开始阅读 <ChevronRight className="w-4 h-4" /></button></div>
              </motion.div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {isTocOpen && (
          <>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setIsTocOpen(false)} className="absolute inset-0 bg-black/20 z-40 backdrop-blur-[2px]" />
            <motion.div initial={{ x: -300 }} animate={{ x: 0 }} exit={{ x: -300 }} transition={{ type: 'spring', damping: 25, stiffness: 200 }} className="absolute left-0 top-0 bottom-0 w-80 bg-white shadow-2xl z-50 flex flex-col border-r editorial-border">
              <div className="p-8 border-b editorial-border flex items-center justify-between"><h3 className="font-serif text-xl font-bold italic">目录</h3><button onClick={() => setIsTocOpen(false)} className="text-[10px] font-bold uppercase tracking-widest opacity-40 hover:opacity-100">关闭</button></div>
              <div className="flex-1 overflow-y-auto p-6 space-y-2 custom-scrollbar">{book.toc && book.toc.length > 0 ? book.toc.map((item) => renderTocItem(item)) : <div className="py-12 text-center opacity-30 italic text-sm">未识别到目录结构</div>}</div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      <main
        ref={contentRef}
        onMouseUp={handleMouseUp}
        onWheel={handleCtrlWheel}
        onScroll={handleReadingScroll}
        className={cn(
          'flex-1 min-h-0 px-12 pb-12 relative overflow-y-auto custom-scrollbar',
          isReadingScrollActive && 'scrollbar-active',
        )}
      >
        <div ref={textViewportRef} className={cn('max-w-3xl mx-auto', !isPdfBook && 'h-full')}>
          {isPdfBook ? (
            <div className="flex justify-center py-6">
              {pdfError ? (
                <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded px-4 py-3">
                  <div>{pdfError}</div>
                  {book.pdfPath && (
                    <button onClick={openWithSystemViewer} className="mt-3 px-3 py-1.5 rounded bg-black text-white text-xs">
                      用系统默认 PDF 查看器打开
                    </button>
                  )}
                </div>
              ) : (
                <canvas ref={pdfCanvasRef} className="max-w-full shadow-lg border border-black/5 bg-white" />
              )}
            </div>
          ) : (
            <AnimatePresence mode="wait">
              <motion.div key={currentPage} {...getAnimationProps()} style={{ fontSize: `${fontSize}px`, lineHeight }} className={cn(fontClasses[fontFamily], 'text-justify space-y-6')}>
                {currentParagraphs.map((p, i) => (
                  <p key={i} className={cn('tracking-wide', i === 0 && currentPage === 0 ? 'first-letter:text-5xl first-letter:font-bold first-letter:mr-3 first-letter:float-left first-letter:mt-2' : 'indent-8')}>
                    {p}
                  </p>
                ))}
                {currentParagraphs.length === 0 && <div className="flex flex-col items-center justify-center py-32 opacity-30 italic"><p>这本书还没有可显示的文本内容...</p></div>}
              </motion.div>
            </AnimatePresence>
          )}
        </div>

        <AnimatePresence>
          {selection && (
            <motion.div initial={{ opacity: 0, y: 5, scale: 0.9 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, scale: 0.9 }} style={{ position: 'fixed', left: selection.x, top: selection.y, transform: 'translate(-100%, 0)' }} className="ai-context-menu z-[100] flex items-center gap-2 bg-black text-white px-3 py-1.5 rounded-full shadow-2xl border border-white/10">
              <button onClick={handleAskAI} className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest hover:text-orange-300 transition-colors"><Sparkles className="w-3 h-3 text-orange-400" />询问 AI</button>
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      <footer className="mt-auto px-12 py-8 border-t editorial-border flex justify-between items-center text-[10px] font-bold uppercase tracking-[0.2em] shrink-0">
        <div className="flex items-center gap-8">
          <button disabled={currentPage === 0} onClick={() => safePageChange(currentPage - 1)} className="hover:opacity-100 opacity-40 transition-opacity disabled:opacity-10">上一页</button>
          <div className="flex items-center gap-3 opacity-40"><span>{currentPage + 1}</span><span className="opacity-20 italic">/</span><span>{totalPages}</span></div>
          <button disabled={currentPage >= totalPages - 1} onClick={() => safePageChange(currentPage + 1)} className="hover:opacity-100 opacity-40 transition-opacity disabled:opacity-10">下一页</button>
        </div>
        <div className="flex items-center gap-4 relative">
          <span className="opacity-40">已读 {calcPercent(currentPage, totalPages)}%</span>
          <div className="relative">
            <button onClick={() => setIsSettingsOpen(!isSettingsOpen)} className="opacity-40 hover:opacity-100 transition-opacity"><Settings className="w-3.5 h-3.5" /></button>
            <AnimatePresence>
              {isSettingsOpen && (
                <>
                  <div className="fixed inset-0 z-40 cursor-default" onClick={() => setIsSettingsOpen(false)} />
                  <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 10 }} className="absolute bottom-full right-0 mb-4 p-6 bg-white border editorial-border shadow-2xl z-50 w-64 text-[#1A1A1A]">
                    <h3 className="text-[10px] font-bold uppercase tracking-widest mb-6">阅读偏好</h3>
                    <div className="space-y-6">
                      <div><label className="text-[9px] font-bold uppercase tracking-widest mb-3 block opacity-50">字体大小 ({fontSize}px)</label><input type="range" min="14" max="32" value={fontSize} onPointerDown={beginTypographyAdjust} onPointerUp={endTypographyAdjust} onTouchStart={beginTypographyAdjust} onTouchEnd={endTypographyAdjust} onChange={(e) => { lockReflowAnchorToCurrentPage(); setFontSize(Number(e.target.value)); }} className="w-full h-1 bg-gray-100 appearance-none pointer cursor-pointer accent-black" /></div>
                      <div><label className="text-[9px] font-bold uppercase tracking-widest mb-3 block opacity-50">行高 ({lineHeight})</label><input type="range" min="1" max="3" step="0.1" value={lineHeight} onPointerDown={beginTypographyAdjust} onPointerUp={endTypographyAdjust} onTouchStart={beginTypographyAdjust} onTouchEnd={endTypographyAdjust} onChange={(e) => { lockReflowAnchorToCurrentPage(); setLineHeight(Number(e.target.value)); }} className="w-full h-1 bg-gray-100 appearance-none pointer cursor-pointer accent-black" /></div>
                      <div><label className="text-[9px] font-bold uppercase tracking-widest mb-3 block opacity-50">字体</label><div className="flex gap-1">{(['serif', 'sans', 'mono'] as const).map((f) => <button key={f} onClick={() => { lockReflowAnchorToCurrentPage(); setFontFamily(f); }} className={cn('flex-1 py-2 text-[9px] font-bold uppercase border', fontFamily === f ? 'bg-black text-white' : 'border-gray-200')}>{f === 'serif' ? '宋体' : f === 'sans' ? '黑体' : '等宽'}</button>)}</div></div>
                      <div><label className="text-[9px] font-bold uppercase tracking-widest mb-3 block opacity-50">阅读主题</label><div className="flex gap-1">{(['light', 'paper', 'dark'] as const).map((t) => <button key={t} onClick={() => onThemeChange(t)} className={cn('flex-1 py-2 text-[9px] font-bold uppercase border', theme === t ? 'bg-black text-white' : 'border-gray-200')}>{t === 'light' ? '明亮' : t === 'paper' ? '纸张' : '深色'}</button>)}</div></div>
                      <div><label className="text-[9px] font-bold uppercase tracking-widest mb-3 block opacity-50">翻页动画</label><div className="grid grid-cols-2 gap-1">{(['fade', 'slide', 'slide-up', 'none'] as const).map((a) => <button key={a} onClick={() => setAnimationType(a)} className={cn('py-2 text-[9px] font-bold uppercase border', animationType === a ? 'bg-black text-white' : 'border-gray-200')}>{a === 'fade' ? '渐变' : a === 'slide' ? '平移' : a === 'slide-up' ? '上滑' : '无'}</button>)}</div></div>
                      <div><label className="text-[9px] font-bold uppercase tracking-widest mb-3 block opacity-50">动画速度 ({animationSpeed}s)</label><input type="range" min="0" max="2" step="0.1" value={animationSpeed} onChange={(e) => setAnimationSpeed(Number(e.target.value))} className="w-full h-1 bg-gray-100 appearance-none pointer cursor-pointer accent-black" /></div>
                    </div>
                  </motion.div>
                </>
              )}
            </AnimatePresence>
          </div>
        </div>
      </footer>
    </div>
  );
}









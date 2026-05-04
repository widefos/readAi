import React, { useState, useEffect, useRef } from 'react';
import { Book, TocItem } from '../types';
import { createReaderEngine } from '../engines/readerEngine';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '../lib/utils';
import { ChevronRight, Settings, List, Sparkles, X as CloseIcon, Clock, FileText, Calendar, Hash } from 'lucide-react';
import { usePdfReaderEngine } from '../engines/pdfReaderEngine';

interface ReaderPanelProps {
  book: Book;
  currentPage: number;
  onPageChange: (page: number) => void;
  onAnnotate?: (text: string) => void;
  isOverviewOpen: boolean;
  onCloseOverview: () => void;
}

export function ReaderPanel({ book, currentPage, onPageChange, onAnnotate, isOverviewOpen, onCloseOverview }: ReaderPanelProps) {
  const [fontSize, setFontSize] = useState(20);
  const [lineHeight, setLineHeight] = useState(1.8);
  const [fontFamily, setFontFamily] = useState<'sans' | 'serif' | 'mono'>('serif');
  const [theme, setTheme] = useState<'paper' | 'light' | 'dark'>('paper');
  const [animationType, setAnimationType] = useState<'fade' | 'slide' | 'slide-up' | 'none'>('fade');
  const [animationSpeed, setAnimationSpeed] = useState(0.5);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isTocOpen, setIsTocOpen] = useState(false);
  const [selection, setSelection] = useState<{ text: string; x: number; y: number } | null>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const pdfCanvasRef = useRef<HTMLCanvasElement>(null);
  const { pdfTotalPages, pdfError, openWithSystemViewer } = usePdfReaderEngine(book, currentPage, pdfCanvasRef);

  const isPdfBook = book.fileType === 'application/pdf';
  const itemsPerPage = 8;
  const engine = createReaderEngine(book, pdfTotalPages);
  const totalPages = engine.totalPages;
  const wordCount = book.content.split(/\s+/).length;
  const readingTime = Math.ceil(wordCount / 200);
  const fileSize = (new Blob([book.content]).size / 1024).toFixed(1);
  const currentParagraphs = engine.getParagraphPage(currentPage);

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

  useEffect(() => {
    const handleGlobalClick = (e: MouseEvent) => {
      if (selection && !(e.target as HTMLElement).closest('.ai-context-menu')) {
        const sel = window.getSelection();
        if (!sel || sel.toString().trim().length === 0) setSelection(null);
      }
    };
    document.addEventListener('mousedown', handleGlobalClick);
    return () => document.removeEventListener('mousedown', handleGlobalClick);
  }, [selection]);

  useEffect(() => {
    if (contentRef.current) contentRef.current.scrollTop = 0;
  }, [currentPage]);

  useEffect(() => {
    if (totalPages > 0 && currentPage > totalPages - 1) onPageChange(totalPages - 1);
  }, [currentPage, totalPages, onPageChange]);


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
            onPageChange(Math.min(Math.floor(item.position / itemsPerPage), totalPages - 1));
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
    <div className={cn('flex-1 flex flex-col h-full border-r editorial-border transition-colors duration-500 relative', themeClasses[theme])}>
      <header className="px-12 py-8 flex items-start gap-6">
        <button onClick={() => setIsTocOpen(!isTocOpen)} className="p-2 hover:bg-black/5 rounded-full transition-all opacity-40 hover:opacity-100 mt-1" title="目录">
          <List className="w-5 h-5" />
        </button>
        <div>
          <h2 className="font-serif text-4xl font-bold leading-tight tracking-tight">{book.title}</h2>
          <p className="text-[10px] uppercase tracking-[0.2em] opacity-40 font-bold">Document View · {book.author || 'Anonymous'}</p>
        </div>
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
                  <div className="flex gap-4 items-start"><div className="p-2 bg-black/5 rounded-lg"><Clock className="w-4 h-4 opacity-40" /></div><div><p className="text-[9px] font-bold uppercase tracking-widest opacity-40 mb-1">阅读时长</p><p className="text-sm font-bold text-[#1A1A1A]">约 {readingTime} 分钟</p></div></div>
                  <div className="flex gap-4 items-start"><div className="p-2 bg-black/5 rounded-lg"><FileText className="w-4 h-4 opacity-40" /></div><div><p className="text-[9px] font-bold uppercase tracking-widest opacity-40 mb-1">文件大小</p><p className="text-sm font-bold text-[#1A1A1A]">{fileSize} KB</p></div></div>
                  <div className="flex gap-4 items-start"><div className="p-2 bg-black/5 rounded-lg"><Hash className="w-4 h-4 opacity-40" /></div><div><p className="text-[9px] font-bold uppercase tracking-widest opacity-40 mb-1">字数统计</p><p className="text-sm font-bold text-[#1A1A1A]">{wordCount} 字</p></div></div>
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
              <div className="flex-1 overflow-y-auto p-6 space-y-2">{book.toc && book.toc.length > 0 ? book.toc.map((item) => renderTocItem(item)) : <div className="py-12 text-center opacity-30 italic text-sm">未识别到目录结构</div>}</div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      <main ref={contentRef} onMouseUp={handleMouseUp} className="flex-1 overflow-y-auto px-12 pb-12 relative">
        <div className="max-w-3xl mx-auto">
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

      <footer className="mt-auto px-12 py-8 border-t editorial-border flex justify-between items-center text-[10px] font-bold uppercase tracking-[0.2em]">
        <div className="flex items-center gap-8">
          <button disabled={currentPage === 0} onClick={() => onPageChange(currentPage - 1)} className="hover:opacity-100 opacity-40 transition-opacity disabled:opacity-10">上一页</button>
          <div className="flex items-center gap-3 opacity-40"><span>{currentPage + 1}</span><span className="opacity-20 italic">/</span><span>{totalPages}</span></div>
          <button disabled={currentPage >= totalPages - 1} onClick={() => onPageChange(currentPage + 1)} className="hover:opacity-100 opacity-40 transition-opacity disabled:opacity-10">下一页</button>
        </div>
        <div className="flex items-center gap-4 relative">
          <span className="opacity-40">已读 {Math.round(((currentPage + 1) / totalPages) * 100)}%</span>
          <div className="relative">
            <button onClick={() => setIsSettingsOpen(!isSettingsOpen)} className="opacity-40 hover:opacity-100 transition-opacity"><Settings className="w-3.5 h-3.5" /></button>
            <AnimatePresence>
              {isSettingsOpen && (
                <>
                  <div className="fixed inset-0 z-40 cursor-default" onClick={() => setIsSettingsOpen(false)} />
                  <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 10 }} className="absolute bottom-full right-0 mb-4 p-6 bg-white border editorial-border shadow-2xl z-50 w-64 text-[#1A1A1A]">
                    <h3 className="text-[10px] font-bold uppercase tracking-widest mb-6">阅读偏好</h3>
                    <div className="space-y-6">
                      <div><label className="text-[9px] font-bold uppercase tracking-widest mb-3 block opacity-50">字体大小 ({fontSize}px)</label><input type="range" min="14" max="32" value={fontSize} onChange={(e) => setFontSize(Number(e.target.value))} className="w-full h-1 bg-gray-100 appearance-none pointer cursor-pointer accent-black" /></div>
                      <div><label className="text-[9px] font-bold uppercase tracking-widest mb-3 block opacity-50">行高 ({lineHeight})</label><input type="range" min="1" max="3" step="0.1" value={lineHeight} onChange={(e) => setLineHeight(Number(e.target.value))} className="w-full h-1 bg-gray-100 appearance-none pointer cursor-pointer accent-black" /></div>
                      <div><label className="text-[9px] font-bold uppercase tracking-widest mb-3 block opacity-50">字体</label><div className="flex gap-1">{(['serif', 'sans', 'mono'] as const).map((f) => <button key={f} onClick={() => setFontFamily(f)} className={cn('flex-1 py-2 text-[9px] font-bold uppercase border', fontFamily === f ? 'bg-black text-white' : 'border-gray-200')}>{f === 'serif' ? '宋体' : f === 'sans' ? '黑体' : '等宽'}</button>)}</div></div>
                      <div><label className="text-[9px] font-bold uppercase tracking-widest mb-3 block opacity-50">阅读主题</label><div className="flex gap-1">{(['light', 'paper', 'dark'] as const).map((t) => <button key={t} onClick={() => setTheme(t)} className={cn('flex-1 py-2 text-[9px] font-bold uppercase border', theme === t ? 'bg-black text-white' : 'border-gray-200')}>{t === 'light' ? '明亮' : t === 'paper' ? '纸张' : '深色'}</button>)}</div></div>
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


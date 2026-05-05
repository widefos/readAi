import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Book as BookIcon, Plus, Trash2 } from 'lucide-react';
import { Book } from '../types';
import { cn } from '../lib/utils';

interface BookshelfProps {
  books: Book[];
  onSelectBook: (book: Book) => void;
  onUploadClick: () => void;
  onDeleteBook: (book: Book) => void;
  progress: Record<string, number>;
  theme: 'paper' | 'light' | 'dark' | 'eye';
}

export function Bookshelf({ books, onSelectBook, onUploadClick, onDeleteBook, progress, theme }: BookshelfProps) {
  const [menuBookId, setMenuBookId] = useState<string | null>(null);
  const titleColor = { light: 'text-[#111]', paper: 'text-[#1A1A1A]', dark: 'text-[#E3E3E3]', eye: 'text-[#28c3ab]' } as const;
  const subtitleColor = { light: 'text-blue-600/65', paper: 'text-indigo-600/60', dark: 'text-sky-300/70', eye: 'text-[#8cd7ca]/90' } as const;
  const coverBase = {
    light: 'bg-[#FCFCFD] shadow-[0_4px_20px_-4px_rgba(0,0,0,0.14)] group-hover:shadow-[0_20px_40px_-8px_rgba(0,0,0,0.22)]',
    paper: 'bg-white shadow-[0_4px_20px_-4px_rgba(0,0,0,0.1)] group-hover:shadow-[0_20px_40px_-8px_rgba(0,0,0,0.2)]',
    dark: 'bg-[#1C1C1C] shadow-[0_6px_24px_-6px_rgba(0,0,0,0.45)] group-hover:shadow-[0_20px_40px_-8px_rgba(0,0,0,0.55)]',
    eye: 'bg-[#7fa0aa]/45 shadow-[0_6px_24px_-6px_rgba(0,0,0,0.35)] group-hover:shadow-[0_20px_40px_-8px_rgba(0,0,0,0.48)] backdrop-blur-sm',
  } as const;
  const fallbackCover = { light: 'bg-[#f8f8fb] border border-black/10', paper: 'bg-[#fdfdfd] border border-black/5', dark: 'bg-[#191919] border border-white/10', eye: 'bg-[#0c4b54] border border-[#24bca3]/25' } as const;
  const fallbackBar = { light: 'bg-black/10', paper: 'bg-black/5', dark: 'bg-white/10', eye: 'bg-[#1fc7ab]/30' } as const;
  const fallbackIcon = { light: 'text-black/15', paper: 'text-black/10', dark: 'text-white/20', eye: 'text-[#9ee7db]/55' } as const;
  const fallbackTitle = { light: 'text-black/45', paper: 'text-black/40', dark: 'text-white/55', eye: 'text-[#d0f4ec]/80' } as const;
  const progressTrack = { light: 'bg-black/8', paper: 'bg-black/5', dark: 'bg-white/10', eye: 'bg-[#0a3640]/65' } as const;
  const progressFill = { light: 'bg-[#111]', paper: 'bg-black', dark: 'bg-white', eye: 'bg-[#25c8ad]' } as const;
  const hoverMask = { light: 'group-hover:bg-black/6', paper: 'group-hover:bg-black/5', dark: 'group-hover:bg-white/5', eye: 'group-hover:bg-[#0a4d56]/22' } as const;
  const bookTitleColor = { light: 'group-hover:text-blue-600 text-[#1A1A1A]', paper: 'group-hover:text-indigo-600 text-[#1A1A1A]', dark: 'group-hover:text-sky-300 text-[#DBDBDB]', eye: 'group-hover:text-[#dbfff7] text-[#d5f7ef]' } as const;
  const authorColor = { light: 'text-black/40', paper: 'text-black/30', dark: 'text-white/35', eye: 'text-[#a4ddd2]/80' } as const;
  const dividerColor = { light: 'bg-black/8', paper: 'bg-black/5', dark: 'bg-white/10', eye: 'bg-[#28c3ab]/26' } as const;
  const unreadColor = { light: 'text-black/30', paper: 'text-black/20', dark: 'text-white/30', eye: 'text-[#8fcfc2]/80' } as const;
  const percentColor = { light: 'text-blue-600', paper: 'text-indigo-500', dark: 'text-sky-300', eye: 'text-[#2fd8bc]' } as const;
  const menuPanel = { light: 'bg-[#FCFCFD] border border-black/12 shadow-[0_14px_30px_rgba(0,0,0,0.16)]', paper: 'bg-white shadow-[0_14px_30px_rgba(0,0,0,0.12)]', dark: 'bg-[#1B1B1B] border border-white/12 shadow-[0_14px_30px_rgba(0,0,0,0.5)]', eye: 'bg-[#0b4750] border border-[#24bca3]/30 shadow-[0_14px_30px_rgba(0,0,0,0.4)]' } as const;
  const menuButton = { light: 'text-black/70 hover:bg-black/[0.04]', paper: 'text-[#666] hover:bg-[#F7F7F7]', dark: 'text-white/75 hover:bg-white/8', eye: 'text-[#ccefe8] hover:bg-[#0f5e67]' } as const;
  const addButton = { light: 'border-black/12 hover:border-blue-400/40 hover:bg-blue-50/30', paper: 'border-gray-100 hover:border-indigo-200 hover:bg-indigo-50/20', dark: 'border-white/15 hover:border-sky-300/40 hover:bg-white/5', eye: 'border-[#23b8a0]/35 hover:border-[#39e0c2]/55 hover:bg-[#0d5760]/30' } as const;
  const addIcon = { light: 'text-black/30 group-hover:text-blue-500', paper: 'text-gray-200 group-hover:text-indigo-300', dark: 'text-white/25 group-hover:text-sky-300/70', eye: 'text-[#7ec8bb] group-hover:text-[#d5fff6]' } as const;
  const addText = { light: 'text-black/35 group-hover:text-blue-600', paper: 'text-gray-300 group-hover:text-indigo-400', dark: 'text-white/35 group-hover:text-sky-300', eye: 'text-[#8fcec1] group-hover:text-[#d5fff6]' } as const;

  const calcPercent = (currentPage: number, totalPages: number) => {
    if (totalPages <= 1) return 100;
    const ratio = currentPage / (totalPages - 1);
    return Math.round(Math.max(0, Math.min(1, ratio)) * 100);
  };

  const getTotalPages = (book: Book) => {
    if (book.fileType === 'application/pdf') {
      return book.pageCount;
    }
    const paragraphs = book.content.split('\n').filter((p) => p.trim().length > 0);
    return Math.ceil(paragraphs.length / 8) || 1;
  };

  useEffect(() => {
    const onGlobalClick = () => setMenuBookId(null);
    window.addEventListener('click', onGlobalClick);
    return () => window.removeEventListener('click', onGlobalClick);
  }, []);

  return (
    <div className="flex-1 bg-transparent overflow-y-auto p-12">
      <div className="max-w-7xl mx-auto">
        <header className="mb-12">
          <h1 className={cn('font-serif text-5xl font-bold tracking-tight mb-4', titleColor[theme])}>我的书架</h1>
          <p className={cn('text-[10px] uppercase tracking-[0.3em] font-bold', subtitleColor[theme])}>Library · {books.length} Documents</p>
        </header>

        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-8 gap-y-12">
          {books.map((book, index) => (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.05 }}
              key={book.id}
              onClick={() => onSelectBook(book)}
              onContextMenu={(e) => {
                e.preventDefault();
                setMenuBookId((prev) => (prev === book.id ? null : book.id));
              }}
              className="group cursor-pointer relative"
            >
              <div
                className={`relative aspect-[7/10] mb-4 rounded-xs transition-all duration-700 overflow-hidden transform group-hover:-translate-y-3 ${coverBase[theme]} ${
                  menuBookId === book.id ? 'ring-2 ring-black/20' : ''
                }`}
              >
                {book.cover ? (
                  <img src={book.cover} alt={book.title} className="w-full h-full object-cover grayscale-[0.2] group-hover:grayscale-0 transition-all duration-700" referrerPolicy="no-referrer" />
                ) : (
                  <div className={cn('w-full h-full flex flex-col items-center justify-center p-8 text-center relative overflow-hidden', fallbackCover[theme])}>
                    <div className={cn('absolute top-0 left-0 w-8 h-full blur-sm', fallbackBar[theme])} />
                    <BookIcon className={cn('w-10 h-10 mb-6', fallbackIcon[theme])} />
                    <span className={cn('font-serif text-[11px] font-bold leading-tight tracking-tight uppercase px-2', fallbackTitle[theme])}>{book.title}</span>
                  </div>
                )}

                {(() => {
                  const currentP = progress[book.id];
                  if (currentP === undefined) return null;
                  const totalPages = getTotalPages(book);
                  if (!totalPages || totalPages <= 1) return null;
                  const percent = calcPercent(currentP, totalPages);

                  return (
                    <div className={cn('absolute bottom-0 left-0 right-0 h-1.5 backdrop-blur-sm', progressTrack[theme])}>
                      <div className={cn('h-full transition-all duration-1000', progressFill[theme])} style={{ width: `${Math.min(100, percent)}%` }} />
                    </div>
                  );
                })()}

                <div className={cn('absolute inset-0 bg-black/0 transition-colors duration-700', hoverMask[theme])} />
              </div>

              <div className="px-1">
                <h3 className={cn('font-serif text-sm font-bold leading-tight transition-colors line-clamp-2 mb-1.5 tracking-tight', bookTitleColor[theme])}>{book.title}</h3>
                <div className="flex items-center gap-2">
                  <span className={cn('text-[8px] uppercase tracking-[0.15em] font-bold truncate max-w-[60%]', authorColor[theme])}>{book.author || 'Anonymous'}</span>
                  <div className={cn('h-[1px] flex-1', dividerColor[theme])} />
                  {(() => {
                    const currentP = progress[book.id];
                    if (currentP === undefined) return <span className={cn('text-[8px] font-bold uppercase tracking-tighter', unreadColor[theme])}>未读</span>;
                    const totalPages = getTotalPages(book);
                    if (!totalPages || totalPages <= 1) return <span className={cn('text-[8px] font-bold uppercase tracking-tighter', unreadColor[theme])}>--</span>;
                    const percent = calcPercent(currentP, totalPages);
                    return <span className={cn('text-[8px] font-bold uppercase tracking-tighter', percentColor[theme])}>{percent}%</span>;
                  })()}
                </div>
                {progress[book.id] !== undefined && <p className="text-[7px] font-bold opacity-20 uppercase tracking-widest mt-1">已读至第 {progress[book.id] + 1} 页</p>}
              </div>

              <AnimatePresence>
                {menuBookId === book.id && (
                  <motion.div
                    initial={{ opacity: 0, y: 14, x: -8, scale: 0.96 }}
                    animate={{ opacity: 1, y: 0, x: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 10, x: -6, scale: 0.96 }}
                    transition={{ duration: 0.2, ease: 'easeOut' }}
                    className={cn('absolute right-2 top-[36%] z-[200] rounded-2xl overflow-hidden', menuPanel[theme])}
                    onClick={(e) => e.stopPropagation()}
                  >
                    <button
                      onClick={() => {
                        onDeleteBook(book);
                        setMenuBookId(null);
                      }}
                      className={cn('w-full flex items-center gap-2 px-5 py-4 text-sm font-semibold transition-colors', menuButton[theme])}
                    >
                      <Trash2 className="w-4 h-4 text-red-500" />
                      删除
                    </button>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          ))}

          <button onClick={onUploadClick} className={cn('aspect-[2/3] rounded-sm border-2 border-dashed flex flex-col items-center justify-center p-8 transition-all group', addButton[theme])}>
            <Plus className={cn('w-8 h-8 transition-colors mb-4', addIcon[theme])} />
            <span className={cn('text-[9px] font-bold uppercase tracking-widest', addText[theme])}>添加更多</span>
          </button>
        </div>
      </div>
    </div>
  );
}

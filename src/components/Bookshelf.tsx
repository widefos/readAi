import React from 'react';
import { motion } from 'motion/react';
import { Book as BookIcon, Plus } from 'lucide-react';
import { Book } from '../types';

interface BookshelfProps {
  books: Book[];
  onSelectBook: (book: Book) => void;
  onUploadClick: () => void;
  progress: Record<string, number>;
}

export function Bookshelf({ books, onSelectBook, onUploadClick, progress }: BookshelfProps) {
  return (
    <div className="flex-1 bg-transparent overflow-y-auto p-12">
      <div className="max-w-7xl mx-auto">
        <header className="mb-12">
          <h1 className="font-serif text-5xl font-bold tracking-tight mb-4">我的书架</h1>
          <p className="text-[10px] uppercase tracking-[0.3em] font-bold text-indigo-600/60">Library · {books.length} Documents</p>
        </header>

        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-8 gap-y-12">
          {books.map((book, index) => (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.05 }}
              key={book.id}
              onClick={() => onSelectBook(book)}
              className="group cursor-pointer"
            >
              <div className="relative aspect-[7/10] mb-4 bg-white rounded-xs shadow-[0_4px_20px_-4px_rgba(0,0,0,0.1)] group-hover:shadow-[0_20px_40px_-8px_rgba(0,0,0,0.2)] transition-all duration-700 overflow-hidden transform group-hover:-translate-y-3">
                {book.cover ? (
                  <img src={book.cover} alt={book.title} className="w-full h-full object-cover grayscale-[0.2] group-hover:grayscale-0 transition-all duration-700" referrerPolicy="no-referrer" />
                ) : (
                  <div className="w-full h-full flex flex-col items-center justify-center bg-[#fdfdfd] p-8 text-center border border-black/5 relative overflow-hidden">
                    <div className="absolute top-0 left-0 w-8 h-full bg-black/5 blur-sm" />
                    <BookIcon className="w-10 h-10 text-black/10 mb-6" />
                    <span className="font-serif text-[11px] font-bold text-black/40 leading-tight tracking-tight uppercase px-2">{book.title}</span>
                  </div>
                )}

                {(() => {
                  const paragraphs = book.content.split('\n').filter((p) => p.trim().length > 0);
                  const totalPages = Math.ceil(paragraphs.length / 8) || 1;
                  const currentP = progress[book.id];
                  if (currentP === undefined) return null;
                  const percent = Math.round(((currentP + 1) / totalPages) * 100);

                  return (
                    <div className="absolute bottom-0 left-0 right-0 h-1.5 bg-black/5 backdrop-blur-sm">
                      <div className="h-full bg-black transition-all duration-1000" style={{ width: `${Math.min(100, percent)}%` }} />
                    </div>
                  );
                })()}

                <div className="absolute inset-0 bg-black/0 group-hover:bg-black/5 transition-colors duration-700" />
              </div>

              <div className="px-1">
                <h3 className="font-serif text-sm font-bold leading-tight group-hover:text-indigo-600 transition-colors line-clamp-2 mb-1.5 tracking-tight">{book.title}</h3>
                <div className="flex items-center gap-2">
                  <span className="text-[8px] uppercase tracking-[0.15em] opacity-30 font-bold truncate max-w-[60%]">{book.author || 'Anonymous'}</span>
                  <div className="h-[1px] bg-black/5 flex-1" />
                  {(() => {
                    const paragraphs = book.content.split('\n').filter((p) => p.trim().length > 0);
                    const totalPages = Math.ceil(paragraphs.length / 8) || 1;
                    const currentP = progress[book.id];
                    if (currentP === undefined) return <span className="text-[8px] font-bold text-black/20 uppercase tracking-tighter">未读</span>;
                    const percent = Math.round(((currentP + 1) / totalPages) * 100);
                    return <span className="text-[8px] font-bold text-indigo-500 uppercase tracking-tighter">{percent}%</span>;
                  })()}
                </div>
                {progress[book.id] !== undefined && <p className="text-[7px] font-bold opacity-20 uppercase tracking-widest mt-1">已读至第 {progress[book.id] + 1} 页</p>}
              </div>
            </motion.div>
          ))}

          <button onClick={onUploadClick} className="aspect-[2/3] rounded-sm border-2 border-dashed border-gray-100 flex flex-col items-center justify-center p-8 hover:border-indigo-200 hover:bg-indigo-50/20 transition-all group">
            <Plus className="w-8 h-8 text-gray-200 group-hover:text-indigo-300 transition-colors mb-4" />
            <span className="text-[9px] font-bold uppercase tracking-widest text-gray-300 group-hover:text-indigo-400">添加更多</span>
          </button>
        </div>
      </div>
    </div>
  );
}

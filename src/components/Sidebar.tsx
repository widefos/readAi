import {
  Heart,
  Lightbulb,
  Highlighter,
  Trash2,
  Library,
  BookOpen,
  Plus,
} from 'lucide-react';
import { motion } from 'motion/react';
import { cn } from '../lib/utils';

interface SidebarProps {
  view: 'bookshelf' | 'reader';
  setView: (view: 'bookshelf' | 'reader') => void;
  activeBook: boolean;
  activeBookTitle?: string;
  onUpload: () => void;
}

export function Sidebar({ view, setView, activeBook, activeBookTitle, onUpload }: SidebarProps) {
  const navItems = [
    { id: 'bookshelf', label: '全部图书', icon: Library },
    { id: 'favorites', label: '我的喜爱', icon: Heart },
    { id: 'notes', label: '我的笔记', icon: Lightbulb },
    { id: 'highlights', label: '我的高亮', icon: Highlighter },
    { id: 'trash', label: '我的回收', icon: Trash2 },
  ];

  return (
    <div className="w-64 h-full bg-paper border-r border-[#1A1A1A]/10 flex flex-col pt-12 relative z-50">
      <div className="px-8 mb-16 flex items-center gap-4">
        <div className="w-10 h-10 bg-[#1A1A1A] rounded-sm flex items-center justify-center shadow-lg">
          <div className="w-5 h-5 bg-[#FDFCF8] rotate-45 transform scale-75 origin-center"></div>
        </div>
        <div>
          <span className="text-2xl font-bold tracking-tighter uppercase italic font-serif block leading-none">AI 智阅</span>
          <span className="text-[7px] font-bold uppercase tracking-[0.4em] opacity-30 mt-1 block">Library System v3.1</span>
        </div>
      </div>

      <nav className="flex-1 px-4 space-y-2">
        <p className="px-4 text-[9px] font-bold uppercase tracking-[0.3em] text-[#1A1A1A]/30 mb-4">Navigate</p>
        {navItems.map((item) => (
          <button
            key={item.id}
            onClick={() => {
              if (item.id === 'bookshelf') setView('bookshelf');
            }}
            className={cn(
              'w-full flex items-center gap-4 px-4 py-3.5 rounded-sm text-left group transition-all relative overflow-hidden',
              view === 'bookshelf' && item.id === 'bookshelf'
                ? 'bg-black/5 text-[#1A1A1A]'
                : 'text-[#1A1A1A]/40 hover:bg-black/[0.02] hover:text-[#1A1A1A]/70',
            )}
          >
            {view === 'bookshelf' && item.id === 'bookshelf' && (
              <motion.div layoutId="nav-active" className="absolute left-0 top-0 bottom-0 w-1 bg-[#1A1A1A]" />
            )}
            <item.icon
              className={cn(
                'w-5 h-5 transition-transform group-hover:scale-110',
                view === 'bookshelf' && item.id === 'bookshelf' ? 'opacity-100' : 'opacity-40',
              )}
            />
            <span className="text-[10px] font-bold uppercase tracking-[0.15em]">{item.label}</span>
          </button>
        ))}

        <div className="pt-10">
          <div className="h-px bg-black/5 mx-4 mb-8" />
          <p className="px-4 text-[9px] font-bold uppercase tracking-[0.3em] text-[#1A1A1A]/30 mb-4">Reading Now</p>

          <button
            onClick={() => {
              if (activeBook) setView('reader');
            }}
            disabled={!activeBook}
            className={cn(
              'w-full flex items-center gap-4 px-4 py-4 rounded-sm text-left group transition-all relative overflow-hidden',
              view === 'reader' ? 'bg-black/5 text-[#1A1A1A]' : 'text-[#1A1A1A]/40 hover:bg-black/[0.02] hover:text-[#1A1A1A]/70',
              !activeBook && 'opacity-20 cursor-not-allowed',
            )}
          >
            {view === 'reader' && <motion.div layoutId="nav-active" className="absolute left-0 top-0 bottom-0 w-1 bg-[#1A1A1A]" />}
            <BookOpen className={cn('w-5 h-5 shrink-0', view === 'reader' ? 'opacity-100' : 'opacity-40')} />
            <div className="flex flex-col min-w-0">
              <span className="text-[10px] font-bold uppercase tracking-[0.15em]">正在阅读</span>
              {activeBookTitle && <span className="text-[8px] opacity-40 font-bold truncate tracking-tight mt-1">{activeBookTitle}</span>}
            </div>
          </button>
        </div>
      </nav>

      <div className="p-6 mt-auto">
        <button
          onClick={onUpload}
          className="w-full flex items-center gap-3 px-4 py-4 text-[#1A1A1A]/40 hover:text-black transition-colors group mb-6 bg-black/5 rounded-lg border border-transparent hover:border-black/10"
        >
          <Plus className="w-4 h-4 opacity-60 group-hover:rotate-90 transition-transform duration-500" />
          <span className="text-[10px] font-bold uppercase tracking-[0.2em]">导入书籍</span>
        </button>

        <div className="bg-white/50 backdrop-blur-sm rounded-xl p-5 border border-black/5">
          <div className="flex items-center gap-3 mb-5">
            <div className="w-9 h-9 rounded-full bg-[#1A1A1A] text-white flex items-center justify-center font-bold text-[11px] ring-4 ring-black/5">L</div>
            <div className="flex-1 min-w-0">
              <p className="text-[9px] font-bold uppercase truncate tracking-widest">Local Reader</p>
              <div className="flex items-center gap-1.5 mt-0.5">
                <span className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse"></span>
                <span className="text-[7px] text-[#1A1A1A]/40 font-bold uppercase tracking-[0.2em]">Local Mode</span>
              </div>
            </div>
          </div>
          <div className="w-full py-2.5 bg-white rounded-lg border border-black/10 text-[8px] font-bold uppercase tracking-widest text-center">Data stays on this device</div>
        </div>

        <p className="text-center text-[7px] font-bold uppercase tracking-[0.5em] opacity-20 mt-6">Design by AI Reader</p>
      </div>
    </div>
  );
}

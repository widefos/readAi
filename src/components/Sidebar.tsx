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
  hasOpenReaderTabs?: boolean;
  onUpload: () => void;
  theme: 'paper' | 'light' | 'dark' | 'eye';
}

export function Sidebar({ view, setView, hasOpenReaderTabs = false, onUpload, theme }: SidebarProps) {
  const shellClasses = {
    light: 'bg-[#FCFCFD] border-black/10 text-[#141414]',
    paper: 'bg-[#F4F1EA] border-[#1A1A1A]/10 text-[#1A1A1A]',
    dark: 'bg-[#151515] border-white/10 text-[#D1D1D1]',
    eye: 'bg-[linear-gradient(180deg,#042f36_0%,#053841_100%)] border-[#23b8a0]/18 text-[#c8efe7]',
  } as const;
  const brandMarkClasses = {
    light: 'bg-[#111]',
    paper: 'bg-[#1A1A1A]',
    dark: 'bg-[#E5E5E5]',
    eye: 'bg-[#16b69d]',
  } as const;
  const brandInnerClasses = {
    light: 'bg-[#FCFCFD]',
    paper: 'bg-[#FDFCF8]',
    dark: 'bg-[#151515]',
    eye: 'bg-[#063840]',
  } as const;
  const navHintClasses = {
    light: 'text-black/35',
    paper: 'text-[#1A1A1A]/30',
    dark: 'text-white/30',
    eye: 'text-[#7ec9bc]/75',
  } as const;
  const navActiveClasses = {
    light: 'bg-black/8 text-black',
    paper: 'bg-black/5 text-[#1A1A1A]',
    dark: 'bg-white/10 text-[#F3F3F3]',
    eye: 'bg-[#0d5a60] text-[#d7f6ef]',
  } as const;
  const navInactiveClasses = {
    light: 'text-black/50 hover:bg-black/[0.035] hover:text-black/80',
    paper: 'text-[#1A1A1A]/40 hover:bg-black/[0.02] hover:text-[#1A1A1A]/70',
    dark: 'text-white/45 hover:bg-white/[0.04] hover:text-white/80',
    eye: 'text-[#8ccfc3]/80 hover:bg-[#0b5057] hover:text-[#ddf8f2]',
  } as const;
  const navBarClasses = { light: 'bg-[#111]', paper: 'bg-[#1A1A1A]', dark: 'bg-[#F3F3F3]', eye: 'bg-[#1fd1b3]' } as const;
  const dividerClasses = { light: 'border-black/8', paper: 'border-black/5', dark: 'border-white/10', eye: 'border-[#21af98]/20' } as const;
  const uploadClasses = {
    light: 'text-black/55 hover:text-black bg-black/5 hover:border-black/20',
    paper: 'text-[#1A1A1A]/40 hover:text-black bg-black/5 hover:border-black/10',
    dark: 'text-white/70 hover:text-white bg-white/5 hover:border-white/20',
    eye: 'text-[#8dd7ca] hover:text-[#d9f8f1] bg-[#0b4a53]/60 hover:border-[#25c5a9]/35',
  } as const;
  const cardClasses = { light: 'bg-black/[0.02] border-black/10', paper: 'bg-white/50 border-black/5', dark: 'bg-white/5 border-white/10', eye: 'bg-[#0a4650]/60 border-[#25b9a1]/24 backdrop-blur-sm' } as const;
  const avatarClasses = {
    light: 'bg-[#101010] text-white ring-black/10',
    paper: 'bg-[#1A1A1A] text-white ring-black/5',
    dark: 'bg-[#E5E5E5] text-[#1A1A1A] ring-white/10',
    eye: 'bg-[#18b49c] text-[#073a43] ring-[#25b9a1]/24',
  } as const;
  const modeTextClasses = { light: 'text-black/50', paper: 'text-[#1A1A1A]/40', dark: 'text-white/40', eye: 'text-[#86cfc2]/80' } as const;
  const modePanelClasses = {
    light: 'bg-white border-black/15 text-black/70',
    paper: 'bg-white border-black/10 text-[#1A1A1A]/70',
    dark: 'bg-[#101010] border-white/15 text-white/75',
    eye: 'bg-[#063b44] border-[#20b29b]/28 text-[#c9f0e8]',
  } as const;

  const navItems = [
    { id: 'bookshelf', label: '全部图书', icon: Library },
    { id: 'favorites', label: '我的喜爱', icon: Heart },
    { id: 'notes', label: '我的笔记', icon: Lightbulb },
    { id: 'highlights', label: '我的高亮', icon: Highlighter },
    { id: 'trash', label: '我的回收', icon: Trash2 },
  ];

  return (
    <div className={cn('w-64 h-full border-r flex flex-col pt-12 relative z-50', shellClasses[theme])}>
      <div className="px-8 mb-16 flex items-center gap-4">
        <div className={cn('w-10 h-10 rounded-sm flex items-center justify-center shadow-lg', brandMarkClasses[theme])}>
          <div className={cn('w-5 h-5 rotate-45 transform scale-75 origin-center', brandInnerClasses[theme])}></div>
        </div>
        <div>
          <span className="text-2xl font-bold tracking-tighter uppercase italic font-serif block leading-none">AI 智阅</span>
          <span className="text-[7px] font-bold uppercase tracking-[0.4em] opacity-30 mt-1 block">Library System v3.1</span>
        </div>
      </div>

      <nav className="flex-1 px-4 space-y-2">
        <p className={cn('px-4 text-[9px] font-bold uppercase tracking-[0.3em] mb-4', navHintClasses[theme])}>Navigate</p>
        {navItems.map((item) => (
          <button
            key={item.id}
            onClick={() => {
              if (item.id === 'bookshelf') setView('bookshelf');
            }}
            className={cn(
              'w-full flex items-center gap-4 px-4 py-3.5 rounded-sm text-left group transition-all relative overflow-hidden',
              view === 'bookshelf' && item.id === 'bookshelf' ? navActiveClasses[theme] : navInactiveClasses[theme],
            )}
          >
            {view === 'bookshelf' && item.id === 'bookshelf' && (
              <motion.div layoutId="nav-active" className={cn('absolute left-0 top-0 bottom-0 w-1', navBarClasses[theme])} />
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

        <div className={cn('pt-8 mt-6 border-t', dividerClasses[theme])}>
          <button
            onClick={() => setView('reader')}
            className={cn(
              'w-full flex items-center gap-4 px-4 py-3.5 rounded-sm text-left group transition-all relative overflow-hidden',
              view === 'reader' ? navActiveClasses[theme] : navInactiveClasses[theme],
              !hasOpenReaderTabs && 'opacity-60',
            )}
          >
            {view === 'reader' && (
              <motion.div layoutId="nav-active" className={cn('absolute left-0 top-0 bottom-0 w-1', navBarClasses[theme])} />
            )}
            <BookOpen className={cn('w-5 h-5 transition-transform group-hover:scale-110', view === 'reader' ? 'opacity-100' : 'opacity-40')} />
            <span className="text-[10px] font-bold uppercase tracking-[0.15em]">阅读</span>
          </button>
        </div>
      </nav>

      <div className="p-6 mt-auto">
        <button
          onClick={onUpload}
          className={cn('w-full flex items-center gap-3 px-4 py-4 transition-colors group mb-6 rounded-lg border border-transparent', uploadClasses[theme])}
        >
          <Plus className="w-4 h-4 opacity-60 group-hover:rotate-90 transition-transform duration-500" />
          <span className="text-[10px] font-bold uppercase tracking-[0.2em]">导入书籍</span>
        </button>

        <div className={cn('backdrop-blur-sm rounded-xl p-5 border', cardClasses[theme])}>
          <div className="flex items-center gap-3 mb-5">
            <div className={cn('w-9 h-9 rounded-full flex items-center justify-center font-bold text-[11px] ring-4', avatarClasses[theme])}>L</div>
            <div className="flex-1 min-w-0">
              <p className="text-[9px] font-bold uppercase truncate tracking-widest">Local Reader</p>
              <div className="flex items-center gap-1.5 mt-0.5">
                <span className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse"></span>
                <span className={cn('text-[7px] font-bold uppercase tracking-[0.2em]', modeTextClasses[theme])}>Local Mode</span>
              </div>
            </div>
          </div>
          <div className={cn('w-full py-2.5 rounded-lg border text-[8px] font-bold uppercase tracking-widest text-center', modePanelClasses[theme])}>Data stays on this device</div>
        </div>

        <p className="text-center text-[7px] font-bold uppercase tracking-[0.5em] opacity-20 mt-6">Design by AI Reader</p>
      </div>
    </div>
  );
}

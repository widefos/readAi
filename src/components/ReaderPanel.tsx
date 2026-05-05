import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Book, TocItem } from '../types';
import { createReaderEngine } from '../engines/readerEngine';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '../lib/utils';
import { ChevronRight, ChevronDown, Settings, List, Sparkles, X as CloseIcon, Clock, FileText, Calendar, Hash, Info, Bookmark } from 'lucide-react';
import { usePdfReaderEngine } from '../engines/pdfReaderEngine';

const textPaginationCache = new Map<string, number[]>();
const TEXT_PAGE_HEIGHT_FACTOR = 1.35;

interface ReaderPanelProps {
  book: Book;
  currentPage: number;
  onPageChange: (page: number) => void;
  theme: 'paper' | 'light' | 'dark' | 'eye';
  onThemeChange: (theme: 'paper' | 'light' | 'dark' | 'eye') => void;
  paragraphAnchor?: number;
  onAnchorChange?: (anchor: number) => void;
  readingDurationSeconds?: number;
  onAnnotate?: (text: string) => void;
  isOverviewOpen: boolean;
  onOpenOverview: () => void;
  onCloseOverview: () => void;
  onBookmarksChange?: (bookmarks: NonNullable<Book['bookmarks']>) => void;
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
  onBookmarksChange,
}: ReaderPanelProps) {
  const [fontSize, setFontSize] = useState(20);
  const [lineHeight, setLineHeight] = useState(1.8);
  const [fontFamily, setFontFamily] = useState<'sans' | 'serif' | 'mono'>('serif');
  const [animationType, setAnimationType] = useState<'fade' | 'slide' | 'slide-up' | 'none'>('fade');
  const [animationSpeed, setAnimationSpeed] = useState(0.5);
  const [pdfScale, setPdfScale] = useState(1.4);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isTocOpen, setIsTocOpen] = useState(false);
  const [tocTab, setTocTab] = useState<'toc' | 'bookmarks'>('toc');
  const [tocExpanded, setTocExpanded] = useState<Record<string, boolean>>({});
  const [isBookmarkEditorOpen, setIsBookmarkEditorOpen] = useState(false);
  const [bookmarkDraftName, setBookmarkDraftName] = useState('');
  const [bookmarkDraftNote, setBookmarkDraftNote] = useState('');
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
  const animationTypeRef = useRef(animationType);
  const animationSpeedRef = useRef(animationSpeed);
  useEffect(() => {
    animationTypeRef.current = animationType;
    animationSpeedRef.current = animationSpeed;
  }, [animationType, animationSpeed]);
  const totalPages = isPdfBook ? engine.totalPages : Math.max(1, textPageStarts.length);
  const bookmarks = book.bookmarks || [];
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
    eye: 'bg-[#053941] text-[#cfeee7]',
  };
  const overviewOverlayClasses = {
    light: 'bg-[#F8F9FB] text-[#1A1A1A]',
    paper: 'bg-white text-[#1A1A1A]',
    dark: 'bg-[#121212] text-[#D8D8D8]',
    eye: 'bg-[#032e37] text-[#d0f1ea]',
  } as const;
  const overviewCoverShellClasses = {
    light: 'bg-[#E9ECF2]',
    paper: 'bg-[#E8E6E1]',
    dark: 'bg-[#1F1F1F]',
    eye: 'bg-[#0a4a53]',
  } as const;
  const overviewBorderGlowClasses = {
    light: 'border-black/10',
    paper: 'border-white/10',
    dark: 'border-white/5',
    eye: 'border-[#22b79f]/25',
  } as const;
  const overviewMetaTextClasses = {
    light: 'text-blue-600',
    paper: 'text-indigo-600',
    dark: 'text-sky-300',
    eye: 'text-[#29cdb3]',
  } as const;
  const overviewTitleClasses = {
    light: 'text-[#111]',
    paper: 'text-[#1A1A1A]',
    dark: 'text-[#ECECEC]',
    eye: 'text-[#daf9f2]',
  } as const;
  const overviewAuthorClasses = {
    light: 'text-black/55',
    paper: 'text-gray-500',
    dark: 'text-white/55',
    eye: 'text-[#9dded2]/85',
  } as const;
  const overviewInfoBorderClasses = {
    light: 'border-black/10',
    paper: 'editorial-border',
    dark: 'border-white/12',
    eye: 'border-[#22b79f]/30',
  } as const;
  const overviewInfoCardClasses = {
    light: 'bg-black/5',
    paper: 'bg-black/5',
    dark: 'bg-white/10',
    eye: 'bg-[#21b39b]/14',
  } as const;
  const overviewInfoTextClasses = {
    light: 'text-[#111]',
    paper: 'text-[#1A1A1A]',
    dark: 'text-[#ECECEC]',
    eye: 'text-[#d3f4ed]',
  } as const;
  const overviewPrimaryBtnClasses = {
    light: 'bg-[#111] text-white hover:bg-black',
    paper: 'bg-black text-white hover:bg-gray-800',
    dark: 'bg-[#ECECEC] text-[#141414] hover:bg-white',
    eye: 'bg-[#1db69e] text-[#05323b] hover:bg-[#2ad3b6]',
  } as const;
  const tocPanelClasses = {
    light: 'border-black/10 bg-[linear-gradient(170deg,rgba(250,251,255,0.88)_0%,rgba(241,244,250,0.9)_100%)] shadow-[0_18px_42px_rgba(0,0,0,0.18)]',
    paper: 'border-[#cfc6b4]/70 bg-[linear-gradient(170deg,rgba(253,251,245,0.9)_0%,rgba(246,241,232,0.9)_100%)] shadow-[0_20px_46px_rgba(62,49,27,0.18)]',
    dark: 'border-[#343434]/70 bg-[linear-gradient(170deg,rgba(36,36,38,0.82)_0%,rgba(24,24,26,0.82)_100%)] shadow-[0_22px_48px_rgba(0,0,0,0.45)]',
    eye: 'border-[#23baa1]/45 bg-[linear-gradient(170deg,rgba(10,77,86,0.86)_0%,rgba(6,54,63,0.86)_100%)] shadow-[0_22px_48px_rgba(0,0,0,0.45)]',
  } as const;
  const tocHeaderBorderClasses = {
    light: 'border-black/8',
    paper: 'border-[#b8ab95]/45',
    dark: 'border-white/10',
    eye: 'border-[#22b79f]/30',
  } as const;
  const tocTitleTextClasses = {
    light: 'text-[#1A1A1A]',
    paper: 'text-[#2a241b]',
    dark: 'text-white',
    eye: 'text-[#d7f8f1]',
  } as const;
  const tocCloseTextClasses = {
    light: 'text-black/45 hover:text-black/90',
    paper: 'text-[#3f3528]/55 hover:text-[#2f281f]',
    dark: 'text-white/45 hover:text-white/90',
    eye: 'text-[#8ed1c5]/85 hover:text-[#dcfbf5]',
  } as const;
  const tocTabWrapClasses = {
    light: 'border-black/10 bg-black/[0.03]',
    paper: 'border-[#b8ab95]/40 bg-[#eee7da]/60',
    dark: 'border-white/12 bg-black/15',
    eye: 'border-[#21b39b]/32 bg-[#084a53]/75',
  } as const;
  const tocTabActiveClasses = {
    light: 'bg-[#3b4f86]/16 text-[#1c2e5d]',
    paper: 'bg-[#6e5944]/15 text-[#473729]',
    dark: 'bg-[#2f3c63]/65 text-white',
    eye: 'bg-[#22b79f]/24 text-[#dbfaf4]',
  } as const;
  const tocTabInactiveClasses = {
    light: 'text-black/55 hover:text-black hover:bg-black/5',
    paper: 'text-[#4d3f2d]/65 hover:text-[#302519] hover:bg-[#3b2f20]/8',
    dark: 'text-white/60 hover:text-white hover:bg-white/5',
    eye: 'text-[#93d7ca]/85 hover:text-[#e1fff8] hover:bg-[#0f5c65]',
  } as const;
  const tocItemTextClasses = {
    light: 'text-black/65 hover:text-black hover:bg-[#3b4f86]/10',
    paper: 'text-[#4a3f30]/70 hover:text-[#2f261c] hover:bg-[#6e5944]/10',
    dark: 'text-white/68 hover:text-white hover:bg-[#2f3c63]/35',
    eye: 'text-[#9bded2]/85 hover:text-[#e1fff8] hover:bg-[#0f5c65]',
  } as const;
  const tocItemDisabledClasses = {
    light: 'text-black/30',
    paper: 'text-[#5a4c39]/35',
    dark: 'text-white/35',
    eye: 'text-[#7ec8bb]/50',
  } as const;
  const tocChildBorderClasses = {
    light: 'border-black/10',
    paper: 'border-[#7f6b55]/20',
    dark: 'border-white/10',
    eye: 'border-[#20b39b]/30',
  } as const;
  const settingsPanelClasses = {
    light: 'bg-white border-black/12 text-[#1A1A1A]',
    paper: 'bg-[#FDFCF8] border-black/10 text-[#1A1A1A]',
    dark: 'bg-[#181818] border-white/14 text-[#D8D8D8]',
    eye: 'bg-[#0a4650] border-[#20b39b]/30 text-[#d4f3ec]',
  } as const;
  const settingsLabelClasses = {
    light: 'text-black/55',
    paper: 'text-black/50',
    dark: 'text-white/55',
    eye: 'text-[#9edfd3]/85',
  } as const;
  const settingsSliderClasses = {
    light: 'bg-black/10 accent-black',
    paper: 'bg-black/10 accent-black',
    dark: 'bg-white/20 accent-white',
    eye: 'bg-[#1ebea3]/22 accent-[#23cfb3]',
  } as const;
  const settingsOptionIdleClasses = {
    light: 'border-black/14 hover:bg-black/5',
    paper: 'border-black/12 hover:bg-black/5',
    dark: 'border-white/16 hover:bg-white/8',
    eye: 'border-[#20b39b]/32 hover:bg-[#0f5a63]',
  } as const;
  const settingsOptionActiveClasses = {
    light: 'bg-black text-white border-black',
    paper: 'bg-black text-white border-black',
    dark: 'bg-white text-[#111] border-white',
    eye: 'bg-[#1db69e] text-[#05323b] border-[#2ad3b6]',
  } as const;
  const tocRailClasses = {
    light: 'border-black/16',
    paper: 'border-[#6d5d4b]/24',
    dark: 'border-white/18',
    eye: 'border-[#20b39b]/36',
  } as const;
  const tocNodeGlowClasses = {
    light: 'bg-[#2f4274] shadow-[0_0_0_2px_rgba(255,255,255,0.86),0_0_12px_rgba(47,66,116,0.45)]',
    paper: 'bg-[#6a5038] shadow-[0_0_0_2px_rgba(250,246,237,0.9),0_0_12px_rgba(106,80,56,0.36)]',
    dark: 'bg-[#8aa3ff] shadow-[0_0_0_2px_rgba(26,26,26,0.9),0_0_12px_rgba(138,163,255,0.44)]',
    eye: 'bg-[#2fd8bc] shadow-[0_0_0_2px_rgba(7,56,66,0.92),0_0_14px_rgba(47,216,188,0.45)]',
  } as const;

  const fontClasses = {
    sans: 'font-sans',
    serif: 'font-serif',
    mono: 'font-mono',
  };

  const currentAnchor = textPageStarts[Math.min(currentPage, textPageStarts.length - 1)] ?? 0;
  const pageBookmarks = bookmarks.filter((b) => {
    if (!isPdfBook && typeof b.paragraphAnchor === 'number') {
      const mappedPage = findPageByParagraphIndex(b.paragraphAnchor, textPageStarts);
      return mappedPage === currentPage;
    }
    return b.page === currentPage;
  });
  const exactCurrentBookmark = bookmarks.find((b) => {
    if (!isPdfBook && typeof b.paragraphAnchor === 'number') return b.paragraphAnchor === currentAnchor;
    return b.page === currentPage;
  });
  const editableBookmark = exactCurrentBookmark || pageBookmarks[0];
  const isCurrentPageBookmarked = pageBookmarks.length > 0;

  const fontFamilies: Record<'sans' | 'serif' | 'mono', string> = {
    sans: '-apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif',
    serif: '"Noto Serif SC", "Songti SC", "STSong", "SimSun", serif',
    mono: '"SFMono-Regular", Consolas, "Liberation Mono", Menlo, monospace',
  };

  function findPageByParagraphIndex(index: number, starts: number[]) {
    if (!starts.length) return 0;
    let lo = 0;
    let hi = starts.length - 1;
    while (lo < hi) {
      const mid = Math.floor((lo + hi + 1) / 2);
      if (starts[mid] <= index) lo = mid;
      else hi = mid - 1;
    }
    return lo;
  }

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

    const delayMs = animationTypeRef.current === 'none'
      ? 0
      : Math.max(0, Math.round(animationSpeedRef.current * 1000));
    const timer = window.setTimeout(() => {
      if (contentRef.current) contentRef.current.scrollTop = 0;
    }, delayMs);

    return () => window.clearTimeout(timer);
  }, [currentPage]);

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

  const renderTocItem = (item: TocItem, depth = 0, parentKey = 'root') => {
    const nodeKey = `${parentKey}:${item.label}:${item.href || ''}:${depth}`;
    const hasChildren = Boolean(item.children && item.children.length > 0);
    const expanded = tocExpanded[nodeKey] ?? false;

    return (
      <div key={nodeKey} className={cn('relative', depth > 0 ? 'ml-4' : '')}>
        <div className="relative pl-8">
          {depth > 0 && <div className={cn('absolute left-[11px] -top-2 bottom-0 w-px', tocChildBorderClasses[theme])} />}
          <button
            onClick={() => {
              if (hasChildren) {
                setTocExpanded((prev) => ({ ...prev, [nodeKey]: !expanded }));
                return;
              }
              if (item.position !== undefined) {
                const targetPage = findPageByParagraphIndex(item.position, textPageStarts);
                safePageChange(Math.min(targetPage, totalPages - 1));
                setIsTocOpen(false);
              }
            }}
            disabled={!hasChildren && item.position === undefined}
            className={cn(
              'w-full text-left py-2.5 pr-2 text-sm transition-all rounded-xl flex items-center gap-3',
              !hasChildren && item.position === undefined
                ? `opacity-35 cursor-default ${tocItemDisabledClasses[theme]}`
                : `cursor-pointer ${tocItemTextClasses[theme]}`,
            )}
          >
            <span
              className={cn(
                'relative shrink-0 rounded-full',
                depth === 0 ? 'w-2.5 h-2.5' : 'w-1.5 h-1.5',
                tocNodeGlowClasses[theme],
              )}
            />
            <span className={cn(depth === 0 ? 'chapter-title' : 'section-title', theme !== 'dark' && 'text-inherit', 'mb-0 flex-1')}>{item.label}</span>
            {hasChildren && (
              <ChevronDown
                className={cn(
                  'w-3.5 h-3.5 transition-transform duration-300 opacity-70',
                  expanded && 'rotate-180',
                )}
              />
            )}
          </button>
        </div>

        {hasChildren && (
          <AnimatePresence initial={false}>
            {expanded && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
                className="overflow-hidden"
              >
                <motion.div
                  initial={{ y: -6 }}
                  animate={{ y: 0 }}
                  exit={{ y: -4 }}
                  transition={{ duration: 0.24, ease: 'easeOut' }}
                  className="relative pl-8"
                >
                  <motion.div
                    initial={{ scaleY: 0 }}
                    animate={{ scaleY: 1 }}
                    exit={{ scaleY: 0 }}
                    transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
                    className={cn('absolute left-[11px] top-0 bottom-2 w-0 border-l border-dashed origin-top', tocRailClasses[theme])}
                  />
                  <div className="space-y-0.5 pb-1">
                    {item.children!.map((child) => renderTocItem(child, depth + 1, nodeKey))}
                  </div>
                </motion.div>
              </motion.div>
            )}
          </AnimatePresence>
        )}
      </div>
    );
  };

  const jumpToBookmark = (bookmark: NonNullable<Book['bookmarks']>[number]) => {
    if (!isPdfBook && typeof bookmark.paragraphAnchor === 'number') {
      const targetPage = findPageByParagraphIndex(bookmark.paragraphAnchor, textPageStarts);
      safePageChange(Math.min(targetPage, totalPages - 1));
    } else {
      safePageChange(Math.min(bookmark.page, totalPages - 1));
    }
    setIsTocOpen(false);
  };

  const toggleCurrentBookmark = () => {
    if (!onBookmarksChange) return;
    if (pageBookmarks.length > 0) {
      const pageBookmarkIds = new Set(pageBookmarks.map((b) => b.id));
      const next = bookmarks.filter((b) => !pageBookmarkIds.has(b.id));
      onBookmarksChange(next);
      setIsBookmarkEditorOpen(false);
      return;
    }
    const next = [
      ...bookmarks,
      {
        id: crypto.randomUUID(),
        page: currentPage,
        paragraphAnchor: isPdfBook ? undefined : currentAnchor,
        createdAt: new Date().toISOString(),
        name: `第 ${currentPage + 1} 页`,
        note: '',
      },
    ];
    onBookmarksChange(next);
  };

  const saveBookmarkName = () => {
    if (!onBookmarksChange || !editableBookmark) return;
    const next = bookmarks.map((b) => (
      b.id === editableBookmark.id
        ? {
            ...b,
            name: bookmarkDraftName.trim() || b.name,
            note: bookmarkDraftNote.trim(),
          }
        : b
    ));
    onBookmarksChange(next);
    setIsBookmarkEditorOpen(false);
  };

  return (
    <div className={cn('flex-1 flex flex-col h-full min-h-0 overflow-hidden border-r editorial-border transition-colors duration-500 relative', themeClasses[theme])}>
      <header className="px-10 py-4 flex items-center gap-3 shrink-0 border-b border-black/5">
        <button onClick={() => setIsTocOpen(!isTocOpen)} className="p-2 hover:bg-black/5 rounded-full transition-all opacity-40 hover:opacity-100" title="目录">
          <List className="w-5 h-5" />
        </button>
        <button onClick={onOpenOverview} className="p-2 hover:bg-black/5 rounded-full transition-all opacity-40 hover:opacity-100" title="信息">
          <Info className="w-5 h-5" />
        </button>
        <div className="ml-auto relative">
          <button
            onClick={toggleCurrentBookmark}
            onContextMenu={(e) => {
              if (!editableBookmark) return;
              e.preventDefault();
              setBookmarkDraftName(editableBookmark.name || '');
              setBookmarkDraftNote(editableBookmark.note || '');
              setIsBookmarkEditorOpen(true);
            }}
            className={cn(
              'p-2 rounded-full transition-all',
              isCurrentPageBookmarked
                ? 'text-[#f6a623] bg-[radial-gradient(circle_at_30%_30%,rgba(255,242,181,0.9),rgba(242,208,108,0.5)_45%,rgba(120,96,38,0.35)_100%)] shadow-[0_0_0_1px_rgba(255,236,171,0.35),0_0_28px_rgba(255,214,120,0.42),inset_0_2px_8px_rgba(255,255,255,0.35)] hover:brightness-105'
                : 'hover:bg-black/5 opacity-40 hover:opacity-100',
            )}
            title={isCurrentPageBookmarked ? '当前页已有书签（点击可在当前阅读位置添加/取消）' : '添加当前页书签'}
          >
            <Bookmark className={cn('w-5 h-5', isCurrentPageBookmarked && 'fill-current')} />
          </button>
          <AnimatePresence>
            {isBookmarkEditorOpen && editableBookmark && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setIsBookmarkEditorOpen(false)} />
                <motion.div
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 8 }}
                  className="absolute right-0 top-full mt-2 z-50 w-56 p-3 bg-white border border-black/10 shadow-xl rounded-lg"
                >
                  <label className="text-[10px] font-bold uppercase tracking-widest opacity-50 block mb-2">书签名称</label>
                  <input
                    value={bookmarkDraftName}
                    onChange={(e) => setBookmarkDraftName(e.target.value)}
                    placeholder={`第 ${currentPage + 1} 页`}
                    className="w-full border border-black/15 rounded px-2 py-1.5 text-xs outline-none focus:border-black/30"
                  />
                  <label className="text-[10px] font-bold uppercase tracking-widest opacity-50 block mt-3 mb-2">备注</label>
                  <textarea
                    value={bookmarkDraftNote}
                    onChange={(e) => setBookmarkDraftNote(e.target.value)}
                    placeholder="输入备注（可选）"
                    rows={3}
                    className="w-full resize-none border border-black/15 rounded px-2 py-1.5 text-xs outline-none focus:border-black/30"
                  />
                  <div className="mt-3 flex justify-end">
                    <button onClick={saveBookmarkName} className="px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider bg-black text-white rounded hover:bg-[#111]">
                      保存
                    </button>
                  </div>
                </motion.div>
              </>
            )}
          </AnimatePresence>
        </div>
      </header>

      <AnimatePresence>
        {isOverviewOpen && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className={cn('fixed inset-0 z-[100] flex flex-col items-center justify-center p-8 overflow-y-auto', overviewOverlayClasses[theme])}>
            <button onClick={onCloseOverview} className="absolute top-12 right-12 p-3 hover:bg-black/5 rounded-full transition-all"><CloseIcon className="w-6 h-6" /></button>
            <div className="max-w-5xl w-full grid grid-cols-1 md:grid-cols-12 gap-16 items-center">
              <motion.div initial={{ opacity: 0, x: -50 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.2 }} className={cn('md:col-span-5 aspect-[2/3] relative shadow-2xl group overflow-hidden', overviewCoverShellClasses[theme])}>
                {book.cover ? <img src={book.cover} alt={book.title} className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105" /> : <div className="w-full h-full flex items-center justify-center border-4 border-black/5 m-4"><span className="font-serif text-3xl opacity-20 italic">No Cover</span></div>}
                <div className={cn('absolute inset-0 border-[20px] pointer-events-none', overviewBorderGlowClasses[theme])} />
              </motion.div>

              <motion.div initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }} className="md:col-span-7 space-y-10">
                <div>
                  <span className={cn('text-[10px] font-bold uppercase tracking-[0.3em] block mb-4', overviewMetaTextClasses[theme])}>Discovery · Library</span>
                  <h1 className={cn('font-serif text-6xl md:text-7xl font-bold leading-[1.1] mb-6 tracking-tight', overviewTitleClasses[theme])}>{book.title}</h1>
                  <p className={cn('text-2xl font-serif italic', overviewAuthorClasses[theme])}>by {book.author || 'Anonymous'}</p>
                </div>

                <div className={cn('grid grid-cols-2 gap-8 py-10 border-y', overviewInfoBorderClasses[theme])}>
                  <div className="flex gap-4 items-start"><div className={cn('p-2 rounded-lg', overviewInfoCardClasses[theme])}><Clock className="w-4 h-4 opacity-40" /></div><div><p className="text-[9px] font-bold uppercase tracking-widest opacity-40 mb-1">阅读时长</p><p className={cn('text-sm font-bold', overviewInfoTextClasses[theme])}>{readingTimeLabel}</p></div></div>
                  <div className="flex gap-4 items-start"><div className={cn('p-2 rounded-lg', overviewInfoCardClasses[theme])}><FileText className="w-4 h-4 opacity-40" /></div><div><p className="text-[9px] font-bold uppercase tracking-widest opacity-40 mb-1">文件大小</p><p className={cn('text-sm font-bold', overviewInfoTextClasses[theme])}>{fileSize} KB</p></div></div>
                  <div className="flex gap-4 items-start"><div className={cn('p-2 rounded-lg', overviewInfoCardClasses[theme])}><Hash className="w-4 h-4 opacity-40" /></div><div><p className="text-[9px] font-bold uppercase tracking-widest opacity-40 mb-1">字数统计</p><p className={cn('text-sm font-bold', overviewInfoTextClasses[theme])}>{isPdfBook ? '—' : `${textStatCount}（汉字+单词）`}</p></div></div>
                  <div className="flex gap-4 items-start"><div className={cn('p-2 rounded-lg', overviewInfoCardClasses[theme])}><Calendar className="w-4 h-4 opacity-40" /></div><div><p className="text-[9px] font-bold uppercase tracking-widest opacity-40 mb-1">最后阅读</p><p className={cn('text-sm font-bold', overviewInfoTextClasses[theme])}>{new Date().toLocaleDateString()}</p></div></div>
                </div>

                <div className="pt-6"><button onClick={onCloseOverview} className={cn('px-10 py-4 text-[10px] font-bold uppercase tracking-widest transition-all flex items-center gap-3 active:scale-95', overviewPrimaryBtnClasses[theme])}>开始阅读 <ChevronRight className="w-4 h-4" /></button></div>
              </motion.div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {isTocOpen && (
          <>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setIsTocOpen(false)} className="absolute inset-0 bg-black/20 z-40 backdrop-blur-[2px]" />
            <motion.div
              initial={{ x: -280, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: -280, opacity: 0 }}
              transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
              className={cn('absolute left-4 top-4 bottom-4 w-[22rem] z-50 flex flex-col rounded-2xl border backdrop-blur-[20px] overflow-hidden', tocPanelClasses[theme], theme === 'light' && 'toc-light', theme === 'paper' && 'toc-paper', theme === 'eye' && 'toc-eye')}
            >
              <div className={cn('p-6 border-b flex items-center justify-between', tocHeaderBorderClasses[theme])}>
                <h3 className={cn('font-serif text-xl font-bold italic', tocTitleTextClasses[theme])}>目录</h3>
                <button onClick={() => setIsTocOpen(false)} className={cn('text-[10px] font-bold uppercase tracking-widest', tocCloseTextClasses[theme])}>关闭</button>
              </div>
              <div className="px-6 pt-4">
                <div className={cn('grid grid-cols-2 gap-2 p-1 border rounded-xl text-[11px] font-bold', tocTabWrapClasses[theme])}>
                  <button onClick={() => setTocTab('toc')} className={cn('py-2 rounded-lg transition-colors', tocTab === 'toc' ? tocTabActiveClasses[theme] : tocTabInactiveClasses[theme])}>目录</button>
                  <button onClick={() => setTocTab('bookmarks')} className={cn('py-2 rounded-lg transition-colors', tocTab === 'bookmarks' ? tocTabActiveClasses[theme] : tocTabInactiveClasses[theme])}>书签</button>
                </div>
              </div>
              <div className="flex-1 overflow-y-auto p-6 space-y-2 custom-scrollbar">
                {tocTab === 'toc' ? (
                  book.toc && book.toc.length > 0 ? book.toc.map((item) => renderTocItem(item)) : <div className="py-12 text-center text-white/35 italic text-sm">未识别到目录结构</div>
                ) : (
                  bookmarks.length > 0 ? (
                    <div className="space-y-2">
                      {bookmarks
                        .slice()
                        .sort((a, b) => a.page - b.page)
                        .map((b) => (
                          <button key={b.id} onClick={() => jumpToBookmark(b)} className="w-full text-left p-3 rounded-xl border border-white/10 text-white/75 hover:text-white hover:bg-[#2f3c63]/35">
                            <div className="text-sm font-semibold">{b.name || `第 ${b.page + 1} 页`}</div>
                            <div className="text-[11px] text-white/45 mt-1">第 {b.page + 1} 页</div>
                            {b.note && <div className="text-[11px] text-white/70 mt-1 line-clamp-2">{b.note}</div>}
                          </button>
                        ))}
                    </div>
                  ) : (
                    <div className="py-12 text-center text-white/35 italic text-sm">还没有书签，点击顶部书签按钮添加</div>
                  )
                )}
              </div>
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
        {isCurrentPageBookmarked && (
          <div className="absolute top-6 right-10 z-20 pointer-events-none select-none">
            <svg width="60" height="100" viewBox="0 0 60 100" xmlns="http://www.w3.org/2000/svg" className="drop-shadow-[0_10px_14px_rgba(0,0,0,0.35)]">
              <defs>
                <linearGradient id="ribbonGradient" x1="0%" y1="0%" x2="0%" y2="100%">
                  <stop offset="0%" stopColor="#E53935" stopOpacity="1" />
                  <stop offset="100%" stopColor="#C62828" stopOpacity="1" />
                </linearGradient>
                <filter id="bookmarkShadow" x="-20%" y="-20%" width="150%" height="150%">
                  <feDropShadow dx="0" dy="2" stdDeviation="2" floodOpacity="0.3" />
                </filter>
              </defs>
              <path d="M0 0 H50 V90 L25 75 L0 90 Z" fill="url(#ribbonGradient)" filter="url(#bookmarkShadow)" />
              <path d="M35 0 L50 0 L50 15 Z" fill="#B71C1C" opacity="0.8" />
              <path d="M35 0 Q50 0 50 15 L35 15 Z" fill="#EF5350" />
            </svg>
          </div>
        )}
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
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 10 }}
                    style={{ fontFamily: '"Source Han Sans CN", "Noto Sans SC", "PingFang SC", "Microsoft YaHei", sans-serif' }}
                    className={cn('absolute bottom-full right-0 mb-4 p-6 border shadow-2xl z-50 w-64', settingsPanelClasses[theme])}
                  >
                    <h3 className="text-[10px] font-bold uppercase tracking-widest mb-6">阅读偏好</h3>
                    <div className="space-y-6">
                      <div><label className={cn('text-[9px] font-bold uppercase tracking-widest mb-3 block', settingsLabelClasses[theme])}>字体大小 ({fontSize}px)</label><input type="range" min="14" max="32" value={fontSize} onPointerDown={beginTypographyAdjust} onPointerUp={endTypographyAdjust} onTouchStart={beginTypographyAdjust} onTouchEnd={endTypographyAdjust} onChange={(e) => { lockReflowAnchorToCurrentPage(); setFontSize(Number(e.target.value)); }} className={cn('w-full h-1 appearance-none pointer cursor-pointer', settingsSliderClasses[theme])} /></div>
                      <div><label className={cn('text-[9px] font-bold uppercase tracking-widest mb-3 block', settingsLabelClasses[theme])}>行高 ({lineHeight})</label><input type="range" min="1" max="3" step="0.1" value={lineHeight} onPointerDown={beginTypographyAdjust} onPointerUp={endTypographyAdjust} onTouchStart={beginTypographyAdjust} onTouchEnd={endTypographyAdjust} onChange={(e) => { lockReflowAnchorToCurrentPage(); setLineHeight(Number(e.target.value)); }} className={cn('w-full h-1 appearance-none pointer cursor-pointer', settingsSliderClasses[theme])} /></div>
                      <div><label className={cn('text-[9px] font-bold uppercase tracking-widest mb-3 block', settingsLabelClasses[theme])}>字体</label><div className="flex gap-1">{(['serif', 'sans', 'mono'] as const).map((f) => <button key={f} onClick={() => { lockReflowAnchorToCurrentPage(); setFontFamily(f); }} className={cn('flex-1 py-2 text-[9px] font-bold uppercase border transition-colors', fontFamily === f ? settingsOptionActiveClasses[theme] : settingsOptionIdleClasses[theme])}>{f === 'serif' ? '宋体' : f === 'sans' ? '黑体' : '等宽'}</button>)}</div></div>
                      <div><label className={cn('text-[9px] font-bold uppercase tracking-widest mb-3 block', settingsLabelClasses[theme])}>阅读主题</label><div className="grid grid-cols-2 gap-1">{(['light', 'paper', 'dark', 'eye'] as const).map((t) => <button key={t} onClick={() => onThemeChange(t)} className={cn('py-2 text-[9px] font-bold uppercase border transition-colors', theme === t ? settingsOptionActiveClasses[theme] : settingsOptionIdleClasses[theme])}>{t === 'light' ? '明亮' : t === 'paper' ? '纸张' : t === 'dark' ? '深色' : '护眼'}</button>)}</div></div>
                      <div><label className={cn('text-[9px] font-bold uppercase tracking-widest mb-3 block', settingsLabelClasses[theme])}>翻页动画</label><div className="grid grid-cols-2 gap-1">{(['fade', 'slide', 'slide-up', 'none'] as const).map((a) => <button key={a} onClick={() => setAnimationType(a)} className={cn('py-2 text-[9px] font-bold uppercase border transition-colors', animationType === a ? settingsOptionActiveClasses[theme] : settingsOptionIdleClasses[theme])}>{a === 'fade' ? '渐变' : a === 'slide' ? '平移' : a === 'slide-up' ? '上滑' : '无'}</button>)}</div></div>
                      <div><label className={cn('text-[9px] font-bold uppercase tracking-widest mb-3 block', settingsLabelClasses[theme])}>动画速度 ({animationSpeed}s)</label><input type="range" min="0" max="2" step="0.1" value={animationSpeed} onChange={(e) => setAnimationSpeed(Number(e.target.value))} className={cn('w-full h-1 appearance-none pointer cursor-pointer', settingsSliderClasses[theme])} /></div>
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

import React, { useState, useEffect, useMemo, useRef, useLayoutEffect } from 'react';
import { Book, TocItem } from '../types';
import { createReaderEngine } from '../engines/readerEngine';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '../lib/utils';
import { ChevronRight, ChevronDown, Settings, List, Sparkles, X as CloseIcon, Clock, FileText, Calendar, Hash, Info, Bookmark, NotebookPen, Trash2, Pencil } from 'lucide-react';
import { usePdfReaderEngine } from '../engines/pdfReaderEngine';

const textPaginationCache = new Map<string, number[]>();
const verticalScrollTopCache = new Map<string, number>();
const verticalInPageOffsetCache = new Map<string, { page: number; offset: number }>();
const TEXT_PAGE_HEIGHT_FACTOR = 1.35;
const PAGE_TURN_DIRECTION_KEY = 'ai-reader-page-turn-direction';
const VERTICAL_IN_PAGE_OFFSET_KEY = 'ai-reader-vertical-in-page-offset';
const READER_DEBUG = process.env.NODE_ENV !== 'production';

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
  onCreateAnnotation?: (text: string) => void;
  isOverviewOpen: boolean;
  onOpenOverview: () => void;
  onCloseOverview: () => void;
  onBookmarksChange?: (bookmarks: NonNullable<Book['bookmarks']>) => void;
  onAnnotationsChange?: (annotations: NonNullable<Book['annotations']>) => void;
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
  onCreateAnnotation,
  isOverviewOpen,
  onOpenOverview,
  onCloseOverview,
  onBookmarksChange,
  onAnnotationsChange,
}: ReaderPanelProps) {
  const debugLog = (event: string, payload?: Record<string, unknown>) => {
    if (!READER_DEBUG) return;
    const data = payload || {};
    console.log('[READER_DEBUG]', event, data);
    void window.electronAPI?.debugLog?.({
      tag: 'READER_DEBUG',
      event,
      data,
    });
  };
  const persistInPageOffset = (bookId: string, page: number, offset: number) => {
    if (typeof window === 'undefined') return;
    try {
      const raw = localStorage.getItem(VERTICAL_IN_PAGE_OFFSET_KEY);
      const parsed = raw ? (JSON.parse(raw) as Record<string, { page: number; offset: number }>) : {};
      parsed[bookId] = { page, offset };
      localStorage.setItem(VERTICAL_IN_PAGE_OFFSET_KEY, JSON.stringify(parsed));
    } catch {
      // ignore persistence errors
    }
  };
  const [pageTurnDirections, setPageTurnDirections] = useState<Record<string, 'horizontal' | 'vertical'>>(() => {
    if (typeof window === 'undefined') return {};
    try {
      const raw = localStorage.getItem(PAGE_TURN_DIRECTION_KEY);
      return raw ? (JSON.parse(raw) as Record<string, 'horizontal' | 'vertical'>) : {};
    } catch {
      return {};
    }
  });
  const [fontSize, setFontSize] = useState(20);
  const [lineHeight, setLineHeight] = useState(1.8);
  const [fontFamily, setFontFamily] = useState<'sans' | 'serif' | 'mono'>('serif');
  const [animationType, setAnimationType] = useState<'fade' | 'slide' | 'slide-up' | 'none'>('fade');
  const [animationSpeed, setAnimationSpeed] = useState(0.5);
  const [pdfScale, setPdfScale] = useState(1.4);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isTocOpen, setIsTocOpen] = useState(false);
  const [tocTab, setTocTab] = useState<'toc' | 'bookmarks' | 'annotations'>('toc');
  const [tocExpanded, setTocExpanded] = useState<Record<string, boolean>>({});
  const [isBookmarkEditorOpen, setIsBookmarkEditorOpen] = useState(false);
  const [bookmarkDraftName, setBookmarkDraftName] = useState('');
  const [bookmarkDraftNote, setBookmarkDraftNote] = useState('');
  const [editingBookmarkId, setEditingBookmarkId] = useState<string | null>(null);
  const [bookmarkEditorPos, setBookmarkEditorPos] = useState<{ x: number; y: number } | null>(null);
  const [isAnnotationEditorOpen, setIsAnnotationEditorOpen] = useState(false);
  const [editingAnnotationId, setEditingAnnotationId] = useState<string | null>(null);
  const [annotationEditorPos, setAnnotationEditorPos] = useState<{ x: number; y: number } | null>(null);
  const [activeInlineAnnotationId, setActiveInlineAnnotationId] = useState<string | null>(null);
  const [inlineAnnotationPopoverPos, setInlineAnnotationPopoverPos] = useState<{ x: number; y: number } | null>(null);
  const pendingAnnotationJumpRef = useRef<{ id: string; paragraphAnchor?: number } | null>(null);
  const inlineAnnotationDraftRef = useRef('');
  const annotationEditorDraftRef = useRef('');
  const [selection, setSelection] = useState<{ text: string; x: number; y: number } | null>(null);
  const [isReadingScrollActive, setIsReadingScrollActive] = useState(false);
  const [readerViewportHeight, setReaderViewportHeight] = useState(0);
  const [isVerticalViewportReady, setIsVerticalViewportReady] = useState(true);
  const contentRef = useRef<HTMLDivElement>(null);
  const verticalPageRefs = useRef<Array<HTMLElement | null>>([]);
  const pdfVerticalPageRefs = useRef<Array<HTMLElement | null>>([]);
  const pdfVerticalCanvasRefs = useRef<Array<HTMLCanvasElement | null>>([]);
  const pdfVerticalRenderedPagesRef = useRef<Set<number>>(new Set());
  const pdfVerticalRenderTasksRef = useRef<Map<number, any>>(new Map());
  const readingScrollHideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const textViewportRef = useRef<HTMLDivElement>(null);
  const [pdfCanvasEl, setPdfCanvasEl] = useState<HTMLCanvasElement | null>(null);
  const programmaticVerticalScrollRef = useRef(false);
  const restoredVerticalKeyRef = useRef<string | null>(null);
  const currentPageRef = useRef(currentPage);
  const hasAppliedCachedScrollRef = useRef(false);
  const blockVerticalSyncUntilRef = useRef(0);
  const lastPageChangeSourceRef = useRef<'jump' | 'scroll'>('jump');
  const pageTurnDirection = pageTurnDirections[book.id] ?? 'horizontal';
  const { pdfDoc, pdfTotalPages, pdfError, openWithSystemViewer } = usePdfReaderEngine(book, currentPage, pdfScale, pdfCanvasEl, pageTurnDirection);
  const isPdfBook = book.fileType === 'application/pdf';
  const isVerticalPaging = pageTurnDirection === 'vertical' && !isPdfBook;
  const isVerticalPdfPaging = pageTurnDirection === 'vertical' && isPdfBook;
  const verticalCacheMinTop = currentPage > 0 ? Math.max(120, Math.floor(readerViewportHeight * 0.35)) : 0;

  useEffect(() => {
    currentPageRef.current = currentPage;
  }, [currentPage]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const raw = localStorage.getItem(VERTICAL_IN_PAGE_OFFSET_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as Record<string, { page: number; offset: number }>;
      const saved = parsed[book.id];
      if (saved && typeof saved.page === 'number' && typeof saved.offset === 'number') {
        verticalInPageOffsetCache.set(book.id, saved);
      }
    } catch {
      // ignore parse errors
    }
  }, [book.id]);

  useEffect(() => {
    hasAppliedCachedScrollRef.current = false;
    setIsVerticalViewportReady(true);
    blockVerticalSyncUntilRef.current = Date.now() + 320;
  }, [book.id, isVerticalPaging, isVerticalPdfPaging]);

  useEffect(() => {
    if (!isVerticalPdfPaging) return;
    // Re-entering vertical PDF uses new canvas nodes; clear rendered mark
    // so pages are rendered again instead of being skipped as "already rendered".
    pdfVerticalRenderedPagesRef.current = new Set();
    pdfVerticalRenderTasksRef.current.forEach((task) => {
      try { task.cancel?.(); } catch { /* noop */ }
    });
    pdfVerticalRenderTasksRef.current.clear();
  }, [book.id, isVerticalPdfPaging, pdfScale]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      localStorage.setItem(PAGE_TURN_DIRECTION_KEY, JSON.stringify(pageTurnDirections));
    } catch {
      // ignore persistence errors
    }
  }, [pageTurnDirections]);
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
  const annotations = book.annotations || [];
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
  const annotationsByParagraph = useMemo(() => {
    const map = new Map<number, NonNullable<Book['annotations']>[number][]>();
    for (const a of annotations) {
      if (typeof a.paragraphAnchor !== 'number') continue;
      const bucket = map.get(a.paragraphAnchor) || [];
      bucket.push(a);
      map.set(a.paragraphAnchor, bucket);
    }
    return map;
  }, [annotations]);
  const renderParagraphWithAnnotationHighlights = (
    paragraphText: string,
    paragraphAnnotations: NonNullable<Book['annotations']>,
  ) => {
    if (!paragraphAnnotations.length) return paragraphText;
    const ranges: Array<{ start: number; end: number; id: string }> = [];
    for (const a of paragraphAnnotations) {
      const quote = (a.quote || '').trim();
      if (!quote) continue;
      const start = paragraphText.indexOf(quote);
      if (start < 0) continue;
      const end = start + quote.length;
      ranges.push({ start, end, id: a.id });
    }
    if (!ranges.length) return paragraphText;
    ranges.sort((x, y) => x.start - y.start || x.end - y.end);

    const openInlinePopover = (annotationId: string, rect: DOMRect) => {
      if (activeInlineAnnotationId && activeInlineAnnotationId !== annotationId) return;
      setActiveInlineAnnotationId((prev) => {
        const next = prev === annotationId ? null : annotationId;
        if (next) {
          const POP_W = 288;
          const POP_H = 210;
          const GAP = 10;
          const MARGIN = 12;
          const vw = window.innerWidth;
          const vh = window.innerHeight;
          let x = rect.left;
          let y = rect.bottom + GAP;
          if (x + POP_W + MARGIN > vw) x = vw - POP_W - MARGIN;
          if (x < MARGIN) x = MARGIN;
          if (y + POP_H + MARGIN > vh) y = rect.top - POP_H - GAP;
          if (y < MARGIN) y = MARGIN;
          setInlineAnnotationPopoverPos({ x, y });
        } else {
          setInlineAnnotationPopoverPos(null);
        }
        return next;
      });
    };

    const starts = new Map<number, string[]>();
    const boundaries = new Set<number>([0, paragraphText.length]);
    for (const r of ranges) {
      boundaries.add(r.start);
      boundaries.add(r.end);
      const list = starts.get(r.start) || [];
      list.push(r.id);
      starts.set(r.start, list);
    }
    const sortedBounds = Array.from(boundaries).sort((a, b) => a - b);
    const nodes: React.ReactNode[] = [];

    for (let i = 0; i < sortedBounds.length - 1; i++) {
      const a = sortedBounds[i];
      const b = sortedBounds[i + 1];
      const icons = starts.get(a) || [];
      if (icons.length > 0) {
        icons.forEach((id, idx) => {
          nodes.push(
            <button
              key={`icon-${a}-${id}-${idx}`}
              type="button"
              data-annotation-hit="true"
              onClick={(e) => {
                e.stopPropagation();
                openInlinePopover(id, (e.currentTarget as HTMLElement).getBoundingClientRect());
              }}
              className={cn('inline-flex align-middle mr-0.5 opacity-80 hover:opacity-100 transition-opacity', annotationUnderlineClasses[theme])}
              title="查看批注"
            >
              <Pencil className="w-3 h-3" />
            </button>,
          );
        });
      }
      if (b <= a) continue;
      const segText = paragraphText.slice(a, b);
      if (!segText) continue;
      const active = ranges.filter((r) => r.start <= a && r.end > a);
      const hitId = active[0]?.id;
      const isActiveSegment = Boolean(hitId && activeInlineAnnotationId === hitId);
      nodes.push(
        <span
          key={`seg-${a}-${b}`}
          data-annotation-hit={isActiveSegment ? 'true' : undefined}
          onClick={isActiveSegment ? (e) => {
            e.stopPropagation();
            openInlinePopover(hitId!, (e.currentTarget as HTMLElement).getBoundingClientRect());
          } : undefined}
          className={isActiveSegment ? cn('underline decoration-2 underline-offset-4 cursor-pointer', annotationUnderlineClasses[theme]) : undefined}
        >
          {segText}
        </span>,
      );
    }
    return nodes;
  };
  const textPages = useMemo(() => (
    textPageStarts.map((start, index) => {
      const end = textPageStarts[index + 1] ?? allParagraphs.length;
      return allParagraphs.slice(start, end);
    })
  ), [textPageStarts, allParagraphs]);
  const paginationCacheKey = `${book.id}|${fontSize}|${lineHeight}|${fontFamily}`;
  const hasWarmPaginationCache = (() => {
    const cached = textPaginationCache.get(paginationCacheKey);
    return Boolean(cached && cached.length > 1);
  })();
  const isVerticalPaginationStabilized = textPaginationReadyRef.current && !(allParagraphs.length > 1 && textPageStarts.length <= 1);
  const verticalPageMinHeight = Math.max(320, Math.floor(readerViewportHeight * 0.9));
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
    light: 'border-black/14 bg-[#e9edf5]/85',
    paper: 'border-[#b8ab95]/40 bg-[#eee7da]/60',
    dark: 'border-white/12 bg-black/15',
    eye: 'border-[#21b39b]/32 bg-[#084a53]/75',
  } as const;
  const tocTabActiveClasses = {
    light: 'bg-[#2f4274] text-white shadow-[0_2px_10px_rgba(47,66,116,0.28)]',
    paper: 'bg-[#6e5944]/15 text-[#473729]',
    dark: 'bg-[#2f3c63]/65 text-white',
    eye: 'bg-[#22b79f]/24 text-[#dbfaf4]',
  } as const;
  const tocTabInactiveClasses = {
    light: 'text-[#334155] hover:text-[#0f172a] hover:bg-white/70',
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
  const bookmarkItemClasses = {
    light: 'border-black/12 bg-white/90 text-[#0f172a] hover:bg-[#eaf0ff] hover:text-[#0b1220]',
    paper: 'border-[#b8ab95]/45 bg-[#f6f1e7]/92 text-[#2f261c] hover:bg-[#efe6d7]',
    dark: 'border-white/10 text-white/75 hover:text-white hover:bg-[#2f3c63]/35',
    eye: 'border-[#22b79f]/28 bg-[#0b4c56]/55 text-[#d7f8f1] hover:bg-[#10636f]',
  } as const;
  const bookmarkMetaClasses = {
    light: 'text-[#334155]',
    paper: 'text-[#5a4a37]',
    dark: 'text-white/45',
    eye: 'text-[#99ddd1]',
  } as const;
  const bookmarkNoteClasses = {
    light: 'text-[#1e293b]',
    paper: 'text-[#4a3d2e]',
    dark: 'text-white/70',
    eye: 'text-[#c8f4eb]',
  } as const;
  const tocEmptyStateClasses = {
    light: 'text-black/45',
    paper: 'text-[#5a4d3b]/55',
    dark: 'text-white/35',
    eye: 'text-[#8bcfc2]/60',
  } as const;
  const annotationQuoteClasses = {
    light: 'text-[#0f172a]',
    paper: 'text-[#2f261c]',
    dark: 'text-white/90',
    eye: 'text-[#dcfbf5]',
  } as const;
  const annotationUnderlineClasses = {
    light: 'decoration-[#2f4274]/70',
    paper: 'decoration-[#6a5038]/65',
    dark: 'decoration-[#8aa3ff]/75',
    eye: 'decoration-[#2fd8bc]/80',
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
  const verticalPageShellClasses = {
    light: 'border-black/8',
    paper: 'border-black/10',
    dark: 'border-white/12',
    eye: 'border-[#20b39b]/25',
  } as const;
  const verticalPageFooterClasses = {
    light: 'border-black/10',
    paper: 'border-black/10',
    dark: 'border-white/12',
    eye: 'border-[#20b39b]/25',
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
  const editingBookmark = bookmarks.find((b) => b.id === editingBookmarkId) || null;
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

  const safePageChange = (nextPage: number, source: 'jump' | 'scroll' = 'jump') => {
    if (nextPage === currentPage) return;
    lastPageChangeSourceRef.current = source;
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
        if (!sel || sel.rangeCount === 0 || sel.isCollapsed || sel.toString().trim().length === 0) setSelection(null);
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
    const handleSelectionChange = () => {
      const sel = window.getSelection();
      if (!sel || sel.rangeCount === 0 || sel.isCollapsed || sel.toString().trim().length === 0) {
        setSelection(null);
        return;
      }
      const range = sel.getRangeAt(0);
      const container = contentRef.current;
      if (!container) {
        setSelection(null);
        return;
      }
      const node = range.commonAncestorContainer;
      const host = node.nodeType === Node.ELEMENT_NODE ? (node as Element) : node.parentElement;
      if (!host || !container.contains(host)) {
        setSelection(null);
      }
    };
    document.addEventListener('selectionchange', handleSelectionChange);
    return () => {
      document.removeEventListener('selectionchange', handleSelectionChange);
    };
  }, []);

  useEffect(() => {
    const container = contentRef.current;
    if (!container) return;
    if (pageTurnDirection === 'vertical') return;

    const delayMs = animationTypeRef.current === 'none'
      ? 0
      : Math.max(0, Math.round(animationSpeedRef.current * 1000));
    const timer = window.setTimeout(() => {
      if (contentRef.current) contentRef.current.scrollTop = 0;
    }, delayMs);

    return () => window.clearTimeout(timer);
  }, [currentPage, isVerticalPaging, pageTurnDirection]);

  useEffect(() => {
    if (!isVerticalPdfPaging) return;
    if (!pdfDoc || pdfTotalPages <= 0) return;
    let cancelled = false;

    const renderPage = async (pageIndex: number) => {
      if (cancelled) return;
      if (pdfVerticalRenderedPagesRef.current.has(pageIndex)) return;
      const canvas = pdfVerticalCanvasRefs.current[pageIndex];
      if (!canvas) return;
      try {
        const page = await pdfDoc.getPage(pageIndex + 1);
        if (cancelled) return;
        const viewport = page.getViewport({ scale: pdfScale });
        const context = canvas.getContext('2d');
        if (!context) return;
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        const task = page.render({ canvasContext: context, viewport });
        pdfVerticalRenderTasksRef.current.set(pageIndex, task);
        await task.promise;
        pdfVerticalRenderTasksRef.current.delete(pageIndex);
        pdfVerticalRenderedPagesRef.current.add(pageIndex);
      } catch {
        pdfVerticalRenderTasksRef.current.delete(pageIndex);
      }
    };

    const observer = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        const index = Number((entry.target as HTMLElement).dataset.pageIndex || -1);
        if (index < 0) continue;
        void renderPage(index);
      }
    }, { root: contentRef.current, rootMargin: '120% 0px' });

    for (let i = 0; i < pdfTotalPages; i++) {
      const el = pdfVerticalPageRefs.current[i];
      if (el) observer.observe(el);
    }

    return () => {
      cancelled = true;
      observer.disconnect();
      pdfVerticalRenderTasksRef.current.forEach((task) => {
        try { task.cancel?.(); } catch { /* noop */ }
      });
      pdfVerticalRenderTasksRef.current.clear();
    };
  }, [isVerticalPdfPaging, pdfDoc, pdfTotalPages, pdfScale]);

  useEffect(() => {
    if (!isVerticalPdfPaging) return;
    const container = contentRef.current;
    if (!container) return;
    let tries = 0;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const alignToCurrent = () => {
      const target = pdfVerticalPageRefs.current[currentPage];
      if (!target) {
        tries += 1;
        if (tries > 20) return;
        timer = setTimeout(alignToCurrent, 16);
        return;
      }
      programmaticVerticalScrollRef.current = true;
      container.scrollTo({ top: target.offsetTop, behavior: 'auto' });
      window.setTimeout(() => {
        programmaticVerticalScrollRef.current = false;
      }, 80);
    };
    alignToCurrent();
    return () => {
      if (timer) clearTimeout(timer);
    };
  }, [isVerticalPdfPaging, currentPage, pdfTotalPages]);

  useEffect(() => {
    if (!isVerticalPaging) return;
    if (!textPaginationReadyRef.current) return;
    if (allParagraphs.length > 1 && textPageStarts.length <= 1) return;
    const restoreKey = `${book.id}:vertical`;
    if (restoredVerticalKeyRef.current === restoreKey) return;
    restoredVerticalKeyRef.current = restoreKey;
    debugLog('vertical:restore-request', {
      bookId: book.id,
      currentPage: currentPageRef.current,
      totalPages,
      textPageStartsLength: textPageStarts.length,
      scrollTop: contentRef.current?.scrollTop ?? null,
    });
  }, [isVerticalPaging, book.id, allParagraphs.length, textPageStarts.length]);

  useLayoutEffect(() => {
    if (!isVerticalPaging) return;
    if (!textPaginationReadyRef.current) return;
    if (allParagraphs.length > 1 && textPageStarts.length <= 1) return;
    if (hasAppliedCachedScrollRef.current) return;
    const container = contentRef.current;
    if (!container) return;
    const target = verticalPageRefs.current[currentPage];
    if (!target) return;
    const inPage = verticalInPageOffsetCache.get(book.id);
    const inPageOffset = inPage && inPage.page === currentPage ? Math.max(0, inPage.offset) : 0;
    const maxOffset = Math.max(0, target.clientHeight - 40);
    const restoreTop = target.offsetTop + Math.min(inPageOffset, maxOffset);
    hasAppliedCachedScrollRef.current = true;
    programmaticVerticalScrollRef.current = true;
    container.scrollTop = restoreTop;
    setIsVerticalViewportReady(true);
    blockVerticalSyncUntilRef.current = Date.now() + 320;
    debugLog('vertical:apply-page-anchor', { bookId: book.id, currentPage, top: restoreTop, inPageOffset });
    window.setTimeout(() => {
      programmaticVerticalScrollRef.current = false;
    }, 60);
  }, [isVerticalPaging, book.id, allParagraphs.length, textPageStarts.length, currentPage]);

  useLayoutEffect(() => {
    if (!isVerticalPaging) return;
    if (lastPageChangeSourceRef.current !== 'jump') return;
    if (!textPaginationReadyRef.current) return;
    if (allParagraphs.length > 1 && textPageStarts.length <= 1) return;
    const container = contentRef.current;
    if (!container) return;
    const target = verticalPageRefs.current[currentPage];
    if (!target) return;
    const inPage = verticalInPageOffsetCache.get(book.id);
    const inPageOffset = inPage && inPage.page === currentPage ? Math.max(0, inPage.offset) : 0;
    const maxOffset = Math.max(0, target.clientHeight - 40);
    const restoreTop = target.offsetTop + Math.min(inPageOffset, maxOffset);
    programmaticVerticalScrollRef.current = true;
    container.scrollTop = restoreTop;
    blockVerticalSyncUntilRef.current = Date.now() + 240;
    debugLog('vertical:jump-scroll', { bookId: book.id, currentPage, top: restoreTop, inPageOffset });
    window.setTimeout(() => {
      programmaticVerticalScrollRef.current = false;
    }, 60);
  }, [isVerticalPaging, book.id, currentPage, allParagraphs.length, textPageStarts.length]);

  // Keep viewport visible at all times; avoid aggressive gate/timeout loops
  // that can cause blank panels or extra jank when switching tabs.

  useEffect(() => {
    textPaginationReadyRef.current = isPdfBook;
  }, [book.id, isPdfBook]);

  useEffect(() => {
    if (!isPdfBook) {
      verticalPageRefs.current = [];
      textPaginationReadyRef.current = false;
    }
    lastAppliedExternalAnchorRef.current = null;
    lastEmittedAnchorRef.current = null;
  }, [book.id]);

  useEffect(() => {
    const container = contentRef.current;
    if (!container) return;
    const syncHeight = () => setReaderViewportHeight(container.clientHeight);
    syncHeight();
    const ro = new ResizeObserver(syncHeight);
    ro.observe(container);
    window.addEventListener('resize', syncHeight);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', syncHeight);
    };
  }, []);

  useEffect(() => {
    textPageStartsRef.current = textPageStarts;
    if (!isPdfBook && textPageStarts.length > 0) {
      textPaginationReadyRef.current = true;
    }
  }, [textPageStarts, isPdfBook]);

  useLayoutEffect(() => {
    if (isPdfBook) return;
    const cached = textPaginationCache.get(paginationCacheKey);
    const initialStarts = cached && cached.length > 0 ? cached : [0];
    setTextPageStarts(initialStarts);
    textPageStartsRef.current = initialStarts;
    prevPageStartsRef.current = initialStarts;
    textPaginationReadyRef.current = Boolean(cached && cached.length > 0);
  }, [book.id, fontSize, lineHeight, fontFamily, isPdfBook, paginationCacheKey]);

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
      const container = contentRef.current;
      if (!viewport) return;
      const maxHeight = container?.clientHeight ?? viewport.clientHeight;
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

    // If we already have pagination cache for the same typography, avoid a
    // synchronous full re-measure on tab switch to reduce visible stutter.
    scheduleRecalc(hasWarmPaginationCache ? 140 : 0);
    const ro = new ResizeObserver(() => scheduleRecalc(100));
    if (textViewportRef.current) ro.observe(textViewportRef.current);
    window.addEventListener('resize', onWindowResize);
    return () => {
      if (timerId) clearTimeout(timerId);
      if (rafId !== null) cancelAnimationFrame(rafId);
      ro.disconnect();
      window.removeEventListener('resize', onWindowResize);
    };
  }, [isPdfBook, allParagraphs, fontSize, lineHeight, fontFamily, book.id, readerViewportHeight, hasWarmPaginationCache]);

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
    if (isVerticalPaging) return;
    if (!textPaginationReadyRef.current) return;
    if (reflowAnchorRef.current !== null) return;
    if (lastAppliedExternalAnchorRef.current === paragraphAnchor) return;
    const starts = textPageStartsRef.current;
    if (starts.length <= 1 && allParagraphs.length > 1) return;
    const targetPage = findPageByParagraphIndex(paragraphAnchor, starts);
    lastAppliedExternalAnchorRef.current = paragraphAnchor;
    if (targetPage !== currentPage) safePageChange(targetPage, 'jump');
  }, [paragraphAnchor, isPdfBook, isVerticalPaging, currentPage, allParagraphs.length]);

  useEffect(() => {
    if (isPdfBook || !onAnchorChange) return;
    if (!textPaginationReadyRef.current) return;
    if (allParagraphs.length > 1 && textPageStarts.length <= 1) return;
    if (reflowAnchorRef.current !== null) return;
    const anchor = textPageStarts[Math.min(currentPage, textPageStarts.length - 1)] ?? 0;
    if (lastEmittedAnchorRef.current === anchor) return;
    lastEmittedAnchorRef.current = anchor;
    onAnchorChange(anchor);
  }, [currentPage, textPageStarts, isPdfBook, onAnchorChange, allParagraphs.length]);


  const handleMouseUp = () => {
    const sel = window.getSelection();
    if (sel && sel.rangeCount > 0 && !sel.isCollapsed && sel.toString().trim().length > 0) {
      const range = sel.getRangeAt(0);
      const container = contentRef.current;
      const node = range.commonAncestorContainer;
      const host = node.nodeType === Node.ELEMENT_NODE ? (node as Element) : node.parentElement;
      if (!container || !host || !container.contains(host)) {
        setSelection(null);
        return;
      }
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

  const handleCreateAnnotation = () => {
    if (!selection) return;
    if (!isPdfBook && onAnnotationsChange) {
      const sel = window.getSelection();
      const range = sel && sel.rangeCount > 0 ? sel.getRangeAt(0) : null;
      const node = range?.commonAncestorContainer;
      const host = node
        ? (node.nodeType === Node.ELEMENT_NODE ? (node as Element) : node.parentElement)
        : null;
      const paragraphEl = host?.closest('[data-paragraph-index]') as HTMLElement | null;
      const paragraphAnchorAttr = paragraphEl?.dataset.paragraphIndex;
      const paragraphAnchor = paragraphAnchorAttr !== undefined ? Number(paragraphAnchorAttr) : currentAnchor;
      const next = [
        ...annotations,
        {
          id: crypto.randomUUID(),
          page: currentPage,
          paragraphAnchor: Number.isFinite(paragraphAnchor) ? paragraphAnchor : currentAnchor,
          quote: selection.text.trim(),
          note: '',
          createdAt: new Date().toISOString(),
        },
      ];
      onAnnotationsChange(next);
      setTocTab('annotations');
      setIsTocOpen(true);
    } else if (onCreateAnnotation) onCreateAnnotation(selection.text);
    else if (onAnnotate) onAnnotate(selection.text);
    setSelection(null);
    window.getSelection()?.removeAllRanges();
  };

  const jumpToAnnotation = (annotation: NonNullable<Book['annotations']>[number]) => {
    pendingAnnotationJumpRef.current = { id: annotation.id, paragraphAnchor: annotation.paragraphAnchor };
    if (!isPdfBook && typeof annotation.paragraphAnchor === 'number') {
      const targetPage = findPageByParagraphIndex(annotation.paragraphAnchor, textPageStarts);
      safePageChange(Math.min(targetPage, totalPages - 1));
    } else {
      safePageChange(Math.min(annotation.page, totalPages - 1));
    }
    setActiveInlineAnnotationId(annotation.id);
    setIsTocOpen(false);
  };

  const openAnnotationEditor = (annotation: NonNullable<Book['annotations']>[number], anchorEl?: HTMLElement | null) => {
    setEditingAnnotationId(annotation.id);
    annotationEditorDraftRef.current = annotation.note || '';
    if (anchorEl) {
      const rect = anchorEl.getBoundingClientRect();
      const POP_W = 288;
      const POP_H = 260;
      const GAP = 8;
      const MARGIN = 12;
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      let x = rect.right + GAP;
      let y = rect.top - 8;
      if (x + POP_W + MARGIN > vw) x = rect.left - POP_W - GAP;
      if (x < MARGIN) x = MARGIN;
      if (y + POP_H + MARGIN > vh) y = vh - POP_H - MARGIN;
      if (y < MARGIN) y = MARGIN;
      setAnnotationEditorPos({ x, y });
    }
    setIsAnnotationEditorOpen(true);
  };

  const saveAnnotationNote = () => {
    if (!onAnnotationsChange || !editingAnnotationId) return;
    const next = annotations.map((a) => (
      a.id === editingAnnotationId
        ? { ...a, note: annotationEditorDraftRef.current.trim() }
        : a
    ));
    onAnnotationsChange(next);
    setIsAnnotationEditorOpen(false);
    setEditingAnnotationId(null);
    setAnnotationEditorPos(null);
  };

  const deleteAnnotation = (annotationId: string) => {
    if (!onAnnotationsChange) return;
    const next = annotations.filter((a) => a.id !== annotationId);
    onAnnotationsChange(next);
    if (activeInlineAnnotationId === annotationId) setActiveInlineAnnotationId(null);
  };

  const saveInlineAnnotationNote = () => {
    if (!onAnnotationsChange || !activeInlineAnnotationId) return;
    const next = annotations.map((a) => (
      a.id === activeInlineAnnotationId
        ? { ...a, note: inlineAnnotationDraftRef.current.trim() }
        : a
    ));
    onAnnotationsChange(next);
    setActiveInlineAnnotationId(null);
    setInlineAnnotationPopoverPos(null);
  };

  const selectionActions = [
    {
      id: 'ask-ai',
      label: '询问 AI',
      icon: Sparkles,
      className: 'hover:text-orange-300',
      iconClassName: 'text-orange-400',
      onClick: handleAskAI,
    },
    {
      id: 'annotate',
      label: '批注',
      icon: NotebookPen,
      className: 'hover:text-cyan-300',
      iconClassName: 'text-cyan-300',
      onClick: handleCreateAnnotation,
    },
  ] as const;
  const editingAnnotation = annotations.find((a) => a.id === editingAnnotationId) || null;
  const activeInlineAnnotation = annotations.find((a) => a.id === activeInlineAnnotationId) || null;
  const isInlineAnnotationPopoverOpen = Boolean(activeInlineAnnotation && inlineAnnotationPopoverPos);

  useEffect(() => {
    inlineAnnotationDraftRef.current = activeInlineAnnotation?.note || '';
  }, [activeInlineAnnotationId, activeInlineAnnotation?.note]);

  useEffect(() => {
    if (!activeInlineAnnotationId) return;
    const handleOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (target.closest('.annotation-inline-popover')) return;
      if (target.closest('[data-annotation-hit="true"]')) return;
      setActiveInlineAnnotationId(null);
      setInlineAnnotationPopoverPos(null);
    };
    document.addEventListener('mousedown', handleOutside);
    return () => document.removeEventListener('mousedown', handleOutside);
  }, [activeInlineAnnotationId]);

  useEffect(() => {
    if (!activeInlineAnnotationId || !inlineAnnotationPopoverPos) return;
    const handleViewportChange = () => {
      const POP_W = 288;
      const POP_H = 210;
      const MARGIN = 12;
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const x = Math.min(Math.max(inlineAnnotationPopoverPos.x, MARGIN), vw - POP_W - MARGIN);
      const y = Math.min(Math.max(inlineAnnotationPopoverPos.y, MARGIN), vh - POP_H - MARGIN);
      if (x !== inlineAnnotationPopoverPos.x || y !== inlineAnnotationPopoverPos.y) {
        setInlineAnnotationPopoverPos({ x, y });
      }
    };
    window.addEventListener('resize', handleViewportChange);
    window.addEventListener('scroll', handleViewportChange, true);
    return () => {
      window.removeEventListener('resize', handleViewportChange);
      window.removeEventListener('scroll', handleViewportChange, true);
    };
  }, [activeInlineAnnotationId, inlineAnnotationPopoverPos]);

  useEffect(() => {
    if (!isVerticalPaging || !isInlineAnnotationPopoverOpen) return;
    const container = contentRef.current;
    if (!container) return;
    const stop = (e: Event) => {
      e.preventDefault();
      e.stopPropagation();
    };
    container.addEventListener('wheel', stop, { passive: false });
    container.addEventListener('touchmove', stop, { passive: false });
    return () => {
      container.removeEventListener('wheel', stop as EventListener);
      container.removeEventListener('touchmove', stop as EventListener);
    };
  }, [isVerticalPaging, isInlineAnnotationPopoverOpen]);

  useLayoutEffect(() => {
    const pending = pendingAnnotationJumpRef.current;
    if (!pending) return;
    if (pending.id !== activeInlineAnnotationId) return;
    if (isPdfBook) {
      pendingAnnotationJumpRef.current = null;
      return;
    }
    if (typeof pending.paragraphAnchor !== 'number') {
      pendingAnnotationJumpRef.current = null;
      return;
    }
    const container = contentRef.current;
    if (!container) return;
    const paragraphEl = container.querySelector(`[data-paragraph-index="${pending.paragraphAnchor}"]`) as HTMLElement | null;
    if (!paragraphEl) return;
    const containerRect = container.getBoundingClientRect();
    const paragraphRect = paragraphEl.getBoundingClientRect();
    const nextTop = container.scrollTop + (paragraphRect.top - containerRect.top) - 16;
    programmaticVerticalScrollRef.current = true;
    container.scrollTo({ top: Math.max(0, nextTop), behavior: 'auto' });
    window.setTimeout(() => {
      programmaticVerticalScrollRef.current = false;
      const rect = paragraphEl.getBoundingClientRect();
      const x = Math.max(12, Math.min(rect.left, window.innerWidth - 300));
      const y = Math.max(12, Math.min(rect.bottom + 8, window.innerHeight - 220));
      setInlineAnnotationPopoverPos({ x, y });
    }, 30);
    pendingAnnotationJumpRef.current = null;
  }, [activeInlineAnnotationId, currentPage, textPageStarts.length, isPdfBook]);

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
    if (!isVerticalPaging && !isVerticalPdfPaging) return;
    if (programmaticVerticalScrollRef.current) return;
    if (Date.now() < blockVerticalSyncUntilRef.current) return;
    const container = contentRef.current;
    if (!container) return;
    if (isVerticalPaging) {
      if (!textPaginationReadyRef.current) return;
      if (!(currentPage > 0 && container.scrollTop < verticalCacheMinTop)) {
        verticalScrollTopCache.set(book.id, container.scrollTop);
      }
    }
    const anchors = isVerticalPdfPaging ? pdfVerticalPageRefs.current : verticalPageRefs.current;
    const readyCount = anchors.filter(Boolean).length;
    if (readyCount <= 0) return;
    const currentEl = anchors[currentPage] as HTMLElement | null;
    const nextEl = (anchors[currentPage + 1] as HTMLElement | null) ?? null;
    const prevEl = (currentPage > 0 ? anchors[currentPage - 1] : null) as HTMLElement | null;
    const hysteresis = 28;
    let mappedPage = currentPage;
    if (currentEl) {
      const currentTop = currentEl.offsetTop;
      const nextTop = nextEl ? nextEl.offsetTop : Number.POSITIVE_INFINITY;
      const prevTop = prevEl ? prevEl.offsetTop : Number.NEGATIVE_INFINITY;
      const scrollTop = container.scrollTop;

      if (nextEl && scrollTop >= nextTop - hysteresis) {
        mappedPage = currentPage + 1;
      } else if (prevEl && scrollTop < currentTop - hysteresis) {
        mappedPage = currentPage - 1;
      } else if (scrollTop >= currentTop && scrollTop < nextTop) {
        mappedPage = currentPage;
      } else {
        const probeTop = scrollTop + 20;
        mappedPage = 0;
        for (let i = 0; i < anchors.length; i++) {
          const el = anchors[i];
          if (!el) continue;
          if (el.offsetTop <= probeTop) mappedPage = i;
          else break;
        }
      }
      if (scrollTop < prevTop) mappedPage = Math.max(0, currentPage - 1);
    } else {
      const probeTop = container.scrollTop + 20;
      mappedPage = 0;
      for (let i = 0; i < anchors.length; i++) {
        const el = anchors[i];
        if (!el) continue;
        if (el.offsetTop <= probeTop) mappedPage = i;
        else break;
      }
    }
    const mappedEl = anchors[mappedPage] as HTMLElement | null;
    if (mappedEl && !isVerticalPdfPaging) {
      const inPageOffset = Math.max(0, container.scrollTop - mappedEl.offsetTop);
      verticalInPageOffsetCache.set(book.id, { page: mappedPage, offset: inPageOffset });
      persistInPageOffset(book.id, mappedPage, inPageOffset);
    }
    if (mappedPage !== currentPage) {
      debugLog('vertical:scroll-sync-page', {
        fromPage: currentPage,
        toPage: mappedPage,
        scrollTop: container.scrollTop,
        totalPages,
      });
      safePageChange(mappedPage, 'scroll');
    }
  };

  useEffect(() => {
    return () => {
      if (!isVerticalPaging) return;
      const container = contentRef.current;
      if (!container) return;
      if (!(currentPage > 0 && container.scrollTop < verticalCacheMinTop)) {
        verticalScrollTopCache.set(book.id, container.scrollTop);
      }
      const target = verticalPageRefs.current[currentPage];
      if (target) {
        const inPageOffset = Math.max(0, container.scrollTop - target.offsetTop);
        verticalInPageOffsetCache.set(book.id, { page: currentPage, offset: inPageOffset });
        persistInPageOffset(book.id, currentPage, inPageOffset);
      }
    };
  }, [book.id, isVerticalPaging, currentPage]);

  useEffect(() => {
    debugLog('reader:enter-or-update', {
      bookId: book.id,
      mode: isVerticalPaging ? 'vertical' : 'horizontal',
      currentPage,
      totalPages,
      textPageStartsLength: textPageStarts.length,
      scrollTop: contentRef.current?.scrollTop ?? null,
    });
  }, [book.id, isVerticalPaging, currentPage, totalPages, textPageStarts.length]);

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
        name: (() => {
          const head = (currentParagraphs[0] || '').trim();
          if (!head) return `第 ${currentPage + 1} 页`;
          return head.length > 18 ? `${head.slice(0, 18)}...` : head;
        })(),
        note: '',
      },
    ];
    onBookmarksChange(next);
  };

  const openBookmarkEditor = (bookmark: NonNullable<Book['bookmarks']>[number], anchorEl?: HTMLElement | null) => {
    setEditingBookmarkId(bookmark.id);
    setBookmarkDraftName(bookmark.name || '');
    setBookmarkDraftNote(bookmark.note || '');
    if (anchorEl) {
      const rect = anchorEl.getBoundingClientRect();
      const POP_W = 224;
      const POP_H = 238;
      const GAP = 8;
      const MARGIN = 12;
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      let x = rect.right + GAP;
      let y = rect.top - 8;
      if (x + POP_W + MARGIN > vw) x = rect.left - POP_W - GAP;
      if (x < MARGIN) x = MARGIN;
      if (y + POP_H + MARGIN > vh) y = vh - POP_H - MARGIN;
      if (y < MARGIN) y = MARGIN;
      setBookmarkEditorPos({ x, y });
    } else {
      setBookmarkEditorPos(null);
    }
    setIsBookmarkEditorOpen(true);
  };

  const deleteBookmark = (bookmarkId: string) => {
    if (!onBookmarksChange) return;
    const next = bookmarks.filter((b) => b.id !== bookmarkId);
    onBookmarksChange(next);
    if (editingBookmarkId === bookmarkId) {
      setIsBookmarkEditorOpen(false);
      setEditingBookmarkId(null);
      setBookmarkEditorPos(null);
    }
  };

  const saveBookmarkName = () => {
    const targetId = editingBookmarkId || editableBookmark?.id;
    if (!onBookmarksChange || !targetId) return;
    const next = bookmarks.map((b) => (
      b.id === targetId
        ? {
            ...b,
            name: bookmarkDraftName.trim() || b.name,
            note: bookmarkDraftNote.trim(),
          }
        : b
    ));
    onBookmarksChange(next);
    setIsBookmarkEditorOpen(false);
    setEditingBookmarkId(null);
    setBookmarkEditorPos(null);
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
              openBookmarkEditor(editableBookmark);
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
            {isBookmarkEditorOpen && (editingBookmark || editableBookmark) && (
              <>
                <div className="fixed inset-0 z-[160]" onClick={() => { setIsBookmarkEditorOpen(false); setEditingBookmarkId(null); setBookmarkEditorPos(null); }} />
                <motion.div
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 8 }}
                  className="fixed z-[170] w-56 p-3 bg-white border border-black/10 shadow-xl rounded-lg"
                  style={bookmarkEditorPos ? { left: bookmarkEditorPos.x, top: bookmarkEditorPos.y } : { right: 40, top: 96 }}
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
                <div className={cn('grid grid-cols-3 gap-2 p-1 border rounded-xl text-[11px] font-bold', tocTabWrapClasses[theme])}>
                  <button onClick={() => setTocTab('toc')} className={cn('py-2 rounded-lg transition-colors', tocTab === 'toc' ? tocTabActiveClasses[theme] : tocTabInactiveClasses[theme])}>目录</button>
                  <button onClick={() => setTocTab('bookmarks')} className={cn('py-2 rounded-lg transition-colors', tocTab === 'bookmarks' ? tocTabActiveClasses[theme] : tocTabInactiveClasses[theme])}>书签</button>
                  <button onClick={() => setTocTab('annotations')} className={cn('py-2 rounded-lg transition-colors', tocTab === 'annotations' ? tocTabActiveClasses[theme] : tocTabInactiveClasses[theme])}>批注</button>
                </div>
              </div>
              <div className="flex-1 overflow-y-auto p-6 space-y-2 custom-scrollbar">
                {tocTab === 'toc' ? (
                  book.toc && book.toc.length > 0 ? book.toc.map((item) => renderTocItem(item)) : <div className={cn('py-12 text-center italic text-sm', tocEmptyStateClasses[theme])}>未识别到目录结构</div>
                ) : tocTab === 'bookmarks' ? (
                  bookmarks.length > 0 ? (
                    <div className="space-y-2">
                      {bookmarks
                        .slice()
                        .sort((a, b) => a.page - b.page)
                        .map((b) => (
                          <div key={b.id} className={cn('w-full text-left p-3 rounded-xl border transition-colors', bookmarkItemClasses[theme])}>
                            <button onClick={() => jumpToBookmark(b)} className="w-full text-left">
                              <div className="text-sm font-semibold">{b.name || `第 ${b.page + 1} 页`}</div>
                              <div className={cn('text-[11px] mt-1', bookmarkMetaClasses[theme])}>第 {b.page + 1} 页</div>
                              {b.note && <div className={cn('text-[11px] mt-1 line-clamp-2', bookmarkNoteClasses[theme])}>{b.note}</div>}
                            </button>
                            <div className="mt-2 pt-2 border-t border-current/10 flex justify-end gap-2">
                              <button onClick={(e) => openBookmarkEditor(b, e.currentTarget)} className={cn('text-[10px] px-2 py-1 rounded transition-colors', tocTabInactiveClasses[theme])}>编辑</button>
                              <button onClick={() => deleteBookmark(b.id)} className={cn('text-[10px] px-2 py-1 rounded transition-colors', theme === 'dark' ? 'text-red-300 hover:bg-red-400/20' : 'text-red-600 hover:bg-red-500/10')}>删除</button>
                            </div>
                          </div>
                        ))}
                    </div>
                  ) : (
                    <div className={cn('py-12 text-center italic text-sm', tocEmptyStateClasses[theme])}>还没有书签，点击顶部书签按钮添加</div>
                  )
                ) : (
                  annotations.length > 0 ? (
                    <div className="space-y-2">
                      {annotations.map((a) => (
                        <div key={a.id} className={cn('w-full text-left p-3 rounded-xl border transition-colors', bookmarkItemClasses[theme])}>
                          <button onClick={() => jumpToAnnotation(a)} className="w-full text-left">
                            {a.note ? (
                              <div className="space-y-1">
                                <div className={cn('text-[11px] opacity-70', bookmarkMetaClasses[theme])}>引文</div>
                                <div className={cn('text-[12px] font-semibold line-clamp-2', annotationQuoteClasses[theme])}>{a.quote}</div>
                                <div className={cn('text-[11px] opacity-70 border-t pt-2 mt-2', bookmarkMetaClasses[theme])}>批注</div>
                                <div className={cn('text-[12px]', bookmarkNoteClasses[theme])}>
                                  {a.note.length > 18 ? `${a.note.slice(0, 18)}...` : a.note}
                                </div>
                              </div>
                            ) : (
                              <div className={cn('text-[12px] font-semibold line-clamp-2', annotationQuoteClasses[theme])}>
                                {a.quote.length > 18 ? `${a.quote.slice(0, 18)}...` : a.quote}
                              </div>
                            )}
                          </button>
                          <div className="mt-2 pt-2 border-t border-current/10 flex justify-end gap-2">
                            <button onClick={(e) => openAnnotationEditor(a, e.currentTarget)} className={cn('text-[10px] px-2 py-1 rounded transition-colors', tocTabInactiveClasses[theme])}>编辑</button>
                            <button onClick={() => deleteAnnotation(a.id)} className={cn('text-[10px] px-2 py-1 rounded transition-colors', theme === 'dark' ? 'text-red-300 hover:bg-red-400/20' : 'text-red-600 hover:bg-red-500/10')}>删除</button>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className={cn('py-12 text-center italic text-sm', tocEmptyStateClasses[theme])}>还没有批注，选中文字后点击“批注”添加</div>
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
        style={{ scrollbarGutter: 'stable' }}
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
            isVerticalPdfPaging ? (
              <div className="space-y-8 py-6">
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
                  Array.from({ length: Math.max(0, pdfTotalPages) }).map((_, pageIndex) => (
                    <section
                      key={`pdf-vertical-page-${pageIndex}`}
                      ref={(el) => { pdfVerticalPageRefs.current[pageIndex] = el; }}
                      data-page-index={pageIndex}
                      className={cn(
                        'rounded-xl px-2 py-4 transition-colors border flex flex-col items-center',
                        verticalPageShellClasses[theme],
                        pageIndex === currentPage && 'ring-1 ring-black/10 dark:ring-white/10',
                      )}
                    >
                      <canvas
                        ref={(el) => { pdfVerticalCanvasRefs.current[pageIndex] = el; }}
                        className="max-w-full shadow-lg border border-black/5 bg-white"
                      />
                      <div className={cn('mt-4 pt-3 border-t w-full text-[10px] opacity-45 font-bold tracking-widest uppercase text-center', verticalPageFooterClasses[theme])}>
                        第 {pageIndex + 1} 页
                      </div>
                    </section>
                  ))
                )}
              </div>
            ) : (
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
                  <canvas key={`pdf-horizontal-${book.id}-${pageTurnDirection}`} ref={setPdfCanvasEl} className="max-w-full shadow-lg border border-black/5 bg-white" />
                )}
              </div>
            )
          ) : isVerticalPaging ? (
            <div className={cn(fontClasses[fontFamily], 'text-justify space-y-8')} style={{ fontSize: `${fontSize}px`, lineHeight }}>
              {textPages.map((pageParagraphs, pageIndex) => (
                <section
                  key={`vertical-page-${pageIndex}`}
                  ref={(el) => {
                    verticalPageRefs.current[pageIndex] = el;
                  }}
                  className={cn(
                    'rounded-xl px-2 py-4 transition-colors border',
                    verticalPageShellClasses[theme],
                    pageIndex === currentPage && 'ring-1 ring-black/10 dark:ring-white/10',
                  )}
                  style={{ minHeight: verticalPageMinHeight }}
                >
                  <div className="space-y-6">
                    {pageParagraphs.map((p, i) => (
                      (() => {
                        const absIndex = (textPageStarts[pageIndex] ?? 0) + i;
                        const paragraphAnnotations = annotationsByParagraph.get(absIndex) || [];
                        return (
                          <div key={`${pageIndex}-${i}`} className="relative">
                            <p
                              data-paragraph-index={absIndex}
                              className={cn(
                                'tracking-wide',
                                pageIndex === 0 && i === 0 ? 'first-letter:text-5xl first-letter:font-bold first-letter:mr-3 first-letter:float-left first-letter:mt-2' : 'indent-8',
                              )}
                            >
                              {renderParagraphWithAnnotationHighlights(p, paragraphAnnotations)}
                            </p>
                          </div>
                        );
                      })()
                    ))}
                  </div>
                  <div className={cn('mt-8 pt-3 border-t text-[10px] opacity-45 font-bold tracking-widest uppercase', verticalPageFooterClasses[theme])}>
                    第 {pageIndex + 1} 页
                  </div>
                </section>
              ))}
              {textPages.length === 0 && <div className="flex flex-col items-center justify-center py-32 opacity-30 italic"><p>这本书还没有可显示的文本内容...</p></div>}
            </div>
          ) : (
            <AnimatePresence mode="wait">
              <motion.div key={currentPage} {...getAnimationProps()} style={{ fontSize: `${fontSize}px`, lineHeight }} className={cn(fontClasses[fontFamily], 'text-justify space-y-6')}>
                {currentParagraphs.map((p, i) => (
                  (() => {
                    const absIndex = (textPageStarts[currentPage] ?? 0) + i;
                    const paragraphAnnotations = annotationsByParagraph.get(absIndex) || [];
                    return (
                      <div key={i} className="relative">
                        <p
                          data-paragraph-index={absIndex}
                          className={cn(
                            'tracking-wide',
                            i === 0 && currentPage === 0 ? 'first-letter:text-5xl first-letter:font-bold first-letter:mr-3 first-letter:float-left first-letter:mt-2' : 'indent-8',
                          )}
                        >
                          {renderParagraphWithAnnotationHighlights(p, paragraphAnnotations)}
                        </p>
                      </div>
                    );
                  })()
                ))}
                {currentParagraphs.length === 0 && <div className="flex flex-col items-center justify-center py-32 opacity-30 italic"><p>这本书还没有可显示的文本内容...</p></div>}
              </motion.div>
            </AnimatePresence>
          )}
        </div>

        <AnimatePresence>
          {selection && (
            <motion.div initial={{ opacity: 0, y: 5, scale: 0.9 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, scale: 0.9 }} style={{ position: 'fixed', left: selection.x, top: selection.y, transform: 'translate(-100%, 0)' }} className="ai-context-menu z-[100] flex items-center gap-1.5 bg-black text-white px-2 py-1.5 rounded-full shadow-2xl border border-white/10">
              {selectionActions.map((action) => {
                const Icon = action.icon;
                return (
                  <button key={action.id} onClick={action.onClick} className={cn('flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest transition-colors px-2 py-1 rounded-full', action.className)}>
                    <Icon className={cn('w-3 h-3', action.iconClassName)} />
                    {action.label}
                  </button>
                );
              })}
            </motion.div>
          )}
        </AnimatePresence>
        <AnimatePresence>
          {activeInlineAnnotation && inlineAnnotationPopoverPos && (
            <motion.div
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 2 }}
              transition={{ duration: 0.14, ease: 'easeOut' }}
              className={cn('annotation-inline-popover fixed z-[130] w-72 p-3 rounded-xl border shadow-2xl', settingsPanelClasses[theme])}
              style={{ left: inlineAnnotationPopoverPos.x, top: inlineAnnotationPopoverPos.y }}
            >
              <div className={cn('text-[11px] opacity-70 mb-1', bookmarkMetaClasses[theme])}>引文</div>
              <div className={cn('text-[12px] mb-2', annotationQuoteClasses[theme])}>{activeInlineAnnotation.quote}</div>
              <textarea
                key={activeInlineAnnotation.id}
                defaultValue={activeInlineAnnotation.note || ''}
                onChange={(e) => { inlineAnnotationDraftRef.current = e.target.value; }}
                rows={3}
                className={cn('w-full resize-none border rounded px-2 py-1.5 text-xs outline-none', theme === 'dark' ? 'bg-black/20 border-white/15' : 'bg-white/80 border-black/15')}
              />
              <div className="mt-2 flex items-center justify-between gap-2">
                <button
                  onClick={() => deleteAnnotation(activeInlineAnnotation.id)}
                  className={cn(
                    'inline-flex items-center gap-1 text-[10px] px-2 py-1 rounded transition-colors',
                    theme === 'dark' ? 'text-red-300 hover:bg-red-400/20' : 'text-red-600 hover:bg-red-500/10',
                  )}
                  title="删除批注"
                >
                  <Trash2 className="w-3 h-3" />
                  删除
                </button>
                <div className="flex items-center gap-2">
                <button onClick={() => { setActiveInlineAnnotationId(null); setInlineAnnotationPopoverPos(null); }} className={cn('text-[10px] px-2 py-1 rounded', tocTabInactiveClasses[theme])}>关闭</button>
                <button onClick={saveInlineAnnotationNote} className={cn('text-[10px] px-2 py-1 rounded', settingsOptionActiveClasses[theme])}>保存</button>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
        <AnimatePresence>
          {isAnnotationEditorOpen && editingAnnotation && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setIsAnnotationEditorOpen(false)} />
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 8 }}
                className={cn('fixed z-[120] w-72 p-3 border shadow-2xl rounded-lg', settingsPanelClasses[theme])}
                style={annotationEditorPos ? { left: annotationEditorPos.x, top: annotationEditorPos.y } : { right: 40, top: 96 }}
              >
                <label className={cn('text-[10px] font-bold uppercase tracking-widest block mb-2', settingsLabelClasses[theme])}>引文</label>
                <div className={cn('text-xs leading-relaxed p-2 rounded border mb-3', theme === 'dark' ? 'border-white/12 bg-white/5' : 'border-black/10 bg-black/[0.03]')}>
                  {editingAnnotation.quote}
                </div>
                <label className={cn('text-[10px] font-bold uppercase tracking-widest block mb-2', settingsLabelClasses[theme])}>批注</label>
                <textarea
                  key={editingAnnotation.id}
                  defaultValue={editingAnnotation.note || ''}
                  onChange={(e) => { annotationEditorDraftRef.current = e.target.value; }}
                  rows={4}
                  className={cn('w-full resize-none border rounded px-2 py-1.5 text-xs outline-none', theme === 'dark' ? 'bg-black/20 border-white/15' : 'bg-white/80 border-black/15')}
                />
                <div className="mt-3 flex justify-end gap-2">
                  <button onClick={() => { setIsAnnotationEditorOpen(false); setAnnotationEditorPos(null); }} className={cn('text-[10px] px-2 py-1 rounded', tocTabInactiveClasses[theme])}>取消</button>
                  <button onClick={saveAnnotationNote} className={cn('text-[10px] px-2 py-1 rounded', settingsOptionActiveClasses[theme])}>保存</button>
                </div>
              </motion.div>
            </>
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
                      <div><label className={cn('text-[9px] font-bold uppercase tracking-widest mb-3 block', settingsLabelClasses[theme])}>翻页模式</label><div className="grid grid-cols-2 gap-1"><button onClick={() => setPageTurnDirections((prev) => ({ ...prev, [book.id]: 'horizontal' }))} className={cn('py-2 text-[9px] font-bold uppercase border transition-colors', pageTurnDirection === 'horizontal' ? settingsOptionActiveClasses[theme] : settingsOptionIdleClasses[theme])}>水平翻页</button><button onClick={() => setPageTurnDirections((prev) => ({ ...prev, [book.id]: 'vertical' }))} className={cn('py-2 text-[9px] font-bold uppercase border transition-colors', pageTurnDirection === 'vertical' ? settingsOptionActiveClasses[theme] : settingsOptionIdleClasses[theme])}>垂直翻页</button></div>{isPdfBook && <p className={cn('mt-2 text-[10px]', settingsLabelClasses[theme])}>PDF 当前仍按单页渲染，垂直模式主要用于文本无缝滚动。</p>}</div>
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


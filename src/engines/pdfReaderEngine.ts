import { useEffect, useRef, useState } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import { Book } from '../types';

pdfjsLib.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';

type CachedPdf = {
  doc: any;
  totalPages: number;
};

const pdfCache = new Map<string, CachedPdf>();
const pdfLoadingCache = new Map<string, Promise<CachedPdf>>();

export function usePdfReaderEngine(book: Book, currentPage: number, pdfScale: number, canvasRef: React.RefObject<HTMLCanvasElement | null>) {
  const initialCached = book.fileType === 'application/pdf' && book.pdfPath ? pdfCache.get(book.pdfPath) : undefined;
  const [pdfDoc, setPdfDoc] = useState<any>(initialCached?.doc ?? null);
  const [pdfTotalPages, setPdfTotalPages] = useState(initialCached?.totalPages ?? 0);
  const [pdfError, setPdfError] = useState<string | null>(null);
  const renderTaskRef = useRef<any>(null);

  useEffect(() => {
    let isMounted = true;
    if (book.fileType !== 'application/pdf') {
      setPdfDoc(null);
      setPdfTotalPages(0);
      setPdfError(null);
      return;
    }

    const loadPdf = async () => {
      try {
        if (!book.pdfPath || !window.electronAPI) {
          setPdfDoc(null);
          setPdfTotalPages(0);
          setPdfError('当前环境无法读取本地 PDF（请在 Electron 桌面端运行）。');
          return;
        }

        const cached = pdfCache.get(book.pdfPath);
        if (cached) {
          if (!isMounted) return;
          setPdfDoc(cached.doc);
          setPdfTotalPages(cached.totalPages);
          setPdfError(null);
          return;
        }

        const url = window.electronAPI.getPdfUrl ? await window.electronAPI.getPdfUrl(book.pdfPath) : undefined;
        if (!url) {
          setPdfDoc(null);
          setPdfTotalPages(0);
          setPdfError('无法获取本地 PDF 地址。');
          return;
        }

        let loadingPromise = pdfLoadingCache.get(book.pdfPath);
        if (!loadingPromise) {
          loadingPromise = pdfjsLib
            .getDocument({ url, withCredentials: false })
            .promise.then((loadedPdf) => ({
              doc: loadedPdf,
              totalPages: loadedPdf.numPages || 0,
            }));
          pdfLoadingCache.set(book.pdfPath, loadingPromise);
        }

        const loaded = await loadingPromise;
        pdfLoadingCache.delete(book.pdfPath);
        pdfCache.set(book.pdfPath, loaded);

        if (!isMounted) return;
        setPdfDoc(loaded.doc);
        setPdfTotalPages(loaded.totalPages);
        setPdfError(null);
      } catch {
        if (book.pdfPath) pdfLoadingCache.delete(book.pdfPath);
        if (!isMounted) return;
        setPdfDoc(null);
        setPdfTotalPages(0);
        setPdfError('PDF 渲染失败：该文件可能包含不兼容内容。');
      }
    };

    void loadPdf();
    return () => {
      isMounted = false;
    };
  }, [book.fileType, book.pdfPath]);

  useEffect(() => {
    if (book.fileType !== 'application/pdf' || !pdfDoc || !canvasRef.current || pdfTotalPages <= 0) return;
    let cancelled = false;

    const render = async () => {
      if (renderTaskRef.current) {
        try {
          renderTaskRef.current.cancel();
        } catch {
          // ignore cancel errors
        }
        renderTaskRef.current = null;
      }

      const pageNumber = Math.min(currentPage + 1, pdfTotalPages);
      const page = await pdfDoc.getPage(pageNumber);
      if (cancelled) return;

      const viewport = page.getViewport({ scale: pdfScale });
      const canvas = canvasRef.current!;
      const context = canvas.getContext('2d');
      if (!context) return;
      canvas.width = viewport.width;
      canvas.height = viewport.height;

      const task = page.render({ canvasContext: context, viewport });
      renderTaskRef.current = task;
      try {
        await task.promise;
      } catch (err: any) {
        if (err?.name !== 'RenderingCancelledException') throw err;
      } finally {
        if (renderTaskRef.current === task) renderTaskRef.current = null;
      }
    };

    void render();
    return () => {
      cancelled = true;
      if (renderTaskRef.current) {
        try {
          renderTaskRef.current.cancel();
        } catch {
          // ignore cancel errors
        }
        renderTaskRef.current = null;
      }
    };
  }, [book.fileType, canvasRef, pdfDoc, pdfTotalPages, currentPage, pdfScale]);

  const openWithSystemViewer = async () => {
    if (!book.pdfPath || !window.electronAPI?.openPdfInDefaultViewer) return;
    const res = await window.electronAPI.openPdfInDefaultViewer(book.pdfPath);
    if (!res.ok) {
      alert(`打开失败：${res.message || '未知错误'}`);
    }
  };

  return {
    pdfTotalPages,
    pdfError,
    openWithSystemViewer,
  };
}

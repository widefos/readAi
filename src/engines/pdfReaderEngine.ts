import { useEffect, useState } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import { Book } from '../types';

pdfjsLib.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';

export function usePdfReaderEngine(book: Book, currentPage: number, canvasRef: React.RefObject<HTMLCanvasElement | null>) {
  const [pdfDoc, setPdfDoc] = useState<any>(null);
  const [pdfTotalPages, setPdfTotalPages] = useState(0);
  const [pdfError, setPdfError] = useState<string | null>(null);

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
        const bytes = await window.electronAPI.readBookFile(book.pdfPath);
        const loadedPdf = await pdfjsLib.getDocument({ data: Uint8Array.from(bytes) }).promise;
        if (!isMounted) return;
        setPdfDoc(loadedPdf);
        setPdfTotalPages(loadedPdf.numPages || 0);
        setPdfError(null);
      } catch {
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
    const render = async () => {
      const pageNumber = Math.min(currentPage + 1, pdfTotalPages);
      const page = await pdfDoc.getPage(pageNumber);
      const viewport = page.getViewport({ scale: 1.4 });
      const canvas = canvasRef.current!;
      const context = canvas.getContext('2d');
      if (!context) return;
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      await page.render({ canvasContext: context, viewport }).promise;
    };
    void render();
  }, [book.fileType, canvasRef, pdfDoc, pdfTotalPages, currentPage]);

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

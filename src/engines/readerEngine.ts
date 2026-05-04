import { Book } from '../types';

export interface ReaderEngine {
  kind: 'pdf' | 'text';
  totalPages: number;
  getParagraphPage: (page: number) => string[];
}

class TextReaderEngine implements ReaderEngine {
  kind: 'pdf' | 'text' = 'text';
  private paragraphs: string[];
  private itemsPerPage: number;

  constructor(book: Book, itemsPerPage = 8) {
    this.paragraphs = book.content.split('\n').filter((p) => p.trim().length > 0);
    this.itemsPerPage = itemsPerPage;
  }

  get totalPages() {
    return Math.max(1, Math.ceil(this.paragraphs.length / this.itemsPerPage));
  }

  getParagraphPage(page: number) {
    return this.paragraphs.slice(page * this.itemsPerPage, (page + 1) * this.itemsPerPage);
  }
}

class PdfReaderEngine implements ReaderEngine {
  kind: 'pdf' | 'text' = 'pdf';
  private pdfTotalPages: number;

  constructor(pdfTotalPages: number) {
    this.pdfTotalPages = pdfTotalPages;
  }

  get totalPages() {
    return Math.max(1, this.pdfTotalPages || 1);
  }

  getParagraphPage() {
    return [];
  }
}

export function createReaderEngine(book: Book, pdfTotalPages: number): ReaderEngine {
  if (book.fileType === 'application/pdf') {
    return new PdfReaderEngine(pdfTotalPages);
  }
  return new TextReaderEngine(book);
}

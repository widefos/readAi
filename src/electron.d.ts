export {};

declare global {
  interface Window {
    electronAPI?: {
      saveBookFile: (payload: { fileName: string; bytes: number[] }) => Promise<{ path: string }>;
      readBookFile: (fullPath: string) => Promise<number[]>;
      getPdfUrl: (fullPath: string) => Promise<string>;
      getLibraryData: () => Promise<{
        books: import('./types').Book[];
        chats: Record<string, import('./types').ChatMessage[]>;
        progress: Record<string, number>;
        progressAnchors: Record<string, number>;
      }>;
      saveBook: (book: import('./types').Book) => Promise<{ ok: boolean }>;
      deleteBook: (bookId: string) => Promise<{ ok: boolean }>;
      saveChat: (payload: { bookId: string; messages: import('./types').ChatMessage[] }) => Promise<{ ok: boolean }>;
      saveProgress: (payload: { bookId: string; currentPage: number; paragraphAnchor?: number }) => Promise<{ ok: boolean }>;
      openPdfInDefaultViewer: (fullPath: string) => Promise<{ ok: boolean; message: string | null }>;
    };
  }
}

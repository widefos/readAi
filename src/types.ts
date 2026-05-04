export interface TocItem {
  label: string;
  href?: string;
  position?: number; // Position in the paragraphs list (index)
  children?: TocItem[];
}

export interface Book {
  id: string;
  title: string;
  author: string;
  content: string;
  userId: string;
  createdAt: string;
  fileType: string;
  toc?: TocItem[];
  cover?: string;
}

export interface ReadingProgress {
  bookId: string;
  userId: string;
  currentPage: number;
  lastReadAt: string;
  bookmarks: string[];
}

export interface ChatMessage {
  role: 'user' | 'model';
  content: string;
  timestamp: string;
}

export interface ChatSession {
  id: string;
  bookId: string;
  userId: string;
  messages: ChatMessage[];
  updatedAt: string;
}

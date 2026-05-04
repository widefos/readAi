import { Book } from '../types';

function splitParagraphs(content: string): string[] {
  return content.split('\n').map((p) => p.trim()).filter(Boolean);
}

export function buildChatContext(book: Book, currentPage: number, pageWindow = 3, itemsPerPage = 8): string {
  if (book.fileType === 'application/pdf') {
    return `${book.content}\n\n[提示] 当前阅读页：第 ${currentPage + 1} 页。`;
  }

  const paragraphs = splitParagraphs(book.content);
  if (paragraphs.length === 0) return book.content;

  const startPage = Math.max(0, currentPage - pageWindow);
  const endPage = currentPage + pageWindow;
  const startIndex = startPage * itemsPerPage;
  const endIndex = Math.min(paragraphs.length, (endPage + 1) * itemsPerPage);
  const excerpt = paragraphs.slice(startIndex, endIndex).join('\n');

  return [
    `[上下文范围] 第 ${startPage + 1} 页 - 第 ${endPage + 1} 页（当前第 ${currentPage + 1} 页）`,
    excerpt,
  ].join('\n\n');
}

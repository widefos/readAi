import ePub from 'epubjs';
import * as pdfjsLib from 'pdfjs-dist';

pdfjsLib.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';
const FULL_HASH_THRESHOLD = 8 * 1024 * 1024;

export interface ImportedBookData {
  text: string;
  toc: any[];
  cover?: string;
  pdfPath?: string;
  pageCount?: number;
  fingerprint: string;
}

function normalizeEpubHref(href?: string): string {
  if (!href) return '';
  const noHash = href.split('#')[0]?.split('?')[0] ?? '';
  const normalized = noHash.replace(/\\/g, '/').replace(/^\.?\//, '').trim().toLowerCase();
  try {
    return decodeURIComponent(normalized);
  } catch {
    return normalized;
  }
}

function resolveHrefPosition(href: string | undefined, hrefToPosition: Map<string, number>): number | undefined {
  const key = normalizeEpubHref(href);
  if (!key) return undefined;
  const exact = hrefToPosition.get(key);
  if (exact !== undefined) return exact;

  for (const [k, pos] of hrefToPosition.entries()) {
    if (k.endsWith(`/${key}`) || key.endsWith(`/${k}`)) return pos;
  }
  return undefined;
}

export async function resolvePdfPageCount(pdfPath?: string): Promise<number | undefined> {
  if (!pdfPath || !window.electronAPI?.getPdfUrl) return undefined;
  try {
    const url = await window.electronAPI.getPdfUrl(pdfPath);
    if (!url) return undefined;
    const loadingTask = pdfjsLib.getDocument({ url, withCredentials: false });
    const loadedPdf = await loadingTask.promise;
    return loadedPdf.numPages || undefined;
  } catch {
    return undefined;
  }
}

async function buildFingerprint(file: File): Promise<string> {
  let buffer: ArrayBuffer;
  if (file.size <= FULL_HASH_THRESHOLD) {
    // Small files: hash full content for strongest deduplication.
    buffer = await file.arrayBuffer();
  } else {
    // Larger files: hash sampled content + stable metadata to reduce import latency.
    const head = await file.slice(0, 128 * 1024).arrayBuffer();
    const tail = await file.slice(Math.max(0, file.size - 128 * 1024), file.size).arrayBuffer();
    const meta = `${file.type}|${file.size}`;
    const merged = new Uint8Array(head.byteLength + tail.byteLength + meta.length);
    merged.set(new Uint8Array(head), 0);
    merged.set(new Uint8Array(tail), head.byteLength);
    for (let i = 0; i < meta.length; i++) merged[head.byteLength + tail.byteLength + i] = meta.charCodeAt(i);
    buffer = merged.buffer;
  }

  const digest = await crypto.subtle.digest('SHA-256', buffer);
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function savePdfToLocal(file: File): Promise<string | undefined> {
  if (!window.electronAPI) return undefined;
  const bytes = await file.arrayBuffer();
  const result = await window.electronAPI.saveBookFile({
    fileName: file.name,
    bytes: Array.from(new Uint8Array(bytes)),
  });
  return result.path;
}

async function extractPdfCover(file: File): Promise<string | undefined> {
  try {
    const bytes = new Uint8Array(await file.arrayBuffer());
    const loadingTask = pdfjsLib.getDocument({ data: bytes });
    const pdf = await loadingTask.promise;
    const page = await pdf.getPage(1);
    const baseViewport = page.getViewport({ scale: 1 });
    if (!baseViewport.width || !baseViewport.height) return undefined;

    const targetWidth = 280;
    const scale = targetWidth / baseViewport.width;
    const viewport = page.getViewport({ scale });

    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    if (!context) return undefined;

    canvas.width = Math.max(1, Math.floor(viewport.width));
    canvas.height = Math.max(1, Math.floor(viewport.height));
    await page.render({ canvasContext: context, viewport }).promise;
    return canvas.toDataURL('image/jpeg', 0.82);
  } catch {
    return undefined;
  }
}

async function importPdf(file: File): Promise<Omit<ImportedBookData, 'fingerprint'>> {
  const pdfPath = await savePdfToLocal(file);
  const cover = await extractPdfCover(file);
  // Extracting page count during upload causes large-PDF import latency.
  // We defer this and keep upload path fast.
  const pageCount: number | undefined = undefined;

  return {
    text: `PDF 文件：${file.name}\n已导入本地，可直接阅读。`,
    toc: [],
    cover,
    pdfPath,
    pageCount,
  };
}

async function importEpub(file: File): Promise<Omit<ImportedBookData, 'fingerprint'>> {
  const arrayBuffer = await file.arrayBuffer();
  const book = ePub(arrayBuffer);
  await book.ready;

  let cover: string | undefined;
  try {
    const coverUrl = await book.coverUrl();
    if (coverUrl) {
      const response = await fetch(coverUrl);
      const blob = await response.blob();
      cover = await new Promise((resolve) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result as string);
        reader.readAsDataURL(blob);
      });
    }
  } catch {
    // ignore cover extraction failure
  }

  let text = '';
  let paragraphOffset = 0;
  const hrefToPosition = new Map<string, number>();
  const spineItems = (book.spine as any).items || [];
  for (const item of spineItems) {
    try {
      const resource = await book.load(item.href);
      if (!resource) continue;
      const parser = new DOMParser();
      const doc = (typeof resource === 'string' ? parser.parseFromString(resource, 'text/html') : resource) as Document;
      const content = doc.body?.innerText || doc.body?.textContent || '';
      const normalizedHref = normalizeEpubHref(item.href);
      if (normalizedHref && !hrefToPosition.has(normalizedHref)) {
        hrefToPosition.set(normalizedHref, paragraphOffset);
      }
      if (content.trim()) {
        const paragraphs = content
          .split('\n')
          .map((p) => p.trim())
          .filter((p) => p.length > 0);
        text += `${paragraphs.join('\n')}\n\n`;
        paragraphOffset += paragraphs.length;
      }
    } catch {
      // ignore chapter parse failure
    }
  }

  let toc: any[] = [];
  try {
    const navigation = await (book as any).navigation;
    const mapToc = (items: any[]): any[] =>
      items.map((item) => ({
        label: item.label,
        href: item.href,
        position: resolveHrefPosition(item.href, hrefToPosition),
        children: item.subitems?.length ? mapToc(item.subitems) : undefined,
      }));
    if (navigation?.toc) toc = mapToc(navigation.toc);
  } catch {
    // ignore toc extraction failure
  }

  return { text, toc, cover };
}

async function importText(file: File): Promise<Omit<ImportedBookData, 'fingerprint'>> {
  return { text: await file.text(), toc: [] };
}

export async function importBookFile(file: File): Promise<ImportedBookData> {
  const fingerprint = await buildFingerprint(file);
  if (file.type === 'application/pdf') return { ...(await importPdf(file)), fingerprint };
  if (file.type === 'application/epub+zip' || file.name.endsWith('.epub')) return { ...(await importEpub(file)), fingerprint };
  return { ...(await importText(file)), fingerprint };
}

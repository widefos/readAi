import ePub from 'epubjs';

export interface ImportedBookData {
  text: string;
  toc: any[];
  cover?: string;
  pdfPath?: string;
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

async function importPdf(file: File): Promise<ImportedBookData> {
  const pdfPath = await savePdfToLocal(file);
  return {
    text: `PDF 文件：${file.name}\n已导入本地，可直接阅读。`,
    toc: [],
    pdfPath,
  };
}

async function importEpub(file: File): Promise<ImportedBookData> {
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
  const spineItems = (book.spine as any).items || [];
  for (const item of spineItems) {
    try {
      const resource = await book.load(item.href);
      if (!resource) continue;
      const parser = new DOMParser();
      const doc = (typeof resource === 'string' ? parser.parseFromString(resource, 'text/html') : resource) as Document;
      const content = doc.body?.innerText || doc.body?.textContent || '';
      if (content.trim()) {
        text += `${content.trim()}\n\n`;
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
        children: item.subitems?.length ? mapToc(item.subitems) : undefined,
      }));
    if (navigation?.toc) toc = mapToc(navigation.toc);
  } catch {
    // ignore toc extraction failure
  }

  return { text, toc, cover };
}

async function importText(file: File): Promise<ImportedBookData> {
  return { text: await file.text(), toc: [] };
}

export async function importBookFile(file: File): Promise<ImportedBookData> {
  if (file.type === 'application/pdf') return importPdf(file);
  if (file.type === 'application/epub+zip' || file.name.endsWith('.epub')) return importEpub(file);
  return importText(file);
}

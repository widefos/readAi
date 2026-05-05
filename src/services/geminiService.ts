import { ChatMessage } from '../types';

async function callGemini(payload: Record<string, unknown>) {
  const res = await fetch('/api/gemini', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const raw = String(data?.error || 'Gemini request failed');
    if (raw.toLowerCase().includes('fetch failed')) {
      throw new Error('模型服务网络请求失败（fetch failed）。请检查网络、代理或地区连通性后重试。');
    }
    throw new Error(raw);
  }
  return data.text as string;
}

export async function summarizeBook(bookTitle: string, content: string) {
  return callGemini({
    action: 'summarize',
    bookTitle,
    content,
  });
}

export async function checkModelHealth() {
  const res = await fetch('/api/gemini', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      action: 'health',
      bookTitle: 'health-check',
      content: 'health-check',
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data?.ok) {
    throw new Error(String(data?.error || '模型健康检查失败'));
  }
  return true;
}

export async function askAboutBookStream(
  bookTitle: string,
  content: string,
  history: ChatMessage[],
  question: string,
  onChunk: (chunk: string) => void,
  signal?: AbortSignal,
) {
  console.log('[AI_STREAM] request:start', { bookTitle, historyLength: history.length });
  const res = await fetch('/api/gemini', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    signal,
    body: JSON.stringify({
      action: 'ask',
      bookTitle,
      content,
      history,
      question,
      stream: true,
    }),
  });
  console.log('[AI_STREAM] request:response', { ok: res.ok, status: res.status, statusText: res.statusText });

  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    const raw = String(data?.error || 'Gemini stream request failed');
    throw new Error(raw);
  }

  if (!res.body) {
    console.log('[AI_STREAM] request:nobody');
    throw new Error('流式响应不可用');
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  console.log('[AI_STREAM] read:begin');

  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      console.log('[AI_STREAM] read:done');
      break;
    }
    const chunk = decoder.decode(value, { stream: true });
    if (chunk) onChunk(chunk);
  }

  const tail = decoder.decode();
  if (tail) onChunk(tail);
  console.log('[AI_STREAM] read:tail', { tailLength: tail.length });
}

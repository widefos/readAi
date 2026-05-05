import { NextResponse } from 'next/server';
import type { ChatMessage } from '@/src/types';

type GeminiAction = 'summarize' | 'ask' | 'health';

interface GeminiRequestBody {
  action: GeminiAction;
  bookTitle: string;
  content: string;
  question?: string;
  history?: ChatMessage[];
  stream?: boolean;
}

const DEEPSEEK_BASE_URL = process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com';
const DEEPSEEK_MODEL = process.env.DEEPSEEK_MODEL || 'deepseek-v4-flash';
const SUMMARY_MAX_CHARS = 500_000;
const QA_MAX_CHARS = 1_000_000;

function getApiKey() {
  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) throw new Error('Server is missing DEEPSEEK_API_KEY');
  return apiKey;
}

function isValidBody(body: Partial<GeminiRequestBody>): body is GeminiRequestBody {
  return (
    (body.action === 'summarize' || body.action === 'ask' || body.action === 'health') &&
    typeof body.bookTitle === 'string' &&
    typeof body.content === 'string'
  );
}

function formatHistory(history: ChatMessage[] = []) {
  if (!history.length) return '无历史对话。';
  return history
    .slice(-12)
    .map((msg, idx) => `${idx + 1}. [${msg.role}] ${msg.content}`)
    .join('\n');
}

function buildMessages(body: GeminiRequestBody) {
  if (body.action === 'summarize') {
    return [
      {
        role: 'system' as const,
        content: '你是专业阅读助手。请使用中文输出结构化、准确、简洁的总结。',
      },
      {
        role: 'user' as const,
        content: [
          `请为《${body.bookTitle}》生成结构化中文总结。`,
          '要求：',
          '1) 提炼核心观点和论证主线；',
          '2) 按逻辑结构组织答案；',
          '3) 简洁但信息密度高。',
          '',
          '书籍内容：',
          body.content.substring(0, SUMMARY_MAX_CHARS),
        ].join('\n'),
      },
    ];
  }

  const question = (body.question ?? '').trim();
  return [
    {
      role: 'system' as const,
      content: '你是 AI 阅读助理。请始终使用中文，优先基于给定书籍内容回答，并在不确定时明确说明。',
    },
    {
      role: 'user' as const,
      content: [
        `书名：${body.bookTitle}`,
        '',
        '历史对话：',
        formatHistory(body.history),
        '',
        '用户问题：',
        question,
        '',
        '书籍内容：',
        body.content.substring(0, QA_MAX_CHARS),
      ].join('\n'),
    },
  ];
}

async function callDeepSeek(messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>) {
  const apiKey = getApiKey();
  const res = await fetch(`${DEEPSEEK_BASE_URL}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: DEEPSEEK_MODEL,
      messages,
      temperature: 0.3,
    }),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const errorMessage = data?.error?.message || data?.error || 'DeepSeek request failed';
    throw new Error(String(errorMessage));
  }

  return String(data?.choices?.[0]?.message?.content || '');
}

async function callDeepSeekStream(messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>) {
  const apiKey = getApiKey();
  const res = await fetch(`${DEEPSEEK_BASE_URL}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: DEEPSEEK_MODEL,
      messages,
      temperature: 0.3,
      stream: true,
    }),
  });

  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    const errorMessage = data?.error?.message || data?.error || 'DeepSeek stream request failed';
    throw new Error(String(errorMessage));
  }
  if (!res.body) throw new Error('DeepSeek stream body is empty');

  const decoder = new TextDecoder();
  const encoder = new TextEncoder();
  const reader = res.body.getReader();
  let sseBuffer = '';
  let printedSample = false;

  const extractText = (value: unknown): string => {
    if (typeof value === 'string') return value;
    if (Array.isArray(value)) {
      return value
        .map((item) => {
          if (typeof item === 'string') return item;
          if (item && typeof item === 'object') {
            const rec = item as Record<string, unknown>;
            return extractText(rec.text ?? rec.content ?? rec.value ?? '');
          }
          return '';
        })
        .join('');
    }
    if (value && typeof value === 'object') {
      const rec = value as Record<string, unknown>;
      return extractText(rec.text ?? rec.content ?? rec.value ?? '');
    }
    return '';
  };

  const pickDeltaText = (parsed: any): string => {
    const choice = parsed?.choices?.[0];
    if (!choice) return '';
    return (
      extractText(choice?.delta?.content) ||
      extractText(choice?.delta?.text) ||
      extractText(choice?.delta?.reasoning_content) ||
      extractText(choice?.message?.content) ||
      extractText(choice?.text) ||
      ''
    );
  };

  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          console.log('[API_GEMINI] stream:upstream_done');
          controller.close();
          return;
        }

        sseBuffer += decoder.decode(value, { stream: true });
        const events = sseBuffer.split(/\r?\n\r?\n/);
        sseBuffer = events.pop() ?? '';

        let emittedInThisPull = 0;
        for (const evt of events) {
          const lines = evt.split(/\r?\n/);
          for (const line of lines) {
            const normalized = line.trim();
            if (!normalized.startsWith('data:')) continue;
            const payload = normalized.slice(5).trim();
            if (!payload || payload === '[DONE]') continue;

            try {
              const parsed = JSON.parse(payload);
              if (!printedSample) {
                printedSample = true;
                console.log('[API_GEMINI] stream:first_payload_keys', {
                  topLevelKeys: Object.keys(parsed || {}),
                  choiceKeys: Object.keys(parsed?.choices?.[0] || {}),
                  deltaKeys: Object.keys(parsed?.choices?.[0]?.delta || {}),
                });
              }
              const delta = pickDeltaText(parsed);
              if (delta) {
                controller.enqueue(encoder.encode(delta));
                emittedInThisPull += delta.length;
              }
            } catch {
              // ignore malformed chunk
            }
          }
        }

        if (events.length > 0) {
          console.log('[API_GEMINI] stream:forwarded', { events: events.length, emittedChars: emittedInThisPull });
          return;
        }
      }
    },
  });
}

export async function POST(req: Request) {
  try {
    console.log('[API_GEMINI] request:start');
    const body = (await req.json()) as Partial<GeminiRequestBody>;
    if (!isValidBody(body)) {
      return NextResponse.json({ error: 'Invalid request body for /api/gemini' }, { status: 400 });
    }

    if (body.action === 'health') {
      const text = await callDeepSeek([
        { role: 'system', content: '你是系统健康检查助手。' },
        { role: 'user', content: '请仅回复：ok' },
      ]);
      return NextResponse.json({ ok: Boolean(text) });
    }

    if (body.action === 'ask') {
      const question = (body.question ?? '').trim();
      if (!question) {
        return NextResponse.json({ error: 'question is required for ask action' }, { status: 400 });
      }
    }

    const messages = buildMessages(body);

    if (body.action === 'ask' && body.stream) {
      console.log('[API_GEMINI] stream:start', { action: body.action, model: DEEPSEEK_MODEL });
      const stream = await callDeepSeekStream(messages);
      console.log('[API_GEMINI] stream:connected');
      return new Response(stream, {
        headers: {
          'Content-Type': 'text/plain; charset=utf-8',
          'Cache-Control': 'no-cache, no-transform',
          Connection: 'keep-alive',
        },
      });
    }

    const content = await callDeepSeek(messages);
    console.log('[API_GEMINI] request:done', { action: body.action, length: content.length });
    return NextResponse.json({ text: content });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'DeepSeek request failed';
    console.log('[API_GEMINI] request:error', { message });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

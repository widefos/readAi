import { NextResponse } from "next/server";
import type { ChatMessage } from "@/src/types";

type GeminiAction = "summarize" | "ask";

interface GeminiRequestBody {
  action: GeminiAction;
  bookTitle: string;
  content: string;
  question?: string;
  history?: ChatMessage[];
}

const DEEPSEEK_BASE_URL = process.env.DEEPSEEK_BASE_URL || "https://api.deepseek.com";
const DEEPSEEK_MODEL = process.env.DEEPSEEK_MODEL || "deepseek-v4-flash";
const SUMMARY_MAX_CHARS = 500_000;
const QA_MAX_CHARS = 1_000_000;

function getApiKey() {
  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) {
    throw new Error("Server is missing DEEPSEEK_API_KEY");
  }
  return apiKey;
}

function isValidBody(body: Partial<GeminiRequestBody>): body is GeminiRequestBody {
  return (
    (body.action === "summarize" || body.action === "ask") &&
    typeof body.bookTitle === "string" &&
    typeof body.content === "string"
  );
}

function formatHistory(history: ChatMessage[] = []) {
  if (!history.length) return "无历史对话。";
  return history
    .slice(-12)
    .map((msg, idx) => `${idx + 1}. [${msg.role}] ${msg.content}`)
    .join("\n");
}

async function callDeepSeek(messages: Array<{ role: "system" | "user" | "assistant"; content: string }>) {
  const apiKey = getApiKey();
  const res = await fetch(`${DEEPSEEK_BASE_URL}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
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
    const errorMessage = data?.error?.message || data?.error || "DeepSeek request failed";
    throw new Error(String(errorMessage));
  }

  return String(data?.choices?.[0]?.message?.content || "");
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as Partial<GeminiRequestBody>;
    if (!isValidBody(body)) {
      return NextResponse.json({ error: "Invalid request body for /api/gemini" }, { status: 400 });
    }

    if (body.action === "summarize") {
      const content = await callDeepSeek([
        {
          role: "system",
          content: "你是专业阅读助手。请用中文输出结构化、准确、简洁的总结。",
        },
        {
          role: "user",
          content: [
            `请为《${body.bookTitle}》生成结构化中文总结。`,
            "要求：",
            "1) 提炼核心观点和论证主线；",
            "2) 按逻辑结构组织答案；",
            "3) 简洁但信息密度高。",
            "",
            "书籍内容：",
            body.content.substring(0, SUMMARY_MAX_CHARS),
          ].join("\n"),
        },
      ]);
      return NextResponse.json({ text: content });
    }

    const question = (body.question ?? "").trim();
    if (!question) {
      return NextResponse.json({ error: "question is required for ask action" }, { status: 400 });
    }

    const content = await callDeepSeek([
      {
        role: "system",
        content: "你是 AI 阅读助理。请始终使用中文，优先基于给定书籍内容回答，并在不确定时明确说明。",
      },
      {
        role: "user",
        content: [
          `书名：${body.bookTitle}`,
          "",
          "历史对话：",
          formatHistory(body.history),
          "",
          "用户问题：",
          question,
          "",
          "书籍内容：",
          body.content.substring(0, QA_MAX_CHARS),
        ].join("\n"),
      },
    ]);

    return NextResponse.json({ text: content });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "DeepSeek request failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

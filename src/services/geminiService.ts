import { ChatMessage } from "../types";

async function callGemini(payload: Record<string, unknown>) {
  const res = await fetch("/api/gemini", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const raw = String(data?.error || "Gemini request failed");
    if (raw.toLowerCase().includes("fetch failed")) {
      throw new Error("模型服务网络请求失败（fetch failed）。请检查服务器网络、代理或地区连通性后重试。");
    }
    throw new Error(raw);
  }
  return data.text as string;
}

export async function summarizeBook(bookTitle: string, content: string) {
  return callGemini({
    action: "summarize",
    bookTitle,
    content,
  });
}

export async function askAboutBook(
  bookTitle: string,
  content: string,
  history: ChatMessage[],
  question: string,
) {
  return callGemini({
    action: "ask",
    bookTitle,
    content,
    history,
    question,
  });
}

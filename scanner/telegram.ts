// Telegram Bot API over fetch. The token stays in the environment and is never printed.

import { londonClock } from "./clock.js";
import { parseDeskReply, replyText } from "./desk.js";
import { applyReply, type Book } from "./journal.js";

type Incoming = {
  updateId: number;
  chatId: string;
  text: string;
};

export function telegramReady(): { token: string; chatId: string } | null {
  const token = process.env.TELEGRAM_BOT_TOKEN?.trim() ?? "";
  const chatId = process.env.TELEGRAM_CHAT_ID?.trim() ?? "";
  if (!token || !/^-?\d+$/.test(chatId)) return null;
  return { token, chatId };
}

export async function sendTelegram(text: string): Promise<void> {
  const config = telegramReady();
  if (!config) return;
  const body = text.length > 4000 ? text.slice(0, 4000) : text;
  const result = await call(config.token, "sendMessage", { chat_id: config.chatId, text: body, disable_web_page_preview: true }, 15_000);
  if (!result.ok) console.log(`telegram failed: HTTP ${result.status}`);
}

/** Apply queued replies from the configured chat. Advances the stored offset. */
export async function drainTelegram(book: Book, now: Date, timeoutSec: number): Promise<number> {
  const config = telegramReady();
  if (!config) return 0;
  const result = await call(
    config.token,
    "getUpdates",
    { offset: book.telegramOffset, timeout: timeoutSec, allowed_updates: ["message"] },
    (timeoutSec + 10) * 1000,
  );
  if (!result.ok || !Array.isArray(result.updates)) {
    if (!result.ok) console.log(`telegram failed: HTTP ${result.status}`);
    return 0;
  }
  const clock = londonClock(now);
  let handled = 0;
  for (const update of result.updates) {
    book.telegramOffset = update.updateId + 1;
    if (update.chatId !== config.chatId || !update.text) continue;
    const reply = parseDeskReply(update.text);
    if (!reply) {
      await sendTelegram("Send not placed, placed, or when. You can add a symbol, for example: not placed US30. Research only. No order was sent.");
      handled += 1;
      continue;
    }
    const outcome = applyReply(book, reply.action, reply.symbol, now.toISOString());
    await sendTelegram(replyText(outcome, clock));
    console.log(`telegram ${reply.action}${reply.symbol ? ` ${reply.symbol}` : ""}`);
    handled += 1;
  }
  return handled;
}

let askedForChat = false;

/** When the token is set and the chat id is empty, print the id of the chat that messages the bot. */
export async function hintChatId(): Promise<void> {
  const token = process.env.TELEGRAM_BOT_TOKEN?.trim() ?? "";
  const chatId = process.env.TELEGRAM_CHAT_ID?.trim() ?? "";
  if (!token || /^-?\d+$/.test(chatId)) return;
  if (chatId) {
    console.log("telegram skipped: TELEGRAM_CHAT_ID must be digits");
    return;
  }
  const result = await call(token, "getUpdates", { timeout: 0, allowed_updates: ["message"] }, 15_000);
  const chat = result.updates?.find((update) => update.chatId)?.chatId;
  if (chat) {
    console.log(`Set TELEGRAM_CHAT_ID=${chat} in .env and run the scanner again.`);
    return;
  }
  if (!askedForChat) {
    askedForChat = true;
    console.log("Telegram token is set. Open the bot, tap Start, then run npm run scan again so it can print TELEGRAM_CHAT_ID.");
  }
}

type CallResult = {
  ok: boolean;
  status: number;
  updates?: Incoming[];
};

async function call(token: string, method: string, body: Record<string, unknown>, timeoutMs: number): Promise<CallResult> {
  try {
    const response = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!response.ok) return { ok: false, status: response.status };
    if (method !== "getUpdates") return { ok: true, status: response.status };
    const parsed = (await response.json()) as { ok?: boolean; result?: unknown[] };
    const updates: Incoming[] = [];
    for (const row of parsed.result ?? []) {
      if (!row || typeof row !== "object") continue;
      const update = row as { update_id?: number; message?: { text?: string; chat?: { id?: number } } };
      if (typeof update.update_id !== "number") continue;
      updates.push({
        updateId: update.update_id,
        chatId: update.message?.chat?.id == null ? "" : String(update.message.chat.id),
        text: typeof update.message?.text === "string" ? update.message.text : "",
      });
    }
    return { ok: parsed.ok !== false, status: response.status, updates };
  } catch {
    return { ok: false, status: 0 };
  }
}

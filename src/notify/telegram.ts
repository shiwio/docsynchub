import type { ProjectRecord } from "../server/state.js";
import { fetchJson } from "../utils/fetch.js";

export async function notifyTelegram(config: ProjectRecord, text: string): Promise<void> {
  const telegram = config.notifications.telegram;
  if (!telegram?.enabled) {
    return;
  }

  const token = telegram.botToken || (telegram as any).botTokenEnv;
  const chatId = telegram.chatId || (telegram as any).chatIdEnv;
  if (!token || !chatId) return;
  const url = `https://api.telegram.org/bot${encodeURIComponent(token)}/sendMessage`;
  await fetchJson(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      disable_web_page_preview: true
    })
  });
}

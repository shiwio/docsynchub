import type { ProjectRecord } from "../server/state.js";
import { fetchJson } from "../utils/fetch.js";

export async function notifyDiscord(config: ProjectRecord, content: string): Promise<void> {
  const discord = config.notifications.discord;
  if (!discord?.enabled) {
    return;
  }

  const webhookUrl = discord.webhookUrl || (discord as any).webhookUrlEnv;
  if (!webhookUrl) return;
  await fetchJson(webhookUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ content })
  });
}

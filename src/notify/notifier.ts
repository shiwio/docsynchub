import type { SyncResult } from "../core/types.js";
import type { ProjectRecord } from "../server/state.js";
import { notifyDiscord } from "./discord.js";
import { notifyTelegram } from "./telegram.js";

export async function notify(config: ProjectRecord, result: SyncResult): Promise<void> {
  const changed = result.changes.filter((change) => change.status !== "skipped");
  if (changed.length === 0) {
    return;
  }

  const lines = [
    `DocSyncHub synced ${changed.length} document(s).`,
    result.commit ? `Commit: ${result.commit}` : undefined,
    ...changed.map((change) => `- ${change.status}: ${change.output}`)
  ].filter(Boolean) as string[];
  const message = lines.join("\n");

  await Promise.all([notifyTelegram(config, message), notifyDiscord(config, message)]);
}

import type { SyncContext } from "../core/syncEngine.js";
import type { SourceConfig, SourceDocument } from "../core/types.js";
import { fetchText } from "../utils/fetch.js";
import type { DocumentSource } from "./source.js";

export class GoogleDocsSource implements DocumentSource {
  async fetch(config: SourceConfig, _workspace: string, context: SyncContext = {}): Promise<SourceDocument> {
    const token = context.googleAccessToken;
    if (!token) throw new Error("Google is not connected. Please connect Google OAuth in Settings.");

    const url = new URL(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent((config as any).id)}/export`);
    url.searchParams.set("mimeType", "text/html");

    const content = await fetchText(url.toString(), {
      headers: { Authorization: `Bearer ${token}` }
    });

    return {
      source: "google_doc",
      sourceId: (config as any).id,
      contentType: "html",
      content
    };
  }
}

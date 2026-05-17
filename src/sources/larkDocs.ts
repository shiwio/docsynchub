import type { SyncContext } from "../core/syncEngine.js";
import type { SourceConfig, SourceDocument } from "../core/types.js";
import { fetchJson } from "../utils/fetch.js";
import type { DocumentSource } from "./source.js";

interface LarkRawContentResponse {
  code?: number;
  msg?: string;
  data?: { content?: string; title?: string };
}

export class LarkDocsSource implements DocumentSource {
  async fetch(config: SourceConfig, _workspace: string, context: SyncContext = {}): Promise<SourceDocument> {
    const token = process.env.LARK_TENANT_ACCESS_TOKEN;
    if (!token) throw new Error("LARK_TENANT_ACCESS_TOKEN is not set");

    const url = `https://open.larksuite.com/open-apis/docx/v1/documents/${encodeURIComponent((config as any).id)}/raw_content`;

    const response = await fetchJson<LarkRawContentResponse>(url, {
      headers: { Authorization: `Bearer ${token}` }
    });

    if (response.code && response.code !== 0) {
      throw new Error(`Lark raw_content failed: ${response.code} ${response.msg ?? ""}`.trim());
    }

    const content = response.data?.content;
    if (!content) throw new Error(`Lark raw_content returned empty content for ${(config as any).id}`);

    return {
      source: "lark_doc",
      sourceId: (config as any).id,
      title: response.data?.title,
      contentType: "markdown",
      content
    };
  }
}

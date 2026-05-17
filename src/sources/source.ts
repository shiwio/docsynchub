import type { SyncContext } from "../core/syncEngine.js";
import type { SourceConfig, SourceDocument } from "../core/types.js";
import { GoogleDocsSource } from "./googleDocs.js";
import { LarkDocsSource } from "./larkDocs.js";

export interface DocumentSource {
  fetch(config: SourceConfig, workspace: string, context: SyncContext): Promise<SourceDocument>;
}

export function createSource(config: SourceConfig): DocumentSource {
  switch (config.type) {
    case "google_doc":
      return new GoogleDocsSource();
    case "lark_doc":
      return new LarkDocsSource();
  }
}

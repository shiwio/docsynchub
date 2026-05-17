export type SourceType = "google_doc" | "lark_doc";

export interface GoogleDocSourceConfig {
  type: "google_doc";
  id: string;
  accessTokenEnv?: string;
}

export interface LarkDocSourceConfig {
  type: "lark_doc";
  id: string;
  tenantAccessTokenEnv?: string;
}

export type SourceConfig = GoogleDocSourceConfig | LarkDocSourceConfig;

export interface SourceDocument {
  source: SourceType;
  sourceId: string;
  title?: string;
  contentType: "markdown" | "html" | "plain";
  content: string;
}

export interface SyncChange {
  mappingId: string;
  source: SourceType;
  sourceId: string;
  output: string;
  checksum: string;
  previousChecksum?: string;
  status: "created" | "updated" | "skipped";
}

export interface SyncResult {
  changes: SyncChange[];
  changedFiles: string[];
  commit?: string;
  updates?: { path: string; content: string; mappingId: string; checksum: string }[];
}

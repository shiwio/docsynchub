import type { SourceDocument } from "../core/types.js";

export function renderDocument(document: SourceDocument, markdown: string): string {
  const lines = [
    "---",
    `source: ${document.source}`,
    `source_id: ${JSON.stringify(document.sourceId)}`,
    ...(document.title ? [`title: ${JSON.stringify(document.title)}`] : []),
    "do_not_edit: true",
    "---",
    "",
    markdown.trim(),
    ""
  ];

  return lines.join("\n");
}

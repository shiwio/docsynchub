import type { ProjectRecord } from "../server/state.js";
import type { SyncChange, SyncResult } from "./types.js";
import { sha256 } from "./checksum.js";
import { htmlToMarkdown, normalizeMarkdown } from "../markdown/htmlToMarkdown.js";
import { renderDocument } from "../markdown/frontMatter.js";
import { createSource } from "../sources/source.js";
import path from "node:path";
import { pushToGitLab } from "../git/gitlabApi.js";
import { pushToGitHub } from "../git/githubApi.js";

export interface SyncOptions {
  dryRun?: boolean;
}

export interface SyncContext {
  googleAccessToken?: string;
  gitlabToken?: string;
  githubToken?: string;
}

export async function sync(
  project: ProjectRecord,
  context: SyncContext = {},
  options: SyncOptions = {}
): Promise<SyncResult> {
  const changes: SyncChange[] = [];
  const changedFiles: string[] = [];
  const updates: { path: string; content: string; mappingId: string; checksum: string }[] = [];

  for (const mapping of project.mappings) {
    const sourceConfig =
      mapping.sourceType === "google_doc"
        ? { type: "google_doc" as const, id: mapping.sourceId }
        : { type: "lark_doc" as const, id: mapping.sourceId };

    const source = createSource(sourceConfig);
    const document = await source.fetch(sourceConfig, "/tmp", context);
    const markdown = convertToMarkdown(document.contentType, document.content);
    const rendered = renderDocument(document, markdown);
    const checksum = sha256(`${document.title ?? ""}\n${markdown}`);
    const previousChecksum = mapping.lastChecksum;

    if (previousChecksum === checksum) {
      changes.push({
        mappingId: mapping.id,
        source: document.source,
        sourceId: document.sourceId,
        output: mapping.outputFile,
        checksum,
        previousChecksum,
        status: "skipped"
      });
      continue;
    }

    const status = previousChecksum ? "updated" : "created";
    const outputPath = path.posix.join(project.folder, mapping.outputFile);

    updates.push({ path: outputPath, content: rendered, mappingId: mapping.id, checksum });
    changes.push({
      mappingId: mapping.id,
      source: document.source,
      sourceId: document.sourceId,
      output: mapping.outputFile,
      checksum,
      previousChecksum,
      status
    });
    changedFiles.push(outputPath);
  }

  let commitUrl: string | undefined;

  if (!options.dryRun && updates.length > 0 && project.commitMode === "auto_commit") {
    const message = "docs: sync product documents";
    if (project.destination.provider === "gitlab") {
      if (!context.gitlabToken) throw new Error("GitLab is not connected. Please connect GitLab OAuth in Settings.");
      commitUrl = await pushToGitLab(project, updates, message, context.gitlabToken);
    } else if (project.destination.provider === "github") {
      if (!context.githubToken) throw new Error("GitHub token is not configured.");
      commitUrl = await pushToGitHub(project, updates, message);
    }
  }

  return { changes, changedFiles, commit: commitUrl, updates };
}

function convertToMarkdown(contentType: "markdown" | "html" | "plain", content: string): string {
  if (contentType === "html") return htmlToMarkdown(content);
  return normalizeMarkdown(content);
}

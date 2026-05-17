import type { ProjectRecord } from "../server/state.js";

export async function pushToGitHub(project: ProjectRecord, updates: {path: string, content: string}[], message: string): Promise<string> {
  // Not implemented fully yet, simple placeholder
  throw new Error("GitHub API push not implemented yet");
}

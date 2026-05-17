import { fetchJson } from "../utils/fetch.js";
import type { ProjectRecord } from "../server/state.js";

export async function pushToGitLab(
  project: ProjectRecord,
  updates: { path: string; content: string }[],
  message: string,
  token: string
): Promise<string> {
  const gitlab = project.destination.gitlab;
  if (!gitlab?.projectId) throw new Error("GitLab project ID is missing.");

  const baseUrl = (gitlab.baseUrl || "https://gitlab.com").replace(/\/$/, "");
  const branch = project.destination.branch || "main";
  const baseBranch = project.destination.baseBranch || "main";

  // Check if branch exists
  let branchExists = false;
  try {
    const res = await fetch(
      `${baseUrl}/api/v4/projects/${encodeURIComponent(gitlab.projectId)}/repository/branches/${encodeURIComponent(branch)}`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    if (res.ok) branchExists = true;
  } catch { /* ignore */ }

  // Build actions — skip files that are identical to what's already on the branch
  const actions = [];
  for (const u of updates) {
    const fileUrl = `${baseUrl}/api/v4/projects/${encodeURIComponent(gitlab.projectId)}/repository/files/${encodeURIComponent(u.path)}?ref=${encodeURIComponent(branch)}`;
    let exists = false;
    let isIdentical = false;
    try {
      const res = await fetch(fileUrl, { headers: { Authorization: `Bearer ${token}` } });
      if (res.ok) {
        exists = true;
        const data = await res.json() as any;
        if (data.encoding === "base64" && data.content) {
          const existingContent = Buffer.from(data.content, "base64").toString("utf-8");
          if (existingContent === u.content) isIdentical = true;
        }
      }
    } catch { /* ignore */ }

    if (!isIdentical) {
      actions.push({ action: exists ? "update" : "create", file_path: u.path, content: u.content });
    }
  }

  // Nothing changed on this branch — skip commit
  if (actions.length === 0 && branchExists) return "skipped";

  const res = await fetchJson<any>(
    `${baseUrl}/api/v4/projects/${encodeURIComponent(gitlab.projectId)}/repository/commits`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        branch,
        start_branch: branchExists ? undefined : baseBranch,
        commit_message: message,
        actions
      })
    }
  );

  return res.web_url || res.short_id;
}

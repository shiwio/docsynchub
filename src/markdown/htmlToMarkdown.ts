import TurndownService from "turndown";

const turndown = new TurndownService({
  headingStyle: "atx",
  codeBlockStyle: "fenced",
  bulletListMarker: "-"
});

turndown.addRule("removeStylesAndScripts", {
  filter: ["style", "script"],
  replacement: () => ""
});

turndown.addRule("strikethrough", {
  filter: ["del", "s", "strike" as any],
  replacement: (content) => `~~${content}~~`
});

turndown.addRule("cleanGoogleLinks", {
  filter: "a",
  replacement: (content, node) => {
    let href = (node as any).getAttribute("href") || "";
    if (href.startsWith("https://www.google.com/url?")) {
      try {
        const url = new URL(href);
        const q = url.searchParams.get("q");
        if (q) href = q;
      } catch {
        // ignore invalid URL
      }
    }
    const title = (node as any).getAttribute("title");
    return `[${content}](${href}${title ? ` "${title}"` : ""})`;
  }
});

export function htmlToMarkdown(html: string): string {
  return normalizeMarkdown(turndown.turndown(html));
}

export function normalizeMarkdown(markdown: string): string {
  return markdown
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .concat("\n");
}

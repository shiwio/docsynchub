export async function fetchText(url: string, init?: RequestInit): Promise<string> {
  const response = await fetch(url, init);
  if (!response.ok) {
    const body = await response.text().catch(() => "");
    const suffix = body ? `: ${body.slice(0, 500)}` : "";
    throw new Error(`HTTP ${response.status} ${response.statusText} for ${url}${suffix}`);
  }

  return response.text();
}

export async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  if (!response.ok) {
    const body = await response.text().catch(() => "");
    const suffix = body ? `: ${body.slice(0, 500)}` : "";
    throw new Error(`HTTP ${response.status} ${response.statusText} for ${url}${suffix}`);
  }

  return response.json() as Promise<T>;
}

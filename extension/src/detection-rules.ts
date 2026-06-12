export type SiteMode = "aggressive" | "selection" | "off";

const STORAGE_KEY = "siteRules";

const QUIET_HOSTS = new Set([
  "solscan.io",
  "birdeye.so",
  "dexscreener.com",
]);

export function defaultMode(hostname: string): SiteMode {
  return QUIET_HOSTS.has(hostname) ? "selection" : "aggressive";
}

export async function getSiteMode(hostname: string): Promise<SiteMode> {
  const result = await chrome.storage.sync.get(STORAGE_KEY);
  const rules = (result[STORAGE_KEY] ?? {}) as Record<string, SiteMode>;
  return rules[hostname] ?? defaultMode(hostname);
}

export async function setSiteMode(hostname: string, mode: SiteMode): Promise<void> {
  const result = await chrome.storage.sync.get(STORAGE_KEY);
  const rules = (result[STORAGE_KEY] ?? {}) as Record<string, SiteMode>;
  rules[hostname] = mode;
  await chrome.storage.sync.set({ [STORAGE_KEY]: rules });
}

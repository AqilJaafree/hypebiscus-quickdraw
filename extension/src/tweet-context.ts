export interface TweetContext {
  authorHandle: string | null;
  verified: boolean;
  tweetText: string | null;
  likes: number | null;
  retweets: number | null;
}

export function parseEngagement(text: string): number | null {
  if (!text) return null;
  const t = text.trim().toUpperCase();
  if (t.endsWith("K")) {
    const n = parseFloat(t.slice(0, -1));
    return isNaN(n) ? null : Math.round(n * 1000);
  }
  if (t.endsWith("M")) {
    const n = parseFloat(t.slice(0, -1));
    return isNaN(n) ? null : Math.round(n * 1_000_000);
  }
  const n = parseFloat(t);
  return isNaN(n) ? null : n;
}

export function extractTweetContext(el: Element | undefined): TweetContext | null {
  const host = window.location.hostname;
  if (host !== "twitter.com" && host !== "x.com") return null;
  if (!el) return null;

  const article = el.closest('article[data-testid="tweet"]');
  if (!article) return null;

  const userNameEl = article.querySelector('[data-testid="User-Name"]');
  const handleEl = userNameEl?.querySelector('a[href^="/"]');
  const href = handleEl?.getAttribute("href") ?? null;
  const authorHandle = href ? href.replace(/^\//, "") : null;

  const verified = !!article.querySelector('[data-testid="icon-verified"]');

  const tweetTextEl = article.querySelector('[data-testid="tweetText"]');
  const tweetText = tweetTextEl?.textContent?.trim() ?? null;

  const likeSpan = article
    .querySelector('[data-testid="like"]')
    ?.querySelector('[data-testid="app-text-transition-container"]');
  const likes = likeSpan?.textContent ? parseEngagement(likeSpan.textContent.trim()) : null;

  const retweetSpan = article
    .querySelector('[data-testid="retweet"]')
    ?.querySelector('[data-testid="app-text-transition-container"]');
  const retweets = retweetSpan?.textContent ? parseEngagement(retweetSpan.textContent.trim()) : null;

  return { authorHandle, verified, tweetText, likes, retweets };
}

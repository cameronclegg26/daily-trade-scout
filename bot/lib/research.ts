// Public headline and oil/geopolitics evidence. The model summarizes it.
// Fetched pages are data, not instructions.

const FETCH_TIMEOUT_MS = 12_000;
const USER_AGENT =
  "daily-trade-scout/0.1 (educational research; +https://github.com/cameronclegg26/daily-trade-scout)";

const OIL_KEYWORDS = [
  "oil",
  "crude",
  "opec",
  "petroleum",
  "brent",
  "wti",
  "lng",
  "natural gas",
  "energy",
  "sanction",
  "hormuz",
  "red sea",
  "houthi",
  "iran",
  "iraq",
  "saudi",
  "russia",
  "ukraine",
  "gaza",
  "tanker",
  "embargo",
  "pipeline",
  "refinery",
  "geopolit",
];

export type Story = {
  title: string;
  url: string;
  published: string | null;
  source: string;
};

export type SourceReport = {
  name: string;
  homepage: string;
  status: "ok" | "empty" | "error";
  note: string | null;
  error: string | null;
  items: Story[];
};

type Feed = {
  url: string;
  source: string;
  keywords?: readonly string[];
  keepUnfiltered?: boolean;
};

export async function fetchHeadlines(perSource: number): Promise<{
  items: Story[];
  sources: SourceReport[];
}> {
  const feeds: Feed[] = [
    {
      url: "https://feeds.finance.yahoo.com/rss/2.0/headline?s=SPY,QQQ,CL=F,BTC-USD,HG=F,ZW=F&region=US&lang=en-US",
      source: "Yahoo Finance",
    },
    {
      url: googleNews("(stock market OR shares OR Nasdaq OR S&P) when:1d"),
      source: "Google News",
    },
    {
      url: googleNews("(wheat OR corn OR soybeans OR copper OR bitcoin) when:2d"),
      source: "Google News",
    },
  ];
  const newsKey = process.env.NEWSAPI_KEY;
  const reports = await Promise.all(feeds.map((feed) => loadFeed(feed, perSource)));
  if (newsKey) reports.push(await loadNewsApi(newsKey, perSource));
  const items = dedupe(reports.flatMap((report) => report.items)).slice(0, perSource * 3);
  return { items, sources: reports };
}

export async function fetchOilGeopolitics(perOutlet: number): Promise<{ outlets: SourceReport[] }> {
  const outlets = await Promise.all([
    loadOutlet({
      name: "Reuters",
      homepage: "https://www.reuters.com/markets/commodities/",
      note: "Reuters does not publish an open RSS feed. Items are public Google News headlines that cite reuters.com.",
      feeds: [{ url: googleNews("site:reuters.com (oil OR OPEC OR crude OR geopolitics) when:3d"), source: "Reuters" }],
      perOutlet,
    }),
    loadOutlet({
      name: "Al Jazeera",
      homepage: "https://www.aljazeera.com/",
      note: null,
      feeds: [
        {
          url: "https://www.aljazeera.com/xml/rss/all.xml",
          source: "Al Jazeera",
          keywords: OIL_KEYWORDS,
        },
      ],
      perOutlet,
    }),
    loadOutlet({
      name: "Arab News",
      homepage: "https://www.arabnews.com/",
      note: null,
      feeds: [
        {
          url: "https://www.arabnews.com/rss.xml",
          source: "Arab News",
          keywords: OIL_KEYWORDS,
        },
      ],
      perOutlet,
    }),
    loadOutlet({
      name: "CNBC Oil",
      homepage: "https://www.cnbc.com/oil/",
      note: "CNBC oil RSS section.",
      feeds: [
        {
          url: "https://search.cnbc.com/rs/search/combinedcms/view.xml?partnerId=wrss01&id=19836768",
          source: "CNBC Oil",
        },
      ],
      perOutlet,
    }),
    loadOutlet({
      name: "OPEC",
      homepage: "https://www.opec.org/",
      note: "OPEC's site blocks this agent's direct fetch. Items are public Google News headlines that cite opec.org.",
      feeds: [{ url: googleNews("site:opec.org when:30d"), source: "OPEC" }],
      perOutlet,
    }),
    loadOutlet({
      name: "EIA",
      homepage: "https://www.eia.gov/petroleum/",
      note: "U.S. Energy Information Administration RSS.",
      feeds: [
        {
          url: "https://www.eia.gov/rss/todayinenergy.xml",
          source: "EIA",
          keywords: OIL_KEYWORDS,
          keepUnfiltered: true,
        },
        {
          url: "https://www.eia.gov/rss/press_rss.xml",
          source: "EIA",
          keywords: OIL_KEYWORDS,
          keepUnfiltered: true,
        },
      ],
      perOutlet,
    }),
    loadOutlet({
      name: "IEA",
      homepage: "https://www.iea.org/news",
      note: "IEA's site blocks this agent's direct fetch. Items are public Google News headlines that cite iea.org.",
      feeds: [{ url: googleNews("site:iea.org (oil OR energy) when:14d"), source: "IEA" }],
      perOutlet,
    }),
  ]);
  return { outlets };
}

async function loadOutlet(input: {
  name: string;
  homepage: string;
  note: string | null;
  feeds: Feed[];
  perOutlet: number;
}): Promise<SourceReport> {
  const loaded = await Promise.all(input.feeds.map((feed) => loadFeed(feed, input.perOutlet)));
  const errors = loaded.map((report) => report.error).filter((error): error is string => Boolean(error));
  const items = dedupe(loaded.flatMap((report) => report.items)).slice(0, input.perOutlet);
  if (items.length > 0) {
    return {
      name: input.name,
      homepage: input.homepage,
      status: "ok",
      note: input.note,
      error: null,
      items,
    };
  }
  return {
    name: input.name,
    homepage: input.homepage,
    status: errors.length === loaded.length ? "error" : "empty",
    note: input.note,
    error: errors[0] ?? null,
    items: [],
  };
}

async function loadFeed(feed: Feed, limit: number): Promise<SourceReport> {
  const res = await fetchText(feed.url);
  if (!res.ok) {
    return {
      name: feed.source,
      homepage: feed.url,
      status: "error",
      note: null,
      error: res.error,
      items: [],
    };
  }
  const parsed = parseRss(res.body, feed.source, limit * 4);
  const filtered = feed.keywords ? parsed.filter((item) => matches(item.title, feed.keywords ?? [])) : parsed;
  const items = (filtered.length > 0 ? filtered : feed.keepUnfiltered ? parsed : []).slice(0, limit);
  return {
    name: feed.source,
    homepage: feed.url,
    status: items.length > 0 ? "ok" : "empty",
    note: filtered.length === 0 && items.length > 0 ? "No oil keyword match. Showing the latest items from this feed." : null,
    error: null,
    items,
  };
}

async function loadNewsApi(key: string, limit: number): Promise<SourceReport> {
  const url =
    "https://newsapi.org/v2/top-headlines?category=business&language=en&pageSize=" +
    `${limit}&apiKey=${encodeURIComponent(key)}`;
  const res = await fetchText(url);
  if (!res.ok) {
    return {
      name: "NewsAPI",
      homepage: "https://newsapi.org/",
      status: "error",
      note: "Optional NEWSAPI_KEY headline supplement.",
      error: res.error,
      items: [],
    };
  }
  let articles: Array<{ title?: unknown; url?: unknown; publishedAt?: unknown; source?: { name?: unknown } }> = [];
  try {
    const parsed = JSON.parse(res.body) as { articles?: typeof articles; status?: string };
    if (parsed.status === "error" || !Array.isArray(parsed.articles)) {
      return {
        name: "NewsAPI",
        homepage: "https://newsapi.org/",
        status: "error",
        note: "Optional NEWSAPI_KEY headline supplement.",
        error: "NewsAPI rejected the request.",
        items: [],
      };
    }
    articles = parsed.articles;
  } catch {
    return {
      name: "NewsAPI",
      homepage: "https://newsapi.org/",
      status: "error",
      note: "Optional NEWSAPI_KEY headline supplement.",
      error: "NewsAPI returned unreadable JSON.",
      items: [],
    };
  }
  const items: Story[] = [];
  for (const article of articles) {
    if (typeof article.title !== "string" || typeof article.url !== "string") continue;
    const publisher = typeof article.source?.name === "string" ? article.source.name : "NewsAPI";
    items.push({
      title: clean(article.title),
      url: article.url,
      published: typeof article.publishedAt === "string" ? article.publishedAt : null,
      source: publisher,
    });
    if (items.length >= limit) break;
  }
  return {
    name: "NewsAPI",
    homepage: "https://newsapi.org/",
    status: items.length > 0 ? "ok" : "empty",
    note: "Optional NEWSAPI_KEY headline supplement.",
    error: null,
    items,
  };
}

function parseRss(xml: string, source: string, limit: number): Story[] {
  const blocks = xml.match(/<item\b[\s\S]*?<\/item>/gi) ?? xml.match(/<entry\b[\s\S]*?<\/entry>/gi) ?? [];
  const items: Story[] = [];
  for (const block of blocks) {
    const title = clean(decode(matchTag(block, "title") ?? ""));
    const url = matchLink(block);
    if (!title || !url) continue;
    const published = matchTag(block, "pubDate") ?? matchTag(block, "published") ?? matchTag(block, "updated");
    items.push({
      title,
      url,
      published: published ? clean(decode(published)) : null,
      source,
    });
    if (items.length >= limit) break;
  }
  return items;
}

function matchTag(block: string, tag: string): string | null {
  const match = block.match(new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)</${tag}>`, "i"));
  return match?.[1] ?? null;
}

function matchLink(block: string): string {
  const tagged = matchTag(block, "link");
  if (tagged && tagged.trim() && !tagged.includes("<")) return decode(tagged).trim();
  const href = block.match(/<link\b[^>]*\bhref=["']([^"']+)["']/i);
  return href?.[1] ? decode(href[1]).trim() : "";
}

function decode(value: string): string {
  return value
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'");
}

function clean(value: string): string {
  return value.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
}

function matches(title: string, keywords: readonly string[]): boolean {
  const haystack = title.toLowerCase();
  return keywords.some((keyword) => haystack.includes(keyword));
}

function dedupe(items: Story[]): Story[] {
  const seen = new Set<string>();
  const out: Story[] = [];
  for (const item of items) {
    const key = item.title.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}

function googleNews(query: string): string {
  const params = new URLSearchParams({ q: query, hl: "en-US", gl: "US", ceid: "US:en" });
  return `https://news.google.com/rss/search?${params.toString()}`;
}

async function fetchText(url: string): Promise<{ ok: boolean; body: string; error: string | null }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      redirect: "follow",
      headers: {
        "user-agent": USER_AGENT,
        accept: "application/rss+xml, application/xml, text/xml, application/json, */*",
      },
    });
    const body = decodeBody(await response.arrayBuffer()).slice(0, 1_000_000);
    if (!response.ok) return { ok: false, body: "", error: `HTTP ${response.status}` };
    if (body.startsWith("<!DOCTYPE html") || body.includes("<title>Just a moment...</title>")) {
      return { ok: false, body: "", error: "The site returned a block page instead of a feed." };
    }
    return { ok: true, body, error: null };
  } catch (err) {
    const aborted = err instanceof Error && err.name === "AbortError";
    return { ok: false, body: "", error: aborted ? "timed out" : "request failed" };
  } finally {
    clearTimeout(timer);
  }
}

function decodeBody(buf: ArrayBuffer): string {
  const sniff = new TextDecoder("utf-8").decode(buf.slice(0, 240));
  const declared = /encoding=["']([A-Za-z0-9._-]+)["']/i.exec(sniff)?.[1] ?? "utf-8";
  try {
    return new TextDecoder(declared).decode(buf);
  } catch {
    return new TextDecoder("utf-8").decode(buf);
  }
}

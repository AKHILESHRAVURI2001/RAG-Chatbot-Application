import { safeFetch } from '../../utils/safeFetch';
import * as cheerio from 'cheerio';
import { crawlerConfig } from '../../config/crawlerConfig';

const MAX_SITEMAP_URLS = 500;

/**
 * Fetches a sitemap.xml (or a sitemap index that itself lists other sitemaps,
 * one level deep) and returns every page URL it contains, so the caller can
 * feed them into the normal one-by-one URL crawl exactly like a pasted list.
 */
export async function loadSitemapUrls(sitemapUrl: string): Promise<string[]> {
  const urls = await fetchLocUrls(sitemapUrl);

  const isSitemapIndex = urls.every((u) => u.toLowerCase().endsWith('.xml'));
  if (isSitemapIndex && urls.length > 0) {
    const nested: string[] = [];
    for (const childSitemap of urls.slice(0, 20)) {
      try {
        nested.push(...(await fetchLocUrls(childSitemap)));
      } catch {
        // one bad child sitemap shouldn't stop the others
      }
      if (nested.length >= MAX_SITEMAP_URLS) break;
    }
    return Array.from(new Set(nested)).slice(0, MAX_SITEMAP_URLS);
  }

  return Array.from(new Set(urls)).slice(0, MAX_SITEMAP_URLS);
}

async function fetchLocUrls(url: string): Promise<string[]> {
  const parsed = new URL(url); // throws on invalid URL
  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new Error('Only http/https URLs are supported');
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), crawlerConfig.timeoutMs);

  try {
    const res = await safeFetch(url, { headers: crawlerConfig.headers, signal: controller.signal });
    if (!res.ok) throw new Error(`Failed to fetch sitemap (${res.status} ${res.statusText})`);

    const xml = await res.text();
    const $ = cheerio.load(xml, { xmlMode: true });
    const locs = $('loc')
      .map((_, el) => $(el).text().trim())
      .get()
      .filter(Boolean);

    if (locs.length === 0) throw new Error('No <loc> URLs found in that sitemap');
    return locs;
  } catch (err: any) {
    if (err.name === 'AbortError' || controller.signal.aborted) {
      throw new Error(`Request timed out after ${crawlerConfig.timeoutMs / 1000}s while fetching sitemap`);
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

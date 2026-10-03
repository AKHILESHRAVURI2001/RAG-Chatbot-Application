import * as cheerio from 'cheerio';
import { crawlerConfig } from '../../config/crawlerConfig';
import { assertPublicHttpUrl, safeFetch } from '../../utils/safeFetch';

export async function loadUrlContent(url: string): Promise<{ title: string; text: string }> {
  await assertPublicHttpUrl(url); // rejects bad schemes and private/internal addresses before anything is fetched

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), crawlerConfig.timeoutMs);

  try {
    const res = await safeFetch(url, {
      headers: crawlerConfig.headers,
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`Failed to fetch URL (${res.status} ${res.statusText})`);

    const html = await res.text();
    const $ = cheerio.load(html);
    $(crawlerConfig.stripSelectors).remove();

    const title = $('title').first().text().trim() || $('h1').first().text().trim() || url;
    const text = $('body').text().replace(/\n{2,}/g, '\n').replace(/[ \t]{2,}/g, ' ').trim();

    if (!text) throw new Error('No readable text found on that page');
    return { title, text };
  } catch (err: any) {
    if (err.name === 'AbortError' || controller.signal.aborted) {
      throw new Error(`Request timed out after ${crawlerConfig.timeoutMs / 1000}s while fetching URL`);
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

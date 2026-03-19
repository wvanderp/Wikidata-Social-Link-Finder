import puppeteer, { Browser } from 'puppeteer';
import { PageFetchResult } from '@wikidata-slf/types';

const PAGE_TIMEOUT_MS = 20_000;
const STABLE_WAIT_MS = 1_500;
const MAX_CONCURRENCY = 3;

let browserInstance: Browser | null = null;
let pendingCount = 0;

async function getBrowser(): Promise<Browser> {
  if (!browserInstance || !browserInstance.connected) {
    browserInstance = await puppeteer.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
      ],
    });
  }
  return browserInstance;
}

export async function closeBrowser(): Promise<void> {
  if (browserInstance) {
    await browserInstance.close();
    browserInstance = null;
  }
}

/**
 * Fetch one page with Puppeteer.
 * Returns rendered HTML plus fetch metadata.
 */
export async function fetchPage(
  url: string,
  generation: 1 | 2,
): Promise<PageFetchResult> {
  // Simple concurrency limiter – wait until a slot is free
  while (pendingCount >= MAX_CONCURRENCY) {
    await new Promise((r) => setTimeout(r, 200));
  }
  pendingCount++;

  const result: PageFetchResult = {
    url,
    finalUrl: url,
    status: 'fetching',
    generation,
  };

  let browser: Browser;
  try {
    browser = await getBrowser();
  } catch (err) {
    pendingCount--;
    result.status = 'failed';
    result.errorMessage = `Browser launch failed: ${err instanceof Error ? err.message : String(err)}`;
    return result;
  }

  const page = await browser.newPage();
  try {
    await page.setUserAgent(
      'WikidataSocialLinkFinder/1.0 (https://github.com/wvanderp/Wikidata-Social-Link-Finder)',
    );
    await page.setDefaultNavigationTimeout(PAGE_TIMEOUT_MS);

    // Intercept resource types we don't need to save bandwidth/time
    await page.setRequestInterception(true);
    page.on('request', (req) => {
      const type = req.resourceType();
      if (['image', 'media', 'font', 'stylesheet'].includes(type)) {
        req.abort();
      } else {
        req.continue();
      }
    });

    const response = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: PAGE_TIMEOUT_MS });
    result.finalUrl = page.url();
    result.httpStatus = response?.status() ?? undefined;

    if (response && !response.ok() && response.status() !== 999) {
      // Some sites return non-200 but still render content; continue
    }

    // Wait briefly for JS-driven content to settle
    await new Promise((r) => setTimeout(r, STABLE_WAIT_MS));

    result.html = await page.content();
    result.status = 'success';
  } catch (err) {
    result.status = 'failed';
    result.errorMessage = err instanceof Error ? err.message : String(err);
  } finally {
    await page.close().catch(() => undefined);
    pendingCount--;
  }

  return result;
}

/**
 * Fetch multiple URLs sequentially (callers manage concurrency).
 */
export async function fetchPages(
  urls: string[],
  generation: 1 | 2,
  onProgress?: (result: PageFetchResult) => void,
): Promise<PageFetchResult[]> {
  const results: PageFetchResult[] = [];
  for (const url of urls) {
    const r = await fetchPage(url, generation);
    results.push(r);
    onProgress?.(r);
  }
  return results;
}

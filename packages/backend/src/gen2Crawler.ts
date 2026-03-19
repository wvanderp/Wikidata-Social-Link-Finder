import { parser } from 'social-profile-url-parser';
import { ProfileGroup, PageFetchResult, CandidateUrl } from '@wikidata-slf/types';
import { fetchPage } from './pageFetcher.js';
import { extractAndGroup } from './profileExtractor.js';

/**
 * Collect recognised social-profile URLs from generation-1 results.
 * Only follows URLs that the parser recognises as social profiles.
 */
function collectSocialProfileUrls(gen1Results: PageFetchResult[]): string[] {
  const urls = new Set<string>();
  for (const page of gen1Results) {
    if (page.status !== 'success' || !page.html) continue;
    const matches = parser(page.html);
    for (const m of matches) {
      urls.add(m.url);
    }
  }
  return Array.from(urls);
}

/**
 * Run the second-generation crawl.
 *
 * Takes the generation-1 page results and profile groups collected so far,
 * fetches recognised social-profile pages, and adds new evidence.
 *
 * @returns Combined generation-2 PageFetchResults and updated profile map.
 */
export async function runGeneration2(
  gen1Results: PageFetchResult[],
  profileMap: Map<string, ProfileGroup>,
  onProgress?: (result: PageFetchResult) => void,
): Promise<{ gen2Results: PageFetchResult[]; gen2CandidateUrls: CandidateUrl[] }> {
  const socialUrls = collectSocialProfileUrls(gen1Results);

  const gen2CandidateUrls: CandidateUrl[] = socialUrls.map((url) => ({
    url,
    sourceKind: 'page-html-gen1' as const,
    generation: 2 as const,
  }));

  const gen2Results: PageFetchResult[] = [];

  for (const url of socialUrls) {
    const result = await fetchPage(url, 2);
    gen2Results.push(result);
    onProgress?.(result);
  }

  // Extract and merge generation-2 profiles into the shared map
  extractAndGroup(gen2Results, profileMap);

  return { gen2Results, gen2CandidateUrls };
}

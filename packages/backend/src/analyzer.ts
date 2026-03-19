import { AnalyzeRequest, AnalyzeResponse, PageFetchResult, CandidateUrl } from '@wikidata-slf/types';
import { discoverCandidateUrls } from './wikidataDiscovery.js';
import { fetchPage } from './pageFetcher.js';
import { extractAndGroup, ingestDirectWikidataProfiles, rankProfiles } from './profileExtractor.js';
import { runGeneration2 } from './gen2Crawler.js';
import { parser } from 'social-profile-url-parser';

/**
 * Run the full analysis pipeline for a given QID.
 *
 * @param req         The analysis request.
 * @param onProgress  Optional callback called after each page fetch.
 */
export async function analyze(
  req: AnalyzeRequest,
  onProgress?: (result: PageFetchResult) => void,
): Promise<AnalyzeResponse> {
  const startMs = Date.now();
  const errors: string[] = [];

  // ---------------------------------------------------------------------------
  // Step 1: Discover candidate seed URLs from Wikidata
  // ---------------------------------------------------------------------------
  const { candidates, errors: discoveryErrors } = await discoverCandidateUrls(req.qid);
  errors.push(...discoveryErrors);

  const allCandidateUrls: CandidateUrl[] = [...candidates];

  // ---------------------------------------------------------------------------
  // Step 2: Ingest direct social links already on the Wikidata item
  // (we run the parser over candidate URL strings from wikidata-url-claim /
  //  wikidata-social-claim entries)
  // ---------------------------------------------------------------------------
  const profileMap = new Map();

  const directUrlTexts = candidates
    .filter((c) => c.sourceKind === 'wikidata-url-claim' || c.sourceKind === 'wikidata-external-id')
    .map((c) => c.url)
    .join('\n');

  if (directUrlTexts) {
    const directMatches = parser(directUrlTexts);
    ingestDirectWikidataProfiles(
      directMatches,
      `https://www.wikidata.org/wiki/${req.qid}`,
      profileMap,
    );
  }

  // ---------------------------------------------------------------------------
  // Step 3: Generation-1 crawl – fetch all Wikidata-derived seed URLs
  // ---------------------------------------------------------------------------
  const gen1Results: PageFetchResult[] = [];
  for (const candidate of candidates) {
    const result = await fetchPage(candidate.url, 1);
    gen1Results.push(result);
    onProgress?.(result);
  }

  extractAndGroup(gen1Results, profileMap);

  // ---------------------------------------------------------------------------
  // Step 4: Generation-2 crawl – follow recognised social-profile URLs only
  // ---------------------------------------------------------------------------
  const { gen2Results, gen2CandidateUrls } = await runGeneration2(
    gen1Results,
    profileMap,
    onProgress,
  );

  allCandidateUrls.push(...gen2CandidateUrls);

  // ---------------------------------------------------------------------------
  // Step 5: Rank and return
  // ---------------------------------------------------------------------------
  const profiles = rankProfiles(profileMap);

  return {
    qid: req.qid,
    candidateUrls: allCandidateUrls,
    pageResults: [...gen1Results, ...gen2Results],
    profiles,
    durationMs: Date.now() - startMs,
    errors,
  };
}

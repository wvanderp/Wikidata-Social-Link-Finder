import { parser } from 'social-profile-url-parser';
import { PageFetchResult, ProfileGroup, SocialProfileEvidence, SourceKind } from '@wikidata-slf/types';

/** Compose the deduplication key for a parsed social profile. */
function profileKey(platformType: string, username: string): string {
  return `${platformType}:${username.toLowerCase()}`;
}

/**
 * Extract social profiles from fetched page HTML and aggregate them
 * into a map of ProfileGroups keyed by `platformType:username`.
 *
 * @param pageResults  The fetched pages to scan.
 * @param existingMap  A mutable map updated in place.
 */
export function extractAndGroup(
  pageResults: PageFetchResult[],
  existingMap: Map<string, ProfileGroup>,
): void {
  for (const page of pageResults) {
    if (page.status !== 'success' || !page.html) continue;

    const matches = parser(page.html);
    const sourceKind: SourceKind =
      page.generation === 1 ? 'page-html-gen1' : 'page-html-gen2';

    // Track which profiles were seen on this page (1 mention per page per profile)
    const seenOnPage = new Set<string>();

    for (const match of matches) {
      const key = profileKey(match.type, match.username);
      if (seenOnPage.has(key)) continue;
      seenOnPage.add(key);

      const evidence: SocialProfileEvidence = {
        profileUrl: match.url,
        platformName: match.name,
        platformType: match.type,
        username: match.username,
        sourcePageUrl: page.finalUrl,
        sourceKind,
        generation: page.generation,
      };

      const existing = existingMap.get(key);
      if (existing) {
        existing.evidence.push(evidence);
        existing.pageCount++;
      } else {
        existingMap.set(key, {
          key,
          platformType: match.type,
          platformName: match.name,
          canonicalUrl: match.url,
          normalizedUsername: match.username.toLowerCase(),
          pageCount: 1,
          evidence: [evidence],
        });
      }
    }
  }
}

/**
 * Ingest direct social-profile claims already present on the Wikidata item.
 * These count as wikidata-social-claim evidence with generation 1.
 *
 * @param directLinks Array of {type, name, url, username} records from the parser
 *                    run on Wikidata claim values.
 * @param existingMap Mutable map updated in place.
 */
export function ingestDirectWikidataProfiles(
  directLinks: { type: string; name: string; url: string; username: string }[],
  wikidataUrl: string,
  existingMap: Map<string, ProfileGroup>,
): void {
  const seenOnPage = new Set<string>();
  for (const match of directLinks) {
    const key = profileKey(match.type, match.username);
    if (seenOnPage.has(key)) continue;
    seenOnPage.add(key);

    const evidence: SocialProfileEvidence = {
      profileUrl: match.url,
      platformName: match.name,
      platformType: match.type,
      username: match.username,
      sourcePageUrl: wikidataUrl,
      sourceKind: 'wikidata-social-claim',
      generation: 1,
    };

    const existing = existingMap.get(key);
    if (existing) {
      existing.evidence.push(evidence);
      existing.pageCount++;
    } else {
      existingMap.set(key, {
        key,
        platformType: match.type,
        platformName: match.name,
        canonicalUrl: match.url,
        normalizedUsername: match.username.toLowerCase(),
        pageCount: 1,
        evidence: [evidence],
      });
    }
  }
}

/**
 * Rank profile groups by distinct-page mentions (descending),
 * then by source diversity, then by platformType alphabetically.
 */
export function rankProfiles(profileMap: Map<string, ProfileGroup>): ProfileGroup[] {
  const groups = Array.from(profileMap.values());

  groups.sort((a, b) => {
    // Primary: page count descending
    if (b.pageCount !== a.pageCount) return b.pageCount - a.pageCount;
    // Secondary: evidence source diversity (unique source kinds) descending
    const diversityA = new Set(a.evidence.map((e) => e.sourceKind)).size;
    const diversityB = new Set(b.evidence.map((e) => e.sourceKind)).size;
    if (diversityB !== diversityA) return diversityB - diversityA;
    // Tertiary: platform type alphabetically
    return a.platformType.localeCompare(b.platformType);
  });

  return groups;
}

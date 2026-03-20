import { parser } from 'social-profile-url-parser';
import { normalizeHttpUrl, SocialProfileEvidence, SourceKind } from '@wikidata-slf/types';
import { InternalPageFetchResult } from './pageFetcher';

function profileKey(platformType: string, username: string): string {
  return `${platformType}:${username.toLowerCase()}`;
}

export function extractProfilesFromPage(page: InternalPageFetchResult): SocialProfileEvidence[] {
  if (page.status !== 'success' || !page.html) {
    return [];
  }

  const matches = parser(page.html);
  const sourceKind: SourceKind = page.generation === 1 ? 'page-html-gen1' : 'page-html-gen2';
  const seenOnPage = new Set<string>();
  const evidence: SocialProfileEvidence[] = [];

  for (const match of matches) {
    const profileUrl = normalizeHttpUrl(match.url);
    if (!profileUrl) {
      continue;
    }

    const key = profileKey(match.type, match.username);
    if (seenOnPage.has(key)) {
      continue;
    }

    seenOnPage.add(key);
    evidence.push({
      profileUrl,
      platformName: match.name,
      platformType: match.type,
      username: match.username,
      normalizedUsername: match.username.toLowerCase(),
      sourcePageUrl: page.finalUrl,
      sourceKind,
      generation: page.generation,
    });
  }

  return evidence;
}

import { parser } from 'social-profile-url-parser';
import type {
  CandidateUrl,
  FetchStatus,
  PageFetchResult,
  ProfileGroup,
  SocialProfileEvidence,
  UrlSource,
} from '@wikidata-slf/types';
import { normalizeHttpUrl } from './urlUtils';

export interface UrlSourceRecord extends UrlSource {
  discoveredUrl: string;
  decision: 'queued' | 'already-known';
}

export interface UrlRecord {
  key: string;
  url: string;
  aliases: string[];
  generation: 1 | 2;
  status: FetchStatus;
  seenCount: number;
  alreadyKnownCount: number;
  sources: UrlSourceRecord[];
  page?: PageFetchResult;
  discoveredEvidenceCount: number;
}

function profileKey(platformType: string, username: string): string {
  return `${platformType}:${username.toLowerCase()}`;
}

function sourceKey(source: UrlSourceRecord): string {
  return [
    source.sourceKind,
    source.generation,
    source.propertyId ?? '',
    source.sourceUrl ?? '',
    source.discoveredUrl,
    source.decision,
  ].join('|');
}

export function normalizeUrlKey(raw: string): string | null {
  const normalized = normalizeHttpUrl(raw);
  if (!normalized) {
    return null;
  }

  const matches = parser(normalized);
  if (matches.length === 1) {
    return normalizeHttpUrl(matches[0].url) ?? normalized;
  }

  return normalized;
}

export function extractDirectWikidataProfiles(
  candidates: CandidateUrl[],
  qid: string,
): SocialProfileEvidence[] {
  const rawText = candidates
    .filter((candidate) => {
      const kind = candidate.source.sourceKind;
      return kind === 'wikidata-url-claim' || kind === 'wikidata-external-id';
    })
    .map((candidate) => candidate.url)
    .join('\n');

  if (!rawText) {
    return [];
  }

  const matches = parser(rawText);
  const seen = new Set<string>();
  const wikidataUrl = `https://www.wikidata.org/wiki/${qid}`;
  const evidence: SocialProfileEvidence[] = [];

  for (const match of matches) {
    const profileUrl = normalizeHttpUrl(match.url);
    if (!profileUrl) {
      continue;
    }

    const key = profileKey(match.type, match.username);
    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    evidence.push({
      profileUrl,
      platformName: match.name,
      platformType: match.type,
      username: match.username,
      normalizedUsername: match.username.toLowerCase(),
      sourcePageUrl: wikidataUrl,
      sourceKind: 'wikidata-social-claim',
      generation: 1,
    });
  }

  return evidence;
}

export function addProfileEvidence(
  profileMap: Map<string, ProfileGroup>,
  evidence: SocialProfileEvidence,
): void {
  const key = profileKey(evidence.platformType, evidence.username);
  const existing = profileMap.get(key);

  if (!existing) {
    profileMap.set(key, {
      key,
      platformType: evidence.platformType,
      platformName: evidence.platformName,
      canonicalUrl: evidence.profileUrl,
      normalizedUsername: evidence.normalizedUsername,
      pageCount: 1,
      evidence: [evidence],
    });
    return;
  }

  const duplicate = existing.evidence.some((item) => {
    return item.sourcePageUrl === evidence.sourcePageUrl && item.sourceKind === evidence.sourceKind;
  });

  if (!duplicate) {
    existing.evidence.push(evidence);
    existing.pageCount = new Set(existing.evidence.map((item) => item.sourcePageUrl)).size;
  }
}

export function rankProfiles(profileMap: Map<string, ProfileGroup>): ProfileGroup[] {
  return Array.from(profileMap.values()).sort((left, right) => {
    if (right.pageCount !== left.pageCount) {
      return right.pageCount - left.pageCount;
    }

    const leftDiversity = new Set(left.evidence.map((item) => item.sourceKind)).size;
    const rightDiversity = new Set(right.evidence.map((item) => item.sourceKind)).size;
    if (rightDiversity !== leftDiversity) {
      return rightDiversity - leftDiversity;
    }

    return left.platformType.localeCompare(right.platformType);
  });
}

export function registerUrlRecord(
  urlMap: Map<string, UrlRecord>,
  candidate: CandidateUrl,
): { action: 'queued' | 'already-known' | 'invalid'; key?: string } {
  const key = normalizeUrlKey(candidate.url);
  if (!key) {
    return { action: 'invalid' };
  }

  const existing = urlMap.get(key);
  const baseSource: Omit<UrlSourceRecord, 'decision'> = {
    ...candidate.source,
    discoveredUrl: candidate.url,
  };

  if (existing) {
    existing.seenCount += 1;
    existing.alreadyKnownCount += 1;
    if (!existing.aliases.includes(candidate.url)) {
      existing.aliases.push(candidate.url);
    }

    const mergedSource: UrlSourceRecord = {
      ...baseSource,
      decision: 'already-known',
    };

    if (!existing.sources.some((item) => sourceKey(item) === sourceKey(mergedSource))) {
      existing.sources.push(mergedSource);
    }

    return { action: 'already-known', key };
  }

  urlMap.set(key, {
    key,
    url: key,
    aliases: candidate.url === key ? [key] : [candidate.url, key],
    generation: candidate.source.generation,
    status: 'pending',
    seenCount: 1,
    alreadyKnownCount: 0,
    sources: [
      {
        ...baseSource,
        decision: 'queued',
      },
    ],
    discoveredEvidenceCount: 0,
  });

  return { action: 'queued', key };
}

export function attachPageResult(
  record: UrlRecord,
  page: PageFetchResult,
  evidenceCount: number,
): void {
  record.page = page;
  record.status = page.status === 'success' ? 'success' : 'failed';
  record.discoveredEvidenceCount = evidenceCount;
  if (!record.aliases.includes(page.finalUrl)) {
    record.aliases.push(page.finalUrl);
  }
}

export function sortUrlRecords(urlMap: Map<string, UrlRecord>): UrlRecord[] {
  const statusOrder: Record<FetchStatus, number> = {
    fetching: 0,
    pending: 1,
    success: 2,
    failed: 3,
    skipped: 4,
  };

  return Array.from(urlMap.values()).sort((left, right) => {
    if (right.seenCount !== left.seenCount) {
      return right.seenCount - left.seenCount;
    }

    const statusDelta = statusOrder[left.status] - statusOrder[right.status];
    if (statusDelta !== 0) {
      return statusDelta;
    }

    if (left.generation !== right.generation) {
      return left.generation - right.generation;
    }

    return left.url.localeCompare(right.url);
  });
}

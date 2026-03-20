/**
 * Shared domain types for Wikidata Social Link Finder.
 */

export type Generation = 1 | 2;

// ---------------------------------------------------------------------------
// Source metadata
// ---------------------------------------------------------------------------

/** How a URL or profile was discovered. */
export type SourceKind =
  | 'wikidata-url-claim'
  | 'wikidata-social-claim'
  | 'wikidata-sitelink'
  | 'wikidata-external-id'
  | 'page-html-gen1'
  | 'page-html-gen2';

// ---------------------------------------------------------------------------
// URL discovery metadata
// ---------------------------------------------------------------------------

export interface UrlSource {
  sourceKind: SourceKind;
  generation: Generation;
  /** The Wikidata property that originated this URL, if any (e.g. "P856"). */
  propertyId?: string;
  /** The page or entity URL from which this URL was discovered. */
  sourceUrl?: string;
}

export interface CandidateUrl {
  url: string;
  source: UrlSource;
}

function truncateMalformedUrlTail(raw: string): string {
  let end = raw.length;
  const literalQuoteIndex = raw.indexOf('"');
  if (literalQuoteIndex >= 0) {
    end = Math.min(end, literalQuoteIndex);
  }

  const encodedQuoteMatch = /%22/i.exec(raw);
  if (encodedQuoteMatch && encodedQuoteMatch.index >= 0) {
    end = Math.min(end, encodedQuoteMatch.index);
  }

  return raw.slice(0, end).trim();
}

export function normalizeHttpUrl(raw: string | undefined | null): string | null {
  if (!raw) {
    return null;
  }

  const sanitized = truncateMalformedUrlTail(raw.trim());
  if (!sanitized) {
    return null;
  }

  try {
    const url = new URL(sanitized);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      return null;
    }
    url.hash = '';
    if (url.pathname.length > 1) {
      url.pathname = url.pathname.replace(/\/+$/, '');
    }
    return url.href;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Page fetch results
// ---------------------------------------------------------------------------

export type FetchStatus = 'pending' | 'fetching' | 'success' | 'failed' | 'skipped';

export interface PageFetchResult {
  url: string;
  finalUrl: string;
  status: FetchStatus;
  /** HTTP status code, undefined when fetch failed at network/timeout level. */
  httpStatus?: number;
  errorMessage?: string;
  generation: Generation;
}

// ---------------------------------------------------------------------------
// Social profile evidence
// ---------------------------------------------------------------------------

export interface SocialProfileEvidence {
  /** The raw URL as extracted. */
  profileUrl: string;
  /** Platform name (e.g. "Twitter", "GitHub"). */
  platformName: string;
  /** Wikidata property type from the parser (e.g. "P2002"). */
  platformType: string;
  /** Extracted username. */
  username: string;
  normalizedUsername: string;
  /** The page from which this profile was extracted. */
  sourcePageUrl: string;
  sourceKind: SourceKind;
  generation: Generation;
}

// ---------------------------------------------------------------------------
// Grouped / ranked results
// ---------------------------------------------------------------------------

/** Primary key is `platformType + ":" + normalizedUsername`. */
export interface ProfileGroup {
  /** Composite key for deduplication. */
  key: string;
  platformType: string;
  platformName: string;
  /** Canonical profile URL (first seen or most authoritative). */
  canonicalUrl: string;
  normalizedUsername: string;
  /** Number of distinct pages that mentioned this profile. */
  pageCount: number;
  evidence: SocialProfileEvidence[];
}

// ---------------------------------------------------------------------------
// API surface
// ---------------------------------------------------------------------------

/** Request body for POST /api/page/analyze */
export interface PageAnalyzeRequest {
  url: string;
  generation: Generation;
}

/** Response body for POST /api/page/analyze */
export interface PageAnalyzeResponse {
  page: PageFetchResult;
  evidence: SocialProfileEvidence[];
}

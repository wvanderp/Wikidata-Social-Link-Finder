/**
 * Shared domain types for Wikidata Social Link Finder.
 */

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
// Candidate URLs (generation 1 seeds from Wikidata)
// ---------------------------------------------------------------------------

export interface CandidateUrl {
  url: string;
  /** The Wikidata property that originated this URL, if any (e.g. "P856"). */
  propertyId?: string;
  sourceKind: SourceKind;
  generation: 1 | 2;
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
  /** Raw HTML content after JS rendering. */
  html?: string;
  generation: 1 | 2;
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
  /** The page from which this profile was extracted. */
  sourcePageUrl: string;
  sourceKind: SourceKind;
  generation: 1 | 2;
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

/** Request body for POST /api/analyze */
export interface AnalyzeRequest {
  qid: string;
}

/** Sent once the crawl is complete. */
export interface AnalyzeResponse {
  qid: string;
  candidateUrls: CandidateUrl[];
  pageResults: PageFetchResult[];
  profiles: ProfileGroup[];
  durationMs: number;
  errors: string[];
}

/** Progress event pushed per fetched page (SSE or polling). */
export interface ProgressEvent {
  type: 'page_fetch';
  page: PageFetchResult;
}

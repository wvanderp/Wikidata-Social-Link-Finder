import type { CandidateUrl } from '@wikidata-slf/types';
import { normalizeHttpUrl } from './urlUtils';

const WIKIDATA_API_URL = 'https://www.wikidata.org/w/api.php';

type EntityMap = Record<string, WikidataEntity>;

interface WikidataApiResponse {
  entities?: EntityMap;
}

interface WikidataEntity {
  claims?: Record<string, WikidataStatement[]>;
  sitelinks?: Record<string, WikidataSitelink>;
}

interface WikidataStatement {
  mainsnak?: WikidataSnak;
}

interface WikidataSnak {
  snaktype?: string;
  datatype?: string;
  datavalue?: {
    value?: unknown;
  };
}

interface WikidataSitelink {
  site: string;
  title: string;
}

interface ExternalIdClaim {
  propertyId: string;
  id: string;
}

export interface WikidataDiscoveryResult {
  candidates: CandidateUrl[];
  errors: string[];
}

function buildApiUrl(params: Record<string, string>): string {
  const url = new URL(WIKIDATA_API_URL);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }
  return url.href;
}

async function fetchWikidataJson(url: string, signal: AbortSignal): Promise<WikidataApiResponse> {
  const response = await fetch(url, { signal });
  if (!response.ok) {
    throw new Error(`Wikidata request failed with ${response.status}`);
  }
  return (await response.json()) as WikidataApiResponse;
}

function asString(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function buildSitelinkUrl(site: string, title: string): string | null {
  const encodedTitle = encodeURIComponent(title.replace(/ /g, '_'));

  if (site.endsWith('wikiquote')) {
    const lang = site.slice(0, -'wikiquote'.length);
    return `https://${lang}.wikiquote.org/wiki/${encodedTitle}`;
  }

  if (site.endsWith('wikinews')) {
    const lang = site.slice(0, -'wikinews'.length);
    return `https://${lang}.wikinews.org/wiki/${encodedTitle}`;
  }

  if (site.endsWith('wikibooks')) {
    const lang = site.slice(0, -'wikibooks'.length);
    return `https://${lang}.wikibooks.org/wiki/${encodedTitle}`;
  }

  if (site.endsWith('wiki')) {
    const lang = site.slice(0, -'wiki'.length);
    if (lang === 'commons' || lang === 'meta' || lang === 'species') {
      return null;
    }
    return `https://${lang}.wikipedia.org/wiki/${encodedTitle}`;
  }

  return null;
}

async function loadFormatterUrls(
  propertyIds: string[],
  signal: AbortSignal,
): Promise<Map<string, string | null>> {
  const formatterUrls = new Map<string, string | null>();
  const uniqueIds = Array.from(new Set(propertyIds));

  for (let index = 0; index < uniqueIds.length; index += 40) {
    const batch = uniqueIds.slice(index, index + 40);
    const response = await fetchWikidataJson(
      buildApiUrl({
        action: 'wbgetentities',
        ids: batch.join('|'),
        props: 'claims',
        format: 'json',
        origin: '*',
      }),
      signal,
    );

    for (const propertyId of batch) {
      const entity = response.entities?.[propertyId];
      const formatterClaim = entity?.claims?.P1630?.[0]?.mainsnak;
      formatterUrls.set(propertyId, asString(formatterClaim?.datavalue?.value));
    }
  }

  return formatterUrls;
}

export async function discoverCandidateUrls(
  qid: string,
  signal: AbortSignal,
): Promise<WikidataDiscoveryResult> {
  const warnings: string[] = [];
  const candidates: CandidateUrl[] = [];
  const wikidataUrl = `https://www.wikidata.org/wiki/${qid}`;

  const response = await fetchWikidataJson(
    buildApiUrl({
      action: 'wbgetentities',
      ids: qid,
      props: 'claims|sitelinks',
      languages: 'en',
      format: 'json',
      origin: '*',
    }),
    signal,
  );

  const entity = response.entities?.[qid];
  if (!entity) {
    throw new Error(`Wikidata item ${qid} was not found`);
  }

  const externalIds: ExternalIdClaim[] = [];

  for (const [propertyId, statements] of Object.entries(entity.claims ?? {})) {
    for (const statement of statements) {
      const mainsnak = statement.mainsnak;
      if (mainsnak?.snaktype !== 'value') {
        continue;
      }

      if (mainsnak.datatype === 'url') {
        const url = normalizeHttpUrl(asString(mainsnak.datavalue?.value));
        if (!url) {
          continue;
        }

        candidates.push({
          url,
          source: {
            sourceKind: 'wikidata-url-claim',
            generation: 1,
            propertyId,
            sourceUrl: wikidataUrl,
          },
        });
      }

      if (mainsnak.datatype === 'external-id') {
        const id = asString(mainsnak.datavalue?.value);
        if (id) {
          externalIds.push({ propertyId, id });
        }
      }
    }
  }

  if (externalIds.length > 0) {
    const formatterUrls = await loadFormatterUrls(
      externalIds.map((claim) => claim.propertyId),
      signal,
    );

    for (const claim of externalIds) {
      const formatter = formatterUrls.get(claim.propertyId);
      if (!formatter) {
        warnings.push(`No formatter URL available for ${claim.propertyId}`);
        continue;
      }

      const expandedUrl = normalizeHttpUrl(formatter.replace('$1', encodeURIComponent(claim.id)));
      if (!expandedUrl) {
        warnings.push(`Expanded external ID ${claim.propertyId}=${claim.id} did not produce a valid URL`);
        continue;
      }

      candidates.push({
        url: expandedUrl,
        source: {
          sourceKind: 'wikidata-external-id',
          generation: 1,
          propertyId: claim.propertyId,
          sourceUrl: wikidataUrl,
        },
      });
    }
  }

  for (const sitelink of Object.values(entity.sitelinks ?? {})) {
    const sitelinkUrl = buildSitelinkUrl(sitelink.site, sitelink.title);
    const normalizedUrl = normalizeHttpUrl(sitelinkUrl);
    if (!normalizedUrl) {
      continue;
    }

    candidates.push({
      url: normalizedUrl,
      source: {
        sourceKind: 'wikidata-sitelink',
        generation: 1,
        sourceUrl: wikidataUrl,
      },
    });
  }

  return { candidates, errors: warnings };
}

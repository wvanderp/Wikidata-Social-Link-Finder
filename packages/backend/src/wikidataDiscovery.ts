import { CandidateUrl, SourceKind } from '@wikidata-slf/types';
import { requestItem, isURLSnak, isExternalIdentifierSnak } from 'iwf';
import { resolveFormatterUrl } from './formatterUrl.js';

const USER_AGENT = 'WikidataSocialLinkFinder/1.0 (https://github.com/wvanderp/Wikidata-Social-Link-Finder)';

/**
 * Normalise and validate a URL string.
 * Returns null for non-http(s) schemes or malformed URLs.
 */
function normaliseUrl(raw: string | undefined | null): string | null {
  if (!raw) return null;
  try {
    const u = new URL(raw);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
    return u.href;
  } catch {
    return null;
  }
}

/**
 * Resolve all candidate seed URLs for a Wikidata QID.
 * Returns deduplicated CandidateUrl records with provenance.
 */
export async function discoverCandidateUrls(qid: string): Promise<{
  candidates: CandidateUrl[];
  errors: string[];
}> {
  const errors: string[] = [];
  const seen = new Set<string>();
  const candidates: CandidateUrl[] = [];

  function add(url: string, propertyId: string | undefined, sourceKind: SourceKind): void {
    const normalised = normaliseUrl(url);
    if (!normalised) return;
    if (seen.has(normalised)) return;
    seen.add(normalised);
    candidates.push({ url: normalised, propertyId, sourceKind, generation: 1 });
  }

  let item;
  try {
    item = await requestItem(qid, { userAgent: USER_AGENT });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    errors.push(`Failed to fetch Wikidata item ${qid}: ${msg}`);
    return { candidates, errors };
  }

  // 1. URL claims (e.g. P856 official website, P18, etc.)
  for (const statement of item.statements) {
    if (isURLSnak(statement.mainsnak)) {
      const url = statement.mainsnak.url;
      if (url) {
        add(url, statement.mainsnak.property, 'wikidata-url-claim');
      }
    }
  }

  // 2. External-ID claims – expand via formatter URL
  for (const statement of item.statements) {
    if (isExternalIdentifierSnak(statement.mainsnak)) {
      const { property, id } = statement.mainsnak;
      if (!id || !property) continue;
      try {
        const formatter = await resolveFormatterUrl(property);
        if (formatter) {
          const expanded = formatter.replace('$1', encodeURIComponent(id));
          add(expanded, property, 'wikidata-external-id');
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        errors.push(`Could not expand external ID ${property}=${id}: ${msg}`);
      }
    }
  }

  // 3. Sitelinks – convert to canonical Wikipedia / other wiki URLs
  for (const sitelink of item.sitelinks) {
    try {
      const site = sitelink.site;
      const title = encodeURIComponent(sitelink.title.replace(/ /g, '_'));
      let url: string | null = null;
      if (site.endsWith('wiki') && !site.endsWith('wikimedia')) {
        const lang = site.replace(/wiki$/, '');
        url = `https://${lang}.wikipedia.org/wiki/${title}`;
      } else if (site.endsWith('wikiquote')) {
        const lang = site.replace(/wikiquote$/, '');
        url = `https://${lang}.wikiquote.org/wiki/${title}`;
      } else if (site.endsWith('wikinews')) {
        const lang = site.replace(/wikinews$/, '');
        url = `https://${lang}.wikinews.org/wiki/${title}`;
      }
      if (url) add(url, undefined, 'wikidata-sitelink');
    } catch {
      // skip malformed sitelinks
    }
  }

  return { candidates, errors };
}

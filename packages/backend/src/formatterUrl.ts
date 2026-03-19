import https from 'https';

/** Simple in-process cache to avoid repeated Wikidata API calls. */
const cache = new Map<string, string | null>();

/**
 * Fetch the formatter URL (P1630) for a Wikidata property.
 * Returns null when the property has no formatter URL.
 */
export async function resolveFormatterUrl(propertyId: string): Promise<string | null> {
  if (cache.has(propertyId)) {
    return cache.get(propertyId) ?? null;
  }

  const url =
    `https://www.wikidata.org/w/api.php?action=wbgetentities` +
    `&ids=${encodeURIComponent(propertyId)}&props=claims&format=json`;

  try {
    const body = await fetchJson(url);
    const entity = (body?.entities as Record<string, unknown> | undefined)?.[propertyId] as Record<string, unknown> | undefined;
    if (!entity) {
      cache.set(propertyId, null);
      return null;
    }
    // P1630 is the "formatter URL" property
    const claims = (entity.claims as Record<string, unknown>)?.['P1630'] as unknown[] | undefined;
    if (!Array.isArray(claims) || claims.length === 0) {
      cache.set(propertyId, null);
      return null;
    }
    const mainsnak = (claims[0] as Record<string, unknown>)?.['mainsnak'] as Record<string, unknown> | undefined;
    const formatter: string | null =
      mainsnak?.['snaktype'] === 'value' && mainsnak?.['datavalue']
        ? String((mainsnak['datavalue'] as Record<string, unknown>)['value'])
        : null;
    cache.set(propertyId, formatter);
    return formatter;
  } catch {
    cache.set(propertyId, null);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Simple HTTPS GET helper (avoids a heavy dependency for a single use-case)
// ---------------------------------------------------------------------------

function fetchJson(url: string): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    const req = https.get(
      url,
      {
        headers: {
          'User-Agent':
            'WikidataSocialLinkFinder/1.0 (https://github.com/wvanderp/Wikidata-Social-Link-Finder)',
        },
        timeout: 10_000,
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (c: Buffer) => chunks.push(c));
        res.on('end', () => {
          try {
            resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')) as Record<string, unknown>);
          } catch (e) {
            reject(e);
          }
        });
        res.on('error', reject);
      },
    );
    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error(`Timeout fetching ${url}`));
    });
  });
}

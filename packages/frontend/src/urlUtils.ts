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

# Wikidata Social Link Finder

A monorepo application that discovers social media profiles linked to a Wikidata entity.

Given a Wikidata QID (e.g. `Q42`), the tool:

1. **Discovers candidate URLs in the frontend** from the Wikidata item (URL claims, external IDs expanded via formatter URLs, sitelinks).
2. **Keeps all crawl state in the frontend**: known URLs, queued URLs, in-flight URLs, finished URLs, failed URLs, seen counts, and per-URL sources.
3. **Analyzes one page at a time through the backend** using Puppeteer.
4. **Extracts social profiles** from fetched HTML using `social-profile-url-parser`.
5. **Deduplicates generation 2 URLs against everything already seen**, so a URL first seen in generation 1 is not re-analyzed in generation 2.
6. **Groups and ranks** profiles by the number of distinct pages mentioning them, with evidence showing exactly how each profile was found.

## Packages

| Package | Description |
|---------|-------------|
| `packages/types` | Shared TypeScript domain types |
| `packages/backend` | Express + TypeScript API server for page fetch and extraction |
| `packages/frontend` | React + TypeScript UI (Vite), including Wikidata discovery, dedupe, and crawl state |

## Quick start

```bash
# Install all workspace dependencies
pnpm install

# Build all packages (types → backend → frontend)
pnpm build

# Start backend (port 3001)
pnpm --filter @wikidata-slf/backend start

# In another terminal: start frontend dev server (port 5173, proxies /api to 3001)
pnpm --filter @wikidata-slf/frontend dev
```

Then open `http://localhost:5173` and enter a QID.

## API

### `GET /api/health`

Returns `{ status: "ok" }`.

### `POST /api/page/analyze`

Body: `{ "url": "https://example.org", "generation": 1 }`

Fetches one page with Puppeteer and returns:

```json
{
  "page": {
    "url": "https://example.org",
    "finalUrl": "https://example.org/",
    "status": "success",
    "generation": 1,
    "httpStatus": 200
  },
  "evidence": [
    {
      "profileUrl": "https://github.com/example",
      "platformName": "GitHub",
      "platformType": "P2037",
      "username": "example",
      "normalizedUsername": "example",
      "sourcePageUrl": "https://example.org/",
      "sourceKind": "page-html-gen1",
      "generation": 1
    }
  ]
}
```

## Architecture

```
Frontend
    │
    ├─ fetch Wikidata item and property metadata
    ├─ build candidate URL list with source provenance
    ├─ dedupe URLs across both generations
    ├─ track seen counts and source lists per URL
    ├─ schedule generation 1 then generation 2
    └─ rank grouped social profiles
                │
                ▼
Backend `/api/page/analyze`
    │
    ├─ fetch page in Puppeteer
    └─ extract social-profile evidence from HTML
```

## Crawl depth

- **Generation 1**: all Wikidata-derived seed URLs.
- **Generation 2**: only recognised social-profile URLs found in generation-1 pages.
- Crawl stops after generation 2.

## Ranking

Profiles are ranked by the number of **distinct pages** that mention them (not total raw occurrences). Ties are broken by source diversity then platform name.

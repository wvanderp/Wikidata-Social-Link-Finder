# Wikidata Social Link Finder

A monorepo application that discovers social media profiles linked to a Wikidata entity.

Given a Wikidata QID (e.g. `Q42`), the tool:

1. **Discovers candidate URLs** from the Wikidata item (URL claims, external IDs expanded via formatter URLs, sitelinks).
2. **Crawls those pages** using Puppeteer (generation 1).
3. **Extracts social profiles** from the fetched HTML using `social-profile-url-parser`.
4. **Follows social-profile URLs** discovered in generation 1 (generation 2, social pages only).
5. **Groups and ranks** profiles by the number of distinct pages mentioning them.
6. **Returns structured results** with evidence showing exactly how each profile was found.

## Packages

| Package | Description |
|---------|-------------|
| `packages/types` | Shared TypeScript domain types |
| `packages/backend` | Express + TypeScript API server (Puppeteer crawl) |
| `packages/frontend` | React + TypeScript UI (Vite) |

## Quick start

```bash
# Install all workspace dependencies
npm install

# Build all packages (types → backend → frontend)
npm run build

# Start backend (port 3001)
npm run start -w packages/backend

# In another terminal: start frontend dev server (port 5173, proxies /api to 3001)
npm run dev -w packages/frontend
```

Then open `http://localhost:5173` and enter a QID.

## API

### `GET /api/health`

Returns `{ status: "ok" }`.

### `POST /api/analyze`

Body: `{ "qid": "Q42" }`

Runs the full crawl synchronously and returns an `AnalyzeResponse` JSON object.

### `GET /api/analyze/stream?qid=Q42`

Server-Sent Events (SSE) endpoint. Emits:

- `{ type: "page_fetch", page: PageFetchResult }` — after each page is fetched.
- `{ type: "complete", result: AnalyzeResponse }` — when the crawl finishes.
- `{ type: "error", message: string }` — on fatal errors.

## Architecture

```
Wikidata API
    │
    ▼
discoverCandidateUrls()   ← iwf (requestItem)
    │                     ← formatterUrl (P1630 lookup for external IDs)
    │
    ▼ Generation 1 seed URLs
fetchPages() via Puppeteer
    │
    ▼
extractAndGroup()         ← social-profile-url-parser
    │
    ▼ Recognized social-profile URLs only
fetchPages() via Puppeteer (Generation 2)
    │
    ▼
extractAndGroup()
    │
    ▼
rankProfiles()            ← by distinct-page mentions
    │
    ▼
AnalyzeResponse
```

## Crawl depth

- **Generation 1**: all Wikidata-derived seed URLs.
- **Generation 2**: only recognised social-profile URLs found in generation-1 pages.
- Crawl stops after generation 2.

## Ranking

Profiles are ranked by the number of **distinct pages** that mention them (not total raw occurrences). Ties are broken by source diversity then platform name.

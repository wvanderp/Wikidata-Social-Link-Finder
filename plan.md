## Plan: Wikidata Social Link Finder

Build a minimal npm-workspaces monorepo with a React + TypeScript frontend and a Node + TypeScript backend. The backend will use `iwf` to resolve a Wikidata QID into candidate URLs, use Wikidata formatter URLs to expand external IDs, fetch pages in Chrome via Puppeteer, extract social profiles with `social-profile-url-parser`, and return ranked results grouped by normalized profile with source-page evidence.

The crawl is limited to two generations:

- **Generation 1**: all Wikidata-derived seed URLs.
- **Generation 2**: only recognized social-profile URLs discovered in generation 1.
- Stop after generation 2.

## Steps

1. **Initialize repository structure**
   - Create a monorepo with separate frontend and backend packages.
   - Add shared workspace tooling for TypeScript, linting, and scripts.
   - Keep the first version server-render agnostic: React app + JSON API only.

2. **Define backend domain model** _blocks 3–7_
   - Define request/response types for:
     - input QID
     - discovered candidate URLs
     - per-page fetch status
     - extracted social profile matches
     - grouped/ranked result rows
     - evidence/source records
   - Include source metadata so results can show whether a profile came from:
     - direct Wikidata claims
     - expanded external-ID URLs
     - fetched page HTML
   - Record crawl generation, source URL, source kind, and fetch status for each hit.
   - Define ranking as the number of distinct pages mentioning the normalized profile.

3. **Implement Wikidata candidate discovery** _depends on 2_
   - Use `requestItem()` from `iwf` with a proper user agent.
   - Extract:
     - direct URL claims
     - direct social-profile claims
     - sitelinks worth turning into URLs
     - external IDs that can be expanded via property formatter URLs
     - reference/source URLs where practical
   - Normalize and deduplicate candidate URLs before crawling.
   - Keep URL provenance so the UI can show how each URL was discovered.

4. **Implement external-ID expansion strategy** _depends on 3_
   - For each external-ID property, resolve formatter URLs from Wikidata property metadata.
   - Generate concrete URLs from ID values only when a formatter exists.
   - Exclude unsupported IDs instead of inventing custom mappings in v1.
   - Add safeguards for malformed IDs, duplicate expansions, and non-http(s) outputs.

5. **Implement page fetching with Chrome** _depends on 2, 3_
   - Use Puppeteer on the backend.
   - Build a page-fetch pipeline with:
     - timeout policy
     - redirect handling
     - per-page status reporting
     - limited concurrency on the backend even if the frontend queues sequentially
   - Fetch rendered HTML after a stable load condition suitable for JS-heavy pages.
   - Record failures per page instead of failing the whole run.

6. **Implement social-profile extraction and grouping** _depends on 5_
   - Run `parser()` from `social-profile-url-parser` on fetched HTML.
   - Also ingest direct social links already present on the Wikidata item.
   - Group by normalized profile identity, using `type + username` as the primary key.
   - Preserve evidence:
     - profile URL
     - platform/property type
     - source page URL
     - source kind
     - crawl generation
   - Because the parser deduplicates within an input string, define page-level presence as one mention per normalized profile per fetched page.

7. **Implement second-generation social crawl** _depends on 6_
   - From generation-1 results, collect only recognized social-profile URLs.
   - Fetch those profile pages as generation 2.
   - Extract any additional social profiles from them.
   - Do not follow non-social links from social pages.
   - Do not crawl beyond generation 2.

8. **Implement ranking and result shaping** _depends on 6, 7_
   - Rank profiles by count of distinct pages mentioning them.
   - Break ties deterministically, for example by source diversity and then platform/profile label.
   - Return grouped results with:
     - platform name
     - canonical profile URL
     - normalized username
     - page-count score
     - evidence list
     - discovery-source summary

9. **Implement backend API surface** _depends on 2–8_
   - Expose endpoints for starting analysis for a QID and returning structured results.
   - Keep the API stateless per request unless progress UX requires lightweight run state.
   - Support the frontend's sequential request handling and per-page progress updates.

10. **Implement frontend MVP flow** _depends on 2, 9_
    - Build a single-page UI with:
      - QID input
      - run action
      - queue/progress display per discovered page
      - ranked grouped result list
    - Show source badges distinguishing:
      - direct Wikidata discovery
      - discovered-via-page evidence
      - generation-2 social crawl evidence
    - Keep the interface simple and readable rather than adding export/history/auth.

11. **Add observability and guardrails**
    - Log crawl decisions and failures clearly.
    - Surface skipped URLs, failed loads, and unsupported formatter cases.
    - Add rate limiting and polite defaults for external page fetching.

12. **Verify end to end**
    - Test against a few known QIDs with official websites and recognizable social links.
    - Confirm:
      - candidate URL discovery is sensible
      - external IDs become valid URLs when formatter URLs exist
      - Puppeteer can render and fetch HTML locally
      - grouped results include both direct Wikidata links and crawled discoveries
      - generation-2 crawling only follows recognized social-profile URLs
      - the crawler stops after generation 2
      - ranking reflects distinct-page mentions, not duplicate markup on the same page

## Relevant files

- This plan is tracked in `plan.md`.
- The implementation will create a monorepo with separate frontend and backend packages plus shared TypeScript types.

## Decisions

- Use a monorepo with separate frontend and backend packages.
- Use Puppeteer for Chrome automation.
- Include both direct Wikidata social links and crawled discoveries, with sources shown.
- Convert external IDs to URLs using Wikidata formatter URLs.
- Frontend manages the queue and sends requests sequentially.
- UI scope for v1 is limited to QID input, progress/status, and ranked grouped results.
- Ranking is by number of distinct pages mentioning a profile, not total raw repeated matches.
- Crawl depth is capped at two generations:
  - generation 1 = all Wikidata-derived seed URLs
  - generation 2 = only recognized social-profile URLs found in generation 1
  - stop after that

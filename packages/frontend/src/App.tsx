import type { PageAnalyzeResponse, ProfileGroup, SourceKind } from '@wikidata-slf/types';
import { startTransition, useDeferredValue, useRef, useState } from 'react';
import {
  addProfileEvidence,
  attachPageResult,
  extractDirectWikidataProfiles,
  normalizeUrlKey,
  rankProfiles,
  registerUrlRecord,
  sortUrlRecords,
  type UrlRecord,
} from './crawlModel';
import { discoverCandidateUrls } from './wikidata';

const SOURCE_LABELS: Record<SourceKind, string> = {
  'wikidata-url-claim': 'Wikidata URL',
  'wikidata-social-claim': 'Wikidata Social',
  'wikidata-sitelink': 'Sitelink',
  'wikidata-external-id': 'External ID',
  'page-html-gen1': 'Page Gen 1',
  'page-html-gen2': 'Page Gen 2',
};

interface RunViewModel {
  qid: string;
  warnings: string[];
  urls: UrlRecord[];
  profiles: ProfileGroup[];
  startedAt: number;
  finishedAt?: number;
}

function formatStatus(status: UrlRecord['status']): string {
  switch (status) {
    case 'pending':
      return 'Will analyze';
    case 'fetching':
      return 'Analyzing';
    case 'success':
      return 'Analyzed';
    case 'failed':
      return 'Failed';
    case 'skipped':
      return 'Skipped';
    default:
      return status;
  }
}

function formatDuration(run: RunViewModel | null): string | null {
  if (!run) {
    return null;
  }

  const end = run.finishedAt ?? Date.now();
  return `${((end - run.startedAt) / 1000).toFixed(1)}s`;
}

function Badge({ kind }: { kind: SourceKind }) {
  return <span className={`source-badge source-badge--${kind}`}>{SOURCE_LABELS[kind]}</span>;
}

function StatusPill({ status }: { status: UrlRecord['status'] }) {
  return <span className={`status-pill status-pill--${status}`}>{formatStatus(status)}</span>;
}

function formatSourceLocation(source: UrlRecord['sources'][number]): string {
  if (source.sourceUrl) {
    return source.sourceUrl;
  }

  if (source.sourceKind === 'wikidata-social-claim' || source.sourceKind === 'wikidata-url-claim') {
    return 'Wikidata';
  }

  return 'Unknown source';
}

function QidInput({
  onSubmit,
  onCancel,
  loading,
}: {
  onSubmit: (qid: string) => void;
  onCancel: () => void;
  loading: boolean;
}) {
  const [value, setValue] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    const qid = value.trim().toUpperCase();
    if (!/^Q\d+$/.test(qid)) {
      setError('Enter a valid Wikidata QID, for example Q42.');
      return;
    }

    setError('');
    onSubmit(qid);
  };

  return (
    <form className="hero__form" onSubmit={handleSubmit}>
      <label className="hero__field">
        <span className="hero__label">Wikidata item</span>
        <input
          className="hero__input"
          type="text"
          value={value}
          onChange={(event) => setValue(event.target.value)}
          placeholder="Q42"
          disabled={loading}
        />
        {error ? <span className="hero__error">{error}</span> : null}
      </label>
      <div className="hero__actions">
        <button className="button button--primary" type="submit" disabled={loading}>
          {loading ? 'Running crawl' : 'Analyze entity'}
        </button>
        <button className="button button--ghost" type="button" onClick={onCancel} disabled={!loading}>
          Stop
        </button>
      </div>
    </form>
  );
}

function SummaryCard({ label, value, accent }: { label: string; value: number | string; accent: string }) {
  return (
    <article className="summary-card">
      <span className="summary-card__label">{label}</span>
      <strong className="summary-card__value" style={{ color: accent }}>
        {value}
      </strong>
    </article>
  );
}

function groupProfilesByPage(profiles: ProfileGroup[]): Map<string, ProfileGroup[]> {
  const grouped = new Map<string, ProfileGroup[]>();

  for (const group of profiles) {
    for (const item of group.evidence) {
      const key = normalizeUrlKey(item.sourcePageUrl);
      if (!key) {
        continue;
      }

      const existing = grouped.get(key);
      if (!existing) {
        grouped.set(key, [group]);
        continue;
      }

      if (!existing.some((entry) => entry.key === group.key)) {
        existing.push(group);
      }
    }
  }

  for (const list of grouped.values()) {
    list.sort((left, right) => {
      if (right.pageCount !== left.pageCount) {
        return right.pageCount - left.pageCount;
      }

      if (right.evidence.length !== left.evidence.length) {
        return right.evidence.length - left.evidence.length;
      }

      return left.platformType.localeCompare(right.platformType);
    });
  }

  return grouped;
}

function getProfilesForRecord(
  record: UrlRecord,
  profilesByPage: Map<string, ProfileGroup[]>,
): ProfileGroup[] {
  const keys = new Set<string>();
  keys.add(record.url);

  for (const alias of record.aliases) {
    const key = normalizeUrlKey(alias);
    if (key) {
      keys.add(key);
    }
  }

  if (record.page?.finalUrl) {
    const finalUrlKey = normalizeUrlKey(record.page.finalUrl);
    if (finalUrlKey) {
      keys.add(finalUrlKey);
    }
  }

  const matchingGroups = new Map<string, ProfileGroup>();
  for (const key of keys) {
    for (const group of profilesByPage.get(key) ?? []) {
      matchingGroups.set(group.key, group);
    }
  }

  return Array.from(matchingGroups.values());
}

function CompactInventoryRow({
  record,
  profiles,
}: {
  record: UrlRecord;
  profiles: ProfileGroup[];
}) {
  const visibleProfiles = profiles.slice(0, 3);
  const hiddenProfileCount = Math.max(profiles.length - visibleProfiles.length, 0);

  return (
    <article className="inventory-row">
      <div className="inventory-row__summary">
        <div className="inventory-row__status">
          <StatusPill status={record.status} />
        </div>

        <div className="inventory-row__main">
          <a className="inventory-row__link" href={record.url} target="_blank" rel="noopener noreferrer">
            {record.url}
          </a>
          <div className="inventory-row__meta">
            <span className="generation-pill">Gen {record.generation}</span>
            <span className="url-card__metric">{record.sources.length} source{record.sources.length === 1 ? '' : 's'}</span>
            {record.alreadyKnownCount > 0 ? (
              <span className="url-card__metric">Re-seen {record.alreadyKnownCount}x</span>
            ) : null}
            {record.page?.httpStatus != null ? <span className="url-card__metric">HTTP {record.page.httpStatus}</span> : null}
            {record.discoveredEvidenceCount > 0 ? (
              <span className="url-card__metric">{record.discoveredEvidenceCount} links found</span>
            ) : null}
          </div>


          {record.page?.finalUrl && record.page.finalUrl !== record.url ? (
            <div className="inventory-row__redirect">Final URL: {record.page.finalUrl}</div>
          ) : null}

          {record.page?.errorMessage ? <div className="inventory-row__error">{record.page.errorMessage}</div> : null}
        </div>

        <div className="inventory-row__count">
          <strong>{record.seenCount}</strong>
          <span>seen</span>
        </div>

        <div className="inventory-row__count">
          <strong>{profiles.length}</strong>
          <span>profiles</span>
        </div>
      </div>

      <details className="inventory-row__details">
        <summary>Details</summary>

        {record.aliases.length > 1 ? (
          <div className="inventory-row__detail-block">
            <strong>Aliases</strong>
            <div className="inventory-row__detail-list">
              {record.aliases.map((alias) => (
                <span className="inventory-row__detail-chip" key={alias}>
                  {alias}
                </span>
              ))}
            </div>
          </div>
        ) : null}

        <div className="inventory-row__detail-block">
          <strong>Sources ({record.sources.length})</strong>
        <div className="source-list">
          {record.sources.map((source, index) => (
            <div className="source-row" key={`${source.discoveredUrl}-${source.sourceKind}-${index}`}>
              <div className="source-row__badges">
                <Badge kind={source.sourceKind} />
                <span className={`decision-pill decision-pill--${source.decision}`}>{source.decision}</span>
                {source.propertyId ? <span className="decision-pill">{source.propertyId}</span> : null}
              </div>
              <div className="source-row__content">
                <span>Found on</span>
                {source.sourceUrl ? (
                  <a href={source.sourceUrl} target="_blank" rel="noopener noreferrer">
                    {formatSourceLocation(source)}
                  </a>
                ) : (
                  <span>{formatSourceLocation(source)}</span>
                )}
              </div>
            </div>
          ))}
        </div>
        </div>
      </details>
    </article>
  );
}

export default function App() {
  const [loading, setLoading] = useState(false);
  const [run, setRun] = useState<RunViewModel | null>(null);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const runIdRef = useRef(0);

  const deferredUrls = useDeferredValue(run?.urls ?? []);
  const deferredProfiles = useDeferredValue(run?.profiles ?? []);
  const profilesByPage = groupProfilesByPage(deferredProfiles);

  const stopRun = () => {
    abortRef.current?.abort();
  };

  const publishRun = (
    runId: number,
    qid: string,
    warnings: string[],
    urlMap: Map<string, UrlRecord>,
    profileMap: Map<string, ProfileGroup>,
    startedAt: number,
    finishedAt?: number,
  ) => {
    if (runId !== runIdRef.current) {
      return;
    }

    startTransition(() => {
      setRun({
        qid,
        warnings: [...warnings],
        urls: sortUrlRecords(urlMap),
        profiles: rankProfiles(profileMap),
        startedAt,
        finishedAt,
      });
    });
  };

  const handleSubmit = async (qid: string) => {
    runIdRef.current += 1;
    const runId = runIdRef.current;

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    const startedAt = Date.now();
    const warnings: string[] = [];
    const urlMap = new Map<string, UrlRecord>();
    const profileMap = new Map<string, ProfileGroup>();
    const generation1Queue: string[] = [];
    const generation2Queue: string[] = [];

    setLoading(true);
    setError(null);
    publishRun(runId, qid, warnings, urlMap, profileMap, startedAt);

    const analyzeQueue = async (queue: string[], generation: 1 | 2) => {
      for (const key of queue) {
        if (controller.signal.aborted) {
          throw new DOMException('Aborted', 'AbortError');
        }

        const record = urlMap.get(key);
        if (!record || record.status !== 'pending') {
          continue;
        }

        record.status = 'fetching';
        publishRun(runId, qid, warnings, urlMap, profileMap, startedAt);

        try {
          const response = await fetch('/api/page/analyze', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ url: record.url, generation }),
            signal: controller.signal,
          });

          if (!response.ok) {
            const message = await response.text().catch(() => response.statusText);
            throw new Error(message || `Request failed with ${response.status}`);
          }

          const payload = (await response.json()) as PageAnalyzeResponse;
          attachPageResult(record, payload.page, payload.evidence.length);

          for (const evidence of payload.evidence) {
            addProfileEvidence(profileMap, evidence);
          }

          if (generation === 1) {
            for (const evidence of payload.evidence) {
              const registration = registerUrlRecord(urlMap, {
                url: evidence.profileUrl,
                source: {
                  sourceKind: evidence.sourceKind,
                  generation: 2,
                  sourceUrl: evidence.sourcePageUrl,
                },
              });

              if (registration.action === 'queued' && registration.key) {
                generation2Queue.push(registration.key);
              }
            }
          }
        } catch (err) {
          if (err instanceof DOMException && err.name === 'AbortError') {
            throw err;
          }

          attachPageResult(
            record,
            {
              url: record.url,
              finalUrl: record.url,
              status: 'failed',
              generation,
              errorMessage: err instanceof Error ? err.message : String(err),
            },
            0,
          );
        }

        publishRun(runId, qid, warnings, urlMap, profileMap, startedAt);
      }
    };

    try {
      const discovery = await discoverCandidateUrls(qid, controller.signal);
      warnings.push(...discovery.errors);

      for (const evidence of extractDirectWikidataProfiles(discovery.candidates, qid)) {
        addProfileEvidence(profileMap, evidence);
      }

      for (const candidate of discovery.candidates) {
        const registration = registerUrlRecord(urlMap, candidate);
        if (registration.action === 'queued' && registration.key) {
          generation1Queue.push(registration.key);
        }
        if (registration.action === 'invalid') {
          warnings.push(`Skipped invalid URL: ${candidate.url}`);
        }
      }

      publishRun(runId, qid, warnings, urlMap, profileMap, startedAt);

      await analyzeQueue(generation1Queue, 1);
      await analyzeQueue(generation2Queue, 2);

      publishRun(runId, qid, warnings, urlMap, profileMap, startedAt, Date.now());
    } catch (err) {
      if (!(err instanceof DOMException && err.name === 'AbortError')) {
        setError(err instanceof Error ? err.message : String(err));
      }
      publishRun(runId, qid, warnings, urlMap, profileMap, startedAt, Date.now());
    } finally {
      if (runId === runIdRef.current) {
        setLoading(false);
      }
    }
  };

  const stats = {
    known: run?.urls.length ?? 0,
    queued: run?.urls.filter((item) => item.status === 'pending').length ?? 0,
    analyzing: run?.urls.filter((item) => item.status === 'fetching').length ?? 0,
    analyzed: run?.urls.filter((item) => item.status === 'success').length ?? 0,
    failed: run?.urls.filter((item) => item.status === 'failed').length ?? 0,
    resightings: run?.urls.reduce((total, item) => total + item.alreadyKnownCount, 0) ?? 0,
  };

  return (
    <main className="app-shell">
      <section className="hero">
        <p className="hero__eyebrow">Frontend-owned crawl state</p>
        <h1>Wikidata Social Link Finder</h1>
        <p className="hero__copy">
          Discover URLs from Wikidata in the browser, analyze pages through the backend, and keep a live inventory of what is known, queued, running, finished, and re-seen.
        </p>
        <QidInput onSubmit={handleSubmit} onCancel={stopRun} loading={loading} />
      </section>

      {error ? <section className="panel panel--error">{error}</section> : null}

      {run ? (
        <>
          <section className="summary-grid">
            <SummaryCard label="Known URLs" value={stats.known} accent="#0f4c5c" />
            <SummaryCard label="Will analyze" value={stats.queued} accent="#9a3412" />
            <SummaryCard label="Analyzing" value={stats.analyzing} accent="#0f766e" />
            <SummaryCard label="Analyzed" value={stats.analyzed} accent="#166534" />
            <SummaryCard label="Failed" value={stats.failed} accent="#b91c1c" />
            <SummaryCard label="Already known" value={stats.resightings} accent="#475569" />
          </section>

          <section className="panel panel--intro">
            <div>
              <h2>
                Run for{' '}
                <a href={`https://www.wikidata.org/wiki/${run.qid}`} target="_blank" rel="noopener noreferrer">
                  {run.qid}
                </a>
              </h2>
              <p>
                {deferredUrls.length} known URLs and {deferredProfiles.length} grouped profiles in {formatDuration(run)}.
              </p>
            </div>
          </section>

          {run.warnings.length > 0 ? (
            <section className="panel panel--warning">
              <h2>Warnings</h2>
              <div className="warning-list">
                {run.warnings.map((warning, index) => (
                  <p key={`${warning}-${index}`}>{warning}</p>
                ))}
              </div>
            </section>
          ) : null}

          <section className="panel panel--inventory">
            <div className="panel__header panel__header--dense">
              <div>
                <h2>Unified URL inventory</h2>
                <p>One compact list, ordered by how often each URL has been seen. Related profiles are shown inline on each row.</p>
              </div>
              <span className="panel__caption">Sorted by seen count</span>
            </div>
            <div className="card-list card-list--compact">
              {deferredUrls.length === 0 ? <p className="empty-state">No URLs discovered yet.</p> : null}
              {deferredUrls.map((record) => (
                <CompactInventoryRow
                  key={record.key}
                  record={record}
                  profiles={getProfilesForRecord(record, profilesByPage)}
                />
              ))}
            </div>
          </section>
        </>
      ) : null}
    </main>
  );
}

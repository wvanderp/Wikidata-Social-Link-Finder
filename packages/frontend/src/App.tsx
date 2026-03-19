import type { AnalyzeResponse, PageFetchResult, ProfileGroup, SourceKind } from '@wikidata-slf/types';
import { useState, useRef } from 'react';

const SOURCE_LABELS: Record<SourceKind, string> = {
  'wikidata-url-claim': 'Wikidata URL',
  'wikidata-social-claim': 'Wikidata Social',
  'wikidata-sitelink': 'Sitelink',
  'wikidata-external-id': 'External ID',
  'page-html-gen1': 'Page (Gen 1)',
  'page-html-gen2': 'Page (Gen 2)',
};

const SOURCE_COLORS: Record<SourceKind, string> = {
  'wikidata-url-claim': '#3b82f6',
  'wikidata-social-claim': '#8b5cf6',
  'wikidata-sitelink': '#06b6d4',
  'wikidata-external-id': '#14b8a6',
  'page-html-gen1': '#f59e0b',
  'page-html-gen2': '#ef4444',
};

function Badge({ kind }: { kind: SourceKind }) {
  return (
    <span
      style={{
        display: 'inline-block',
        padding: '2px 8px',
        borderRadius: 9999,
        fontSize: '0.7rem',
        fontWeight: 600,
        color: '#fff',
        background: SOURCE_COLORS[kind],
        marginRight: 4,
        marginBottom: 2,
      }}
    >
      {SOURCE_LABELS[kind]}
    </span>
  );
}

function QidInput({
  onSubmit,
  loading,
}: {
  onSubmit: (qid: string) => void;
  loading: boolean;
}) {
  const [value, setValue] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const qid = value.trim().toUpperCase();
    if (!/^Q\d+$/.test(qid)) {
      setError('Enter a valid Wikidata QID, e.g. Q42');
      return;
    }
    setError('');
    onSubmit(qid);
  };

  return (
    <form onSubmit={handleSubmit} style={{ display: 'flex', gap: 8, alignItems: 'flex-start', flexWrap: 'wrap' }}>
      <div style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
        <input
          type="text"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="Enter Wikidata QID (e.g. Q42)"
          disabled={loading}
          style={{
            padding: '0.5rem 0.75rem',
            border: '1px solid #d1d5db',
            borderRadius: 6,
            fontSize: '1rem',
            outline: 'none',
          }}
        />
        {error && <span style={{ color: '#dc2626', fontSize: '0.8rem', marginTop: 4 }}>{error}</span>}
      </div>
      <button
        type="submit"
        disabled={loading}
        style={{
          padding: '0.5rem 1.25rem',
          background: loading ? '#9ca3af' : '#2563eb',
          color: '#fff',
          border: 'none',
          borderRadius: 6,
          fontSize: '1rem',
          cursor: loading ? 'not-allowed' : 'pointer',
        }}
      >
        {loading ? 'Analyzing...' : 'Analyze'}
      </button>
    </form>
  );
}

function PageProgressRow({ page }: { page: PageFetchResult }) {
  const icon =
    page.status === 'success'
      ? '✅'
      : page.status === 'failed'
        ? '❌'
        : page.status === 'fetching'
          ? '⏳'
          : '⏸';

  return (
    <div
      style={{
        display: 'flex',
        gap: 8,
        alignItems: 'baseline',
        padding: '4px 0',
        borderBottom: '1px solid #f3f4f6',
        fontSize: '0.85rem',
      }}
    >
      <span>{icon}</span>
      <span
        style={{
          background: page.generation === 1 ? '#dbeafe' : '#fce7f3',
          color: page.generation === 1 ? '#1d4ed8' : '#9d174d',
          padding: '1px 6px',
          borderRadius: 4,
          fontSize: '0.7rem',
          fontWeight: 600,
        }}
      >
        Gen {page.generation}
      </span>
      <a
        href={page.url}
        target="_blank"
        rel="noopener noreferrer"
        style={{ color: '#2563eb', textDecoration: 'none', wordBreak: 'break-all', flex: 1 }}
      >
        {page.url}
      </a>
      {page.httpStatus != null && (
        <span style={{ color: '#6b7280', whiteSpace: 'nowrap' }}>HTTP {page.httpStatus}</span>
      )}
      {page.errorMessage && (
        <span style={{ color: '#dc2626', fontSize: '0.75rem', wordBreak: 'break-all' }}>
          {page.errorMessage}
        </span>
      )}
    </div>
  );
}

function ProfileCard({ group }: { group: ProfileGroup }) {
  const [expanded, setExpanded] = useState(false);
  const uniqueKinds = Array.from(new Set(group.evidence.map((e) => e.sourceKind)));

  return (
    <div
      style={{
        border: '1px solid #e5e7eb',
        borderRadius: 8,
        padding: '0.75rem 1rem',
        background: '#fff',
        marginBottom: 8,
      }}
    >
      <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 700, fontSize: '0.95rem' }}>
            {group.platformName}{' '}
            <span style={{ fontWeight: 400, color: '#6b7280' }}>@{group.normalizedUsername}</span>
          </div>
          <a
            href={group.canonicalUrl}
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: '#2563eb', fontSize: '0.85rem', wordBreak: 'break-all' }}
          >
            {group.canonicalUrl}
          </a>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: '1.5rem', fontWeight: 700, color: '#1f2937', lineHeight: 1 }}>
            {group.pageCount}
          </div>
          <div style={{ fontSize: '0.7rem', color: '#6b7280' }}>pages</div>
        </div>
      </div>

      <div style={{ marginTop: 6 }}>
        {uniqueKinds.map((k) => (
          <Badge key={k} kind={k} />
        ))}
      </div>

      <button
        onClick={() => setExpanded((v) => !v)}
        style={{
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          color: '#6b7280',
          fontSize: '0.8rem',
          padding: '4px 0',
          marginTop: 4,
        }}
      >
        {expanded ? '▲ Hide evidence' : '▼ Show evidence'}
      </button>

      {expanded && (
        <div style={{ marginTop: 8 }}>
          {group.evidence.map((ev, i) => (
            <div
              key={i}
              style={{
                display: 'flex',
                gap: 8,
                alignItems: 'baseline',
                padding: '3px 0',
                fontSize: '0.8rem',
                borderBottom: '1px solid #f3f4f6',
              }}
            >
              <Badge kind={ev.sourceKind} />
              <span style={{ color: '#6b7280' }}>Gen {ev.generation}</span>
              <a
                href={ev.sourcePageUrl}
                target="_blank"
                rel="noopener noreferrer"
                style={{ color: '#2563eb', wordBreak: 'break-all', flex: 1 }}
              >
                {ev.sourcePageUrl}
              </a>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function App() {
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState<PageFetchResult[]>([]);
  const [result, setResult] = useState<AnalyzeResponse | null>(null);
  const [streamError, setStreamError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const handleSubmit = async (qid: string) => {
    if (abortRef.current) abortRef.current.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;

    setLoading(true);
    setProgress([]);
    setResult(null);
    setStreamError(null);

    try {
      const resp = await fetch(`/api/analyze/stream?qid=${encodeURIComponent(qid)}`, {
        signal: ctrl.signal,
      });

      if (!resp.ok || !resp.body) {
        const text = await resp.text().catch(() => resp.statusText);
        setStreamError(`Server error: ${text}`);
        setLoading(false);
        return;
      }

      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const parts = buffer.split('\n\n');
        buffer = parts.pop() ?? '';

        for (const part of parts) {
          const line = part.trim();
          if (!line.startsWith('data:')) continue;
          try {
            const event = JSON.parse(line.slice('data:'.length)) as {
              type: string;
              page?: PageFetchResult;
              result?: AnalyzeResponse;
              message?: string;
            };
            if (event.type === 'page_fetch' && event.page) {
              setProgress((prev) => [...prev, event.page!]);
            } else if (event.type === 'complete' && event.result) {
              setResult(event.result);
            } else if (event.type === 'error') {
              setStreamError(event.message ?? 'Unknown error');
            }
          } catch {
            // skip malformed SSE line
          }
        }
      }
    } catch (err) {
      if ((err as Error).name !== 'AbortError') {
        setStreamError(err instanceof Error ? err.message : String(err));
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <h1 style={{ fontSize: '1.5rem', fontWeight: 700, marginBottom: '0.5rem' }}>
        Wikidata Social Link Finder
      </h1>
      <p style={{ color: '#6b7280', marginBottom: '1.5rem', marginTop: 0 }}>
        Enter a Wikidata QID to discover social media profiles linked to that entity.
      </p>

      <QidInput onSubmit={handleSubmit} loading={loading} />

      {streamError && (
        <div
          style={{
            marginTop: '1rem',
            padding: '0.75rem 1rem',
            background: '#fef2f2',
            border: '1px solid #fecaca',
            borderRadius: 6,
            color: '#dc2626',
          }}
        >
          {streamError}
        </div>
      )}

      {progress.length > 0 && (
        <div style={{ marginTop: '1.5rem' }}>
          <h2 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: 8 }}>
            Crawl progress ({progress.length} pages)
          </h2>
          <div
            style={{
              border: '1px solid #e5e7eb',
              borderRadius: 6,
              padding: '0.5rem 0.75rem',
              background: '#fff',
              maxHeight: 280,
              overflowY: 'auto',
            }}
          >
            {progress.map((p, i) => (
              <PageProgressRow key={i} page={p} />
            ))}
          </div>
        </div>
      )}

      {result && (
        <div style={{ marginTop: '1.5rem' }}>
          <h2 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: 4 }}>
            Results for{' '}
            <a
              href={`https://www.wikidata.org/wiki/${result.qid}`}
              target="_blank"
              rel="noopener noreferrer"
              style={{ color: '#2563eb' }}
            >
              {result.qid}
            </a>
            <span style={{ fontWeight: 400, color: '#6b7280', fontSize: '0.85rem', marginLeft: 8 }}>
              {result.profiles.length} profiles found · {result.pageResults.length} pages crawled ·{' '}
              {(result.durationMs / 1000).toFixed(1)}s
            </span>
          </h2>

          {result.errors.length > 0 && (
            <div
              style={{
                padding: '0.5rem 0.75rem',
                background: '#fffbeb',
                border: '1px solid #fde68a',
                borderRadius: 6,
                fontSize: '0.8rem',
                color: '#92400e',
                marginBottom: '0.75rem',
              }}
            >
              <strong>Warnings:</strong>
              <ul style={{ margin: '4px 0 0', paddingLeft: '1.25rem' }}>
                {result.errors.map((e, i) => (
                  <li key={i}>{e}</li>
                ))}
              </ul>
            </div>
          )}

          {result.profiles.length === 0 ? (
            <p style={{ color: '#6b7280' }}>No social profiles discovered.</p>
          ) : (
            result.profiles.map((group) => <ProfileCard key={group.key} group={group} />)
          )}
        </div>
      )}
    </div>
  );
}

import express, { type Express, Request, Response, NextFunction } from 'express';
import cors from 'cors';
import { normalizeHttpUrl, PageAnalyzeRequest } from '@wikidata-slf/types';
import { closeBrowser } from './pageFetcher';
import { fetchPage } from './pageFetcher';
import { extractProfilesFromPage } from './profileExtractor';

const app: Express = express();
const PORT = process.env.PORT ?? 3001;

app.use(cors());
app.use(express.json());

// ---------------------------------------------------------------------------
// Health check
// ---------------------------------------------------------------------------
app.get('/api/health', (_req: Request, res: Response) => {
  res.json({ status: 'ok' });
});

// ---------------------------------------------------------------------------
// POST /api/page/analyze  – fetch one page and extract social-profile evidence
// ---------------------------------------------------------------------------
app.post('/api/page/analyze', async (req: Request, res: Response, next: NextFunction) => {
  const body = req.body as Partial<PageAnalyzeRequest>;
  const rawUrl = body.url?.trim();
  const generation = body.generation;

  if (!rawUrl) {
    res.status(400).json({ error: 'url is required' });
    return;
  }

  const url = normalizeHttpUrl(rawUrl);
  if (!url) {
    res.status(400).json({ error: 'Invalid URL' });
    return;
  }

  if (generation !== 1 && generation !== 2) {
    res.status(400).json({ error: 'generation must be 1 or 2' });
    return;
  }

  try {
    const page = await fetchPage(url, generation);
    const evidence = extractProfilesFromPage(page);
    res.json({ page, evidence });
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// Error handler
// ---------------------------------------------------------------------------
app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  console.error('[error]', err);
  const message = err instanceof Error ? err.message : 'Internal server error';
  res.status(500).json({ error: message });
});

// ---------------------------------------------------------------------------
// Start server
// ---------------------------------------------------------------------------
const server = app.listen(PORT, () => {
  console.log(`[backend] listening on http://localhost:${PORT}`);
});

// Graceful shutdown
const shutdown = async (): Promise<void> => {
  console.log('[backend] shutting down…');
  await closeBrowser();
  server.close(() => process.exit(0));
};

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

export { app };

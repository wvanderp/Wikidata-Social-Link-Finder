import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import { AnalyzeRequest, PageFetchResult } from '@wikidata-slf/types';
import { analyze } from './analyzer.js';
import { closeBrowser } from './pageFetcher.js';

const app = express();
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
// POST /api/analyze  – runs the full crawl and returns when complete
// ---------------------------------------------------------------------------
app.post('/api/analyze', async (req: Request, res: Response, next: NextFunction) => {
  const body = req.body as Partial<AnalyzeRequest>;
  const qid = body.qid?.trim();

  if (!qid || !/^Q\d+$/i.test(qid)) {
    res.status(400).json({ error: 'qid must be a valid Wikidata QID (e.g. Q42)' });
    return;
  }

  try {
    const result = await analyze({ qid: qid.toUpperCase() });
    res.json(result);
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// GET /api/analyze/stream  – SSE endpoint for live progress updates
// ---------------------------------------------------------------------------
app.get('/api/analyze/stream', async (req: Request, res: Response, next: NextFunction) => {
  const qid = (req.query['qid'] as string | undefined)?.trim();

  if (!qid || !/^Q\d+$/i.test(qid)) {
    res.status(400).json({ error: 'qid must be a valid Wikidata QID (e.g. Q42)' });
    return;
  }

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  const send = (data: unknown): void => {
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  };

  try {
    const result = await analyze(
      { qid: qid.toUpperCase() },
      (pageResult: PageFetchResult) => {
        send({ type: 'page_fetch', page: pageResult });
      },
    );

    send({ type: 'complete', result });
  } catch (err) {
    send({
      type: 'error',
      message: err instanceof Error ? err.message : String(err),
    });
  } finally {
    res.end();
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

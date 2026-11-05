import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { createServer as createViteServer } from 'vite';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const require = createRequire(import.meta.url);

process.env.VITE_DEV_SERVER = 'true';

async function start() {
  const { app, bootstrap } = require('./api-server.cjs');

  // Parse command-line args (e.g. --port 3000 --host 0.0.0.0)
  const args = process.argv.slice(2);
  const portArgIndex = args.indexOf('--port');
  const hostArgIndex = args.indexOf('--host');
  const portFromArg = portArgIndex !== -1 ? parseInt(args[portArgIndex + 1], 10) : null;
  const hostFromArg = hostArgIndex !== -1 ? args[hostArgIndex + 1] : null;

  const PORT = portFromArg || Number(process.env.PORT) || 3000;
  const HOST = hostFromArg || process.env.HOST || '0.0.0.0';

  // Run api-server bootstrap tasks without listening on a separate port
  if (typeof bootstrap === 'function') {
    try {
      await bootstrap({ listen: false });
    } catch (err) {
      console.error('[Server] api-server bootstrap error:', err);
    }
  }

  // In development, mount Vite middleware
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    // In production, serve the built static dist directory
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath, { index: false, maxAge: '1h' }));
    app.get('*', (req: express.Request, res: express.Response) => {
      res.sendFile(path.resolve(distPath, 'index.html'));
    });
  }

  app.listen(PORT, HOST, () => {
    console.log(`[Server] 🚀 Unified Full-Stack Server listening on http://${HOST}:${PORT}`);
  });
}

start().catch((err) => {
  console.error('[Server] Fatal server error:', err);
  process.exit(1);
});

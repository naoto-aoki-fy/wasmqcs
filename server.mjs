// server.mjs
// Minimal Express static server that sets COOP/COEP headers for SharedArrayBuffer/pthreads.
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const pub = path.join(__dirname, 'public');

// COOP/COEP required for crossOriginIsolated -> SharedArrayBuffer
app.use((req, res, next) => {
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  res.setHeader('Cross-Origin-Embedder-Policy', 'require-corp');
  // (Optional) If you load any cross-origin static assets, make sure they send CORP or CORS.
  next();
});

app.use(express.static(pub, {
  setHeaders: (res, filePath) => {
    // Serve wasm with the right type (some servers do this automatically)
    if (filePath.endsWith('.wasm')) {
      res.setHeader('Content-Type', 'application/wasm');
    }
    if (filePath.endsWith('.js')) {
      res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
    }
    if (filePath.endsWith('.wasm.map')) {
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
    }
  }
}));

app.get('*', (_req, res) => res.sendFile(path.join(pub, 'index.html')));

const port = process.env.PORT || 8080;
app.listen(port, () => {
  console.log(`Serving on http://localhost:${port}`);
});

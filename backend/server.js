import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import processVideoRouter from './routes/processVideo.js';

const app = express();
const PORT = Number(process.env.PORT || process.env.BACKEND_PORT || 4000);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const jobs = new Map();

app.use(cors());
app.use(express.json({ limit: '2mb' }));
app.use('/downloads', express.static(path.join(process.cwd(), 'public', 'downloads')));

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, service: 'tikyok-backend' });
});

app.use('/api', processVideoRouter({ jobs }));

app.use((err, _req, res, _next) => {
  console.error('[UnhandledError]', err);
  res.status(500).json({
    error: {
      code: 'INTERNAL_SERVER_ERROR',
      message: err?.message || 'Unexpected server error'
    }
  });
});

app.listen(PORT, () => {
  console.log(`Backend listening on port ${PORT}`);
});

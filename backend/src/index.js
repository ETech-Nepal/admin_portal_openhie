import express from 'express';
import cors from 'cors';
import pinoHttp from 'pino-http';
import { config } from './config.js';
import { logger } from './lib/logger.js';
import { authRouter } from './routes/auth.js';
import { reviewRouter } from './routes/review.js';

const app = express();
app.use(express.json({ limit: '256kb' }));
app.use(pinoHttp({ logger }));
app.use(cors({ origin: config.CORS_ORIGIN.split(',').map((s) => s.trim()), credentials: false }));

app.get('/health', (_req, res) => res.json({ status: 'ok' }));
app.use('/auth', authRouter);
app.use('/review', reviewRouter);

app.use((err, _req, res, _next) => {
  logger.error({ err: err.message, stack: err.stack }, 'unhandled error');
  res.status(500).json({ error: 'internal error' });
});

app.listen(config.PORT, () => logger.info(`Admin portal BFF listening on :${config.PORT}`));

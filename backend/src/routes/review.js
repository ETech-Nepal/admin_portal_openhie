import { Router } from 'express';
import { requireAdmin } from '../middleware/requireAdmin.js';
import * as openhim from '../clients/openhimClient.js';
import { logger } from '../lib/logger.js';

export const reviewRouter = Router();
reviewRouter.use(requireAdmin);

// Upstream failures carry useful detail (e.g. MERGE_PARTIAL); pass it through rather
// than collapsing everything to a generic 500.
function forwardError(err, res, what) {
  const status = err.response?.status ?? 502;
  const body = err.response?.data ?? { error: err.message };
  logger.error({ status, body, what }, 'upstream identity-mediator call failed');
  res.status(status).json(typeof body === 'object' ? body : { error: String(body) });
}

reviewRouter.get('/tasks', async (req, res) => {
  try {
    res.json(await openhim.listTasks({
      status: req.query.status ?? 'OPEN',
      limit: req.query.limit ?? 50,
      offset: req.query.offset ?? 0,
    }, req.admin));
  } catch (err) { forwardError(err, res, 'listTasks'); }
});

reviewRouter.get('/tasks/:id', async (req, res) => {
  try {
    res.json(await openhim.getTask(req.params.id, req.admin));
  } catch (err) { forwardError(err, res, 'getTask'); }
});

reviewRouter.post('/tasks/:id/merge', async (req, res) => {
  const { survivorUid } = req.body ?? {};
  if (!survivorUid) return res.status(400).json({ error: 'survivorUid is required' });
  try {
    const out = await openhim.mergeTask(req.params.id, survivorUid, req.admin);
    logger.info({ task: req.params.id, survivorUid, by: req.admin }, 'merge requested');
    res.json(out);
  } catch (err) { forwardError(err, res, 'mergeTask'); }
});

reviewRouter.post('/tasks/:id/dismiss', async (req, res) => {
  try {
    res.json(await openhim.dismissTask(req.params.id, req.body?.reason ?? null, req.admin));
  } catch (err) { forwardError(err, res, 'dismissTask'); }
});

reviewRouter.post('/scan', async (req, res) => {
  try {
    res.json(await openhim.runScan(req.admin));
  } catch (err) { forwardError(err, res, 'runScan'); }
});

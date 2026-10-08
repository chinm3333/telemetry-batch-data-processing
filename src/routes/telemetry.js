const express = require('express');
const {
  validateIngestRequest,
  validateSummaryQuery,
} = require('../validators/telemetry');
const { ingestBatch } = require('../services/ingest');
const { getSummary } = require('../services/summary');

const router = express.Router();

router.post('/ingest', (req, res) => {
  const requestError = validateIngestRequest(req.body);

  if (requestError) {
    return res.status(400).json({ error: requestError });
  }

  const deviceId = req.body.device_id.trim();
  const result = ingestBatch(deviceId, req.body.events);

  return res.status(200).json(result);
});

router.get('/summary', (req, res) => {
  const parsed = validateSummaryQuery(req.query);

  if (parsed.error) {
    return res.status(400).json({ error: parsed.error });
  }

  const result = getSummary(parsed.deviceId, parsed.from, parsed.to);
  return res.status(200).json(result);
});

module.exports = router;

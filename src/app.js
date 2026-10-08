const express = require('express');
const telemetryRoutes = require('./routes/telemetry');

const app = express();

app.use(express.json({ limit: '1mb' }));

app.get('/health', (_req, res) => {
  res.status(200).json({ status: 'ok' });
});

app.use('/api/v1/telemetry', telemetryRoutes);

app.use((err, _req, res, _next) => {
  if (err instanceof SyntaxError && err.status === 400 && 'body' in err) {
    return res.status(400).json({ error: 'Invalid JSON body' });
  }

  console.error(err);
  return res.status(500).json({ error: 'Internal server error' });
});

module.exports = app;

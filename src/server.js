const app = require('./app');
require('./db');

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Telemetry API listening on http://localhost:${PORT}`);
});

const db = require('../db');

const summaryStmt = db.prepare(`
  SELECT
    COUNT(*) AS event_count,
    AVG(speed_kmph) AS avg_speed_kmph,
    MAX(
      SQRT(accel_x * accel_x + accel_y * accel_y + accel_z * accel_z)
    ) AS max_accel_magnitude
  FROM telemetry_events
  WHERE device_id = @device_id
    AND timestamp >= @from
    AND timestamp <= @to
`);

function round(value, digits) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function getSummary(deviceId, from, to) {
  const row = summaryStmt.get({
    device_id: deviceId,
    from,
    to,
  });

  const eventCount = Number(row.event_count);

  if (eventCount === 0) {
    return {
      device_id: deviceId,
      from,
      to,
      avg_speed_kmph: null,
      max_accel_magnitude: null,
      event_count: 0,
    };
  }

  return {
    device_id: deviceId,
    from,
    to,
    avg_speed_kmph: round(row.avg_speed_kmph, 4),
    max_accel_magnitude: round(row.max_accel_magnitude, 6),
    event_count: eventCount,
  };
}

module.exports = {
  getSummary,
};

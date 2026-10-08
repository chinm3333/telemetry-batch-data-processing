const db = require('../db');
const { validateEvent } = require('../validators/telemetry');

const insertEvent = db.prepare(`
  INSERT OR IGNORE INTO telemetry_events (
    device_id, timestamp, lat, lon, speed_kmph,
    accel_x, accel_y, accel_z, gyro_x, gyro_y, gyro_z
  ) VALUES (
    @device_id, @timestamp, @lat, @lon, @speed_kmph,
    @accel_x, @accel_y, @accel_z, @gyro_x, @gyro_y, @gyro_z
  )
`);

function ingestBatch(deviceId, events) {
  const serverNowMs = Date.now();
  const seenInBatch = new Set();

  let accepted = 0;
  let duplicates = 0;
  let rejected = 0;
  const errors = [];

  db.exec('BEGIN');
  try {
    for (let index = 0; index < events.length; index += 1) {
      const event = events[index];
      const reason = validateEvent(event, serverNowMs);

      if (reason) {
        rejected += 1;
        errors.push({ index, reason });
        continue;
      }

      const key = String(event.timestamp);

      if (seenInBatch.has(key)) {
        duplicates += 1;
        continue;
      }

      const result = insertEvent.run({
        device_id: deviceId,
        timestamp: event.timestamp,
        lat: event.lat,
        lon: event.lon,
        speed_kmph: event.speed_kmph,
        accel_x: event.accel_x,
        accel_y: event.accel_y,
        accel_z: event.accel_z,
        gyro_x: event.gyro_x,
        gyro_y: event.gyro_y,
        gyro_z: event.gyro_z,
      });

      if (result.changes === 0) {
        duplicates += 1;
      } else {
        accepted += 1;
        seenInBatch.add(key);
      }
    }

    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }

  return {
    device_id: deviceId,
    accepted,
    duplicates,
    rejected,
    errors,
  };
}

module.exports = {
  ingestBatch,
};

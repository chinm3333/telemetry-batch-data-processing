const REQUIRED_EVENT_FIELDS = [
  'timestamp',
  'lat',
  'lon',
  'speed_kmph',
  'accel_x',
  'accel_y',
  'accel_z',
  'gyro_x',
  'gyro_y',
  'gyro_z',
];

const MAX_BATCH_SIZE = 500;
const MAX_FUTURE_MS = 24 * 60 * 60 * 1000;

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isFiniteNumber(value) {
  return typeof value === 'number' && Number.isFinite(value);
}

function validateIngestRequest(body) {
  if (!isPlainObject(body)) {
    return 'Request body must be a JSON object';
  }

  if (typeof body.device_id !== 'string' || body.device_id.trim() === '') {
    return 'device_id is required and must be a non-empty string';
  }

  if (!Array.isArray(body.events)) {
    return 'events must be an array';
  }

  if (body.events.length === 0) {
    return 'events array must not be empty';
  }

  if (body.events.length > MAX_BATCH_SIZE) {
    return `events array must not exceed ${MAX_BATCH_SIZE} items`;
  }

  return null;
}

function validateEvent(event, serverNowMs = Date.now()) {
  if (!isPlainObject(event)) {
    return 'event must be an object';
  }

  for (const field of REQUIRED_EVENT_FIELDS) {
    if (!(field in event) || event[field] === null || event[field] === undefined) {
      return `missing required field: ${field}`;
    }
  }

  const { timestamp, lat, lon, speed_kmph } = event;

  if (!Number.isInteger(timestamp) || timestamp <= 0) {
    return 'timestamp must be a positive integer';
  }

  if (timestamp > serverNowMs + MAX_FUTURE_MS) {
    return 'timestamp more than 24 hours in the future';
  }

  if (!isFiniteNumber(lat) || lat < -90 || lat > 90) {
    return 'lat out of range';
  }

  if (!isFiniteNumber(lon) || lon < -180 || lon > 180) {
    return 'lon out of range';
  }

  if (!isFiniteNumber(speed_kmph) || speed_kmph < 0 || speed_kmph > 300) {
    return 'speed_kmph out of range';
  }

  for (const field of [
    'accel_x',
    'accel_y',
    'accel_z',
    'gyro_x',
    'gyro_y',
    'gyro_z',
  ]) {
    if (!isFiniteNumber(event[field])) {
      return `${field} must be numeric`;
    }
  }

  return null;
}

function validateSummaryQuery(query) {
  const { device_id: deviceId, from: fromRaw, to: toRaw } = query;

  if (typeof deviceId !== 'string' || deviceId.trim() === '') {
    return { error: 'device_id is required and must be a non-empty string' };
  }

  if (fromRaw === undefined || fromRaw === '') {
    return { error: 'from is required' };
  }

  if (toRaw === undefined || toRaw === '') {
    return { error: 'to is required' };
  }

  const from = Number(fromRaw);
  const to = Number(toRaw);

  if (!Number.isInteger(from) || from <= 0) {
    return { error: 'from must be a positive integer (epoch milliseconds)' };
  }

  if (!Number.isInteger(to) || to <= 0) {
    return { error: 'to must be a positive integer (epoch milliseconds)' };
  }

  if (from > to) {
    return { error: 'from must be less than or equal to to' };
  }

  return {
    deviceId: deviceId.trim(),
    from,
    to,
  };
}

module.exports = {
  MAX_BATCH_SIZE,
  validateIngestRequest,
  validateEvent,
  validateSummaryQuery,
};

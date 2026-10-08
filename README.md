# Lane Telemetry API

Minimal Node.js + Express service that ingests high-frequency smartphone motion telemetry (GPS, accelerometer, gyroscope) and serves time-range summary queries per device.

**Requirements:** Node.js `>= 22.5` (uses the built-in `node:sqlite` module)

## Setup

```bash
npm install
npm start
```

Server listens on `http://localhost:3000` (override with `PORT`).

```bash
npm run dev   # restart on file changes
```

## Endpoints

| Method | Path | Purpose |
|--------|------|---------|
| `POST` | `/api/v1/telemetry/ingest` | Batch ingest (1–500 events) |
| `GET`  | `/api/v1/telemetry/summary` | Aggregates for a device + time window |
| `GET`  | `/health` | Liveness check |

## Sample curl requests

### 1. Ingest a valid batch

```bash
POST http://localhost:3000/api/v1/telemetry/ingest \
  -H "Content-Type: application/json" \
  -d '{
    "device_id": "DVC-1029",
    "events": [
      {
        "timestamp": 1730894521123,
        "lat": 12.9716,
        "lon": 77.5946,
        "speed_kmph": 42.5,
        "accel_x": 0.12,
        "accel_y": -0.03,
        "accel_z": 9.81,
        "gyro_x": 0.002,
        "gyro_y": -0.001,
        "gyro_z": 0.0
      },
      {
        "timestamp": 1730894521173,
        "lat": 12.9716,
        "lon": 77.5947,
        "speed_kmph": 42.8,
        "accel_x": 0.14,
        "accel_y": -0.02,
        "accel_z": 9.80,
        "gyro_x": 0.001,
        "gyro_y": -0.001,
        "gyro_z": 0.0
      }
    ]
  }'
```

Expected shape:

```json
{
  "device_id": "DVC-1029",
  "accepted": 2,
  "duplicates": 0,
  "rejected": 0,
  "errors": []
}
```

### 2. Retry the same batch (duplicates)

Re-run above. Expected: `accepted: 0`, `duplicates: 2`.

### 3. Partial success (one invalid event)

```bash
POST http://localhost:3000/api/v1/telemetry/ingest \
  -H "Content-Type: application/json" \
  -d '{
    "device_id": "DVC-1029",
    "events": [
      {
        "timestamp": 1730894522000,
        "lat": 12.97,
        "lon": 77.59,
        "speed_kmph": 999,
        "accel_x": 0.1,
        "accel_y": 0.1,
        "accel_z": 9.8,
        "gyro_x": 0,
        "gyro_y": 0,
        "gyro_z": 0
      },
      {
        "timestamp": 1730894522100,
        "lat": 12.97,
        "lon": 77.59,
        "speed_kmph": 40,
        "accel_x": 0.1,
        "accel_y": 0.1,
        "accel_z": 9.8,
        "gyro_x": 0,
        "gyro_y": 0,
        "gyro_z": 0
      }
    ]
  }'
```

Expected: `accepted: 1`, `rejected: 1`, with `errors[0].index === 0` and reason `speed_kmph out of range`.

### 4. Request-level failure (empty device_id → HTTP 400)

```bash
POST http://localhost:3000/api/v1/telemetry/ingest \
  -H "Content-Type: application/json" \
  -d '{"device_id":"","events":[{"timestamp":1}]}'
```

### 5. Summary query

```bash
GET "http://localhost:3000/api/v1/telemetry/summary?device_id=DVC-1029&from=1730894520000&to=1730894580000"
```

Expected shape:

```json
{
  "device_id": "DVC-1029",
  "from": 1730894520000,
  "to": 1730894580000,
  "avg_speed_kmph": 42.5,
  "max_accel_magnitude": 9.81078,
  "event_count": 2
}
```

`from` and `to` are inclusive epoch milliseconds. Aggregates are rounded (`avg_speed_kmph` to 4 decimals, `max_accel_magnitude` to 6) to avoid float noise.

### 6. Empty window

```bash
GET "http://localhost:3000/api/v1/telemetry/summary?device_id=DVC-1029&from=1000&to=2000"
```

Expected: `event_count: 0`, both aggregates `null`, HTTP 200.

### 7. Invalid query (`from` > `to` → HTTP 400)

```bash
GET "http://localhost:3000/api/v1/telemetry/summary?device_id=DVC-1029&from=2000&to=1000"
```

---

## Design Notes

### Schema and indexes

Table `telemetry_events`:

| Column | Type | Notes |
|--------|------|--------|
| `id` | INTEGER PK | Surrogate key |
| `device_id` | TEXT | Device identity |
| `timestamp` | INTEGER | Event time (epoch ms), not server receipt time |
| `lat`, `lon`, `speed_kmph` | REAL | GPS / speed |
| `accel_*`, `gyro_*` | REAL | Motion sensors |
| `created_at` | INTEGER | Server ingest time (audit only) |

Constraints / indexes:

- **`UNIQUE(device_id, timestamp)`** — natural identity of an event for this assignment. Enforces idempotent retries without a separate dedupe store.
- **`INDEX (device_id, timestamp)`** — matches the summary access pattern: filter by device, then scan/aggregate a time window. The unique constraint already creates a usable index in SQLite; the explicit composite index documents intent and keeps the query plan stable if the unique definition ever changes.

Storage is SQLite via Node’s built-in `node:sqlite` (`DatabaseSync`), with WAL mode enabled for better concurrent readers during writes. Acceptable for the single-node coding portion; not the production store (see below).

### Duplicate detection and concurrency

Duplicates are defined as the same `(device_id, timestamp)`.

1. **Within a batch** — a `Set` of timestamps already accepted in the current request counts later copies as `duplicates` without attempting another insert.
2. **Across requests / retries** — inserts use `INSERT OR IGNORE`. If the unique constraint already holds a row, `changes === 0` and the event is counted as a duplicate (not a rejection).
3. **Concurrent requests for the same device** — two overlapping inserts for the same key cannot both succeed: SQLite’s unique constraint is the source of truth. The loser of the race becomes a duplicate. The batch is wrapped in a transaction so a crash mid-batch does not leave a half-applied mix of accepted rows from that request.

Duplicates are reported separately from validation rejections, matching the required ingest response shape.

### Validation policy (string vs number)

JSON numbers must arrive as **JSON numbers**, not numeric strings.

- `"speed_kmph": 42.5` → valid  
- `"speed_kmph": "42.5"` → rejected (`speed_kmph out of range` / not numeric)  
- `"timestamp": 1730894521123` → valid  
- `"timestamp": "1730894521123"` → rejected (`timestamp must be a positive integer`)

Rationale: mobile clients should serialize typed fields correctly; silent coercion can hide producer bugs (e.g. locale-formatted strings) and makes “numeric” checks ambiguous. Query parameters for summary (`from`, `to`) are strings by HTTP nature and **are** parsed to integers.

### Summary aggregates

- Average of `speed_kmph` over events in `[from, to]` (inclusive).
- Max acceleration magnitude: per event `√(accel_x² + accel_y² + accel_z²)`, then max over the window.
- Computed in SQL so the DB uses the `(device_id, timestamp)` index rather than loading all rows into Node.

### One thing I would do differently in production

**Decouple ingest from durable write path.** Keep the HTTP handler thin: validate → publish the batch to a durable log/queue (e.g. Kinesis / Kafka) → ACK quickly with accepted/rejected/duplicate counts derived from validation + an idempotency check, while a consumer writes into a time-series store (e.g. TimescaleDB / Timestream) partitioned by time and keyed by `device_id`. That avoids blocking the API process on synchronous SQLite transactions under 10–50 Hz × many devices, and gives replay, backpressure, and horizontal scale that a single-node `DatabaseSync` file cannot.

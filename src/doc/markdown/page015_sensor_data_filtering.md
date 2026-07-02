# Sensor Data Filtering

JaiaBots use a **Hampel filter** to remove outlier sensor readings. The approved design applies filtering live during a mission: raw readings are always preserved, and filtered values are published separately so downstream consumers can tell when a sample was rejected.

See also: [Sensors and Data Processing](page014_sensors.md)

## Design decisions

| Decision | Choice |
|----------|--------|
| Behavior | Outlier removal only (no smoothing) |
| When | Live, during mission |
| Outlier handling | Drop from filtered stream (value is not altered) |
| Configurability | Yes — default threshold is **3 × MAD** |
| Data model | Raw field always set; filtered field set only for accepted samples |

## Algorithm

For each incoming scalar sample `x_i`, the filter maintains a sliding window of the last `W` **accepted** samples.

1. Build a candidate window from the stored buffer plus `x_i`.
2. Compute the window **median**: `m = median(W)`.
3. Compute **median absolute deviation**: `MAD = median(|x_j - m|)` for all `x_j ∈ W`.
4. If `|x_i - m| > k × MAD`, classify `x_i` as an **outlier** (default `k = 3`).
5. Otherwise accept `x_i` and add it to the buffer.

**Warmup:** Until the buffer holds `W - 1` accepted samples, all readings pass through without outlier rejection.

**Rejected outliers** are not added to the buffer, so a spike cannot shift future median estimates.

### Worked example

Window size `W = 7`, threshold `k = 3`, stable readings near `1.0`, then a spike:

| Step | Sample | Window (incl. sample) | Median | MAD | Outlier? | Filtered output |
|------|--------|------------------------|--------|-----|----------|-----------------|
| 1–6 | 1.0 | fewer than 7 samples | — | — | No (warmup) | 1.0 |
| 7 | 1.0 | seven 1.0 values | 1.0 | 0.0 | No | 1.0 |
| 8 | 100.0 | six 1.0 + 100.0 | 1.0 | 0.0 | Yes | omitted |
| 9 | 1.0 | six 1.0 + 1.0 | 1.0 | 0.0 | No | 1.0 |

The spike at step 8 would remain in the raw field but be omitted from the filtered output.

## Complexity

| Resource | Per sample | Notes |
|----------|-----------|-------|
| Time | **O(W log W)** | Sort-based median on a window of size `W` |
| Space | **O(W)** | Circular buffer per filter instance |
| Instances | One filter per scalar field | e.g. Bar30 would use separate filters for pressure and temperature |

For `n` samples over a mission: **O(n × W log W)** total. With default `W = 7` and typical sample rates (10 Hz), cost is negligible on the Raspberry Pi.

## Configuration

`HampelFilterConfig` in `jaiabot::utils`:

| Field | Default | Description |
|-------|---------|-------------|
| `enabled` | `true` | When false, all samples pass through unchanged |
| `window_size` | `7` | Sliding window length (must be odd, ≥ 3) |
| `mad_threshold` | `3.0` | Multiplier `k` in `k × MAD` |

## Implementation

- Utility: `src/lib/utils/hampel_filter.h`
- Tests: `src/test/utils/test.cpp`

Sensor driver integration is planned as a follow-up.

**Reference:** Hampel, F.R. (1974). The influence curve and its role in robust estimation.

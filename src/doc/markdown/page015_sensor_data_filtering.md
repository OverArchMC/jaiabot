# Sensor Data Filtering

JaiaBots apply a live **Hampel filter** to remove outlier sensor readings during a mission. Raw readings are always preserved; filtered values are published separately so downstream consumers and log analysis can tell when a sample was rejected.

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

| Step | Sample | Window (incl. sample) | Median | MAD | Outlier? | Filtered field |
|------|--------|------------------------|--------|-----|----------|----------------|
| 1–6 | 1.0 | fewer than 7 samples | — | — | No (warmup) | 1.0 |
| 7 | 1.0 | seven 1.0 values | 1.0 | 0.0 | No | 1.0 |
| 8 | 100.0 | six 1.0 + 100.0 | 1.0 | 0.0 | Yes | omitted |
| 9 | 1.0 | six 1.0 + 1.0 | 1.0 | 0.0 | No | 1.0 |

The spike at step 8 is logged in the raw field but omitted from the filtered field.

## Complexity

| Resource | Per sample | Notes |
|----------|-----------|-------|
| Time | **O(W log W)** | Sort-based median on a window of size `W` |
| Space | **O(W)** | Circular buffer per filter instance |
| Instances | One filter per scalar field | e.g. Bar30 uses separate filters for pressure and temperature |

For `n` samples over a mission: **O(n × W log W)** total. With default `W = 7` and typical sample rates (10 Hz), cost is negligible on the Raspberry Pi.

## Configuration

Filter settings are defined in `jaiabot.sensor.protobuf.HampelFilterConfig`:

| Field | Default | Description |
|-------|---------|-------------|
| `enabled` | `true` | When false, all samples pass through unchanged |
| `window_size` | `7` | Sliding window length (must be odd, ≥ 3) |
| `mad_threshold` | `3.0` | Multiplier `k` in `k × MAD` |

Per-sensor overrides are set in each driver thread config under `jaiabot_sensors`, or in `jaiabot_udp_gateway` for HYDRO pressure/temperature data.

## Raw vs filtered fields

| Field pattern | Meaning |
|---------------|---------|
| `*_raw` or unqualified sensor reading | Actual value from hardware |
| `*_filtered` | Value after Hampel acceptance; omitted when sample is an outlier |

In HDF5 logs and the Jaia Data Visualizer, a missing filtered field at a timestamp indicates that sample was rejected as an outlier while the raw value was still recorded.

## Implementation

- Utility: `src/lib/utils/hampel_filter.h`
- Config proto: `src/lib/messages/sensor/hampel_filter_config.proto`
- Applied live in `jaiabot_sensors` drivers and `jaiabot_udp_gateway`

**Reference:** Hampel, F.R. (1974). The influence curve and its role in robust estimation.

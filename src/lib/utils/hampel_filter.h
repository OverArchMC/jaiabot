/**
 * @file hampel_filter.h
 * @brief Hampel filter for live sensor outlier rejection.
 *
 * Uses a sliding window median and median absolute deviation (MAD) to classify
 * samples as outliers. Raw samples are always preserved; filtered output omits
 * rejected outliers.
 */

#ifndef JAIABOT_UTILS_HAMPEL_FILTER_H
#define JAIABOT_UTILS_HAMPEL_FILTER_H

#include <algorithm>
#include <cmath>
#include <cstddef>
#include <deque>
#include <stdexcept>
#include <vector>

namespace jaiabot
{
namespace utils
{

struct HampelFilterConfig
{
    std::size_t window_size{7};
    double mad_threshold{3.0};
    bool enabled{true};
};

enum class HampelFilterResult
{
    ACCEPTED,
    OUTLIER,
    WARMUP
};

/**
 * @brief Computes the median of a non-empty vector.
 *
 * @param values Sample values (may be reordered in place)
 * @return double Median value
 */
inline double median(std::vector<double> values)
{
    if (values.empty())
    {
        throw std::invalid_argument("median requires at least one value");
    }

    const std::size_t mid = values.size() / 2;
    std::nth_element(values.begin(), values.begin() + static_cast<std::ptrdiff_t>(mid),
                     values.end());

    if (values.size() % 2 == 1)
    {
        return values[mid];
    }

    const double upper = values[mid];
    const double lower =
        *std::max_element(values.begin(), values.begin() + static_cast<std::ptrdiff_t>(mid));
    return (lower + upper) / 2.0;
}

/**
 * @brief Computes the median absolute deviation for a sample window.
 *
 * @param values Sample window
 * @param window_median Median of the window
 * @return double MAD value
 */
inline double median_absolute_deviation(const std::vector<double>& values, double window_median)
{
    std::vector<double> deviations;
    deviations.reserve(values.size());
    for (const double value : values)
    {
        deviations.push_back(std::abs(value - window_median));
    }
    return median(std::move(deviations));
}

/**
 * @brief Returns true when a sample is an outlier in the given window.
 *
 * @param sample Current sample
 * @param window Sliding window including the current sample
 * @param mad_threshold Multiplier k in k * MAD
 * @return bool True when |sample - median| > k * MAD
 */
inline bool is_hampel_outlier(double sample, const std::vector<double>& window,
                              double mad_threshold)
{
    if (window.empty())
    {
        return false;
    }

    const double window_median = median(std::vector<double>(window));
    const double mad = median_absolute_deviation(window, window_median);
    return std::abs(sample - window_median) > mad_threshold * mad;
}

/**
 * @brief Stateful Hampel filter for live sensor streams.
 *
 * Rejected outliers are not added to the internal window so spikes do not
 * pollute subsequent median estimates.
 */
class HampelFilter
{
  public:
    explicit HampelFilter(HampelFilterConfig config = {}) : config_(validate_config(config)) {}

    /**
     * @brief Classify a sample and optionally return its filtered value.
     *
     * @param sample Incoming sensor reading
     * @param filtered_out Set to sample when accepted or during warmup
     * @return HampelFilterResult Classification result
     */
    HampelFilterResult filter(double sample, double& filtered_out)
    {
        if (!config_.enabled)
        {
            filtered_out = sample;
            return HampelFilterResult::ACCEPTED;
        }

        if (buffer_.size() < config_.window_size - 1)
        {
            append_sample(sample);
            filtered_out = sample;
            return HampelFilterResult::WARMUP;
        }

        std::vector<double> window(buffer_.begin(), buffer_.end());
        window.push_back(sample);

        if (is_hampel_outlier(sample, window, config_.mad_threshold))
        {
            return HampelFilterResult::OUTLIER;
        }

        append_sample(sample);
        filtered_out = sample;
        return HampelFilterResult::ACCEPTED;
    }

    void reset()
    {
        buffer_.clear();
    }

    const HampelFilterConfig& config() const { return config_; }

  private:
    static HampelFilterConfig validate_config(HampelFilterConfig config)
    {
        if (config.window_size < 3 || config.window_size % 2 == 0)
        {
            throw std::invalid_argument("HampelFilter window_size must be odd and >= 3");
        }
        return config;
    }

    void append_sample(double sample)
    {
        buffer_.push_back(sample);
        while (buffer_.size() > config_.window_size)
        {
            buffer_.pop_front();
        }
    }

    HampelFilterConfig config_;
    std::deque<double> buffer_;
};

} // namespace utils
} // namespace jaiabot

#endif

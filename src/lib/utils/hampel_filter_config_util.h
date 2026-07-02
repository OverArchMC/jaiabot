#ifndef JAIABOT_UTILS_HAMPEL_FILTER_CONFIG_UTIL_H
#define JAIABOT_UTILS_HAMPEL_FILTER_CONFIG_UTIL_H

#include "jaiabot/messages/sensor/hampel_filter_config.pb.h"
#include "jaiabot/utils/hampel_filter.h"

namespace jaiabot
{
namespace utils
{

inline HampelFilterConfig hampel_filter_config_from_proto(
    const sensor::protobuf::HampelFilterConfig& proto_config)
{
    HampelFilterConfig config;
    if (proto_config.has_enabled())
    {
        config.enabled = proto_config.enabled();
    }
    if (proto_config.has_window_size())
    {
        config.window_size = proto_config.window_size();
    }
    if (proto_config.has_mad_threshold())
    {
        config.mad_threshold = proto_config.mad_threshold();
    }
    return config;
}

} // namespace utils
} // namespace jaiabot

#endif

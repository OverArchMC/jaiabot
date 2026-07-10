import { useEffect, useState } from "react";

import { taskPacketFilter } from "../../../data/task_packets/task-packet-filter";
import {
    fetchTaskPackets,
    getAllTaskPackets,
    getTaskPacketQueryUrl,
    invalidateTaskPacketVersion,
} from "../../../data/task_packets/task-packet-fetch";
import { syncTaskLayers } from "../../../context/handlers/handler-utils";
import { jaiaAPI } from "../../../utils/jaia-api";

import Checkbox from "@mui/material/Checkbox";
import Slider from "@mui/material/Slider";
import { grey } from "@mui/material/colors";

import "./TaskPacketFilterPanel.less";

function formatPacketTime(timestampMicroseconds: number): string {
    return new Date(timestampMicroseconds / 1000).toLocaleString([], {
        dateStyle: "medium",
        timeStyle: "short",
    });
}

function getDefaultEndDate(): string {
    return new Date().toISOString().slice(0, 10);
}

function getDefaultStartDate(): string {
    const date = new Date();
    date.setDate(date.getDate() - 7);
    return date.toISOString().slice(0, 10);
}

/**
 * Panel for filtering task packets by date range, mission, and time slider.
 */
export default function TaskPacketFilterPanel() {
    const [startDate, setStartDate] = useState(
        taskPacketFilter.getStartDate() || getDefaultStartDate(),
    );
    const [endDate, setEndDate] = useState(taskPacketFilter.getEndDate() || getDefaultEndDate());
    const [missionNameQuery, setMissionNameQuery] = useState("");
    const [nameOptions, setNameOptions] = useState<string[]>([]);
    const [missionSummaries, setMissionSummaries] = useState(
        taskPacketFilter.getMissionSummaries(),
    );
    const [selectedMissions, setSelectedMissions] = useState(
        new Set(taskPacketFilter.getSelectedMissions()),
    );
    const [timeRange, setTimeRange] = useState(taskPacketFilter.getTimeRange());
    const [sliderBounds, setSliderBounds] = useState(taskPacketFilter.getSliderBounds());
    const [isSearching, setIsSearching] = useState(false);
    const [searchError, setSearchError] = useState("");

    useEffect(() => {
        const interval = setInterval(() => {
            setTimeRange(taskPacketFilter.getTimeRange());
            setSliderBounds(taskPacketFilter.getSliderBounds());
        }, 1000);

        return () => clearInterval(interval);
    }, []);

    useEffect(() => {
        if (!startDate || !endDate) {
            setNameOptions([]);
            return;
        }

        const timer = setTimeout(() => {
            jaiaAPI
                .getTaskPackets(`${startDate} 00:00`, `${endDate} 23:59`)
                .then((response) => {
                    const allPackets = response.result.included.concat(response.result.excluded);
                    setNameOptions(taskPacketFilter.getMissionNameOptions(allPackets));
                })
                .catch((error) => {
                    console.error(error);
                });
        }, 400);

        return () => clearTimeout(timer);
    }, [startDate, endDate]);

    const handleSearch = async () => {
        if (!startDate || !endDate) {
            setSearchError("Choose a start and end date.");
            return;
        }

        setIsSearching(true);
        setSearchError("");

        try {
            const url = getTaskPacketQueryUrl(startDate, endDate);
            await fetchTaskPackets(url);
            const allPackets = getAllTaskPackets();
            taskPacketFilter.activateSearch(startDate, endDate, allPackets, missionNameQuery);
            setMissionSummaries(taskPacketFilter.getMissionSummaries());
            setSelectedMissions(new Set());
            setTimeRange(null);
            setSliderBounds(null);
        } catch (error) {
            console.error(error);
            setSearchError("Could not load task packets for that date range.");
        }

        setIsSearching(false);
    };

    const handleMissionToggle = (missionKey: string) => {
        const updatedSelection = new Set(selectedMissions);
        if (updatedSelection.has(missionKey)) {
            updatedSelection.delete(missionKey);
        } else {
            updatedSelection.add(missionKey);
        }

        taskPacketFilter.setSelectedMissions(updatedSelection);
        setSelectedMissions(updatedSelection);
        setTimeRange(taskPacketFilter.getTimeRange());
        setSliderBounds(taskPacketFilter.getSliderBounds());
        syncTaskLayers();
    };

    const handleTimeRangeChange = (_event: Event, value: number | number[]) => {
        if (!Array.isArray(value) || value.length !== 2 || !sliderBounds) {
            return;
        }

        const [start, end] = value;
        const followEnd = end >= sliderBounds[1];
        taskPacketFilter.setTimeRange(start, end, followEnd);
        setTimeRange([start, end]);
        syncTaskLayers();
    };

    const handleClear = async () => {
        taskPacketFilter.clear();
        setMissionSummaries([]);
        setSelectedMissions(new Set());
        setTimeRange(null);
        setSliderBounds(null);
        setSearchError("");
        invalidateTaskPacketVersion();

        try {
            await fetchTaskPackets();
        } catch (error) {
            console.error(error);
        }
    };

    const checkboxStyle = {
        "&.Mui-checked": { color: grey[200] },
        color: grey[400],
        padding: "4px",
    };

    return (
        <div className="jaia-panel task-packet-filter-panel">
            <div className="jaia-panel-title">Task Packet Filter</div>

            <div className="filter-field">
                <label htmlFor="task-packet-start-date">Start date</label>
                <input
                    id="task-packet-start-date"
                    type="date"
                    value={startDate}
                    onChange={(event) => setStartDate(event.target.value)}
                />
            </div>

            <div className="filter-field">
                <label htmlFor="task-packet-end-date">End date</label>
                <input
                    id="task-packet-end-date"
                    type="date"
                    value={endDate}
                    onChange={(event) => setEndDate(event.target.value)}
                />
            </div>

            <div className="filter-field">
                <label htmlFor="task-packet-mission-name">Mission name</label>
                <input
                    id="task-packet-mission-name"
                    type="text"
                    list="task-packet-mission-names"
                    placeholder="Optional"
                    value={missionNameQuery}
                    onChange={(event) => setMissionNameQuery(event.target.value)}
                />
                <datalist id="task-packet-mission-names">
                    {nameOptions.map((name) => (
                        <option key={name} value={name} />
                    ))}
                </datalist>
            </div>

            <div className="filter-actions">
                <button type="button" onClick={handleSearch} disabled={isSearching}>
                    {isSearching ? "Searching..." : "Search"}
                </button>
                <button type="button" onClick={handleClear}>
                    Clear
                </button>
            </div>

            {searchError && <div className="filter-error">{searchError}</div>}

            {missionSummaries.length > 0 && (
                <div className="mission-results">
                    {missionSummaries.map((summary) => (
                        <label className="mission-result-row" key={summary.key || "unnamed"}>
                            <Checkbox
                                checked={selectedMissions.has(summary.key)}
                                onChange={() => handleMissionToggle(summary.key)}
                                sx={checkboxStyle}
                            />
                            <div className="mission-result-details">
                                <div className="mission-result-name">{summary.displayName}</div>
                                <div className="mission-result-meta">
                                    {formatPacketTime(summary.startTime)} · {summary.packetCount}{" "}
                                    packets
                                </div>
                            </div>
                        </label>
                    ))}
                </div>
            )}

            {timeRange && sliderBounds && selectedMissions.size > 0 && (
                <div className="time-slider-container">
                    <div className="time-slider-labels">
                        <span>{formatPacketTime(timeRange[0])}</span>
                        <span>{formatPacketTime(timeRange[1])}</span>
                    </div>
                    <Slider
                        value={timeRange}
                        min={sliderBounds[0]}
                        max={sliderBounds[1]}
                        onChange={handleTimeRangeChange}
                        valueLabelDisplay="auto"
                        valueLabelFormat={(value) => formatPacketTime(value)}
                        disableSwap
                    />
                </div>
            )}
        </div>
    );
}

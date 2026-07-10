import { convertHTMLStrDateToISO } from "../../shared/Utilities";
import { TaskPacket } from "../../types/protobuf-types";
import { syncTaskLayers } from "../../context/handlers/handler-utils";
import { taskPacketFilter } from "./task-packet-filter";
import { taskPackets } from "./task-packets";

const TASK_PACKET_URL = "/jaia/v0/task-packets";

export function getTaskPacketQueryUrl(startDate?: string, endDate?: string): string {
    if (!startDate || !endDate) {
        return TASK_PACKET_URL;
    }

    const startDateStr = convertHTMLStrDateToISO(`${startDate} 00:00`);
    const endDateStr = convertHTMLStrDateToISO(`${endDate} 23:59`);
    return `${TASK_PACKET_URL}?startDate=${encodeURIComponent(startDateStr)}&endDate=${encodeURIComponent(endDateStr)}`;
}

export function getActiveTaskPacketQueryUrl(): string {
    if (!taskPacketFilter.isActive()) {
        return TASK_PACKET_URL;
    }

    return getTaskPacketQueryUrl(taskPacketFilter.getStartDate(), taskPacketFilter.getEndDate());
}

export function getDateRangeQueryParams(): { startDate?: string; endDate?: string } {
    if (!taskPacketFilter.isActive()) {
        return {};
    }

    const startDate = taskPacketFilter.getStartDate();
    const endDate = taskPacketFilter.getEndDate();
    if (!startDate || !endDate) {
        return {};
    }

    return {
        startDate: `${startDate} 00:00`,
        endDate: `${endDate} 23:59`,
    };
}

export function getAllTaskPackets(): TaskPacket[] {
    return taskPackets.getIncludedTaskPackets().concat(taskPackets.getExcludedTaskPackets());
}

export async function fetchTaskPackets(url = getActiveTaskPacketQueryUrl()): Promise<void> {
    const response = await fetch(url);
    if (!response.ok) {
        throw new Error(`Task packet response status: ${response.status}`);
    }

    const json = await response.json();
    taskPackets.setIncludedTaskPackets(json.result.included);
    taskPackets.setExcludedTaskPackets(json.result.excluded);
    taskPacketFilter.updateFromPackets(getAllTaskPackets());
    syncTaskLayers();
}

export function invalidateTaskPacketVersion(): void {
    taskPackets.setVersion(-1);
}

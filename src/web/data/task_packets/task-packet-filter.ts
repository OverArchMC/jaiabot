import { TaskPacket } from "../../types/protobuf-types";

export const UNNAMED_MISSION_KEY = "";

export interface MissionSummary {
    key: string;
    displayName: string;
    startTime: number;
    packetCount: number;
}

export function getPacketMissionKey(packet: TaskPacket): string {
    return packet.mission_name ?? UNNAMED_MISSION_KEY;
}

export function getMissionDisplayName(key: string): string {
    return key === UNNAMED_MISSION_KEY ? "Unnamed" : key;
}

export function buildMissionSummaries(packets: TaskPacket[], nameQuery = ""): MissionSummary[] {
    const byMission = new Map<string, { startTime: number; packetCount: number }>();

    for (const packet of packets) {
        const key = getPacketMissionKey(packet);
        const startTime = packet.start_time ?? 0;
        const existing = byMission.get(key);

        if (!existing) {
            byMission.set(key, { startTime, packetCount: 1 });
            continue;
        }

        existing.packetCount++;
        if (startTime < existing.startTime) {
            existing.startTime = startTime;
        }
    }

    const query = nameQuery.trim().toLowerCase();
    return [...byMission.entries()]
        .map(([key, data]) => ({
            key,
            displayName: getMissionDisplayName(key),
            startTime: data.startTime,
            packetCount: data.packetCount,
        }))
        .filter((summary) => !query || summary.displayName.toLowerCase().includes(query))
        .sort((a, b) => a.startTime - b.startTime);
}

function getPacketTimeBounds(packet: TaskPacket): { start: number; end: number } {
    const start = packet.start_time ?? 0;
    const end = packet.end_time ?? start;
    return { start, end: Math.max(start, end) };
}

export class TaskPacketFilter {
    private active = false;
    private startDate = "";
    private endDate = "";
    private selectedMissions = new Set<string>();
    private missionSummaries: MissionSummary[] = [];
    private allPackets: TaskPacket[] = [];
    private timeRange: [number, number] | null = null;
    private followEnd = true;

    isActive(): boolean {
        return this.active;
    }

    getStartDate(): string {
        return this.startDate;
    }

    getEndDate(): string {
        return this.endDate;
    }

    getMissionSummaries(): MissionSummary[] {
        return this.missionSummaries;
    }

    getSelectedMissions(): Set<string> {
        return this.selectedMissions;
    }

    getTimeRange(): [number, number] | null {
        return this.timeRange;
    }

    getSliderBounds(): [number, number] | null {
        const bounds = this.getSelectionBounds(this.allPackets);
        if (!bounds) {
            return null;
        }

        return [bounds.min, bounds.max];
    }

    getFollowEnd(): boolean {
        return this.followEnd;
    }

    getMissionNameOptions(packets: TaskPacket[]): string[] {
        return buildMissionSummaries(packets).map((summary) => summary.displayName);
    }

    activateSearch(
        startDate: string,
        endDate: string,
        packets: TaskPacket[],
        nameQuery = "",
    ): void {
        this.active = true;
        this.startDate = startDate;
        this.endDate = endDate;
        this.allPackets = packets;
        this.selectedMissions = new Set();
        this.timeRange = null;
        this.followEnd = true;
        this.missionSummaries = buildMissionSummaries(packets, nameQuery);
    }

    setSelectedMissions(keys: Set<string>): void {
        this.selectedMissions = new Set(keys);
        if (keys.size === 0) {
            this.timeRange = null;
            this.followEnd = true;
            return;
        }
        this.resetTimeRangeFromSelection();
    }

    setTimeRange(start: number, end: number, followEnd: boolean): void {
        this.timeRange = [start, end];
        this.followEnd = followEnd;
    }

    updateFromPackets(packets: TaskPacket[]): void {
        if (!this.active) {
            return;
        }

        this.allPackets = packets;
        this.missionSummaries = buildMissionSummaries(packets);
        if (this.selectedMissions.size === 0) {
            return;
        }

        const bounds = this.getSelectionBounds(this.allPackets);
        if (!bounds || !this.timeRange) {
            this.resetTimeRangeFromSelection();
            return;
        }

        if (this.followEnd) {
            this.timeRange = [this.timeRange[0], bounds.max];
        }
    }

    clear(): void {
        this.active = false;
        this.startDate = "";
        this.endDate = "";
        this.selectedMissions = new Set();
        this.missionSummaries = [];
        this.allPackets = [];
        this.timeRange = null;
        this.followEnd = true;
    }

    includesPacket(packet: TaskPacket): boolean {
        if (!this.active) {
            return true;
        }

        if (this.selectedMissions.size === 0) {
            return true;
        }

        if (!this.selectedMissions.has(getPacketMissionKey(packet))) {
            return false;
        }

        if (!this.timeRange) {
            return true;
        }

        const packetTime = packet.start_time ?? 0;
        return packetTime >= this.timeRange[0] && packetTime <= this.timeRange[1];
    }

    private resetTimeRangeFromSelection(): void {
        const bounds = this.getSelectionBounds(this.allPackets);
        if (!bounds) {
            this.timeRange = null;
            return;
        }

        this.timeRange = [bounds.min, bounds.max];
        this.followEnd = true;
    }

    private getSelectionBounds(packets: TaskPacket[]): { min: number; max: number } | null {
        if (this.selectedMissions.size === 0) {
            return null;
        }

        let min = Number.POSITIVE_INFINITY;
        let max = Number.NEGATIVE_INFINITY;

        for (const packet of packets) {
            if (!this.selectedMissions.has(getPacketMissionKey(packet))) {
                continue;
            }

            const bounds = getPacketTimeBounds(packet);
            min = Math.min(min, bounds.start);
            max = Math.max(max, bounds.end);
        }

        if (!Number.isFinite(min) || !Number.isFinite(max)) {
            return null;
        }

        return { min, max };
    }
}

export const taskPacketFilter = new TaskPacketFilter();

import { TaskPacket } from "../../types/protobuf-types";
import { taskPacketFilter } from "./task-packet-filter";

export class TaskPackets {
    private includedTaskPackets: TaskPacket[];
    private excludedTaskPackets: TaskPacket[];
    private version: number;

    constructor() {
        this.includedTaskPackets = [];
        this.excludedTaskPackets = [];
    }

    getIncludedTaskPackets() {
        return this.includedTaskPackets;
    }

    getMapIncludedTaskPackets() {
        return this.includedTaskPackets.filter((taskPacket) =>
            taskPacketFilter.includesPacket(taskPacket),
        );
    }

    getMapExcludedTaskPackets() {
        return this.excludedTaskPackets.filter((taskPacket) =>
            taskPacketFilter.includesPacket(taskPacket),
        );
    }

    setIncludedTaskPackets(taskPackets: TaskPacket[]) {
        this.includedTaskPackets = taskPackets;
    }

    getExcludedTaskPackets() {
        return this.excludedTaskPackets;
    }

    setExcludedTaskPackets(taskPackets: TaskPacket[]) {
        this.excludedTaskPackets = taskPackets;
    }

    getVersion() {
        return this.version;
    }

    setVersion(version: number) {
        this.version = version;
    }

    getTaskPacket(botID: number, startTime: number) {
        const allTaskPackets = this.includedTaskPackets.concat(this.excludedTaskPackets);
        for (const taskPacket of allTaskPackets) {
            if (taskPacket.start_time === startTime && taskPacket.bot_id === botID) {
                return taskPacket;
            }
        }
    }
}

export const taskPackets = new TaskPackets();

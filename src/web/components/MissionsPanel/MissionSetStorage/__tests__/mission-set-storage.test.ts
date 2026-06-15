import Mission from "../../../../data/mission_set/mission";
import { missionSet } from "../../../../data/mission_set/mission-set";
import {
    listSavedMissionSetsFromHub,
    saveToHub,
    loadSnapshotFromHub,
    deleteFromHub,
} from "../mission-set-storage";

jest.mock("../../../../utils/jaia-api", () => ({
    jaiaAPI: {
        listMissionSets: jest.fn(),
        saveMissionSet: jest.fn(),
        loadMissionSet: jest.fn(),
        deleteMissionSet: jest.fn(),
    },
}));

import { jaiaAPI } from "../../../../utils/jaia-api";

const mockJaiaAPI = jaiaAPI as jest.Mocked<typeof jaiaAPI>;

describe("Mission hub storage", () => {
    beforeEach(() => {
        missionSet.deleteAllMissions();
        jest.clearAllMocks();
    });

    test("listSavedMissionSetsFromHub returns names from the hub", async () => {
        mockJaiaAPI.listMissionSets.mockResolvedValue(["mission-a", "mission-b"]);
        const names = await listSavedMissionSetsFromHub();
        expect(names).toEqual(["mission-a", "mission-b"]);
        expect(mockJaiaAPI.listMissionSets).toHaveBeenCalledTimes(1);
    });

    test("saveToHub calls the API with the current mission set snapshot", async () => {
        const mission = new Mission();
        mission.addWaypoint({ lat: 41.0, lon: -72.0 });
        missionSet.addMission(mission);
        mockJaiaAPI.saveMissionSet.mockResolvedValue(undefined);

        await saveToHub("my-missions");

        expect(mockJaiaAPI.saveMissionSet).toHaveBeenCalledTimes(1);
        const [name, snapshot] = mockJaiaAPI.saveMissionSet.mock.calls[0];
        expect(name).toBe("my-missions");
        expect(snapshot.missions.length).toBe(1);
        expect(snapshot.name).toBe("my-missions");
    });

    test("loadSnapshotFromHub returns a deserialized snapshot from the hub", async () => {
        const fakeSnapshot = {
            missions: [[1, { missionID: 1, waypoints: [], speeds: {}, repeats: 0 }]],
            nextMissionID: 2,
            missionIDInEditMode: -1,
            missionSpeeds: { transit: 2, stationkeep_outer: 2 },
            name: "my-missions",
        };
        mockJaiaAPI.loadMissionSet.mockResolvedValue(fakeSnapshot);

        const result = await loadSnapshotFromHub("my-missions");
        expect(result).not.toBeNull();
        expect(result?.name).toBe("my-missions");
        expect(result?.missions.length).toBe(1);
        expect(result?.missions[0][1]).toBeInstanceOf(Mission);
        expect(mockJaiaAPI.loadMissionSet).toHaveBeenCalledWith("my-missions");
    });

    test("loadSnapshotFromHub returns null when the hub has no entry", async () => {
        mockJaiaAPI.loadMissionSet.mockResolvedValue(null);
        const result = await loadSnapshotFromHub("nonexistent");
        expect(result).toBeNull();
    });

    test("deleteFromHub calls the API with the correct name", async () => {
        mockJaiaAPI.deleteMissionSet.mockResolvedValue(undefined);
        await deleteFromHub("my-missions");
        expect(mockJaiaAPI.deleteMissionSet).toHaveBeenCalledWith("my-missions");
    });
});

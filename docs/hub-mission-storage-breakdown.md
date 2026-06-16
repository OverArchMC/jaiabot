# Hub Mission Storage — Code Change Breakdown

This document explains every part of the code change that moved mission set storage from the browser to the hub. It is written for people who need to understand or explain the implementation, not just the user-facing behavior.

**Pull request:** Store mission sets on hub instead of browser localStorage  
**Pattern copied from:** Exclusion zone hub storage (already existed)

---

## Table of contents

1. [Big picture](#1-big-picture)
2. [What was removed](#2-what-was-removed)
3. [Server changes (`app.py`)](#3-server-changes-apppy)
4. [API client changes (`jaia-api.ts`)](#4-api-client-changes-jaia-apits)
5. [Storage layer changes (`mission-set-storage.ts`)](#5-storage-layer-changes-mission-set-storagets)
6. [UI changes](#6-ui-changes)
7. [Test changes](#7-test-changes)
8. [What did not change](#8-what-did-not-change)
9. [End-to-end flows](#9-end-to-end-flows)
10. [Quick reference table](#10-quick-reference-table)

---

## 1. Big picture

### Before
- Saved mission sets lived in the browser only (`localStorage`, key `"missionSets"`).
- Each computer had its own private list of saves.
- Save/load was instant and synchronous (no network call).

### After
- Saved mission sets live on the **hub** as JSON files.
- Anyone connected to the same hub can see and load the same saved names.
- Save/load/delete go over the network and are **async** (the UI waits for the hub to respond).

### Architecture (4 layers)

```
UI buttons/dialog
       ↓
mission-set-storage.ts   (helper functions)
       ↓
jaia-api.ts              (HTTP calls)
       ↓
app.py                   (reads/writes files on hub disk)
```

This is the same stack exclusion zones already used.

---

## 2. What was removed

These four functions were deleted from `mission-set-storage.ts`:

| Old function | What it did |
|---|---|
| `saveToLocalStorage(name)` | Wrote the current mission set into browser `localStorage` |
| `loadSnapshotFromLocalStorage(name)` | Read one mission set back out of `localStorage` |
| `deleteFromLocalStorage(name)` | Removed one entry from `localStorage` |
| `listSavedMissionSets()` | Returned all names stored in `localStorage` |

**Why removed:** The hub is now the source of truth for named saves. Keeping localStorage would mean two places to sync and confusing behavior.

**Note:** Old saves still sitting in a user's browser are **not** migrated automatically. They can recover them with file import if they exported a `.json` file earlier.

---

## 3. Server changes (`app.py`)

**File:** `src/web/server/app.py`  
**Location:** Added after the exclusion zone block (~line 301)

### `MISSION_SETS_DIR`

```python
MISSION_SETS_DIR = _LOG_DIR / 'mission-sets'
```

- **What it is:** The folder on the hub where mission set files are stored.
- **Where files go:** Usually `/var/log/jaiabot/mission-sets/` (or whatever `jaia_log_dir` is set to).
- **Why:** Same idea as `EXCLUSION_ZONES_DIR` — one folder per data type, under the hub log directory.

---

### `_mission_set_path(name)`

- **What it does:** Turns a user-provided name like `"Survey-A"` into a full file path like `.../mission-sets/Survey-A.json`.
- **Security:** Rejects bad names that could escape the folder:
  - Empty name
  - `/` or `\` in the name
  - Names starting with `.`
  - `..` in the name
- **Why:** Prevents someone from saving to `../../etc/passwd` or similar path tricks.
- **On failure:** Raises `ValueError`; the route handler returns HTTP 400 Bad Request.

---

### `GET /jaia/v0/mission-sets` → `list_mission_sets()`

- **What it does:** Lists all saved mission set names.
- **How:** Creates the folder if missing, finds all `*.json` files, returns sorted names (without the `.json` extension).
- **Response shape:** `{ "result": ["name-a", "name-b", ...] }` via `JaiaResponse`.
- **Why:** The UI needs this to populate the "Stored Mission Sets" list in the dialog.

---

### `GET /jaia/v0/mission-sets/<name>` → `get_mission_set(name)`

- **What it does:** Returns the full JSON contents of one saved mission set.
- **How:** Reads the file from disk and returns it as raw JSON text.
- **Errors:**
  - Bad name → 400 Bad Request
  - File not found → 404 Not Found
- **Why:** Called when the user clicks **Load**.

---

### `POST /jaia/v0/mission-sets/<name>` → `save_mission_set(name)`

- **What it does:** Saves (or overwrites) a mission set file.
- **How:** Writes the raw request body directly to `{name}.json`.
- **Response:** `{ "status": "ok" }`
- **Why:** Called when the user clicks **Save**. Overwriting an existing name is allowed (same as exclusion zones).

---

### `DELETE /jaia/v0/mission-sets/<name>` → `delete_mission_set(name)`

- **What it does:** Deletes one mission set file from disk.
- **Errors:** 404 if the file does not exist.
- **Why:** Called when the user clicks **Delete**.

---

## 4. API client changes (`jaia-api.ts`)

**File:** `src/web/utils/jaia-api.ts`  
**Location:** Added after the exclusion zone methods (~line 352)

These four methods are the JavaScript/TypeScript side of the HTTP calls above. The UI never calls the URLs directly — it goes through `jaiaAPI`.

### `listMissionSets(): Promise<string[]>`

- Calls `GET jaia/v0/mission-sets`
- Returns the `result` array from the response, or `[]` if missing
- **Why:** Feeds the saved-names list in the dialog

### `saveMissionSet(name, snapshot): Promise<void>`

- Calls `POST jaia/v0/mission-sets/{name}` with the snapshot object as the body
- Uses `encodeURIComponent(name)` so names with spaces or special characters work in the URL
- **Why:** Sends the in-memory mission data to the hub

### `loadMissionSet(name): Promise<any | null>`

- Calls `GET jaia/v0/mission-sets/{name}`
- Returns the parsed JSON on success
- Returns `null` on any error (including 404) — does not throw
- **Why:** Load should fail gracefully if the file is missing; the UI checks for `null`

### `deleteMissionSet(name): Promise<void>`

- Calls `DELETE jaia/v0/mission-sets/{name}`
- **Why:** Removes the file when the user deletes a save

---

## 5. Storage layer changes (`mission-set-storage.ts`)

**File:** `src/web/components/MissionsPanel/MissionSetStorage/mission-set-storage.ts`

This file sits between the UI and `jaiaAPI`. It knows about mission data (`missionSet`, `Mission`, snapshots) so the UI components stay simple.

### New import

```typescript
import { jaiaAPI } from "../../../utils/jaia-api";
```

- **Why:** Hub functions need to call the API client.

---

### `listSavedMissionSetsFromHub(): Promise<string[]>`

- **What it does:** Asks the hub for all saved mission set names.
- **Implementation:** `return jaiaAPI.listMissionSets()`
- **Why:** Replaces the old synchronous `listSavedMissionSets()` that read localStorage.

---

### `saveToHub(name): Promise<void>`

- **What it does:**
  1. Sets the in-memory mission set name: `missionSet.setName(name)`
  2. Captures a snapshot: `missionSet.captureSnapshot()`
  3. Sends it to the hub: `jaiaAPI.saveMissionSet(name, snapshot)`
- **Why:** Bundles "prepare data + upload" in one place so buttons stay thin.
- **What's in the snapshot:** missions, next mission ID, edit mode ID, speeds, and name — same data that used to go to localStorage.

---

### `loadSnapshotFromHub(name): Promise<MissionSetSnapshot | null>`

- **What it does:**
  1. Fetches raw JSON from the hub
  2. If nothing came back, returns `null`
  3. Otherwise converts JSON into proper `Mission` class objects via `deserializeMissionSetSnapshot`
- **Why:** Hub JSON is plain data. The app needs real `Mission` instances with methods, not plain objects.

---

### `deleteFromHub(name): Promise<void>`

- **What it does:** `jaiaAPI.deleteMissionSet(name)`
- **Why:** Thin wrapper, same pattern as exclusion zones.

---

### `deserializeMissionSetSnapshot(raw)` (new private helper)

- **What it does:** Converts hub JSON into a `MissionSetSnapshot`:
  - Loops over `raw.missions` and runs each through `Mission.fromJSON()`
  - Fills in defaults for missing fields (`nextMissionID`, `missionIDInEditMode`, `missionSpeeds`, `name`)
- **Why:** This logic used to live inside `loadSnapshotFromLocalStorage`. Hub load needs the same conversion step.
- **Not exported:** Only used inside this file.

---

### Unchanged in this file

These were **not** modified:

| Function | Purpose |
|---|---|
| `exportMissionSetToFile` | Download a `.json` file to the user's computer |
| `loadSnapshotFromFile` | Import from a picked file |
| `extractMissionSetSnapshot` | Parse current-format file imports |
| `extractLegacyMissionData` | Parse old Jaia ≤2.3 file imports |
| `LoadResultType` / `LoadSnapshotResult` | Types for file import results |

**Why kept:** File export/import is still useful for backups and moving data between hubs. It is separate from hub save/load.

---

## 6. UI changes

All UI changes follow the **Zone Storage** dialog pattern in `ExclusionZonesPanel/ZoneStorage/`.

---

### `MissionSetStorageDialog.tsx`

**File:** `src/web/components/MissionsPanel/MissionSetStorage/MissionSetStorageDialog.tsx`

#### New state: `savedNames`

```typescript
const [savedNames, setSavedNames] = useState<string[]>([]);
```

- **What:** Holds the list of names fetched from the hub.
- **Why:** Before, the list came from synchronous localStorage. Hub fetch is async, so we store results in state and re-render when they arrive.

#### New function: `refreshNames()`

- Calls `listSavedMissionSetsFromHub()`
- On success: updates `savedNames`
- On failure: sets `savedNames` to `[]` (empty list, no crash)
- **Why:** Called on dialog open and again after save/delete so the list stays current.

#### New hook: `useEffect(() => { refreshNames(); }, [])`

- **What:** Runs `refreshNames()` once when the dialog opens.
- **Why:** Populates the list as soon as the user opens Mission Set Storage.

#### List rendering change

- **Before:** `listSavedMissionSets().map(...)` — synchronous, read localStorage every render
- **After:** `savedNames.map(...)` — renders from state filled by the hub

#### New props passed to buttons

| Button | New props | Purpose |
|---|---|---|
| Save | `savedNames`, `onSaved={refreshNames}` | Check overwrite against hub list; refresh list after save |
| Load | `savedNames` | Check name exists on hub before loading |
| Delete | `savedNames`, `onDeleted={refreshNames}` | Check name exists; refresh list after delete |

#### Comment update

- Mission set row comment now says "stored on the Hub" instead of "in local storage".

---

### `SaveMissionSetButton.tsx`

**File:** `src/web/components/MissionsPanel/MissionSetStorage/SaveMissionSetButton/SaveMissionSetButton.tsx`

#### New props

- `savedNames: string[]` — list from hub (passed down by dialog)
- `onSaved: () => void` — callback to refresh the list after a successful save

#### `getDisabledCode()` change

- **Before:** `listSavedMissionSets().includes(props.saveName)` — checked localStorage
- **After:** `props.savedNames.includes(props.saveName.trim())` — checks hub list
- Also trims whitespace from the name before checking.

#### Save action change

- **Before:** `saveToLocalStorage(props.saveName)` — instant, synchronous
- **After:**
  ```typescript
  saveToHub(props.saveName.trim()).then(() => {
      jaiaDispatch({ type: CHANGE_MISSION_SET_NAME, missionSetName: ... });
      props.onSaved();
  });
  ```
- **`saveToHub`:** uploads to hub
- **`CHANGE_MISSION_SET_NAME`:** updates the displayed mission set name in the app state (same as when the user renames in the missions panel)
- **`onSaved`:** tells the dialog to re-fetch the name list

#### New: `JaiaDispatchContext`

- Save button now uses React context to dispatch the name change.
- **Why:** Matches how `SaveZoneButton` works for exclusion zones.

---

### `LoadMissionSetButton.tsx`

**File:** `src/web/components/MissionsPanel/MissionSetStorage/LoadMissionSetButton/LoadMissionSetButton.tsx`

#### New prop: `savedNames`

- Used to verify the name exists on the hub before allowing load.

#### `getDisabledCode()` change

- **Before:** Checked localStorage list
- **After:** `!props.savedNames.includes(props.saveName.trim())` → shows "file not found" style warning

#### Load action change

- **Before:** `loadSnapshotFromLocalStorage(props.saveName)` — instant
- **After:**
  ```typescript
  loadSnapshotFromHub(props.saveName.trim()).then((snapshot) => {
      if (snapshot) {
          jaiaDispatch({ type: LOAD_MISSION_SET, missionSetSnapshot: snapshot });
          props.onClose();
      }
  });
  ```
- **`loadSnapshotFromHub`:** fetches from hub and deserializes
- **`LOAD_MISSION_SET`:** existing action — replaces current missions, clears bot assignments, runs exclusion-zone conflict checks
- **`if (snapshot)`:** only loads if hub returned data; silently does nothing if null

---

### `DeleteMissionSetButton.tsx`

**File:** `src/web/components/MissionsPanel/MissionSetStorage/DeleteMissionSetButton/DeleteMissionSetButton.tsx`

#### New props

- `savedNames: string[]` — verify name exists on hub
- `onDeleted: () => void` — refresh list after delete

#### Delete action change

- **Before:** `deleteFromLocalStorage(props.saveName)` — instant, returned `true`/`false`
- **After:**
  ```typescript
  deleteFromHub(props.saveName.trim()).then(() => {
      props.clearSaveName();
      props.onDeleted();
  });
  ```
- **`clearSaveName`:** clears the name input field (unchanged behavior)
- **`onDeleted`:** re-fetches the hub name list

---

## 7. Test changes

**File:** `src/web/components/MissionsPanel/MissionSetStorage/__tests__/mission-set-storage.test.ts`

### What changed

| Before | After |
|---|---|
| Tested localStorage read/write | Tests hub API calls via mocks |
| Used `localStorage.clear()` in setup | Mocks `jaiaAPI` methods with Jest |
| One big integration-style test | Five focused async unit tests |

### Mock setup

```typescript
jest.mock("../../../../utils/jaia-api", () => ({
    jaiaAPI: {
        listMissionSets: jest.fn(),
        saveMissionSet: jest.fn(),
        loadMissionSet: jest.fn(),
        deleteMissionSet: jest.fn(),
    },
}));
```

- **Why:** Tests should not need a real hub or real HTTP. They verify our functions call the API correctly and handle responses.

### Tests included

1. **List** — `listSavedMissionSetsFromHub` returns what the API returns
2. **Save** — `saveToHub` calls API with correct name and snapshot containing missions
3. **Load** — `loadSnapshotFromHub` deserializes missions into `Mission` instances
4. **Load missing** — returns `null` when hub has no entry
5. **Delete** — `deleteFromHub` calls API with correct name

---

## 8. What did not change

These parts of the codebase were **intentionally left alone**:

| Area | Why unchanged |
|---|---|
| `mission-set.ts` (data model) | Already had `captureSnapshot()` / `restoreFromSnapshot()` — works for both localStorage and hub |
| `handleLoadMissionSet` in `mission-handlers.ts` | Still the single place that applies a loaded snapshot to the UI; only the *source* of the snapshot changed |
| Export / Import buttons | Still use file download/upload — independent of hub storage |
| Starting missions on bots (`MISSION_PLAN` commands) | Runtime bot control, not related to saving named sets |
| Exclusion zone code | Already on hub; used as the template, not modified |
| Auto-load on page connect | Nothing loads from hub automatically — user must click **Load** |

---

## 9. End-to-end flows

### Save flow

1. User edits missions in JCC (in memory only).
2. User opens **Mission Set Storage**, types a name, clicks **Save**.
3. `SaveMissionSetButton` → `saveToHub(name)`
4. `saveToHub` → `missionSet.captureSnapshot()` → `jaiaAPI.saveMissionSet`
5. HTTP POST → `app.py` writes `{jaia_log_dir}/mission-sets/{name}.json`
6. On success: dispatch `CHANGE_MISSION_SET_NAME`, refresh name list in dialog.

### Load flow

1. User opens dialog → `refreshNames()` fetches list from hub.
2. User selects a name, clicks **Load**.
3. `LoadMissionSetButton` → `loadSnapshotFromHub(name)`
4. HTTP GET → `app.py` reads file → returns JSON
5. `deserializeMissionSetSnapshot` converts JSON to `Mission` objects
6. Dispatch `LOAD_MISSION_SET` → `handleLoadMissionSet` replaces current missions.

### Delete flow

1. User selects a name, clicks **Delete**, confirms.
2. `DeleteMissionSetButton` → `deleteFromHub(name)`
3. HTTP DELETE → `app.py` deletes file
4. Clear name field, refresh name list.

### List flow (dialog open)

1. Dialog mounts → `useEffect` runs `refreshNames()`
2. `listSavedMissionSetsFromHub()` → `jaiaAPI.listMissionSets()`
3. HTTP GET → `app.py` scans folder, returns sorted names
4. Names appear in the list on the left side of the dialog.

---

## 10. Quick reference table

| Layer | File | New symbols |
|---|---|---|
| Server | `src/web/server/app.py` | `MISSION_SETS_DIR`, `_mission_set_path`, `list_mission_sets`, `get_mission_set`, `save_mission_set`, `delete_mission_set` |
| API client | `src/web/utils/jaia-api.ts` | `listMissionSets`, `saveMissionSet`, `loadMissionSet`, `deleteMissionSet` |
| Storage | `mission-set-storage.ts` | `listSavedMissionSetsFromHub`, `saveToHub`, `loadSnapshotFromHub`, `deleteFromHub`, `deserializeMissionSetSnapshot` |
| UI | `MissionSetStorageDialog.tsx` | `savedNames`, `refreshNames`, `useEffect` |
| UI | `SaveMissionSetButton.tsx` | hub save, `savedNames`, `onSaved`, dispatch name change |
| UI | `LoadMissionSetButton.tsx` | hub load, `savedNames`, async dispatch |
| UI | `DeleteMissionSetButton.tsx` | hub delete, `savedNames`, `onDeleted` |
| Tests | `mission-set-storage.test.ts` | mock-based hub storage tests |

| Removed | Replaced by |
|---|---|
| `saveToLocalStorage` | `saveToHub` |
| `loadSnapshotFromLocalStorage` | `loadSnapshotFromHub` |
| `deleteFromLocalStorage` | `deleteFromHub` |
| `listSavedMissionSets` | `listSavedMissionSetsFromHub` |

---

## One-line summary for each file

- **`app.py`** — Added hub endpoints that read/write mission JSON files on disk.
- **`jaia-api.ts`** — Added four HTTP wrapper methods the UI can call.
- **`mission-set-storage.ts`** — Swapped localStorage for hub calls; added JSON-to-Mission conversion on load.
- **`MissionSetStorageDialog.tsx`** — Fetches saved names from hub when opened; refreshes after save/delete.
- **`SaveMissionSetButton.tsx`** — Saves to hub instead of browser; updates app name after save.
- **`LoadMissionSetButton.tsx`** — Loads from hub instead of browser; same load action as before.
- **`DeleteMissionSetButton.tsx`** — Deletes from hub instead of browser; refreshes list after.
- **`mission-set-storage.test.ts`** — Tests hub storage with mocked API instead of localStorage.

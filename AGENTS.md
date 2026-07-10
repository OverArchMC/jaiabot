# AGENTS.md

## Cursor Cloud specific instructions

This section captures non-obvious, durable facts for developing JaiaBot in the Cursor Cloud
environment. Standard setup/build/run steps live in `README.md` and
`src/doc/markdown/page120_working_with_jaia_software.md`; only the gotchas are repeated here.

### Product / services overview
JaiaBot is an autonomous marine-drone platform. The primary local end-to-end dev flow is:
`./build.sh` → run the JCC web stack (`src/web/run.sh`) → launch the simulator
(`config/launch/simulation`) → drive/monitor the fleet in JCC at `http://localhost:40001`.
There is no database; logs are file-based under `~/jaia-logs`. JDV (`src/web/jdv`) and the
REST API (`src/web/rest_api`, port 9092) are optional extras.

### Compiler: must use gcc/g++, not clang (critical)
The base image sets the `cc`/`c++` alternatives to **clang 18**, and clang fails to link
`libstdc++` here, so CMake's compiler check fails with `cannot find -lstdc++`. The project
builds with **gcc 13 / g++ 13**. This environment already selects gcc via:
`sudo update-alternatives --set c++ /usr/bin/g++` and `sudo update-alternatives --set cc /usr/bin/gcc`.
If a build ever fails on the compiler check, re-run those two commands.

### Node / nvm (run build & web in a login shell)
Node **v24.14.0** is provided by nvm (version pinned in `scripts/common-versions.env`). A
system `/exec-daemon/node` (v22) can shadow nvm's node in non-login shells, which makes
`npm install -g` resolve its prefix to `/` and fail. Run `./build.sh` and `src/web/run.sh`
from a **login shell** (e.g. `bash -lc "./build.sh"`) so nvm's node wins. Do **not** set
`prefix`/`globalconfig` in `~/.npmrc` — it breaks nvm; global npm packages must live in nvm's
node dir.

### Git version tag required for the build
`cmake/JaiaVersions.cmake` derives the version from `git describe --tags` and fails if no
`X.Y.Z` tag is reachable. This fork has no tags, so a **local** tag `2.0.0` is created (not
pushed). If `git describe --tags` fails, run `git tag 2.0.0`.

### Extra system packages (beyond the setup scripts)
`scripts/setup-tools-build.sh` + `scripts/setup-tools-runtime.sh` do most of the work, but the
following are also required and are installed in this environment: `gpsd` (sim hub/bot launch),
`rsync` (`src/python/build_venv.sh`), `python3-netifaces` (config generators
`config/gen/*.py`), `python3.12-venv` (venv creation), and `clang-format` (C++ pre-commit
lint). `python3-netifaces` installed via apt is visible to the venv (built with
`--system-site-packages`).

### Running the stack
- Build: `bash -lc "./build.sh"` (outputs to `build/amd64/`; ~5 min on 4 cores). Runtime
  binaries also come from apt (`/usr/bin`, e.g. `goby_moos_gateway`, `MOOSDB`).
- JCC web (dev): `cd src/web && ./run.sh`. Serves JCC on `http://localhost:40001` and connects
  to the hub's `jaiabot_web_portal` on UDP `40000`. It prints `🏓 Pinging server localhost:40000`
  until the simulator is running — this is expected, not an error. `run.sh` also builds the
  `build/web_dev/python` venv (also used by the sim) and runs `webpack --watch`.
- Simulator: `cd config/launch/simulation && export jaia_fleet_index=0 && ./generate_all_launch.sh <n_bots> <warp> w && ./all.launch`.
  `jaia_fleet_index` **must** be exported. `w` = wifi comms (simplest; no XBee sim). Per-process
  logs are under `~/jaia-logs/<hub|bot>/<n>/` (text logs are often empty; data goes to the
  binary `.goby` file). Keep the sim to ~2 bots on a 4-core VM.
- Stop the sim: `scripts/kill-jaiabot-processes.sh` (never `pkill` broadly).

### Commanding a mission (state machine order)
Bots boot to `PRE_DEPLOYMENT__IDLE`. To run a mission (via JCC UI or the JCC HTTP API under
`/jaia/v0/...` with a `clientId` header): take control → `ACTIVATE` (runs self-test →
`PRE_DEPLOYMENT__WAIT_FOR_MISSION_PLAN`) → send a `MISSION_PLAN` / single-waypoint mission →
bot enters `IN_MISSION__UNDERWAY__MOVEMENT__TRANSIT` and navigates. Sending only a plan while
`IDLE` does nothing.

### Tests & lint
- Web (Jest): `cd src/web && npm test`.
- Web lint (Prettier, used by the pre-commit hook): `cd src/web && npx prettier --check "<glob>"`.
- Python: `cd src/python/pyjaia/tests && python -m pytest` with the venv activated
  (`source build/web_dev/python/venv/bin/activate`). Run from the `tests/` dir so the
  `test.h5` fixture resolves.
- C++ (CTest): tests are **off** by default; configure with
  `JAIABOT_CMAKE_FLAGS="-Denable_testing=ON" ./build.sh`, then `ctest` in `build/amd64`.

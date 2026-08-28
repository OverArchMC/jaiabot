# AGENTS.md

## Cursor Cloud specific instructions

JaiaBot is a **Ubuntu 24.04 (noble)** C++/MOOS/Goby + Python + React monorepo. Full developer setup is documented in `README.md` and https://docs.jaia.tech/.

### One-time / heavy setup (not in the VM update script)

1. **System dependencies:** `sudo ./scripts/setup-tools-build.sh` (Jaia/Goby apt repos, `build-dep jaiabot`, nvm, Node **v24.14.0**, global webpack, arduino-cli, clang-format pre-commit hook).
2. **Minimal image extras:** If CMake fails linking with `cannot find -lstdc++`, install `sudo apt-get install -y build-essential libstdc++-14-dev`.
3. **nvm vs platform Node:** Cloud images may ship Node under `/exec-daemon/node` with a broken global `npm` prefix. After setup, use nvm only (`export NVM_DIR="$HOME/.nvm" && . "$NVM_DIR/nvm.sh" && nvm use v24.14.0`). Do **not** add a `prefix=` line to `~/.npmrc` (nvm will refuse to run). If `setup-tools-build.sh` dies on `npm install -g`, finish with `nvm use v24.14.0` then `npm install -g npm@11.2.0 webpack@5.105.4 webpack-cli@6.0.1`.
4. **Git version for CMake:** `cmake/JaiaVersions.cmake` requires `git describe --tags` to match `X.Y.Z`. Shallow clones with **no tags** fail configure. Fix with `git fetch --tags origin` or, if tags are unavailable, `git tag 2.6.0 HEAD` (adjust version to match the branch).
5. **Build:** `git submodule update --init --recursive`, then `./build.sh` with nvm loaded. Use `JAIABOT_CMAKE_FLAGS="-Denable_testing=ON"` and `JAIA_BUILD_NPROC=4` on 4-core VMs (~4–5 minutes after deps are installed).

### Verify (from repo root, nvm loaded)

| Check | Command |
|--------|---------|
| C++ tests | `cd build/amd64 && ctest --output-on-failure` |
| Web (Jest) | `cd build/amd64/intermediate/web && npm test` |
| Python (`pyjaia`) | Build venv first: `src/python/build_venv.sh <parent-dir>`, install package, then `pytest` under `src/python/pyjaia/tests/` |

### Running the stack locally

- **Fastest E2E demo (sim + JCC + JDV + REST):** `cd scripts/sim-docker && sudo docker compose up -d jaia-sim` — ports **40001** (JCC), **40011** (JDV), **9092** (REST). Docker in this environment needs `sudo` unless the user is in the `docker` group.
- **Native sim (after `./build.sh`):** `config/launch/simulation/generate_all_launch.sh` then `./all.launch`; web UIs via `src/web/run.sh`.
- **Web-only dev:** `src/web/run.sh [hub_hostname]` (expects a running hub portal).

### Gotchas

- Always **source nvm** before `./build.sh` or web builds; the script assumes webpack/npm from nvm.
- Reinstalling npm deps without rebuilding does not refresh C++ binaries under `build/amd64/bin/`.
- REST API in the sim container may return **403** for some routes until the hub/API is fully initialized; JCC on port 40001 is the reliable smoke check (`curl -s http://localhost:40001/` → title `Jaia Command & Control`).

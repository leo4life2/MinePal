# MinePal

## Overview

MinePal is a desktop Minecraft companion app built with Electron that adds an AI agent to your Minecraft world.

## Structure

![MinePal Structure](diagram.png)

- **Frontend**: Located in `frontend/`, built with React and Vite.
- **Agent**: Minecraft agent logic in `src/agent/`.
- **Libraries**: Located in `libs/`, contains several submodules:
  - `node-minecraft-protocol-forge/`
  - `mineflayer-collectblock/`
  - `mineflayer-auto-eat/`
  - `mineflayer-pvp/`
  - `prismarine-world/`
  - `mineflayer/`
  - `minecraft-protocol/`

## Setup

This section is for building an app from source. You can skip straight to [Installation guide](#installation) if you downloaded executable from [minepal.net](https://minepal.net/)

### Prerequisites

- [Node.js](https://nodejs.org/) (v14 or later)
- [Electron](https://www.electronjs.org/) (v25 or later)

### Building from source

> [!NOTE]
> Steps 2-5 can be skipped by running `setup.sh` script

1. Clone the repository

> [!WARNING]
> This project contains submodules. Use `--recurse-submodules` when cloning. If you're getting `ERESOLVE unable to resolve dependency tree` error, it means that you did not use this flag.

2. Install dependencies:

   ```sh
   npm install
   ```

3. Install and build submodules:

   ```sh
   cd libs
   for dir in */; do
     cd "$dir"
     npm install
     if [ -f "package.json" ] && grep -q "\"build\"" "package.json"; then
       npm run build
     fi
     if [ -f "package.json" ] && grep -q "\"prepare\"" "package.json"; then
       npm run prepare
     fi
     cd ..
   done
   cd ..
   ```

4. Build the frontend:
```sh
cd frontend
npm install
npm run build
```

5. Build the app:

   ```sh
   npm run buildLocal
   ```


### Installation

Once you're done with the build, check [Installation guide](#installation) to register url schemas and setup the AppImage system-wide.

## License

[MIT](LICENSE)

## Known issues

Sometimes on linux it fails to fetch Minecraft version that results in execption like this in `agent.log`:
```
[_processingLoop] Error during prompt cycle: TypeError: Cannot read properties of undefined (reading 'blocks')
  at MCData.getAllBlocks
  at MCData.getAllBlockIds
  at Module.getNearestBlocks
```

For now we don't know why this is happening, so report this in discord or by creating an Issue
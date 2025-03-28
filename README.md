# MinePal

## Overview

MinePal is a desktop Minecraft companion app built with Electron that adds an AI agent to your Minecraft world.

## Structure

![MinePal Structure](diagram.png)

- **Frontend**: Located in `frontend/`, built with React and Vite.
- **Agent**: Minecraft agent logic in `src/agent/`.

## Setup

### Prerequisites

- [Node.js](https://nodejs.org/) (v14 or later)
- [Electron](https://www.electronjs.org/)

### Installation

1. Clone the repository
2. Install dependencies:

   ```sh
   npm install
   ```

3. Build the app:

   ```sh
   npm run buildLocal
   ```

### Running the App

```sh
npm start
```

### Agent

1. Navigate to `src/agent/`.
2. Actions that the bot can take are in `src/agent/commands/actions.js` or `src/agent/commands/queries.js`.

## License

MIT

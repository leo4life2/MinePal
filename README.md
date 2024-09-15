# MinePal

## Overview

MinePal is a Minecraft companion app with a React frontend, a local backend, and an AI agent.

## Structure

![MinePal Structure](diagram.png)

- **Frontend**: Located in `frontend/`, built with React and Vite.
- **Backend**: Local backend APIs in `server.js`.
- **Agent**: Minecraft agent logic in `src/agent/`.

## Setup

### Frontend

1. Navigate to `frontend/`.
2. Install dependencies:

   ```sh
   npm install
   ```

3. Build the frontend:

   ```sh
   npm run build
   ```

### Backend

Refer to the backend repository: [minepal-backend](https://github.com/leo4life2/minepal-backend).

### Agent

1. Navigate to `src/agent/`.
2. Actions that the bot can take are in `src/agent/commands/actions.js` or `src/agent/commands/queries.js`.

## License

MIT

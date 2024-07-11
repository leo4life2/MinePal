#!/bin/bash

# Function to clean up background processes
cleanup() {
  echo "Cleaning up..."
  lsof -ti :9999 | xargs kill
}
trap cleanup EXIT

# Run backend in the background
npm run backend &
BACKEND_PID=$!

# Ensure BACKEND_PID is valid
if [ -z "$BACKEND_PID" ]; then
  echo "Failed to start backend."
  exit 1
fi

# Wait a bit to see if backend fails immediately
sleep 1

# Check if backend is still running
if ! kill -0 $BACKEND_PID 2>/dev/null; then
  echo "Backend failed to start."
  exit 1
fi

# Proceed with frontend build
cd frontend
npm run build
if [ $? -ne 0 ]; then
  echo "Frontend build failed."
  exit 1
fi

# Run frontend preview
sudo npm run preview
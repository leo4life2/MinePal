#!/bin/bash

set -euo pipefail

echo "Step 1. Installing dependencies"
npm install

echo "Step 2. Installing submodules"
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

echo "Step 3. Building election"
npm run buildLocal

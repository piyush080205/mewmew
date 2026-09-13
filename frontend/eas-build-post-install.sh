#!/usr/bin/env bash
echo "Ensuring hermesc binaries are executable..."
find node_modules/hermes-compiler -type f -name hermesc -exec chmod +x {} \; 2>/dev/null || true
find node_modules/react-native -type f -name "*.sh" -exec chmod +x {} \; 2>/dev/null || true

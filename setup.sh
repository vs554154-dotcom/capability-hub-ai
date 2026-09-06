#!/bin/bash
set -e

echo "=== Setting up Capability Hub AI for Kiro Environment ==="

# 1. Install dependencies
echo "Installing npm dependencies..."
npm install

# 2. Check for .env file
if [ ! -f .env ]; then
  echo "Creating .env from .env.example..."
  cp .env.example .env
  echo "⚠️ Please set your GEMINI_API_KEY in .env file."
fi

# 3. Verify TypeScript build
echo "Verifying TypeScript types..."
npm run lint

# 4. Verify bundle build
echo "Testing build pipeline..."
npm run build

echo "✅ Environment setup complete! Run 'npm run dev' to start the application."

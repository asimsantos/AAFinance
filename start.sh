#!/bin/bash
echo "🚀 Starting A&A Finance..."
echo ""
cd "$(dirname "$0")"

# Install dependencies if needed
if [ ! -d "node_modules" ]; then
  echo "📦 Installing dependencies (first run only)..."
  npm install
  echo ""
fi

echo "✅ Starting app — opening at http://localhost:5173"
echo "   Press Ctrl+C to stop"
echo ""
npm run dev

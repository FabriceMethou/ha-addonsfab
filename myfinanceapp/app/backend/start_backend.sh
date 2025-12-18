#!/bin/bash
# Simple script to start the FastAPI backend for local/dev use

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
DATA_DIR="${PROJECT_ROOT}/data"

echo "🚀 Starting Finance Tracker Backend..."
echo ""

# Ensure local data directory exists
mkdir -p "$DATA_DIR"
if [ ! -w "$DATA_DIR" ]; then
    echo "⚠️  Data directory is not writable: $DATA_DIR"
    echo "    Fix permissions and re-run the script."
    exit 1
fi

# Set environment variables
export JWT_SECRET_KEY="${JWT_SECRET_KEY:-dev-secret-key-change-in-production}"
export PYTHONPATH="$PROJECT_ROOT"
export DATABASE_PATH="${DATA_DIR}/finance.db"

# Change to backend directory
cd "$SCRIPT_DIR"

# Check if virtual environment exists
if [ ! -d "venv" ]; then
    echo "📦 Creating virtual environment..."
    python3 -m venv venv
fi

# Activate virtual environment
source venv/bin/activate

# Install dependencies if needed
if [ ! -f "venv/.installed" ]; then
    echo "📥 Installing dependencies (this may take a minute)..."
    pip install -q --upgrade pip
    pip install -q -r requirements.txt
    touch venv/.installed
    echo "✅ Dependencies installed"
    echo ""
fi

# Start the server
echo "✨ Backend starting at http://localhost:8000"
echo "📚 API Documentation available at http://localhost:8000/docs"
echo "🔑 Health check at http://localhost:8000/health"
echo ""
echo "Press Ctrl+C to stop the server"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
uvicorn main:app --reload --host 0.0.0.0 --port 8000

#!/bin/bash
# Simple script to start the FastAPI backend

echo "🚀 Starting Finance Tracker Backend..."
echo ""

# Fix data directory permissions if needed
if [ ! -w "/home/fab/Documents/Development/myfinanceapp/data" ]; then
    echo "⚠️  Data directory needs permission fix. Running:"
    echo "   sudo chown -R $USER:$USER /home/fab/Documents/Development/myfinanceapp/data/"
    sudo chown -R $USER:$USER /home/fab/Documents/Development/myfinanceapp/data/
    echo ""
fi

# Set environment variables
export JWT_SECRET_KEY="dev-secret-key-change-in-production"
export PYTHONPATH=/home/fab/Documents/Development/myfinanceapp
export DATABASE_PATH=/home/fab/Documents/Development/myfinanceapp/data/finance.db

# Change to backend directory
cd /home/fab/Documents/Development/myfinanceapp/backend

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

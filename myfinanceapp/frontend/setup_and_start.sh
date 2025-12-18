#!/bin/bash
# Setup and start the React frontend

echo "🎨 Finance Tracker Frontend Setup"
echo "=================================="
echo ""

# Load nvm if available
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"

# Check if nvm is available and use Node 22
if command -v nvm &> /dev/null; then
    echo "📦 Setting Node.js version to 22..."
    nvm use 22 &> /dev/null || nvm install 22
    echo "✅ Using Node.js $(node --version)"
    echo "   npm: $(npm --version)"
elif ! command -v node &> /dev/null; then
    echo "❌ Node.js not found and nvm not available."
    echo "   Please install nvm or Node.js 20.19+ / 22.12+"
    exit 1
else
    echo "⚠️  Using system Node.js: $(node --version)"
    echo "   Vite requires Node.js 20.19+ or 22.12+"
    echo "   Consider using nvm for better version management"
fi

echo ""
echo "=================================="
echo ""

# Change to frontend directory
cd /home/fab/Documents/Development/myfinanceapp/frontend

# Install dependencies if needed
if [ ! -d "node_modules" ]; then
    echo "📥 Installing frontend dependencies..."
    echo "   (This may take 2-3 minutes the first time)"
    npm install
    echo ""
    echo "✅ Dependencies installed!"
else
    echo "✅ Dependencies already installed"
fi

echo ""
echo "=================================="
echo "🚀 Starting React Frontend..."
echo "=================================="
echo ""
echo "Frontend will start at: http://localhost:5173"
echo "Make sure backend is running at: http://localhost:8000"
echo ""
echo "Press Ctrl+C to stop the server"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Start the development server
npm run dev

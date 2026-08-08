#!/bin/bash
echo "Killing any old servers..."
fuser -k -9 3000/tcp 2>/dev/null || true
fuser -k -9 5500/tcp 2>/dev/null || true

echo "Starting Backend Server on port 3000..."
cd custom-backend
npm run dev &
BACKEND_PID=$!

echo "Starting Frontend Server on port 5500..."
cd ..
python3 -m http.server 5500 &
FRONTEND_PID=$!

echo ""
echo "================================================="
echo "✅ SUCCESS! Both servers are running!"
echo "➡️  Go to: http://localhost:5500"
echo "================================================="
echo "Press Ctrl+C to stop both servers."

# Wait for user to press Ctrl+C, then kill both
trap 'kill $BACKEND_PID $FRONTEND_PID; exit' INT
wait

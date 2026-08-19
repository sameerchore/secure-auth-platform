#!/bin/bash
set -Eeuo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_PID=""
FRONTEND_PID=""

cleanup() {
	echo "Stopping application services..."
	[[ -n "$BACKEND_PID" ]] && kill "$BACKEND_PID" 2>/dev/null || true
	[[ -n "$FRONTEND_PID" ]] && kill "$FRONTEND_PID" 2>/dev/null || true
}

stop_port() {
	local port="$1"
	fuser -k -TERM "$port/tcp" 2>/dev/null || true
	for attempt in {1..10}; do
		if ! fuser "$port/tcp" >/dev/null 2>&1; then
			return
		fi
		sleep 0.2
	done
	fuser -k -KILL "$port/tcp" 2>/dev/null || true
}

trap cleanup INT TERM EXIT

cd "$ROOT_DIR"

if [[ -f "$HOME/.nvm/nvm.sh" ]]; then
	export NVM_DIR="$HOME/.nvm"
	# Make nvm-managed node and npm available to this script and its children.
	# shellcheck source=/dev/null
	source "$NVM_DIR/nvm.sh"
fi

if ! command -v npm >/dev/null 2>&1; then
	for node_bin in "$HOME"/.nvm/versions/node/*/bin; do
		if [[ -x "$node_bin/npm" ]]; then
			export PATH="$node_bin:$PATH"
			break
		fi
	done
fi

command -v docker >/dev/null 2>&1 || {
	echo "ERROR: Docker is required to start PostgreSQL."
	exit 1
}
if command -v sg >/dev/null 2>&1 && getent group docker >/dev/null 2>&1; then
	DOCKER_CMD=(sg docker -c)
else
	DOCKER_CMD=(docker compose)
fi
command -v npm >/dev/null 2>&1 || {
	echo "ERROR: npm is not on PATH. Install Node.js or load nvm before running this script."
	exit 1
}
command -v python3 >/dev/null 2>&1 || {
	echo "ERROR: python3 is required to serve the frontend."
	exit 1
}

echo "Stopping old application servers..."
stop_port 3000
stop_port 5500

echo "Starting PostgreSQL with Docker Compose..."
if [[ "${DOCKER_CMD[0]}" == "sg" ]]; then
	if ! "${DOCKER_CMD[@]}" 'docker compose up -d'; then
		echo "ERROR: PostgreSQL could not start. Check Docker permission and run: docker ps"
		echo "       If permission is denied, add your user to the docker group and log in again."
		exit 1
	fi
else
	if ! docker compose up -d; then
		echo "ERROR: PostgreSQL could not start. Check Docker permission and run: docker ps"
		echo "       If permission is denied, add your user to the docker group and log in again."
		exit 1
	fi
fi

echo "Waiting for PostgreSQL on port 5433..."
database_ready=false
for attempt in {1..30}; do
	if [[ "${DOCKER_CMD[0]}" == "sg" ]]; then
		ready_output=$("${DOCKER_CMD[@]}" 'docker compose exec -T postgres pg_isready -U postgres' 2>/dev/null) || ready_output=""
	else
		ready_output=$(docker compose exec -T postgres pg_isready -U postgres 2>/dev/null) || ready_output=""
	fi
	if [[ "$ready_output" == *"accepting connections"* ]]; then
		database_ready=true
		break
	fi
	sleep 1
done

if [[ "$database_ready" != true ]]; then
	echo "ERROR: PostgreSQL did not become ready on port 5433."
	echo "       Inspect it with: docker compose logs postgres"
	exit 1
fi

echo "Applying database schema and seed data..."
(cd "$ROOT_DIR/custom-backend" && npm run setup)

echo "Starting backend API on port 3000..."
if curl -fsS http://127.0.0.1:3000/health >/dev/null 2>&1; then
	echo "Backend API is already running on port 3000; reusing it."
else
	(cd "$ROOT_DIR/custom-backend" && exec node src/app.js) &
	BACKEND_PID=$!
	for attempt in {1..10}; do
		if curl -fsS http://127.0.0.1:3000/health >/dev/null 2>&1; then
			break
		fi
		sleep 0.2
	done
	if ! curl -fsS http://127.0.0.1:3000/health >/dev/null 2>&1; then
		echo "ERROR: Backend API did not start on port 3000."
		exit 1
	fi
fi

echo "Starting frontend on port 5500..."
(cd "$ROOT_DIR" && python3 -m http.server 5500) &
FRONTEND_PID=$!

echo ""
echo "================================================="
echo "SUCCESS: database, API, and frontend are running"
echo "Frontend: http://localhost:5500"
echo "API health: http://localhost:3000/health"
echo "================================================="
echo "Press Ctrl+C to stop the API and frontend."

if [[ -n "$BACKEND_PID" ]]; then
	wait -n "$BACKEND_PID" "$FRONTEND_PID"
else
	wait "$FRONTEND_PID"
fi

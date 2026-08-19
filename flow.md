# Secure Auth Platform - Run Flow

## What was breaking

The registration request was returning:

```text
connect ECONNREFUSED 127.0.0.1:5433
```

This is not an email or password validation error. The request reaches `POST /register`, but the controller calls `authService.emailExists(email)`. That function queries PostgreSQL. PostgreSQL was not listening on port `5433`, so the database connection was refused and Express returned HTTP 500.

The full dependency flow is:

```text
Browser
  -> frontend on http://localhost:5500
  -> POST /register or POST /login
  -> API on http://localhost:3000
  -> PostgreSQL on localhost:5433
```

The Docker Compose mapping is `5433:5432`: port `5433` is the host port and `5432` is the PostgreSQL port inside the container.

## One-time prerequisites

Install or verify:

- Docker and Docker Compose
- Node.js 18 or newer
- npm

Check versions:

```bash
docker --version
node --version
npm --version
```

If `npm` is installed with nvm but is not found in a script or VS Code terminal, load nvm first:

```bash
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"
nvm use 24
```

Use the installed Node version shown by `nvm ls` if version 24 is unavailable.

## Start the database

From the project root:

```bash
cd /home/samc4e/Desktop/osdag
docker compose up -d
```

This starts the PostgreSQL container defined in `docker-compose.yml`. The API cannot register or log in without it.

Check that it is running:

```bash
docker compose ps
ss -ltn '( sport = :5433 )'
```

The database is ready when the Compose service is running and port `5433` is listening.

### Docker permission error

If Docker reports:

```text
permission denied while trying to connect to the Docker API at unix:///var/run/docker.sock
```

Your Linux user cannot access the Docker daemon. Fix it once with an administrator account:

```bash
sudo usermod -aG docker "$USER"
```

Log out and log back in, or reboot. Then verify access:

```bash
id
docker ps
```

If the `docker` group is still not active in the current shell, use:

```bash
newgrp docker
docker ps
```

Then run `docker compose up -d` again. If Docker is not installed or cannot be enabled, start a PostgreSQL 16 database by another method and make it reachable at `localhost:5433` with database `secure_auth_db`, user `postgres`, and password `postgres`.

## Install backend dependencies

```bash
cd /home/samc4e/Desktop/osdag/custom-backend
npm install
```

The project dependencies include Express, PostgreSQL client `pg`, bcrypt, and the test tools.

## Configure the API

The backend reads `custom-backend/.env`. The important setting is:

```env
DATABASE_URL=postgresql://postgres:postgres@localhost:5433/secure_auth_db
PORT=3000
```

Do not change `5433` to `5432` when using the supplied Docker Compose file. `5432` is the container port; `5433` is the host port used by the Node.js API.

## Apply schema and seed data

After PostgreSQL is running:

```bash
cd /home/samc4e/Desktop/osdag/custom-backend
npm run setup
```

This runs:

1. `npm run migrate` to create the `users`, `sessions`, `files`, and `login_attempts` tables.
2. `npm run seed` to insert the sample data.

If this command reports `ECONNREFUSED 127.0.0.1:5433`, stop here and fix PostgreSQL/Docker. Running the API again will not fix a database that is not listening.

## Start the complete application

The startup script now runs the complete sequence: Docker PostgreSQL, database readiness check, migrations, seed data, backend API, and frontend. If the `docker` group exists but the current terminal has stale group membership, the script uses `sg docker` for Docker commands automatically.

Run this from the project root:

```bash
cd /home/samc4e/Desktop/osdag
./start.sh
```

When successful, open `http://localhost:5500`. The API health endpoint is `http://localhost:3000/health`.

The manual method is available when you need each process in a separate terminal:

Terminal 1, API:

```bash
cd /home/samc4e/Desktop/osdag/custom-backend
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"
npm run dev
```

Terminal 2, frontend:

```bash
cd /home/samc4e/Desktop/osdag
python3 -m http.server 5500
```

Open:

```text
http://localhost:5500
```

The script loads nvm when available and also checks common nvm Node installation paths. If it reports an npm, Docker, or PostgreSQL error, fix that prerequisite and rerun the script. It exits before starting partial services, so a displayed success message means the full startup sequence completed.

## Verify before testing registration

```bash
curl http://localhost:3000/health
curl -I http://localhost:5500/
```

Expected results:

- API health returns JSON containing `"status":"ok"`.
- Frontend returns HTTP status `200`.
- `ss -ltn '( sport = :5433 )'` shows PostgreSQL listening.

## Registration and login flow

Register with a valid email and a password that satisfies the password policy:

```bash
curl -i -c cookies.txt \
  -H 'Content-Type: application/json' \
  -d '{"email":"newuser@example.com","password":"StrongPassword1!"}' \
  http://localhost:3000/register
```

A successful new registration returns HTTP `201` with the user ID and email. Reusing the same email returns HTTP `409`, which is expected duplicate-account behavior.

Login with the same credentials:

```bash
curl -i -b cookies.txt -c cookies.txt \
  -H 'Content-Type: application/json' \
  -d '{"email":"newuser@example.com","password":"StrongPassword1!"}' \
  http://localhost:3000/login
```

A successful login returns HTTP `200`, returns a session token in the test response body, and sets the `sid` HttpOnly cookie. The server stores only a hash of the session token in PostgreSQL.

Test the authenticated session:

```bash
curl -i -b cookies.txt http://localhost:3000/me
```

Logout and revoke the session:

```bash
curl -i -X POST -b cookies.txt -c cookies.txt http://localhost:3000/logout
```

## Troubleshooting checklist

### `ECONNREFUSED 127.0.0.1:5433`

PostgreSQL is stopped, the container is unhealthy, or the port is mapped differently. Run:

```bash
docker compose ps
docker compose logs postgres
ss -ltn '( sport = :5433 )'
```

Then rerun `./start.sh`; it starts the database and runs `npm run setup` automatically.

### `npm: command not found`

The terminal does not have nvm's Node bin directory on PATH:

```bash
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"
npm --version
```

### API health works but registration fails

The API process is running, but the database is still unavailable or the schema has not been applied. Run:

```bash
cd /home/samc4e/Desktop/osdag/custom-backend
npm run setup
```

### Port already in use

Find the process and stop it, or use different ports and update the matching `.env`/frontend configuration:

```bash
ss -ltnp '( sport = :3000 or sport = :5500 or sport = :5433 )'
```

## Shutdown

Stop the frontend/API with `Ctrl+C` in their terminals. Stop PostgreSQL with:

```bash
cd /home/samc4e/Desktop/osdag
docker compose down
```

Use `docker compose down -v` only when you intentionally want to delete the PostgreSQL volume and all local database data.

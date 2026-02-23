# Run CodeClash with Docker Compose

## Prerequisites
- Docker Desktop installed and running.
- Internet access for pulling base images and runner images.

## Start everything
From repository root:

```bash
docker compose up --build -d
```

This starts:
- `codeclash-backend` on `http://localhost:8888`
- `codeclash-frontend` on `http://localhost:3000`

## View logs
```bash
docker compose logs -f backend frontend
```

## Stop everything
```bash
docker compose down
```

## If ports are already in use
Run with alternate host ports:

```bash
BACKEND_PORT=8890 FRONTEND_PORT=3001 \
NEXT_PUBLIC_SOCKET_URL=http://localhost:8890 \
FRONTEND_URL=http://localhost:3001 \
docker compose up --build -d
```

## Notes
- Backend code execution uses Docker-in-Docker style via mounted socket:
  `- ${DOCKER_SOCKET_PATH:-/var/run/docker.sock}:/var/run/docker.sock`
- Default execution timeout is `20000ms` (`DOCKER_EXEC_TIMEOUT_MS`), which helps
  avoid false timeouts during first-run runtime image setup.
- On some Docker Desktop setups (macOS), set socket path explicitly:

```bash
export DOCKER_SOCKET_PATH=/Users/$USER/.docker/run/docker.sock
docker compose up --build -d
```
- On first run of `run-code`/`submit-solution`, runner images may be pulled:
  - `node:20-alpine`
  - `python:3.12-alpine`

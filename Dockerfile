# Precedent: one container that serves the API and the web app (Cloud Run). See docs/DEPLOY.md.

# 1. Build the web app. VITE_API_BASE_URL=/ makes it call the API on its own origin.
FROM node:22-slim AS web
WORKDIR /src
COPY frontend/package.json frontend/package-lock.json frontend/
RUN cd frontend && npm ci --no-audit --no-fund
COPY frontend frontend
COPY docs/mocks docs/mocks
ENV VITE_API_BASE_URL=/
RUN cd frontend && npm run build

# 2. The API, with the built web app next to it.
FROM python:3.12-slim
COPY --from=ghcr.io/astral-sh/uv:latest /uv /uvx /bin/
ENV UV_COMPILE_BYTECODE=1 UV_LINK_MODE=copy UV_PYTHON_DOWNLOADS=never PYTHONUNBUFFERED=1
WORKDIR /app/backend
COPY backend/pyproject.toml backend/uv.lock ./
RUN uv sync --frozen --no-dev --no-install-project
COPY backend/app app
COPY backend/data data
COPY --from=web /src/frontend/dist /app/web
ENV FRONTEND_DIST=/app/web PORT=8080
# one process: live updates, the simulator and the demo state live in memory
CMD ["sh", "-c", "exec .venv/bin/uvicorn app.main:app --host 0.0.0.0 --port ${PORT} --proxy-headers --forwarded-allow-ips='*'"]

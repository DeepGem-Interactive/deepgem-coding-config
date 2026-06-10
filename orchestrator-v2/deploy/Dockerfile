# dgorch engine image (orchestrator-v2)
#
# Build from the orchestrator-v2 directory (the build context must be the
# package root, not deploy/):
#
#   docker build -f deploy/Dockerfile -t dgorch .
#
# IMPORTANT — state and the target repo:
#   The repo under orchestration is NOT baked into this image. Mount it (or
#   clone it inside the container) and point --repo at it. The state database
#   lives at <repo>/.dgorch, so persisting that mount persists the run state:
#
#   docker run --rm -it \
#     -v /path/to/project:/work/project \
#     -e LINEAR_API_KEY=... -e LINEAR_TEAM_ID=... \
#     -e ANTHROPIC_API_KEY=... \
#     -p 8787:8787 \
#     dgorch node dist/index.js serve --repo /work/project --prd /work/project/prd.md --webhook-port 8787

FROM node:22-slim

# git is required: the engine drives worktrees/branches in the target repo.
RUN apt-get update \
    && apt-get install -y --no-install-recommends git ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install deps first for layer caching. devDeps are needed for the TypeScript
# build, so NODE_ENV=production is set only after `npm run build`.
# (better-sqlite3 ships prebuilt binaries for Node 22 on linux x64/arm64; if a
# prebuild is ever missing, add python3/make/g++ to the apt install above.)
COPY package*.json ./
RUN npm ci

COPY tsconfig*.json ./
COPY src ./src
RUN npm run build

ENV NODE_ENV=production

# Default: show usage. Override CMD with run/resume/status/serve as needed.
CMD ["node", "dist/index.js", "--help"]

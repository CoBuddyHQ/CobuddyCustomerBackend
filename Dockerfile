# =============================================================
# CoBuddy Customer Backend — Multi-Stage Dockerfile
# Stage 1 (builder): compile TypeScript, generate Prisma client
# Stage 2 (runner):  lean production image, no devDependencies
# =============================================================

# ── STAGE 1: BUILD ────────────────────────────────────────────
FROM node:20-alpine AS builder

RUN apk add --no-cache openssl libc6-compat

WORKDIR /app

# Install ALL deps (including dev) for build
COPY package.json package-lock.json ./
RUN npm ci

# Copy source & config
COPY prisma ./prisma/
COPY tsconfig*.json ./
COPY nest-cli.json ./
COPY prisma.config.ts ./
COPY src ./src/

# Generate Prisma client + compile TypeScript
ENV DATABASE_URL="postgresql://dummy:dummy@localhost:5432/dummy"
RUN npx prisma generate
RUN npm run build

# ── STAGE 2: RUNNER ───────────────────────────────────────────
FROM node:20-alpine AS runner

RUN apk add --no-cache openssl libc6-compat dos2unix

WORKDIR /app

# Production-only dependencies
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# Copy compiled output, Prisma schema and generated client from builder
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY prisma ./prisma/
COPY prisma.config.ts ./

# Entrypoint script
COPY docker-entrypoint.sh ./
RUN dos2unix docker-entrypoint.sh && chmod +x docker-entrypoint.sh

EXPOSE 4002

CMD ["sh", "docker-entrypoint.sh"]

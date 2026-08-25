# =========================================================
# CoBuddy Customer Backend — Development Dockerfile
# Node version is PINNED to avoid version mismatch issues
# across different machines/laptops.
# =========================================================
FROM node:20-alpine

# Install essential OS dependencies (for Prisma binary targets)
RUN apk add --no-cache openssl libc6-compat

# Set working directory
WORKDIR /app

# Copy dependency lockfiles FIRST (Docker layer cache optimization)
COPY package.json package-lock.json ./

# npm ci uses package-lock.json exactly — guarantees same versions everywhere
RUN npm ci

# Copy Prisma schema (needed for prisma generate at runtime)
COPY prisma ./prisma/

# Copy NestJS config files
COPY tsconfig*.json ./
COPY nest-cli.json ./

# Copy prisma config if exists
COPY prisma.config.ts ./

# Copy application source code
COPY src ./src

# Copy entrypoint script
COPY docker-entrypoint.sh ./
RUN chmod +x docker-entrypoint.sh

# Expose backend port
EXPOSE 4002

# Use entrypoint: generates Prisma client, runs migrations, starts dev server
CMD ["sh", "docker-entrypoint.sh"]

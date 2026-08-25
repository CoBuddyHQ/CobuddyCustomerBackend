#!/bin/sh
set -e

echo "================================================="
echo " CoBuddy Customer Backend — Container Starting   "
echo "================================================="
echo ""

echo "[1/4] Installing / verifying dependencies (npm ci)..."
# npm ci is strict — uses package-lock.json exactly, no version drift
npm ci --prefer-offline 2>/dev/null || npm ci

echo ""
echo "[2/4] Generating Prisma Client (inside container)..."
npx prisma generate

echo ""
echo "[3/4] Syncing database schema (prisma db push)..."
# db push is safe for development — auto creates tables if not exists
npx prisma db push --accept-data-loss

echo ""
echo "[4/4] Starting NestJS in development watch mode..."
echo "      API available at: http://localhost:4002"
echo "      Health check:     http://localhost:4002/health"
echo ""

exec npm run start:dev

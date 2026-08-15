#!/bin/sh
set -e

echo "================================================="
echo "CoBuddy Customer Backend — Container Initializing"
echo "================================================="

echo "[1/4] Ensuring container dependencies..."
npm install --no-audit --prefer-offline

echo "[2/4] Generating Prisma Client..."
npx prisma generate

echo "[3/4] Syncing PostgreSQL Database Schema..."
npx prisma db push

echo "[4/4] Starting NestJS Customer Backend in Watch Mode..."
exec npm run start:dev

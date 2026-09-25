#!/bin/sh
set -e

echo "================================================="
echo " CoBuddy Customer Backend — Container Starting   "
echo " Environment: ${NODE_ENV:-development}           "
echo "================================================="
echo ""

echo "[1/4] Checking dependencies..."
if [ ! -d "node_modules" ] || [ ! -f "node_modules/.bin/prisma" ]; then
  echo "      Installing clean dependencies with npm ci..."
  npm ci
fi

echo ""
echo "[2/4] Generating Prisma Client..."
npx prisma generate

echo ""
echo "[3/4] Running database sync / migrations..."
if [ "$NODE_ENV" = "production" ]; then
  echo "      Applying Prisma migrations (production)..."
  # SAFE: migrate deploy only — NEVER use db push --accept-data-loss in production
  npx prisma migrate deploy
  if [ $? -ne 0 ]; then
    echo "ERROR: Prisma migrate deploy failed. Container will not start to protect data integrity."
    exit 1
  fi
  echo ""
  echo "[4/4] Starting NestJS in Production mode..."
  echo "      Port: 4002"
  echo "      Health: http://localhost:4002/health"
  echo ""
  exec node dist/main
else
  echo "      Syncing schema with prisma db push (development)..."
  npx prisma db push --accept-data-loss
  echo ""
  echo "[4/4] Starting NestJS application..."
  echo "      Port: 4002"
  echo "      Health: http://localhost:4002/health"
  echo ""
  exec node dist/main
fi

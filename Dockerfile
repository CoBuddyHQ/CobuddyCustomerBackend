FROM node:20-alpine

# Set working directory
WORKDIR /app

# Copy dependency definitions and config files
COPY package*.json ./
COPY tsconfig*.json ./
COPY nest-cli.json ./
COPY prisma.config.ts ./
COPY prisma ./prisma/

# Install dependencies
RUN npm install

# Copy application source code
COPY src ./src

# Copy entrypoint script and make it executable
COPY docker-entrypoint.sh ./
RUN chmod +x docker-entrypoint.sh

# Expose backend port
EXPOSE 4002

# Run entrypoint script
CMD ["sh", "docker-entrypoint.sh"]

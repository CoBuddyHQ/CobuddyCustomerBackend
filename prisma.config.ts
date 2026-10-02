import 'dotenv/config';
import { defineConfig } from 'prisma/config';

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error('DATABASE_URL environment variable is not set');
}

export default defineConfig({
  schema: './prisma/schema.prisma',
  migrations: {
    seed: 'ts-node ./prisma/seed.ts',
  },
  datasource: {
    url: connectionString,
  },
});

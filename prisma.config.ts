import 'dotenv/config';
import { defineConfig } from 'prisma/config';

const connectionString =
  process.env.DATABASE_URL ||
  'postgresql://dummy:dummy@localhost:5432/postgres?sslmode=require';

export default defineConfig({
  schema: './prisma/schema.prisma',
  migrations: {
    seed: 'ts-node ./prisma/seed.ts',
  },
  datasource: {
    url: connectionString,
  },
});

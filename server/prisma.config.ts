import './src/load-env.ts';
import { defineConfig } from 'prisma/config';

const databaseUrl = process.env.DATABASE_URL ?? 'file:./leeloo.db';

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: { path: 'prisma/migrations', seed: 'tsx prisma/seed.ts' },
  datasource: { url: databaseUrl },
});

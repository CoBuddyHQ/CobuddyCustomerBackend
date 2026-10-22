import { readFileSync } from 'fs';
import { resolve } from 'path';

describe('Customer Backend Docker database startup', () => {
  const entrypoint = readFileSync(resolve(process.cwd(), 'docker-entrypoint.sh'), 'utf8');

  it('does not automatically accept destructive database changes in development', () => {
    expect(entrypoint).toContain('npx prisma db push');
    expect(entrypoint).not.toContain('db push --accept-data-loss');
  });

  it('uses the reviewed migration deployment command in production', () => {
    expect(entrypoint).toContain('npx prisma migrate deploy');
  });
});

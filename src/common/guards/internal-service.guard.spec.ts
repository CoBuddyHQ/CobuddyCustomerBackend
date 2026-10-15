import { UnauthorizedException, ExecutionContext } from '@nestjs/common';
import { InternalServiceGuard } from './internal-service.guard';

describe('InternalServiceGuard (Customer)', () => {
  let guard: InternalServiceGuard;
  const originalEnv = process.env;

  beforeEach(() => {
    guard = new InternalServiceGuard();
    process.env = { ...originalEnv };
    process.env.INTERNAL_SERVICE_TOKEN = 'test-internal-secret-token';
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  function createMockContext(tokenHeader?: string): ExecutionContext {
    return {
      switchToHttp: () => ({
        getRequest: () => ({
          headers: {
            'x-internal-token': tokenHeader,
          },
        }),
      }),
    } as unknown as ExecutionContext;
  }

  it('should throw UnauthorizedException if header is missing', () => {
    const ctx = createMockContext(undefined);
    expect(() => guard.canActivate(ctx)).toThrow(UnauthorizedException);
  });

  it('should throw UnauthorizedException if header is incorrect', () => {
    const ctx = createMockContext('invalid-token');
    expect(() => guard.canActivate(ctx)).toThrow(UnauthorizedException);
  });

  it('should return true when valid header is provided', () => {
    const ctx = createMockContext('test-internal-secret-token');
    expect(guard.canActivate(ctx)).toBe(true);
  });
});

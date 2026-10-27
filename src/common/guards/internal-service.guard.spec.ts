import { ServiceUnavailableException, UnauthorizedException, ExecutionContext } from '@nestjs/common';
import { InternalServiceGuard } from './internal-service.guard';

describe('InternalServiceGuard (Customer)', () => {
  let guard: InternalServiceGuard;
  const originalEnv = process.env;

  beforeEach(() => {
    guard = new InternalServiceGuard();
    process.env = { ...originalEnv };
    delete process.env.INTERNAL_SERVICE_SECRET;
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  function createMockContext(tokenHeader?: string): ExecutionContext {
    return {
      switchToHttp: () => ({
        getRequest: () => ({
          headers: {
            'x-internal-service-key': tokenHeader,
          },
        }),
      }),
    } as unknown as ExecutionContext;
  }

  it('should throw UnauthorizedException if header is missing', () => {
    process.env.INTERNAL_SERVICE_SECRET = 'configured-secret';
    const ctx = createMockContext(undefined);
    expect(() => guard.canActivate(ctx)).toThrow(UnauthorizedException);
  });

  it('should throw UnauthorizedException if header is incorrect', () => {
    process.env.INTERNAL_SERVICE_SECRET = 'configured-secret';
    const ctx = createMockContext('invalid-token');
    expect(() => guard.canActivate(ctx)).toThrow(UnauthorizedException);
  });

  it('returns unavailable when no S2S secret is configured', () => {
    const ctx = createMockContext('configured-by-nobody');
    expect(() => guard.canActivate(ctx)).toThrow(ServiceUnavailableException);
  });

  it('rejects the legacy x-internal-token header', () => {
    process.env.INTERNAL_SERVICE_SECRET = 'test-internal-secret-token';
    const ctx = {
      switchToHttp: () => ({ getRequest: () => ({ headers: { 'x-internal-token': 'test-internal-secret-token' } }) }),
    } as unknown as ExecutionContext;
    expect(() => guard.canActivate(ctx)).toThrow(UnauthorizedException);
  });

  it('should return true when valid header is provided', () => {
    process.env.INTERNAL_SERVICE_SECRET = 'test-internal-secret-token';
    const ctx = createMockContext('test-internal-secret-token');
    expect(guard.canActivate(ctx)).toBe(true);
  });
});

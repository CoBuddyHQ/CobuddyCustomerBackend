import { CallHandler, ExecutionContext, Logger } from '@nestjs/common';
import { firstValueFrom, of, throwError } from 'rxjs';
import { LoggingInterceptor } from './logging.interceptor';

describe('HTTP logging sensitive-data handling', () => {
  afterEach(() => jest.restoreAllMocks());

  const contextFor = (request: object): ExecutionContext =>
    ({
      switchToHttp: () => ({
        getRequest: () => request,
        getResponse: () => ({ statusCode: 201 }),
      }),
    }) as unknown as ExecutionContext;

  it.each(['development', 'production'])(
    'logs metadata without request/response values in %s',
    async (environment) => {
      const original = process.env.NODE_ENV;
      process.env.NODE_ENV = environment;
      const log = jest.spyOn(Logger.prototype, 'log').mockImplementation();
      const response = {
        accessToken: 'secret-access',
        profile: { phone: 'secret-phone', address: 'secret-address' },
        nested: ['secret-nested'],
      };
      const request = {
        method: 'POST',
        url: '/api/v1/auth/secret-id?credential=secret-query',
        route: { path: '/api/v1/auth/:id' },
        body: { code: 'secret-code', credentials: { value: 'secret-body' } },
        query: { credential: 'secret-query' },
        headers: {
          authorization: 'secret-authorization',
          cookie: 'secret-cookie',
        },
        ip: 'secret-ip',
      };

      try {
        const handler: CallHandler<unknown> = { handle: () => of(response) };
        const result = await firstValueFrom(
          new LoggingInterceptor().intercept(contextFor(request), handler),
        );
        expect(result).toBe(response);
        expect(log).toHaveBeenCalledTimes(2);
        const lines = JSON.stringify(log.mock.calls);
        expect(lines).toContain('/api/v1/auth/:id');
        expect(lines).toContain('201');
        expect(lines).not.toMatch(/secret-|Body:|Query:|Res:|IP:/);
      } finally {
        if (original === undefined) delete process.env.NODE_ENV;
        else process.env.NODE_ENV = original;
      }
    },
  );

  it.each(['secret-response-string', null, { value: 'secret-field' }])(
    'does not serialize response bodies',
    async (response) => {
      const log = jest.spyOn(Logger.prototype, 'log').mockImplementation();
      const result = await firstValueFrom(
        new LoggingInterceptor().intercept(
          contextFor({
            method: 'GET',
            url: '/secret-path?credential=secret-query',
          }),
          { handle: () => of(response) },
        ),
      );
      expect(result).toBe(response);
      expect(JSON.stringify(log.mock.calls)).not.toContain('secret-');
    },
  );

  it('does not inspect circular request/response bodies', async () => {
    jest.spyOn(Logger.prototype, 'log').mockImplementation();
    const circular: { child?: unknown } = {};
    circular.child = circular;
    await expect(
      firstValueFrom(
        new LoggingInterceptor().intercept(
          contextFor({ method: 'POST', url: '/test', body: circular }),
          { handle: () => of(circular) },
        ),
      ),
    ).resolves.toBe(circular);
  });

  it('propagates the original error without logging its details or a success', async () => {
    const log = jest.spyOn(Logger.prototype, 'log').mockImplementation();
    const failure = new Error('secret-provider-detail');
    await expect(
      firstValueFrom(
        new LoggingInterceptor().intercept(
          contextFor({ method: 'GET', route: { path: '/api/v1/profile' } }),
          { handle: () => throwError(() => failure) },
        ),
      ),
    ).rejects.toBe(failure);
    expect(log).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(log.mock.calls)).not.toContain(
      'secret-provider-detail',
    );
  });
});

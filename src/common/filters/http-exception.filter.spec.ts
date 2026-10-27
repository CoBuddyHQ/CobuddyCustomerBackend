import { BadRequestException, InternalServerErrorException } from '@nestjs/common';
import { HttpExceptionFilter } from './http-exception.filter';

describe('HttpExceptionFilter sensitive-data handling', () => {
  const makeHost = (request: any) => {
    const response: any = {
      headersSent: false,
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    };
    const host: any = {
      switchToHttp: () => ({ getResponse: () => response, getRequest: () => request }),
    };
    return { host, response };
  };

  it('does not log request bodies, query strings, IPs or exception messages', () => {
    const filter = new HttpExceptionFilter();
    const warn = jest.spyOn((filter as any).logger, 'warn').mockImplementation();
    const { host, response } = makeHost({
      method: 'POST',
      path: '/api/v1/auth/verify-otp',
      url: '/api/v1/auth/verify-otp?access_token=do-not-log',
      body: { phone: 'private', otp: 'private-code' },
      query: { token: 'private-token' },
      ip: 'private-ip',
    });

    filter.catch(new BadRequestException('private-code was rejected'), host);

    const logLine = warn.mock.calls[0][0] as string;
    expect(logLine).toContain('/api/v1/auth/verify-otp');
    expect(logLine).not.toMatch(/private|token=|\?|Body:|Query:|IP:/i);
    expect(response.json).toHaveBeenCalledWith(expect.objectContaining({
      path: '/api/v1/auth/verify-otp',
    }));
  });

  it('returns a generic server error and omits exception details from logs and response', () => {
    const filter = new HttpExceptionFilter();
    const error = jest.spyOn((filter as any).logger, 'error').mockImplementation();
    const { host, response } = makeHost({
      method: 'POST',
      path: '/api/v1/kyc/document',
      url: '/api/v1/kyc/document?private=value',
      body: { documentNumber: 'private-document' },
      query: {},
    });

    filter.catch(new InternalServerErrorException('private-document'), host);

    expect(error).toHaveBeenCalledTimes(1);
    expect(error.mock.calls[0][0]).not.toContain('private-document');
    expect(error.mock.calls[0][1]).toBeUndefined();
    expect(response.json).toHaveBeenCalledWith(expect.objectContaining({ message: 'Internal server error' }));
  });
});

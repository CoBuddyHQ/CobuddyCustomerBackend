import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();
    const { method, url, body, query, ip } = request;

    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;

    const message =
      exception instanceof HttpException
        ? exception.getResponse()
        : 'Internal server error';

    const errorBody =
      typeof message === 'object'
        ? message
        : { message };

    // Sanitize sensitive fields (password, pass, pin, token, secret)
    const sanitize = (obj: any) => {
      if (!obj || typeof obj !== 'object') return obj;
      const copy = { ...obj };
      ['password', 'pass', 'pin', 'token', 'secret', 'otp'].forEach(key => {
        if (key in copy && typeof copy[key] === 'string') {
          copy[key] = '***MASKED***';
        }
      });
      return copy;
    };

    const sanitizedBody = sanitize(body);
    const bodyStr = Object.keys(sanitizedBody || {}).length ? ` | Body: ${JSON.stringify(sanitizedBody)}` : '';
    const queryStr = Object.keys(query || {}).length ? ` | Query: ${JSON.stringify(query)}` : '';

    if (status >= 500) {
      this.logger.error(
        `❌ [HTTP ERROR ${status}] ${method} ${url} (IP: ${ip || 'local'})${queryStr}${bodyStr} → ${JSON.stringify(message)}`,
        exception instanceof Error ? exception.stack : String(exception),
      );
    } else {
      this.logger.warn(
        `⚠️ [HTTP WARN ${status}] ${method} ${url} (IP: ${ip || 'local'})${queryStr}${bodyStr} → ${JSON.stringify(message)}`,
      );
    }

    if (response.headersSent) {
      return;
    }

    response.status(status).json({
      success: false,
      statusCode: status,
      timestamp: new Date().toISOString(),
      path: request.url,
      ...(typeof errorBody === 'object' ? errorBody : { message: errorBody }),
    });
  }
}


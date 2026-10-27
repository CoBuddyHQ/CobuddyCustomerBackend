import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  Logger,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { httpLogMetadata } from '../utils/http-log.util';

@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger('HTTP');

  intercept(
    context: ExecutionContext,
    next: CallHandler<unknown>,
  ): Observable<unknown> {
    const ctx = context.switchToHttp();
    const request = ctx.getRequest<Request>();
    const response = ctx.getResponse<Response>();
    const url = request?.originalUrl || request?.url || '';
    const isHealthCheck = url === '/health' || url === '/api/v1/health';
    const metadata = httpLogMetadata(request);
    const startedAt = Date.now();

    if (!isHealthCheck) {
      this.logger.log(`[REQ] ${metadata}`);
    }

    return next.handle().pipe(
      tap(() => {
        if (!isHealthCheck) {
          this.logger.log(
            `[RES] ${metadata} ${response.statusCode} ${Date.now() - startedAt}ms`,
          );
        }
      }),
    );
  }
}

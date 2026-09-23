import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  Logger,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';

@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger('HTTP');

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const ctx = context.switchToHttp();
    const req = ctx.getRequest();
    const res = ctx.getResponse();
    const { method, url, body, query, ip } = req;
    const now = Date.now();

    // Sanitize sensitive fields (password, pass, pin, token, secret) for log safety
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

    this.logger.log(`➡️  [REQ] ${method} ${url} (IP: ${ip || 'local'})${queryStr}${bodyStr}`);

    return next.handle().pipe(
      tap(data => {
        const duration = Date.now() - now;
        const statusCode = res.statusCode || 200;
        let respStr = '';
        if (data) {
          const raw = JSON.stringify(data);
          respStr = ` | Res: ${raw.length > 300 ? raw.substring(0, 300) + '...[truncated]' : raw}`;
        }
        this.logger.log(`⬅️  [RES] ${method} ${url} ${statusCode} — ${duration}ms${respStr}`);
      }),
    );
  }
}

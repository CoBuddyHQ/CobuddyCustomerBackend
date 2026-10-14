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

    const isProd = process.env.NODE_ENV === 'production';

    // Sanitize sensitive fields in request bodies & query params
    const sanitize = (obj: any): any => {
      if (!obj || typeof obj !== 'object') return obj;
      if (Array.isArray(obj)) return obj.map(sanitize);
      const copy: Record<string, any> = {};
      const sensitivePatterns = /password|pass|pin|token|secret|otp|aadhaar|pan|docnumber|cvv|authorization/i;
      for (const [key, value] of Object.entries(obj)) {
        if (sensitivePatterns.test(key)) {
          copy[key] = '***MASKED***';
        } else if (value && typeof value === 'object') {
          copy[key] = sanitize(value);
        } else {
          copy[key] = value;
        }
      }
      return copy;
    };

    const sanitizedBody = sanitize(body);
    const bodyStr = !isProd && Object.keys(sanitizedBody || {}).length ? ` | Body: ${JSON.stringify(sanitizedBody)}` : '';
    const queryStr = Object.keys(query || {}).length ? ` | Query: ${JSON.stringify(sanitize(query))}` : '';

    this.logger.log(`➡️  [REQ] ${method} ${url} (IP: ${ip || 'local'})${queryStr}${bodyStr}`);

    return next.handle().pipe(
      tap(data => {
        const duration = Date.now() - now;
        const statusCode = res.statusCode || 200;
        let respStr = '';
        if (!isProd && data) {
          try {
            const raw = typeof data === 'string' ? data : JSON.stringify(sanitize(data));
            respStr = ` | Res: ${raw.length > 200 ? raw.substring(0, 200) + '...[truncated]' : raw}`;
          } catch {
            respStr = ' | Res: [Unserializable Payload]';
          }
        }
        this.logger.log(`⬅️  [RES] ${method} ${url} ${statusCode} — ${duration}ms${respStr}`);
      }),
    );
  }
}

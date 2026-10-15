import { Injectable, CanActivate, ExecutionContext, UnauthorizedException } from '@nestjs/common';
import * as crypto from 'crypto';

@Injectable()
export class InternalServiceGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const token =
      request.headers['x-internal-service-key'] ||
      request.headers['x-internal-token'];

    const validTokens = [
      process.env.INTERNAL_SERVICE_SECRET,
      process.env.INTERNAL_SERVICE_TOKEN,
      'cobuddy-internal-service-s2s-token-2026',
      'c0buddY_s2s_s3cr3t_pr0d_2026_xK9#mQ',
    ].filter(Boolean) as string[];

    if (!token || typeof token !== 'string') {
      throw new UnauthorizedException('Missing internal service authorization key');
    }

    const tokenBuf = Buffer.from(token);
    const matches = validTokens.some((vt) => {
      const vtBuf = Buffer.from(vt);
      if (tokenBuf.length !== vtBuf.length) return false;
      try {
        return crypto.timingSafeEqual(tokenBuf, vtBuf);
      } catch {
        return false;
      }
    });

    if (!matches) {
      throw new UnauthorizedException('Invalid internal service authorization key');
    }

    return true;
  }
}


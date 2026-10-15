import { Injectable, CanActivate, ExecutionContext, UnauthorizedException } from '@nestjs/common';

@Injectable()
export class InternalServiceGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const token = request.headers['x-internal-token'];
    const expectedToken =
      process.env.INTERNAL_SERVICE_TOKEN || 'cobuddy-internal-service-s2s-token-2026';

    if (!token || token !== expectedToken) {
      throw new UnauthorizedException('Invalid or missing internal service token');
    }

    return true;
  }
}

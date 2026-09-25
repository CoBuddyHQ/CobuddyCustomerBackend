import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

@Injectable()
export class OptionalJwtAuthGuard extends AuthGuard('customer-jwt') {
  handleRequest(err: any, user: any) {
    return user || null;
  }
}

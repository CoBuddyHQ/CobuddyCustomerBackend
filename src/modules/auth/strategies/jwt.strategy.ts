import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { PrismaService } from '../../../prisma/prisma.service';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'customer-jwt') {
  constructor(private prisma: PrismaService) {
    const isProd = process.env.NODE_ENV === 'production';
    const secret = process.env.JWT_SECRET;
    if (isProd && (!secret || secret === 'dev-secret-key-only')) {
      throw new Error('FATAL: JWT_SECRET must be configured with a secure key in production');
    }
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: secret || 'dev-secret-key-only',
    });
  }


  async validate(payload: { sub: string; phone: string }) {
    const customer = await this.prisma.customer.findUnique({
      where: { id: payload.sub },
    });
    if (!customer) {
      throw new UnauthorizedException('Customer not found');
    }
    if (customer.accountStatus === 'deleted') {
      throw new UnauthorizedException('Customer account has been deleted');
    }
    if (customer.accountStatus === 'deactivated' || customer.accountStatus === 'suspended') {
      throw new UnauthorizedException(`Customer account is ${customer.accountStatus}`);
    }
    return customer;
  }
}

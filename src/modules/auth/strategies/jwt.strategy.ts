import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { PrismaService } from '../../../prisma/prisma.service';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'customer-jwt') {
  constructor(private prisma: PrismaService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: process.env.JWT_SECRET ?? 'fallback-secret',
    });
  }

  async validate(payload: { sub: string; phone: string }) {
    const customer = await this.prisma.customer.findUnique({
      where: { id: payload.sub },
    });
    if (!customer || customer.accountStatus === 'deleted') {
      throw new UnauthorizedException('Customer not found or deleted');
    }
    return customer;
  }
}

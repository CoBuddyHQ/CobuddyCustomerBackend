import {
  Injectable,
  BadRequestException,
  UnauthorizedException,
  ServiceUnavailableException,
  Logger,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { SendOtpDto, VerifyOtpDto } from './dto/auth.dto';
import {
  QA_TEST_OTP,
  isReservedTestOtp,
  normalizePhone,
  isTestPhoneAllowlisted,
  isTestOtpAllowed,
} from '../../common/utils/otp-test.util';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
  ) {}

  // ── SEND OTP ──────────────────────────────────────────────────────────────
  async sendOtp(dto: SendOtpDto) {
    const { phone } = dto;
    const normalized = normalizePhone(phone);
    if (!normalized || normalized.length < 10) {
      throw new BadRequestException('Invalid phone number format');
    }

    const isAllowlisted = isTestPhoneAllowlisted(phone);
    let otp: string;

    if (isAllowlisted) {
      otp = QA_TEST_OTP;
    } else {
      throw new ServiceUnavailableException(
        'SMS OTP delivery is unavailable because no SMS sender is integrated. Please contact support.',
      );
    }

    const expiresAt = new Date(
      Date.now() + (parseInt(process.env.OTP_EXPIRES_IN_MINUTES ?? '10') * 60 * 1000),
    );

    // Delete existing OTPs for this phone
    await this.prisma.customerOtp.deleteMany({ where: { phone } });

    // Create new OTP
    await this.prisma.customerOtp.create({
      data: { phone, otp: await bcrypt.hash(otp, 10), expiresAt },
    });

    return {
      message: 'QA test OTP prepared; no SMS was sent.',
    };
  }

  // ── VERIFY OTP ────────────────────────────────────────────────────────────
  async verifyOtp(dto: VerifyOtpDto, deviceInfo?: string, ipAddress?: string) {
    const { phone, otp } = dto;

    const otpRecord = await this.prisma.customerOtp.findFirst({
      where: { phone },
      orderBy: { createdAt: 'desc' },
    });

    if (!otpRecord) {
      throw new BadRequestException('OTP not found. Please request a new one.');
    }

    if (otpRecord.expiresAt < new Date()) {
      await this.prisma.customerOtp.delete({ where: { id: otpRecord.id } });
      throw new BadRequestException('OTP has expired. Please request a new one.');
    }

    const maxAttempts = parseInt(process.env.OTP_MAX_ATTEMPTS ?? '5');
    if (otpRecord.attempts >= maxAttempts) {
      throw new BadRequestException('Too many failed attempts. Please request a new OTP.');
    }

    // Fixed test OTP check: only allow if flag enabled and phone is in allowlist
    const isTestOtp = isReservedTestOtp(otp);
    const isLegacyQaCode = isTestPhoneAllowlisted(phone) && otp === '123456';
    const isStoredHash = otpRecord.otp.startsWith('$2');
    const matchesStoredOtp = isTestOtp
      ? false
      : isStoredHash
        ? await bcrypt.compare(otp, otpRecord.otp).catch(() => false)
        : otpRecord.otp === otp;
    const isValid = isTestOtp
      ? isTestOtpAllowed(phone, otp)
      : !isLegacyQaCode && matchesStoredOtp;
    if (!isValid) {
      await this.prisma.customerOtp.update({
        where: { id: otpRecord.id },
        data: { attempts: { increment: 1 } },
      });
      throw new UnauthorizedException('Invalid OTP');
    }

    // OTP verified — single use deletion
    await this.prisma.customerOtp.delete({ where: { id: otpRecord.id } });


    // Find or create customer
    let customer = await this.prisma.customer.findUnique({ where: { phone } });
    const isNewCustomer = !customer;

    if (!customer) {
      customer = await this.prisma.customer.create({
        data: {
          phone,
          countryCode: dto.phone.startsWith('+') ? dto.phone.slice(0, dto.phone.length - 10) : '+91',
        },
      });

      // Create wallet for new customer
      await this.prisma.customerWallet.create({
        data: { customerId: customer.id, balance: 0 },
      });

      // Create settings for new customer
      await this.prisma.customerSetting.create({
        data: { customerId: customer.id },
      });
    }

    // Generate tokens
    const tokens = await this.generateTokens(customer.id, customer.phone);

    // Store refresh token
    await this.prisma.customerRefreshToken.create({
      data: {
        customerId: customer.id,
        token: tokens.refreshToken,
        deviceInfo: deviceInfo ?? null,
        ipAddress: ipAddress ?? null,
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
      },
    });

    return {
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      isNewCustomer,
      customer: this.sanitizeCustomer(customer),
    };
  }

  // ── RESEND OTP ────────────────────────────────────────────────────────────
  async resendOtp(phone: string) {
    return this.sendOtp({ phone });
  }

  // ── REFRESH TOKEN ─────────────────────────────────────────────────────────
  async refreshToken(refreshToken: string) {
    const tokenRecord = await this.prisma.customerRefreshToken.findUnique({
      where: { token: refreshToken },
      include: { customer: true },
    });

    if (!tokenRecord || tokenRecord.expiresAt < new Date()) {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    if (['deleted', 'suspended', 'deactivated'].includes(tokenRecord.customer.accountStatus)) {
      throw new UnauthorizedException('Account is not active');
    }

    // Rotate refresh token
    const consumed = await this.prisma.customerRefreshToken.deleteMany({ where: { token: refreshToken } });
    if (consumed.count !== 1) throw new UnauthorizedException('Refresh token already used');

    const tokens = await this.generateTokens(
      tokenRecord.customer.id,
      tokenRecord.customer.phone,
    );

    await this.prisma.customerRefreshToken.create({
      data: {
        customerId: tokenRecord.customer.id,
        token: tokens.refreshToken,
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      },
    });

    return tokens;
  }

  // ── LOGOUT ────────────────────────────────────────────────────────────────
  async logout(customerId: string, refreshToken?: string) {
    if (refreshToken) {
      await this.prisma.customerRefreshToken.deleteMany({
        where: { customerId, token: refreshToken },
      });
    }
    return { message: 'Logged out successfully' };
  }

  // ── LOGOUT ALL ────────────────────────────────────────────────────────────
  async logoutAll(customerId: string) {
    await this.prisma.customerRefreshToken.deleteMany({ where: { customerId } });
    return { message: 'Logged out from all devices' };
  }

  // ── CURRENT CUSTOMER ──────────────────────────────────────────────────────
  async getMe(customerId: string) {
    const customer = await this.prisma.customer.findUnique({
      where: { id: customerId },
      include: { settings: true },
    });
    if (!customer) throw new UnauthorizedException('Customer not found');
    return this.sanitizeCustomer(customer);
  }

  // ── HELPERS ───────────────────────────────────────────────────────────────
  private async generateTokens(customerId: string, phone: string) {
    const jti = crypto.randomUUID();
    const payload = { sub: customerId, phone, jti };

    const [accessToken, refreshToken] = await Promise.all([
      this.jwtService.signAsync(payload, {
        secret: process.env.JWT_SECRET,
        expiresIn: (process.env.JWT_EXPIRES_IN ?? '15m') as any,
      }),
      this.jwtService.signAsync({ ...payload, type: 'refresh' }, {
        secret: process.env.JWT_REFRESH_SECRET,
        expiresIn: (process.env.JWT_REFRESH_EXPIRES_IN ?? '30d') as any,
      }),
    ]);

    return { accessToken, refreshToken };
  }

  private sanitizeCustomer(customer: any) {
    // Explicitly exclude fields that must never reach the client
    const {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      otp, otpExpiry, otpAttempts, refreshTokens,
      kyc,   // nested KYC object can contain docNumber — expose via dedicated /kyc endpoint
      ...safe
    } = customer;
    return safe;
  }
}

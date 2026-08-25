import {
  Controller,
  Post,
  Body,
  Get,
  UseGuards,
  Req,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { AuthService } from './auth.service';
import { SendOtpDto, VerifyOtpDto, RefreshTokenDto } from './dto/auth.dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { CurrentCustomer } from '../../common/decorators/current-customer.decorator';
import type { Request } from 'express';

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) { }

  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @Post('send-otp')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Send OTP to phone number (strict rate limit: 5/min)' })
  sendOtp(@Body() dto: SendOtpDto) {
    return this.authService.sendOtp(dto);
  }

  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @Post('verify-otp')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Verify OTP and get JWT tokens (strict rate limit: 5/min)' })
  verifyOtp(@Body() dto: VerifyOtpDto, @Req() req: Request) {
    const deviceInfo = req.headers['user-agent'];
    const ipAddress = req.ip;
    return this.authService.verifyOtp(dto, deviceInfo, ipAddress);
  }

  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @Post('resend-otp')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Resend OTP (strict rate limit: 5/min)' })
  resendOtp(@Body() body: { phone: string }) {
    return this.authService.resendOtp(body.phone);
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Refresh access token using refresh token' })
  refresh(@Body() dto: RefreshTokenDto) {
    return this.authService.refreshToken(dto.refreshToken);
  }

  @Post('logout')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('customer-jwt')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Logout from current device' })
  logout(@CurrentCustomer() customer: any, @Body() body: { refreshToken?: string }) {
    return this.authService.logout(customer.id, body.refreshToken);
  }

  @Post('logout-all')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('customer-jwt')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Logout from all devices' })
  logoutAll(@CurrentCustomer() customer: any) {
    return this.authService.logoutAll(customer.id);
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('customer-jwt')
  @ApiOperation({ summary: 'Get current authenticated customer' })
  getMe(@CurrentCustomer() customer: any) {
    return this.authService.getMe(customer.id);
  }
}

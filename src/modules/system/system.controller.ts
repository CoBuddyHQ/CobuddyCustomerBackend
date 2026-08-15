import { Controller, Get } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';

@ApiTags('System')
@Controller('system')
export class SystemController {
  @Get('config')
  @ApiOperation({ summary: 'Get remote system configurations (force update, maintenance, legal URLs)' })
  getConfig() {
    return {
      minAppVersion: '1.0.0',
      currentAppVersion: '1.0.0',
      forceUpdate: false,
      isMaintenanceMode: false,
      maintenanceMessage: 'We are currently performing scheduled maintenance. Please check back shortly.',
      supportEmail: 'support@cobuddy.club',
      supportPhone: '+91 80000 12345',
      policyUrls: {
        privacy: 'https://cobuddy.club/privacy',
        terms: 'https://cobuddy.club/terms',
        safety: 'https://cobuddy.club/safety',
        communityGuidelines: 'https://cobuddy.club/guidelines',
      },
    };
  }

  @Get('status')
  @ApiOperation({ summary: 'Get server health and uptime status' })
  getStatus() {
    return {
      status: 'operational',
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
      service: 'cobuddy-customer-backend',
    };
  }
}

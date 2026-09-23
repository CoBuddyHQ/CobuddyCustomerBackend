import { Controller, Get, HttpStatus, ServiceUnavailableException } from '@nestjs/common';
import { PrismaService } from './prisma/prisma.service';

@Controller('health')
export class AppController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async getHealth() {
    let dbStatus = 'disconnected';
    let isHealthy = false;

    try {
      await this.prisma.$queryRaw`SELECT 1`;
      dbStatus = 'connected';
      isHealthy = true;
    } catch (err: any) {
      dbStatus = `error: ${err.message || 'database unreachable'}`;
    }

    const payload = {
      status: isHealthy ? 'ok' : 'unhealthy',
      database: dbStatus,
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
      service: 'cobuddy-customer-backend',
    };

    if (!isHealthy) {
      throw new ServiceUnavailableException(payload);
    }

    return payload;
  }
}

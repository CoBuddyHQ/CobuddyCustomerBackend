import { Controller, Get, HttpStatus, Res } from '@nestjs/common';
import type { Response } from 'express';
import { PrismaService } from './prisma/prisma.service';

@Controller('health')
export class AppController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async getHealth(@Res() res: Response) {
    let dbStatus = 'disconnected';
    let isHealthy = false;

    try {
      await this.prisma.$queryRaw`SELECT 1`;
      dbStatus = 'connected';
      isHealthy = true;
    } catch (err: any) {
      dbStatus = `error: ${err.message || 'database unreachable'}`;
    }

    const responsePayload = {
      status: isHealthy ? 'ok' : 'unhealthy',
      database: dbStatus,
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
      service: 'cobuddy-customer-backend',
    };

    return res
      .status(isHealthy ? HttpStatus.OK : HttpStatus.SERVICE_UNAVAILABLE)
      .json(responsePayload);
  }
}

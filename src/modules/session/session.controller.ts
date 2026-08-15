import { Controller, Get, Post, Patch, Param, Body, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentCustomer } from '../../common/decorators/current-customer.decorator';
import { SessionService } from './session.service';

@ApiTags('Sessions')
@ApiBearerAuth('customer-jwt')
@UseGuards(JwtAuthGuard)
@Controller('sessions')
export class SessionController {
  constructor(private readonly sessionService: SessionService) {}

  @Get('current')
  @ApiOperation({ summary: 'Get current active session' })
  getCurrentSession(@CurrentCustomer() customer: any) {
    return this.sessionService.getCurrentSession(customer.id);
  }

  @Get('history')
  @ApiOperation({ summary: 'Get session history' })
  getHistory(@CurrentCustomer() customer: any) {
    return this.sessionService.listSessionHistory(customer.id);
  }

  @Post('check-in')
  @ApiOperation({ summary: 'Check in to session using booking ID' })
  checkIn(
    @CurrentCustomer() customer: any,
    @Body() body: { bookingId: string; passCode?: string },
  ) {
    return this.sessionService.checkIn(customer.id, body.bookingId, body.passCode);
  }

  @Get(':id/pass')
  @ApiOperation({ summary: 'Get digital session pass' })
  getPass(@CurrentCustomer() customer: any, @Param('id') id: string) {
    return this.sessionService.getSessionPass(customer.id, id);
  }

  @Patch(':id/extend')
  @ApiOperation({ summary: 'Extend active session' })
  extend(
    @CurrentCustomer() customer: any,
    @Param('id') id: string,
    @Body() body: { extraMinutes: number },
  ) {
    return this.sessionService.extendSession(customer.id, id, body.extraMinutes);
  }

  @Patch(':id/end')
  @ApiOperation({ summary: 'End session early or on time' })
  endSession(
    @CurrentCustomer() customer: any,
    @Param('id') id: string,
    @Body() body: { tip?: number },
  ) {
    return this.sessionService.endSession(customer.id, id, body.tip);
  }
}

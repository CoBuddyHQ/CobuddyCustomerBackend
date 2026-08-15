import { Controller, Get, Post, Patch, Delete, Body, Param, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentCustomer } from '../../common/decorators/current-customer.decorator';
import { SafetyService } from './safety.service';

@ApiTags('Safety')
@ApiBearerAuth('customer-jwt')
@UseGuards(JwtAuthGuard)
@Controller('safety')
export class SafetyController {
  constructor(private readonly safetyService: SafetyService) {}

  @Post('sos/trigger')
  @ApiOperation({ summary: 'Trigger emergency SOS alert' })
  triggerSOS(
    @CurrentCustomer() customer: any,
    @Body() body: { sessionId?: string; lat?: number; lng?: number },
  ) {
    return this.safetyService.triggerSOS(customer.id, body.sessionId, body.lat, body.lng);
  }

  @Patch('sos/:id/resolve')
  @ApiOperation({ summary: 'Resolve emergency SOS alert' })
  resolveSOS(@CurrentCustomer() customer: any, @Param('id') id: string) {
    return this.safetyService.resolveSOS(customer.id, id);
  }

  @Get('sos/history')
  @ApiOperation({ summary: 'Get SOS history' })
  getSOSHistory(@CurrentCustomer() customer: any) {
    return this.safetyService.getSOSHistory(customer.id);
  }

  @Get('trusted-contacts')
  @ApiOperation({ summary: 'List trusted contacts' })
  getTrustedContacts(@CurrentCustomer() customer: any) {
    return this.safetyService.getTrustedContacts(customer.id);
  }

  @Post('trusted-contacts')
  @ApiOperation({ summary: 'Add trusted contact' })
  addTrustedContact(
    @CurrentCustomer() customer: any,
    @Body() body: { name: string; phone: string; relationship: string },
  ) {
    return this.safetyService.addTrustedContact(customer.id, body);
  }

  @Patch('trusted-contacts/:id')
  @ApiOperation({ summary: 'Update trusted contact' })
  updateTrustedContact(
    @CurrentCustomer() customer: any,
    @Param('id') id: string,
    @Body() body: Partial<{ name: string; phone: string; relationship: string }>,
  ) {
    return this.safetyService.updateTrustedContact(customer.id, id, body);
  }

  @Delete('trusted-contacts/:id')
  @ApiOperation({ summary: 'Delete trusted contact' })
  deleteTrustedContact(@CurrentCustomer() customer: any, @Param('id') id: string) {
    return this.safetyService.deleteTrustedContact(customer.id, id);
  }

  @Post('incidents')
  @ApiOperation({ summary: 'Submit incident report' })
  createIncidentReport(
    @CurrentCustomer() customer: any,
    @Body() body: { companionId?: string; bookingId?: string; description: string; evidenceUrls?: string[] },
  ) {
    return this.safetyService.createIncidentReport(customer.id, body);
  }

  @Get('incidents')
  @ApiOperation({ summary: 'Get submitted incident reports' })
  getIncidentReports(@CurrentCustomer() customer: any) {
    return this.safetyService.getIncidentReports(customer.id);
  }
}

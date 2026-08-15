import { Controller, Get, Post, Param, Body, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentCustomer } from '../../common/decorators/current-customer.decorator';
import { SupportService } from './support.service';

@ApiTags('Support')
@Controller('support')
export class SupportController {
  constructor(private readonly supportService: SupportService) {}

  @Get('tickets')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('customer-jwt')
  @ApiOperation({ summary: 'List customer support tickets' })
  listTickets(@CurrentCustomer() customer: any) {
    return this.supportService.listTickets(customer.id);
  }

  @Post('tickets')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('customer-jwt')
  @ApiOperation({ summary: 'Create new support ticket' })
  createTicket(
    @CurrentCustomer() customer: any,
    @Body() body: { subject: string; category: string; message: string },
  ) {
    return this.supportService.createTicket(customer.id, body.subject, body.category, body.message);
  }

  @Get('tickets/:id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('customer-jwt')
  @ApiOperation({ summary: 'Get ticket detail with thread' })
  getTicketDetail(@CurrentCustomer() customer: any, @Param('id') id: string) {
    return this.supportService.getTicketDetail(customer.id, id);
  }

  @Post('tickets/:id/reply')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('customer-jwt')
  @ApiOperation({ summary: 'Send message reply to ticket thread' })
  replyToTicket(
    @CurrentCustomer() customer: any,
    @Param('id') id: string,
    @Body() body: { text: string },
  ) {
    return this.supportService.replyToTicket(customer.id, id, body.text);
  }

  @Get('categories')
  @ApiOperation({ summary: 'Get help center topic categories' })
  getCategories() {
    return this.supportService.getCategories();
  }

  @Get('faqs')
  @ApiOperation({ summary: 'Get help center FAQs with optional search and category filter' })
  getFaqs(@Query() query?: { search?: string; categoryId?: string }) {
    return this.supportService.getFaqs(query?.search, query?.categoryId);
  }
}

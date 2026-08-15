import { Controller, Get, Post, Delete, Patch, Body, Param, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentCustomer } from '../../common/decorators/current-customer.decorator';
import { WalletService } from './wallet.service';

@ApiTags('Wallet')
@ApiBearerAuth('customer-jwt')
@UseGuards(JwtAuthGuard)
@Controller('wallet')
export class WalletController {
  constructor(private readonly walletService: WalletService) {}

  @Get('balance')
  @ApiOperation({ summary: 'Get wallet balance and stats' })
  getBalance(@CurrentCustomer() customer: any) {
    return this.walletService.getBalance(customer.id);
  }

  @Get('transactions')
  @ApiOperation({ summary: 'Get transaction history' })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'limit', required: false })
  getTransactions(
    @CurrentCustomer() customer: any,
    @Query('page') page = '1',
    @Query('limit') limit = '20',
  ) {
    return this.walletService.getTransactions(customer.id, parseInt(page), parseInt(limit));
  }

  @Get('transactions/:id')
  @ApiOperation({ summary: 'Get transaction detail' })
  getTransaction(@CurrentCustomer() customer: any, @Param('id') id: string) {
    return this.walletService.getTransaction(customer.id, id);
  }

  @Get('payment-methods')
  @ApiOperation({ summary: 'Get saved payment methods' })
  getPaymentMethods(@CurrentCustomer() customer: any) {
    return this.walletService.getPaymentMethods(customer.id);
  }

  @Post('payment-methods')
  @ApiOperation({ summary: 'Add a payment method' })
  addPaymentMethod(@CurrentCustomer() customer: any, @Body() body: any) {
    return this.walletService.addPaymentMethod(customer.id, body);
  }

  @Delete('payment-methods/:id')
  @ApiOperation({ summary: 'Remove a payment method' })
  deletePaymentMethod(@CurrentCustomer() customer: any, @Param('id') id: string) {
    return this.walletService.deletePaymentMethod(customer.id, id);
  }

  @Patch('payment-methods/:id/default')
  @ApiOperation({ summary: 'Set default payment method' })
  setDefault(@CurrentCustomer() customer: any, @Param('id') id: string) {
    return this.walletService.setDefaultPaymentMethod(customer.id, id);
  }
}

import { Controller, Post, Get, Body, Param, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentCustomer } from '../../common/decorators/current-customer.decorator';
import { PaymentService } from './payment.service';

@ApiTags('Payments')
@ApiBearerAuth('customer-jwt')
@UseGuards(JwtAuthGuard)
@Controller('payments')
export class PaymentController {
  constructor(private readonly paymentService: PaymentService) {}

  @Post('create-order')
  @ApiOperation({ summary: 'Create Razorpay order for booking payment' })
  createOrder(@CurrentCustomer() customer: any, @Body() body: { bookingId: string }) {
    return this.paymentService.createOrder(customer.id, body.bookingId);
  }

  @Post('verify')
  @ApiOperation({ summary: 'Verify Razorpay payment signature' })
  verifyPayment(@CurrentCustomer() customer: any, @Body() body: any) {
    return this.paymentService.verifyPayment(customer.id, body);
  }

  @Get('order/:orderId')
  @ApiOperation({ summary: 'Get Razorpay order status' })
  getOrderStatus(@CurrentCustomer() customer: any, @Param('orderId') orderId: string) {
    return this.paymentService.getOrderStatus(customer.id, orderId);
  }

  @Post('add-money/create-order')
  @ApiOperation({ summary: 'Create Razorpay order to top up wallet' })
  addMoney(@CurrentCustomer() customer: any, @Body() body: { amount: number; description?: string }) {
    return this.paymentService.addMoney(customer.id, body.amount, body.description);
  }

  @Post('add-money/verify')
  @ApiOperation({ summary: 'Verify wallet top-up payment and credit wallet' })
  verifyWalletTopup(@CurrentCustomer() customer: any, @Body() body: any) {
    return this.paymentService.verifyWalletTopup(customer.id, body);
  }
}

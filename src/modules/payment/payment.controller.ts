import {
  Controller,
  Post,
  Get,
  Body,
  Param,
  UseGuards,
  Headers,
  Req,
  BadRequestException,
} from '@nestjs/common';
import type { RawBodyRequest } from '@nestjs/common';
import type { Request } from 'express';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentCustomer } from '../../common/decorators/current-customer.decorator';
import { PaymentService } from './payment.service';
import {
  CreatePaymentOrderDto,
  CreateWalletTopupDto,
  VerifyPaymentDto,
} from './dto/payment.dto';

@ApiTags('Payments')
@Controller('payments')
export class PaymentController {
  constructor(private readonly paymentService: PaymentService) {}

  @Post('create-order')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('customer-jwt')
  @ApiOperation({ summary: 'Create Razorpay order for booking payment' })
  createOrder(
    @CurrentCustomer() customer: { id: string },
    @Body() body: CreatePaymentOrderDto,
  ) {
    return this.paymentService.createOrder(customer.id, body.bookingId);
  }

  @Post('verify')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('customer-jwt')
  @ApiOperation({ summary: 'Verify Razorpay payment signature' })
  verifyPayment(
    @CurrentCustomer() customer: { id: string },
    @Body() body: VerifyPaymentDto,
  ) {
    return this.paymentService.verifyPayment(customer.id, body);
  }

  @Get('order/:orderId')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('customer-jwt')
  @ApiOperation({ summary: 'Get Razorpay order status' })
  getOrderStatus(
    @CurrentCustomer() customer: { id: string },
    @Param('orderId') orderId: string,
  ) {
    return this.paymentService.getOrderStatus(customer.id, orderId);
  }

  @Post('add-money/create-order')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('customer-jwt')
  @ApiOperation({ summary: 'Create Razorpay order to top up wallet' })
  addMoney(
    @CurrentCustomer() customer: { id: string },
    @Body() body: CreateWalletTopupDto,
  ) {
    return this.paymentService.addMoney(
      customer.id,
      body.amount,
      body.description,
    );
  }

  @Post('add-money/verify')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('customer-jwt')
  @ApiOperation({ summary: 'Verify wallet top-up payment and credit wallet' })
  verifyWalletTopup(
    @CurrentCustomer() customer: { id: string },
    @Body() body: VerifyPaymentDto,
  ) {
    return this.paymentService.verifyWalletTopup(customer.id, body);
  }

  @Post('webhook')
  @ApiOperation({
    summary: 'Razorpay webhook handler for async payment events',
  })
  handleWebhook(
    @Headers('x-razorpay-signature') signature: string,
    @Req() req: RawBodyRequest<Request>,
  ) {
    if (!req.rawBody)
      throw new BadRequestException('Raw webhook body is required.');
    return this.paymentService.handleWebhook(signature || '', req.rawBody);
  }
}

import {
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class CreatePaymentOrderDto {
  @IsString()
  @Matches(/^[a-zA-Z0-9_-]{1,100}$/)
  bookingId!: string;
}

export class CreateWalletTopupDto {
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(100)
  @Max(10000)
  amount!: number;

  @IsOptional()
  @IsString()
  @MaxLength(250)
  description?: string;
}

// Keep both published spellings; the service requires all three values.
export class VerifyPaymentDto {
  @IsOptional()
  @Matches(/^[a-zA-Z0-9_-]{1,100}$/)
  razorpay_order_id?: string;

  @IsOptional()
  @Matches(/^[a-zA-Z0-9_-]{1,100}$/)
  razorpayOrderId?: string;

  @IsOptional()
  @Matches(/^[a-zA-Z0-9_-]{1,100}$/)
  razorpay_payment_id?: string;

  @IsOptional()
  @Matches(/^[a-zA-Z0-9_-]{1,100}$/)
  razorpayPaymentId?: string;

  @IsOptional()
  @Matches(/^[a-fA-F0-9]{64}$/)
  razorpay_signature?: string;

  @IsOptional()
  @Matches(/^[a-fA-F0-9]{64}$/)
  razorpaySignature?: string;
}

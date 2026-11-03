import { Module } from '@nestjs/common';
import { KycController } from './kyc.controller';
import { InternalKycController } from './internal-kyc.controller';
import { KycService } from './kyc.service';

@Module({
  controllers: [KycController, InternalKycController],
  providers: [KycService],
  exports: [KycService],
})
export class KycModule {}

import { Module } from '@nestjs/common';
import { SupportController } from './support.controller';
import { InternalSupportController } from './internal-support.controller';
import { SupportService } from './support.service';

@Module({
  controllers: [SupportController, InternalSupportController],
  providers: [SupportService],
  exports: [SupportService],
})
export class SupportModule {}

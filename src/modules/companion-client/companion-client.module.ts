import { Module, Global } from '@nestjs/common';
import { CompanionClientService } from './companion-client.service';

@Global()
@Module({
  providers: [CompanionClientService],
  exports: [CompanionClientService],
})
export class CompanionClientModule {}

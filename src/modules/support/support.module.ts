import { Module, forwardRef } from '@nestjs/common';
import { SupportController } from './support.controller';
import { InternalSupportController } from './internal-support.controller';
import { SupportService } from './support.service';
import { ChatModule } from '../chat/chat.module';

@Module({
  imports: [forwardRef(() => ChatModule)],
  controllers: [SupportController, InternalSupportController],
  providers: [SupportService],
  exports: [SupportService],
})
export class SupportModule {}


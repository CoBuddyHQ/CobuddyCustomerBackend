import { Controller, Post, Param, Body, UseGuards, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiHeader, ApiResponse } from '@nestjs/swagger';
import { InternalServiceGuard } from '../../common/guards/internal-service.guard';
import { SupportService } from './support.service';

@ApiTags('Internal - Support')
@Controller('internal/tickets')
@UseGuards(InternalServiceGuard)
export class InternalSupportController {
  constructor(private readonly supportService: SupportService) {}

  @Post(':id/messages')
  @ApiOperation({ summary: 'Internal S2S endpoint for Admin to add message to ticket thread' })
  @ApiHeader({ name: 'X-Internal-Service-Key', required: true, description: 'Internal S2S secret' })
  @ApiResponse({ status: 200, description: 'Message added to support ticket' })
  @HttpCode(HttpStatus.OK)
  async addMessage(
    @Param('id') ticketId: string,
    @Body() body: { message: string; senderType?: string; senderName?: string },
  ) {
    const created = await this.supportService.addInboundMessage(ticketId, body.message, body.senderName);
    return {
      success: true,
      data: created,
    };
  }
}


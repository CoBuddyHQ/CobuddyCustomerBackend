import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Body,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiHeader } from '@nestjs/swagger';
import { InternalServiceGuard } from '../../common/guards/internal-service.guard';
import { ChatService } from './chat.service';

@ApiTags('Internal - Chat')
@Controller('internal/chat')
@UseGuards(InternalServiceGuard)
export class InternalChatController {
  constructor(private readonly chatService: ChatService) {}

  // ─── Companion S2S Endpoints ───────────────────────────────────────────────

  @Get('companion/:companionId/conversations')
  @ApiOperation({ summary: 'Internal S2S fetch of companion conversations' })
  @ApiHeader({ name: 'X-Internal-Service-Key', required: true })
  listCompanionConversations(
    @Param('companionId') companionId: string,
    @Query('search') search?: string,
  ) {
    return this.chatService.internalListCompanionConversations(companionId, search);
  }

  @Post('companion/:companionId/booking/:bookingId')
  @ApiOperation({ summary: 'Internal S2S get/create conversation for a booking' })
  @ApiHeader({ name: 'X-Internal-Service-Key', required: true })
  getCompanionBookingConversation(
    @Param('companionId') companionId: string,
    @Param('bookingId') bookingId: string,
  ) {
    return this.chatService.internalGetBookingConversation(companionId, bookingId);
  }

  @Get('companion/:companionId/conversations/:conversationId/messages')
  @ApiOperation({ summary: 'Internal S2S fetch of messages for companion' })
  @ApiHeader({ name: 'X-Internal-Service-Key', required: true })
  getCompanionMessages(
    @Param('companionId') companionId: string,
    @Param('conversationId') conversationId: string,
    @Query('page') page = '1',
    @Query('limit') limit = '50',
  ) {
    return this.chatService.getMessages(
      { role: 'companion', id: companionId },
      conversationId,
      parseInt(page) || 1,
      parseInt(limit) || 50,
    );
  }

  @Post('companion/:companionId/conversations/:conversationId/messages')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Internal S2S send message from companion' })
  @ApiHeader({ name: 'X-Internal-Service-Key', required: true })
  sendCompanionMessage(
    @Param('companionId') companionId: string,
    @Param('conversationId') conversationId: string,
    @Body() body: { text?: string; attachmentUrl?: string; attachmentType?: string; clientMessageId?: string; companionName?: string },
  ) {
    return this.chatService.sendMessage(
      { role: 'companion', id: companionId, name: body.companionName },
      conversationId,
      body,
    );
  }

  @Patch('companion/:companionId/conversations/:conversationId/read')
  @ApiOperation({ summary: 'Internal S2S mark conversation read by companion' })
  @ApiHeader({ name: 'X-Internal-Service-Key', required: true })
  markCompanionRead(
    @Param('companionId') companionId: string,
    @Param('conversationId') conversationId: string,
  ) {
    return this.chatService.markAsRead(
      { role: 'companion', id: companionId },
      conversationId,
    );
  }

  // ─── Admin S2S Endpoints ───────────────────────────────────────────────────

  @Get('admin/conversations')
  @ApiOperation({ summary: 'Internal S2S search conversations for Admin Support' })
  @ApiHeader({ name: 'X-Internal-Service-Key', required: true })
  adminListConversations(
    @Query('search') search?: string,
    @Query('status') status?: string,
    @Query('page') page = '1',
    @Query('limit') limit = '20',
  ) {
    return this.chatService.adminListConversations({
      search,
      status,
      page: parseInt(page) || 1,
      limit: parseInt(limit) || 20,
    });
  }

  @Get('admin/conversations/:id')
  @ApiOperation({ summary: 'Internal S2S get conversation transcript for Admin' })
  @ApiHeader({ name: 'X-Internal-Service-Key', required: true })
  adminGetConversation(@Param('id') conversationId: string) {
    return this.chatService.adminGetConversation(conversationId);
  }

  @Post('admin/conversations/:id/messages')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Internal S2S reply from Admin Staff' })
  @ApiHeader({ name: 'X-Internal-Service-Key', required: true })
  adminSendMessage(
    @Param('id') conversationId: string,
    @Body() body: { staffId: string; staffName?: string; text: string; clientMessageId?: string },
  ) {
    return this.chatService.sendMessage(
      { role: 'staff', id: body.staffId, name: body.staffName || 'CoBuddy Support' },
      conversationId,
      { text: body.text, clientMessageId: body.clientMessageId },
    );
  }

  @Get('admin/flagged')
  @ApiOperation({ summary: 'Internal S2S list flagged messages for Admin Moderation' })
  @ApiHeader({ name: 'X-Internal-Service-Key', required: true })
  adminListFlagged(
    @Query('page') page = '1',
    @Query('limit') limit = '20',
  ) {
    return this.chatService.adminListFlaggedMessages({
      page: parseInt(page) || 1,
      limit: parseInt(limit) || 20,
    });
  }

  @Post('admin/messages/:id/decide')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Internal S2S decide flagged message' })
  @ApiHeader({ name: 'X-Internal-Service-Key', required: true })
  adminDecideFlagged(
    @Param('id') messageId: string,
    @Body() body: { action: string; note?: string; staffId: string },
  ) {
    return this.chatService.adminDecideFlaggedMessage(messageId, body, body.staffId);
  }
}


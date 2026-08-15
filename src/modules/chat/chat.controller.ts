import { Controller, Get, Post, Patch, Param, Body, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentCustomer } from '../../common/decorators/current-customer.decorator';
import { ChatService } from './chat.service';

@ApiTags('Chat')
@ApiBearerAuth('customer-jwt')
@UseGuards(JwtAuthGuard)
@Controller('chat')
export class ChatController {
  constructor(private readonly chatService: ChatService) {}

  @Get('conversations')
  @ApiOperation({ summary: 'List customer conversations' })
  listConversations(@CurrentCustomer() customer: any) {
    return this.chatService.listConversations(customer.id);
  }

  @Post('conversations/companion')
  @ApiOperation({ summary: 'Get or create conversation with companion' })
  getOrCreateCompanionConv(
    @CurrentCustomer() customer: any,
    @Body() body: { companionId: string; bookingId?: string },
  ) {
    return this.chatService.getOrCreateCompanionConversation(customer.id, body.companionId, body.bookingId);
  }

  @Post('conversations/concierge')
  @ApiOperation({ summary: 'Get or create Concierge support chat' })
  getOrCreateConciergeConv(@CurrentCustomer() customer: any) {
    return this.chatService.getOrCreateConciergeConversation(customer.id);
  }

  @Get('conversations/:id/messages')
  @ApiOperation({ summary: 'Get messages for a conversation' })
  getMessages(
    @CurrentCustomer() customer: any,
    @Param('id') id: string,
    @Query('page') page = '1',
    @Query('limit') limit = '50',
  ) {
    return this.chatService.getMessages(customer.id, id, parseInt(page), parseInt(limit));
  }

  @Post('conversations/:id/messages')
  @ApiOperation({ summary: 'Send message in conversation' })
  sendMessage(
    @CurrentCustomer() customer: any,
    @Param('id') id: string,
    @Body() body: { text: string; attachmentUrl?: string },
  ) {
    return this.chatService.sendMessage(customer.id, id, body.text, body.attachmentUrl);
  }

  @Patch('conversations/:id/read')
  @ApiOperation({ summary: 'Mark conversation as read' })
  markAsRead(@CurrentCustomer() customer: any, @Param('id') id: string) {
    return this.chatService.markAsRead(customer.id, id);
  }
}

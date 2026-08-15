import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class ChatService {
  constructor(private prisma: PrismaService) {}

  async listConversations(customerId: string) {
    return this.prisma.customerConversation.findMany({
      where: { customerId },
      orderBy: { lastMessageAt: 'desc' },
    });
  }

  async getOrCreateCompanionConversation(customerId: string, companionId: string, bookingId?: string) {
    let conv = await this.prisma.customerConversation.findFirst({
      where: { customerId, companionId, isConcierge: false },
    });

    if (!conv) {
      conv = await this.prisma.customerConversation.create({
        data: {
          customerId,
          companionId,
          bookingId: bookingId ?? null,
          isConcierge: false,
        },
      });
    }

    return conv;
  }

  async getOrCreateConciergeConversation(customerId: string) {
    let conv = await this.prisma.customerConversation.findFirst({
      where: { customerId, isConcierge: true },
    });

    if (!conv) {
      conv = await this.prisma.customerConversation.create({
        data: {
          customerId,
          isConcierge: true,
          lastMessage: 'Welcome to CoBuddy Support Concierge! How can we assist you today?',
          lastMessageAt: new Date(),
        },
      });

      // Add default welcome message
      await this.prisma.customerMessage.create({
        data: {
          conversationId: conv.id,
          senderType: 'concierge',
          senderId: 'concierge-system',
          text: 'Welcome to CoBuddy Support Concierge! How can we assist you today?',
        },
      });
    }

    return conv;
  }

  async getMessages(customerId: string, conversationId: string, page = 1, limit = 50) {
    const conv = await this.prisma.customerConversation.findFirst({
      where: { id: conversationId, customerId },
    });
    if (!conv) throw new NotFoundException('Conversation not found');

    const skip = (page - 1) * limit;
    const messages = await this.prisma.customerMessage.findMany({
      where: { conversationId },
      orderBy: { createdAt: 'asc' },
      skip,
      take: limit,
    });

    // Reset unread count
    await this.prisma.customerConversation.update({
      where: { id: conversationId },
      data: { unreadCount: 0 },
    });

    return messages;
  }

  async sendMessage(customerId: string, conversationId: string, text: string, attachmentUrl?: string) {
    const conv = await this.prisma.customerConversation.findFirst({
      where: { id: conversationId, customerId },
    });
    if (!conv) throw new NotFoundException('Conversation not found');

    const message = await this.prisma.customerMessage.create({
      data: {
        conversationId,
        senderType: 'customer',
        senderId: customerId,
        text,
        attachmentUrl: attachmentUrl ?? null,
      },
    });

    await this.prisma.customerConversation.update({
      where: { id: conversationId },
      data: {
        lastMessage: text,
        lastMessageAt: new Date(),
      },
    });

    return message;
  }

  async markAsRead(customerId: string, conversationId: string) {
    await this.prisma.customerConversation.updateMany({
      where: { id: conversationId, customerId },
      data: { unreadCount: 0 },
    });
    await this.prisma.customerMessage.updateMany({
      where: { conversationId, isRead: false },
      data: { isRead: true },
    });
    return { message: 'Conversation marked as read' };
  }
}

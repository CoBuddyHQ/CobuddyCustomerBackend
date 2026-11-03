import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  Logger,
  Inject,
  forwardRef,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { ChatGateway } from './chat.gateway';
import { CompanionClientService } from '../companion-client/companion-client.service';

export interface ParticipantIdentity {
  role: 'customer' | 'companion' | 'staff';
  id: string;
  name?: string;
}

export interface SendMessagePayload {
  text?: string;
  attachmentUrl?: string;
  attachmentType?: string;
  clientMessageId?: string;
}

@Injectable()
export class ChatService {
  private readonly logger = new Logger(ChatService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(forwardRef(() => ChatGateway))
    private readonly chatGateway: ChatGateway,
    @Inject(forwardRef(() => CompanionClientService))
    private readonly companionClient?: CompanionClientService,
  ) {}

  // ── Helper: Format conversation for client output ──────────────────────────
  public formatConversation(conv: any, viewerRole: 'customer' | 'companion' | 'staff') {
    const isCompanion = viewerRole === 'companion';
    const otherParticipantId = isCompanion ? conv.customerId : conv.companionId;
    const isOnline = otherParticipantId ? this.chatGateway.isUserOnline(otherParticipantId) : false;

    return {
      id: conv.id,
      conversationId: conv.id,
      type: conv.isConcierge ? 'concierge' : 'companion',
      bookingId: conv.bookingId,
      status: conv.status || 'active',
      displayName: isCompanion
        ? conv.customerName || 'Customer'
        : conv.isConcierge
        ? 'CoBuddy Support Concierge'
        : conv.companionName || 'Companion',
      avatar: isCompanion ? conv.customerAvatar : conv.companionAvatar,
      activity: conv.activityName || 'Meetup Experience',
      activityName: conv.activityName || 'Meetup Experience',
      lastMessage: conv.lastMessage || 'Tap to chat',
      lastMessageAt: conv.lastMessageAt || conv.createdAt,
      unreadCount: isCompanion ? conv.companionUnreadCount : conv.customerUnreadCount,
      isOnline,
      createdAt: conv.createdAt,
    };
  }

  // ── 1. Create or Get Unique Conversation for a Booking ─────────────────────
  async getOrCreateBookingConversation(customerId: string, bookingId: string) {
    if (!bookingId) {
      throw new BadRequestException('Booking ID is required.');
    }

    const booking = await this.prisma.customerBooking.findUnique({
      where: { id: bookingId },
      include: { customer: true },
    });

    if (!booking) {
      throw new NotFoundException(`Booking with ID ${bookingId} not found.`);
    }

    if (booking.customerId !== customerId) {
      this.logger.warn(`Unauthorized booking chat access: Customer ${customerId} for booking ${bookingId}`);
      throw new ForbiddenException('You are not authorized to access this booking conversation.');
    }

    const companionId = booking.companionId;
    let companionName = booking.companionName;

    if (!companionName && companionId && this.companionClient) {
      try {
        const comp = await this.companionClient.getCompanionById(companionId);
        companionName = comp?.displayName || comp?.name || 'Companion';
      } catch {
        companionName = 'Companion';
      }
    }

    const customerName = booking.customer?.name || 'Customer';
    const activityName = booking.activityName || (booking as any).activityType || 'Meetup Experience';

    let convStatus = 'active';
    if (booking.status === 'completed') {
      convStatus = 'read_only';
    } else if (booking.status === 'cancelled' || booking.status === 'declined') {
      convStatus = 'closed';
    }

    let conv = await this.prisma.customerConversation.findUnique({
      where: { bookingId },
    });

    if (!conv) {
      conv = await this.prisma.customerConversation.create({
        data: {
          customerId,
          companionId,
          bookingId,
          isConcierge: false,
          status: convStatus,
          companionName: companionName || 'Companion',
          customerName,
          activityName,
        },
      });
      this.logger.log(`Created unique conversation ${conv.id} for booking ${bookingId}`);
    } else {
      conv = await this.prisma.customerConversation.update({
        where: { id: conv.id },
        data: {
          status: convStatus,
          companionName: companionName || conv.companionName,
          customerName: customerName || conv.customerName,
          activityName: activityName || conv.activityName,
        },
      });
    }

    return this.formatConversation(conv, 'customer');
  }

  // ── Update Conversation Status by Booking ID ───────────────────────────────
  async updateBookingConversationStatus(bookingId: string, status: 'active' | 'read_only' | 'closed') {
    if (!bookingId) return null;
    try {
      const conv = await this.prisma.customerConversation.findUnique({
        where: { bookingId },
      });
      if (!conv) return null;
      const updated = await this.prisma.customerConversation.update({
        where: { id: conv.id },
        data: { status },
      });
      this.logger.log(`Updated conversation ${conv.id} status to ${status} for booking ${bookingId}`);
      return updated;
    } catch (err: any) {
      this.logger.warn(`Could not update conversation status for booking ${bookingId}: ${err.message}`);
      return null;
    }
  }

  // ── 2. Backward Compatible Companion Conversation ──────────────────────────
  async getOrCreateCompanionConversation(customerId: string, companionId: string, bookingId?: string) {
    if (bookingId) {
      return this.getOrCreateBookingConversation(customerId, bookingId);
    }

    // Look for active booking between this customer and companion
    const activeBooking = await this.prisma.customerBooking.findFirst({
      where: {
        customerId,
        companionId,
        status: { in: ['confirmed', 'accepted', 'in_progress', 'pending'] },
      },
      orderBy: { createdAt: 'desc' },
    });

    if (activeBooking) {
      return this.getOrCreateBookingConversation(customerId, activeBooking.id);
    }

    // Fallback: direct conversation
    let conv = await this.prisma.customerConversation.findFirst({
      where: { customerId, companionId, isConcierge: false },
    });

    if (!conv) {
      let companionName = 'Companion';
      if (this.companionClient) {
        try {
          const comp = await this.companionClient.getCompanionById(companionId);
          companionName = comp?.displayName || comp?.name || 'Companion';
        } catch {}
      }
      const customer = await this.prisma.customer.findUnique({
        where: { id: customerId },
        select: { name: true },
      });

      conv = await this.prisma.customerConversation.create({
        data: {
          customerId,
          companionId,
          isConcierge: false,
          status: 'active',
          companionName,
          customerName: customer?.name || 'Customer',
          activityName: 'Direct Chat',
        },
      });
    }

    return this.formatConversation(conv, 'customer');
  }

  // ── 3. Concierge Support Chat ──────────────────────────────────────────────
  async getOrCreateConciergeConversation(customerId: string) {
    let conv = await this.prisma.customerConversation.findFirst({
      where: { customerId, isConcierge: true },
    });

    if (!conv) {
      conv = await this.prisma.customerConversation.create({
        data: {
          customerId,
          isConcierge: true,
          status: 'active',
          companionName: 'CoBuddy Support Concierge',
          customerName: 'Customer',
          activityName: 'Concierge Support',
          lastMessage: 'Welcome to CoBuddy Support Concierge! How can we assist you today?',
          lastMessageAt: new Date(),
        },
      });

      await this.prisma.customerMessage.create({
        data: {
          conversationId: conv.id,
          senderType: 'concierge',
          senderId: 'concierge-system',
          senderName: 'CoBuddy Support',
          text: 'Welcome to CoBuddy Support Concierge! How can we assist you today?',
        },
      });
    }

    return this.formatConversation(conv, 'customer');
  }

  // ── 4. List Customer Conversations with Search ─────────────────────────────
  async listConversations(customerId: string, search?: string) {
    const where: any = { customerId };
    if (search && search.trim()) {
      const q = search.trim();
      where.OR = [
        { companionName: { contains: q, mode: 'insensitive' } },
        { activityName: { contains: q, mode: 'insensitive' } },
        { bookingId: { contains: q, mode: 'insensitive' } },
        { lastMessage: { contains: q, mode: 'insensitive' } },
      ];
    }

    const conversations = await this.prisma.customerConversation.findMany({
      where,
      orderBy: { lastMessageAt: 'desc' },
    });

    return conversations.map((c) => this.formatConversation(c, 'customer'));
  }

  // ── 5. Get Messages with Cursor/Page Pagination and Participant Check ───────
  async getMessages(
    participant: ParticipantIdentity,
    conversationId: string,
    page = 1,
    limit = 50,
  ) {
    const conv = await this.prisma.customerConversation.findUnique({
      where: { id: conversationId },
    });

    if (!conv) {
      throw new NotFoundException('Conversation not found');
    }

    // Verify participant authorization
    if (participant.role === 'customer' && conv.customerId !== participant.id) {
      throw new ForbiddenException('You do not have access to this conversation.');
    }
    if (participant.role === 'companion' && conv.companionId !== participant.id) {
      throw new ForbiddenException('You do not have access to this conversation.');
    }

    const skip = (Math.max(1, page) - 1) * limit;
    const [messages, total] = await Promise.all([
      this.prisma.customerMessage.findMany({
        where: { conversationId },
        orderBy: { createdAt: 'asc' },
        skip,
        take: limit,
      }),
      this.prisma.customerMessage.count({ where: { conversationId } }),
    ]);

    // Update read cursor
    if (participant.role === 'customer') {
      await this.prisma.customerConversation.update({
        where: { id: conversationId },
        data: {
          customerUnreadCount: 0,
          unreadCount: 0,
          customerLastReadAt: new Date(),
        },
      });
    } else if (participant.role === 'companion') {
      await this.prisma.customerConversation.update({
        where: { id: conversationId },
        data: {
          companionUnreadCount: 0,
          companionLastReadAt: new Date(),
        },
      });
    }

    return {
      conversation: this.formatConversation(conv, participant.role),
      data: messages,
      total,
      page,
      limit,
    };
  }

  // ── 6. Send Message with DB Transaction, Idempotency & Validation ──────────
  async sendMessage(
    sender: ParticipantIdentity,
    conversationId: string,
    payload: SendMessagePayload,
  ) {
    const text = payload.text?.trim();
    const attachmentUrl = payload.attachmentUrl?.trim();

    if (!text && !attachmentUrl) {
      throw new BadRequestException('Message must contain either text or an attachment.');
    }

    // Validate attachment URL to prevent injection of malicious schemes
    if (attachmentUrl) {
      const isAllowed =
        attachmentUrl.startsWith('http://') ||
        attachmentUrl.startsWith('https://') ||
        attachmentUrl.startsWith('/api/v1/uploads/') ||
        attachmentUrl.startsWith('/uploads/');
      if (!isAllowed) {
        throw new BadRequestException('Invalid attachment URL scheme.');
      }
    }

    const conv = await this.prisma.customerConversation.findUnique({
      where: { id: conversationId },
    });

    if (!conv) {
      throw new NotFoundException('Conversation not found');
    }

    // Verify sender authorization
    if (sender.role === 'customer' && conv.customerId !== sender.id) {
      throw new ForbiddenException('You are not authorized to send messages in this conversation.');
    }
    if (sender.role === 'companion' && conv.companionId !== sender.id) {
      throw new ForbiddenException('You are not authorized to send messages in this conversation.');
    }

    // Lifecycle policy checks
    if (conv.status === 'read_only') {
      throw new BadRequestException('This booking session has ended. Conversation is read-only.');
    }
    if (conv.status === 'closed') {
      throw new BadRequestException('This booking has been cancelled or declined. Messaging is closed.');
    }

    // Block checks
    if (conv.companionId && conv.customerId) {
      const isBlocked = await this.prisma.customerBlock.findFirst({
        where: {
          OR: [
            { blockerId: conv.customerId, blockedId: conv.companionId },
            { blockerId: conv.companionId, blockedId: conv.customerId },
          ],
        },
      });
      if (isBlocked) {
        throw new BadRequestException('Cannot send messages to a blocked participant.');
      }
    }

    // clientMessageId Idempotency: Return existing message if client retries
    if (payload.clientMessageId) {
      const existing = await this.prisma.customerMessage.findFirst({
        where: {
          conversationId,
          clientMessageId: payload.clientMessageId,
        },
      });
      if (existing) {
        return existing;
      }
    }

    const senderName =
      sender.name ||
      (sender.role === 'customer'
        ? conv.customerName || 'Customer'
        : sender.role === 'companion'
        ? conv.companionName || 'Companion'
        : 'CoBuddy Support');

    // Atomic DB persistence
    const [message] = await this.prisma.$transaction([
      this.prisma.customerMessage.create({
        data: {
          conversationId,
          clientMessageId: payload.clientMessageId || null,
          senderType: sender.role,
          senderId: sender.id,
          senderName,
          text: text || null,
          attachmentUrl: attachmentUrl || null,
          attachmentType: payload.attachmentType || null,
        },
      }),
      this.prisma.customerConversation.update({
        where: { id: conversationId },
        data: {
          lastMessage: text || '[Attachment]',
          lastMessageAt: new Date(),
          customerUnreadCount: sender.role !== 'customer' ? { increment: 1 } : undefined,
          companionUnreadCount: sender.role !== 'companion' ? { increment: 1 } : undefined,
          unreadCount: sender.role !== 'customer' ? { increment: 1 } : 0,
        },
      }),
    ]);

    // 1. Broadcast to Customer Chat Room
    this.chatGateway.broadcastNewMessage(conversationId, message);

    // 2. Relay to Companion Backend if recipient is Companion
    if (sender.role !== 'companion' && conv.companionId) {
      this.relayToCompanionBackend(conv, message).catch((err) => {
        this.logger.warn(`Failed to relay message to Companion backend: ${err.message}`);
      });
    }

    // 3. Dispatch offline in-app notification if recipient is offline
    this.dispatchOfflineNotification(conv, sender, text || '[Attachment]').catch(() => {});

    return message;
  }

  // ── 7. Mark Conversation Read ──────────────────────────────────────────────
  async markAsRead(participant: ParticipantIdentity, conversationId: string) {
    const conv = await this.prisma.customerConversation.findUnique({
      where: { id: conversationId },
    });
    if (!conv) throw new NotFoundException('Conversation not found');

    if (participant.role === 'customer') {
      if (conv.customerId !== participant.id) throw new ForbiddenException();
      await this.prisma.customerConversation.update({
        where: { id: conversationId },
        data: { customerUnreadCount: 0, unreadCount: 0, customerLastReadAt: new Date() },
      });
    } else if (participant.role === 'companion') {
      if (conv.companionId !== participant.id) throw new ForbiddenException();
      await this.prisma.customerConversation.update({
        where: { id: conversationId },
        data: { companionUnreadCount: 0, companionLastReadAt: new Date() },
      });
    }

    this.chatGateway.broadcastReadReceipt(conversationId, participant.id, participant.role);
    return { success: true, conversationId };
  }

  // ── 8. Search Messages within Authorized Conversation ──────────────────────
  async searchMessages(participant: ParticipantIdentity, conversationId: string, query: string) {
    const conv = await this.prisma.customerConversation.findUnique({
      where: { id: conversationId },
    });
    if (!conv) throw new NotFoundException('Conversation not found');

    if (participant.role === 'customer' && conv.customerId !== participant.id) throw new ForbiddenException();
    if (participant.role === 'companion' && conv.companionId !== participant.id) throw new ForbiddenException();

    return this.prisma.customerMessage.findMany({
      where: {
        conversationId,
        text: { contains: query.trim(), mode: 'insensitive' },
      },
      orderBy: { createdAt: 'desc' },
      take: 30,
    });
  }

  // ── 9. S2S Companion Backend Internal Methods ──────────────────────────────
  async internalListCompanionConversations(companionId: string, search?: string) {
    const where: any = { companionId };
    if (search && search.trim()) {
      const q = search.trim();
      where.OR = [
        { customerName: { contains: q, mode: 'insensitive' } },
        { activityName: { contains: q, mode: 'insensitive' } },
        { bookingId: { contains: q, mode: 'insensitive' } },
      ];
    }

    const convs = await this.prisma.customerConversation.findMany({
      where,
      orderBy: { lastMessageAt: 'desc' },
    });

    return convs.map((c) => this.formatConversation(c, 'companion'));
  }

  async internalGetBookingConversation(companionId: string, bookingId: string) {
    const booking = await this.prisma.customerBooking.findUnique({
      where: { id: bookingId },
      include: { customer: true },
    });
    if (!booking) throw new NotFoundException('Booking not found');
    if (booking.companionId !== companionId) {
      throw new ForbiddenException('Companion is not a participant in this booking');
    }

    return this.getOrCreateBookingConversation(booking.customerId, bookingId);
  }

  // ── 10. Admin Support & Moderation Methods ──────────────────────────────────
  async adminListConversations(query: { search?: string; status?: string; page?: number; limit?: number }) {
    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(query.limit) || 20));
    const skip = (page - 1) * limit;

    const where: any = {};
    if (query.status) where.status = query.status;
    if (query.search && query.search.trim()) {
      const q = query.search.trim();
      where.OR = [
        { customerName: { contains: q, mode: 'insensitive' } },
        { companionName: { contains: q, mode: 'insensitive' } },
        { bookingId: { contains: q, mode: 'insensitive' } },
        { activityName: { contains: q, mode: 'insensitive' } },
        { lastMessage: { contains: q, mode: 'insensitive' } },
      ];
    }

    const [conversations, total] = await Promise.all([
      this.prisma.customerConversation.findMany({
        where,
        orderBy: { lastMessageAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.customerConversation.count({ where }),
    ]);

    return {
      data: conversations.map((c) => this.formatConversation(c, 'staff')),
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async adminGetConversation(conversationId: string) {
    const conv = await this.prisma.customerConversation.findUnique({
      where: { id: conversationId },
      include: {
        messages: {
          orderBy: { createdAt: 'asc' },
          take: 200,
        },
      },
    });
    if (!conv) throw new NotFoundException('Conversation not found');
    return {
      conversation: this.formatConversation(conv, 'staff'),
      messages: conv.messages,
    };
  }

  async adminListFlaggedMessages(query: { page?: number; limit?: number }) {
    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(query.limit) || 20));
    const skip = (page - 1) * limit;

    const [messages, total] = await Promise.all([
      this.prisma.customerMessage.findMany({
        where: { isFlagged: true },
        include: { conversation: true },
        orderBy: { flaggedAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.customerMessage.count({ where: { isFlagged: true } }),
    ]);

    return {
      data: messages,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  async adminDecideFlaggedMessage(messageId: string, decision: { action: string; note?: string }, staffId: string) {
    const message = await this.prisma.customerMessage.findUnique({
      where: { id: messageId },
    });
    if (!message) throw new NotFoundException('Message not found');

    const updated = await this.prisma.customerMessage.update({
      where: { id: messageId },
      data: {
        isFlagged: decision.action === 'dismiss' ? false : true,
        flagReason: `Decision by ${staffId}: ${decision.action} — ${decision.note || ''}`,
      },
    });

    this.logger.log(`Moderator ${staffId} applied ${decision.action} on message ${messageId}`);
    return { success: true, message: updated };
  }

  // ── Helper: Relay message to Companion Backend via S2S ─────────────────────
  private async relayToCompanionBackend(conv: any, message: any) {
    const companionApiUrl = (process.env.COMPANION_API_URL || 'http://localhost:4001').replace(/\/+$/, '');
    const internalSecret = process.env.INTERNAL_SERVICE_SECRET;
    if (!internalSecret) return;

    await fetch(`${companionApiUrl}/api/v1/internal/chat/relay`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Internal-Service-Key': internalSecret,
      },
      body: JSON.stringify({
        bookingId: conv.bookingId,
        conversationId: conv.id,
        message,
      }),
      signal: AbortSignal.timeout(3000),
    });
  }

  // ── Helper: Dispatch offline notification ──────────────────────────────────
  private async dispatchOfflineNotification(conv: any, sender: ParticipantIdentity, previewText: string) {
    if (sender.role === 'companion' && conv.customerId) {
      const isOnline = this.chatGateway.isUserOnline(conv.customerId);
      if (!isOnline) {
        await this.prisma.customerNotification.create({
          data: {
            customerId: conv.customerId,
            title: `New message from ${conv.companionName || 'Companion'}`,
            description: previewText.length > 80 ? `${previewText.slice(0, 80)}...` : previewText,
            category: 'chat',
            icon: 'chat-processing',
            iconColor: '#D4AF37',
            route: 'CompanionChatScreen',
            stack: 'ChatStack',
            routeParams: {
              conversationId: conv.id,
              companionName: conv.companionName,
              companionId: conv.companionId,
              bookingId: conv.bookingId,
            },
          },
        });
      }
    }
  }
}

import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
  OnGatewayConnection,
  OnGatewayDisconnect,
  WsException,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Logger, Inject, forwardRef } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ChatService } from './chat.service';
import { PrismaService } from '../../prisma/prisma.service';

@WebSocketGateway({
  cors: {
    origin: process.env.CORS_ORIGIN ? process.env.CORS_ORIGIN.split(',') : '*',
    credentials: true,
  },
  namespace: 'chat',
})
export class ChatGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(ChatGateway.name);
  // Real presence map: userId -> active socket count
  private readonly presenceMap = new Map<string, number>();

  constructor(
    @Inject(forwardRef(() => ChatService))
    private readonly chatService: ChatService,
    private readonly jwtService: JwtService,
    private readonly prisma: PrismaService,
  ) {}

  public isUserOnline(userId?: string | null): boolean {
    if (!userId) return false;
    return (this.presenceMap.get(userId) || 0) > 0;
  }

  // ── Authenticate Socket on Connection ──────────────────────────────────────
  async handleConnection(client: Socket) {
    try {
      const authHeader = client.handshake.headers.authorization;
      const token =
        client.handshake.auth?.token ||
        (authHeader && authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null);

      if (!token) {
        this.logger.warn(`Socket ${client.id} disconnected: Missing auth token`);
        client.disconnect();
        return;
      }

      const isProduction = process.env.NODE_ENV === 'production';
      const customerSecret = process.env.JWT_SECRET || process.env.JWT_ACCESS_SECRET;
      const companionSecret =
        process.env.COMPANION_JWT_SECRET ||
        (!isProduction ? 'cobuddy-companion-jwt-secret-dev-change-in-production' : undefined);
      const adminSecret = process.env.ADMIN_JWT_SECRET;

      let payload: any = null;
      let verifiedRole: 'customer' | 'companion' | 'staff' | null = null;

      // 1. Try Customer verification
      if (customerSecret) {
        try {
          const res = await this.jwtService.verifyAsync(token, { secret: customerSecret });
          if (res?.sub) {
            payload = res;
            verifiedRole = 'customer';
          }
        } catch {
          // Try next role
        }
      }

      // 2. Try Companion verification if not customer
      if (!payload && companionSecret) {
        try {
          const res = await this.jwtService.verifyAsync(token, { secret: companionSecret });
          if (res?.sub) {
            payload = res;
            verifiedRole = 'companion';
          }
        } catch {
          // Try next role
        }
      }

      // 3. Try Admin verification ONLY if Admin secret matches AND role is staff
      if (!payload && adminSecret) {
        try {
          const res = await this.jwtService.verifyAsync(token, { secret: adminSecret });
          const staffRoles = ['SUPER_ADMIN', 'SUPPORT_AGENT', 'SUPPORT_LEAD', 'MODERATOR', 'SAFETY_OPERATOR', 'LEGAL_ADMIN'];
          const hasStaffRole = Array.isArray(res?.roles) && res.roles.some((r: string) => staffRoles.includes(r));
          if (res?.sub && hasStaffRole) {
            payload = res;
            verifiedRole = 'staff';
          }
        } catch {
          // Failed admin verification
        }
      }

      if (!payload || !payload.sub || !verifiedRole) {
        this.logger.warn(`Socket ${client.id} disconnected: JWT signature verification failed or role unauthorized`);
        client.disconnect();
        return;
      }

      const userId = String(payload.sub);
      const role = verifiedRole;

      client.data.user = {
        id: userId,
        role,
        name: payload.name || payload.displayName || (role === 'companion' ? 'Companion' : role === 'staff' ? 'Staff Operator' : 'Customer'),
      };

      // Update real presence
      const count = (this.presenceMap.get(userId) || 0) + 1;
      this.presenceMap.set(userId, count);

      if (count === 1) {
        this.server.emit('presence_change', { userId, isOnline: true });
      }

      this.logger.log(`Socket ${client.id} authenticated as ${role}: ${userId} (active: ${count})`);
    } catch (err: any) {
      this.logger.warn(`Socket ${client.id} handshake failed: ${err.message}`);
      client.disconnect();
    }
  }

  handleDisconnect(client: Socket) {
    const user = client.data?.user;
    if (user?.id) {
      const count = (this.presenceMap.get(user.id) || 1) - 1;
      if (count <= 0) {
        this.presenceMap.delete(user.id);
        this.server.emit('presence_change', { userId: user.id, isOnline: false });
        this.logger.log(`User ${user.id} went offline`);
      } else {
        this.presenceMap.set(user.id, count);
      }
    }
    this.logger.log(`Socket ${client.id} disconnected`);
  }

  // ── Join Conversation Room ────────────────────────────────────────────────
  @SubscribeMessage('join_conversation')
  async handleJoinConversation(
    @MessageBody() data: { conversationId: string },
    @ConnectedSocket() client: Socket,
  ) {
    const user = client.data?.user;
    if (!user) {
      throw new WsException('Unauthorized');
    }

    if (!data?.conversationId) {
      throw new WsException('conversationId is required');
    }

    const conversation = await this.prisma.customerConversation.findUnique({
      where: { id: data.conversationId },
    });

    if (!conversation) {
      throw new WsException('Conversation not found');
    }

    // Verify user is authorized participant
    if (user.role === 'customer' && conversation.customerId !== user.id) {
      throw new WsException('Forbidden: You are not a participant in this conversation');
    }
    if (user.role === 'companion' && conversation.companionId !== user.id) {
      throw new WsException('Forbidden: You are not a participant in this conversation');
    }

    const room = `conversation_${data.conversationId}`;
    client.join(room);
    this.logger.log(`${user.role} ${user.id} joined room: ${room}`);

    return { event: 'joined', conversationId: data.conversationId, room };
  }

  // ── Send Message via Socket ────────────────────────────────────────────────
  @SubscribeMessage('send_message')
  async handleSendMessage(
    @MessageBody()
    data: {
      conversationId: string;
      text?: string;
      attachmentUrl?: string;
      attachmentType?: string;
      clientMessageId?: string;
    },
    @ConnectedSocket() client: Socket,
  ) {
    const user = client.data?.user;
    if (!user) throw new WsException('Unauthorized');

    try {
      const message = await this.chatService.sendMessage(user, data.conversationId, {
        text: data.text,
        attachmentUrl: data.attachmentUrl,
        attachmentType: data.attachmentType,
        clientMessageId: data.clientMessageId,
      });
      return { success: true, message };
    } catch (err: any) {
      throw new WsException(err.message || 'Failed to send message');
    }
  }

  // ── Typing Indicator ───────────────────────────────────────────────────────
  @SubscribeMessage('typing')
  handleTyping(
    @MessageBody() data: { conversationId: string; isTyping: boolean },
    @ConnectedSocket() client: Socket,
  ) {
    const user = client.data?.user;
    if (!user || !data?.conversationId) return;

    const room = `conversation_${data.conversationId}`;
    client.to(room).emit('user_typing', {
      conversationId: data.conversationId,
      userId: user.id,
      role: user.role,
      isTyping: !!data.isTyping,
    });
  }

  // ── Broadcast Helpers ──────────────────────────────────────────────────────
  public broadcastNewMessage(conversationId: string, message: any) {
    const room = `conversation_${conversationId}`;
    if (this.server) {
      this.server.to(room).emit('new_message', message);
      this.server.to(room).emit('receive_message', message);
    }
  }

  public broadcastReadReceipt(conversationId: string, userId: string, role: string) {
    const room = `conversation_${conversationId}`;
    this.server.to(room).emit('messages_read', { conversationId, userId, role });
  }
}

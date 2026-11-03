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

      const candidateSecrets = [
        process.env.JWT_SECRET,
        process.env.COMPANION_JWT_SECRET,
        process.env.ADMIN_JWT_SECRET,
        'cobuddy-companion-jwt-secret-dev-change-in-production',
      ].filter(Boolean) as string[];

      let payload: any = null;
      let verifiedByAdminSecret = false;

      for (const secret of candidateSecrets) {
        try {
          payload = await this.jwtService.verifyAsync(token, { secret });
          if (payload) {
            if (process.env.ADMIN_JWT_SECRET && secret === process.env.ADMIN_JWT_SECRET) {
              verifiedByAdminSecret = true;
            }
            break;
          }
        } catch {
          // Signature verification failed for this secret, try next
        }
      }

      if (!payload || !payload.sub) {
        this.logger.warn(`Socket ${client.id} disconnected: JWT signature verification failed`);
        client.disconnect();
        return;
      }

      const userId = String(payload.sub);
      // Staff role is only granted if verified with Admin JWT secret or explicit admin payload
      const isStaff = verifiedByAdminSecret || Boolean(payload.department || (Array.isArray(payload.roles) && payload.roles.length > 0));
      const role = isStaff ? 'staff' : (payload.role === 'companion' ? 'companion' : 'customer');

      client.data.user = {
        id: userId,
        role,
        name: payload.name || payload.displayName || (role === 'companion' ? 'Companion' : 'Customer'),
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

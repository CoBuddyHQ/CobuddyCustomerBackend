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
import { Logger, UseGuards } from '@nestjs/common';
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

  constructor(
    private readonly chatService: ChatService,
    private readonly jwtService: JwtService,
    private readonly prisma: PrismaService,
  ) {}

  // Authenticate socket connection during handshake
  async handleConnection(client: Socket) {
    try {
      const authHeader = client.handshake.headers.authorization;
      const token =
        client.handshake.auth?.token ||
        (authHeader && authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null);

      if (!token) {
        this.logger.warn(`Client ${client.id} disconnected: Missing auth token`);
        client.disconnect();
        return;
      }

      const jwtSecret = process.env.JWT_SECRET;
      if (!jwtSecret && process.env.NODE_ENV === 'production') {
        this.logger.error('JWT_SECRET is missing in production');
        client.disconnect();
        return;
      }

      const payload = await this.jwtService.verifyAsync(token, {
        secret: jwtSecret || 'fallback-secret',
      });

      if (!payload || !payload.sub) {
        this.logger.warn(`Client ${client.id} disconnected: Invalid token payload`);
        client.disconnect();
        return;
      }

      // Verify customer exists and is active
      const customer = await this.prisma.customer.findUnique({
        where: { id: payload.sub },
        select: { id: true, accountStatus: true },
      });

      if (!customer || customer.accountStatus !== 'active') {
        this.logger.warn(`Client ${client.id} disconnected: Inactive or deleted account`);
        client.disconnect();
        return;
      }

      // Store verified customerId on client data
      client.data.customerId = customer.id;
      this.logger.log(`Client ${client.id} authenticated as customer: ${customer.id}`);
    } catch (err: any) {
      this.logger.warn(`Client ${client.id} connection failed: ${err.message}`);
      client.disconnect();
    }
  }

  handleDisconnect(client: Socket) {
    this.logger.log(`Client ${client.id} disconnected`);
  }

  @SubscribeMessage('join_conversation')
  async handleJoinRoom(
    @MessageBody() data: { conversationId: string },
    @ConnectedSocket() client: Socket,
  ) {
    const customerId = client.data.customerId;
    if (!customerId) {
      throw new WsException('Unauthorized: WebSocket connection not authenticated');
    }

    if (!data?.conversationId) {
      throw new WsException('Invalid conversationId');
    }

    // Verify customer owns or participates in this conversation
    const conversation = await this.prisma.customerConversation.findFirst({
      where: {
        id: data.conversationId,
        customerId,
      },
    });

    if (!conversation) {
      this.logger.warn(`Customer ${customerId} attempted to join unauthorized conversation: ${data.conversationId}`);
      throw new WsException('Forbidden: You are not a participant in this conversation');
    }

    client.join(data.conversationId);
    this.logger.log(`Customer ${customerId} (Socket: ${client.id}) joined conversation: ${data.conversationId}`);
    return { event: 'joined', room: data.conversationId };
  }

  @SubscribeMessage('send_message')
  async handleSendMessage(
    @MessageBody() data: { conversationId: string; text: string; attachmentUrl?: string },
    @ConnectedSocket() client: Socket,
  ) {
    // ALWAYS use server-verified customerId from authenticated socket handshake
    const customerId = client.data.customerId;
    if (!customerId) {
      throw new WsException('Unauthorized: WebSocket connection not authenticated');
    }

    if (!data?.conversationId || !data?.text?.trim()) {
      throw new WsException('Invalid message payload');
    }

    // ChatService verifies ownership and persists the message
    const message = await this.chatService.sendMessage(
      customerId,
      data.conversationId,
      data.text.trim(),
      data.attachmentUrl,
    );

    // Broadcast to the conversation room
    this.server.to(data.conversationId).emit('new_message', message);
    return message;
  }
}

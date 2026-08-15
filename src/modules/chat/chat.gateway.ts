import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Logger } from '@nestjs/common';
import { ChatService } from './chat.service';

@WebSocketGateway({
  cors: {
    origin: '*',
  },
  namespace: 'chat',
})
export class ChatGateway {
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(ChatGateway.name);

  constructor(private readonly chatService: ChatService) {}

  @SubscribeMessage('join_conversation')
  handleJoinRoom(
    @MessageBody() data: { conversationId: string },
    @ConnectedSocket() client: Socket,
  ) {
    client.join(data.conversationId);
    this.logger.log(`Client ${client.id} joined conversation room: ${data.conversationId}`);
    return { event: 'joined', room: data.conversationId };
  }

  @SubscribeMessage('send_message')
  async handleSendMessage(
    @MessageBody() data: { customerId: string; conversationId: string; text: string },
  ) {
    const message = await this.chatService.sendMessage(
      data.customerId,
      data.conversationId,
      data.text,
    );

    // Broadcast to room
    this.server.to(data.conversationId).emit('new_message', message);
    return message;
  }
}

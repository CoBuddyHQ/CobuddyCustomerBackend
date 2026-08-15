import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class SupportService {
  constructor(private prisma: PrismaService) {}

  async listTickets(customerId: string) {
    return this.prisma.customerSupportTicket.findMany({
      where: { customerId },
      include: { messages: { orderBy: { createdAt: 'asc' } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  async createTicket(customerId: string, subject: string, category: string, initialMessage: string) {
    const ticket = await this.prisma.customerSupportTicket.create({
      data: {
        customerId,
        subject,
        category,
        status: 'open',
        messages: {
          create: {
            senderType: 'customer',
            senderId: customerId,
            text: initialMessage,
          },
        },
      },
      include: { messages: true },
    });
    return ticket;
  }

  async getTicketDetail(customerId: string, ticketId: string) {
    const ticket = await this.prisma.customerSupportTicket.findFirst({
      where: { id: ticketId, customerId },
      include: { messages: { orderBy: { createdAt: 'asc' } } },
    });
    if (!ticket) throw new NotFoundException('Support ticket not found');
    return ticket;
  }

  async replyToTicket(customerId: string, ticketId: string, text: string) {
    const ticket = await this.prisma.customerSupportTicket.findFirst({
      where: { id: ticketId, customerId },
    });
    if (!ticket) throw new NotFoundException('Support ticket not found');

    const message = await this.prisma.customerSupportMessage.create({
      data: {
        ticketId,
        senderType: 'customer',
        senderId: customerId,
        text,
      },
    });

    await this.prisma.customerSupportTicket.update({
      where: { id: ticketId },
      data: { status: 'open', updatedAt: new Date() },
    });

    return message;
  }
}

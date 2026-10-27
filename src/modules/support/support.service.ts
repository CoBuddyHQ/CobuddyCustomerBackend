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

  getCategories() {
    return [
      { id: '1', title: 'Bookings & Meetups', icon: 'calendar-check-outline' },
      { id: '2', title: 'Payments & Refunds', icon: 'credit-card-outline' },
      { id: '3', title: 'Trust & Safety', icon: 'shield-check-outline' },
      { id: '4', title: 'Account Settings', icon: 'account-cog-outline' },
    ];
  }

  getFaqs(search?: string, categoryId?: string) {
    const allFaqs = [
      { id: 'f1', categoryId: '1', question: 'How do I cancel a booking?', answer: 'Use booking details to request cancellation. The Customer Backend reports whether it was accepted. Provider refunds are unavailable in this app build.' },
      { id: 'f2', categoryId: '1', question: "What if a companion doesn't show up?", answer: 'Submit an incident report and contact local emergency services if there is immediate danger. A refund or profile action is not guaranteed by this app build.' },
      { id: 'f3', categoryId: '1', question: 'Can I reschedule my meetup?', answer: 'Schedule changes are available for pending booking requests. The Customer Backend must confirm the Companion Backend accepted the update.' },
      { id: 'f4', categoryId: '1', question: 'Are there extra charges for overtime?', answer: 'Session extensions are unavailable in this app build because companion approval and payment processing are not connected.' },
      { id: 'f5', categoryId: '2', question: 'How is my payment secured?', answer: 'Booking checkout is unavailable in this app build. No booking payment is submitted and no escrow funds are held by this screen.' },
      { id: 'f6', categoryId: '2', question: 'When will I get my refund?', answer: 'Refund transfers are not configured in this app build. If a paid cancellation requires a refund, the Customer Backend keeps the booking active and reports that it could not cancel it.' },
      { id: 'f7', categoryId: '2', question: 'What payment methods do you accept?', answer: 'Card tokenization and booking checkout are unavailable in this app build. Do not enter payment credentials here.' },
      { id: 'f8', categoryId: '3', question: 'How does the SOS feature work?', answer: 'SOS records an event with the Customer Backend. This app build does not notify trusted contacts, share live location, or dispatch emergency services. Contact local authorities if you are in immediate danger.' },
      { id: 'f9', categoryId: '3', question: 'Are the companions identity-verified?', answer: 'A profile may show a verification state reported by the service. Do not treat a badge as a guarantee; meet in public and use your judgment.' },
      { id: 'f10', categoryId: '3', question: 'Can I hide my profile?', answer: 'Use the privacy controls available in settings. Visibility is determined by the current service configuration.' },
      { id: 'f11', categoryId: '4', question: 'How do I change my phone number?', answer: 'Go to Profile > Settings Hub > Account Settings to update your registered phone number.' },
      { id: 'f12', categoryId: '4', question: 'How do I delete my account?', answer: 'You can delete your account from Profile > Settings Hub > Account Settings > Delete Account. Please note this action is permanent.' },
    ];

    return allFaqs.filter((faq) => {
      const matchSearch = !search || faq.question.toLowerCase().includes(search.toLowerCase()) || faq.answer.toLowerCase().includes(search.toLowerCase());
      const matchCategory = !categoryId || faq.categoryId === categoryId;
      return matchSearch && matchCategory;
    });
  }
}

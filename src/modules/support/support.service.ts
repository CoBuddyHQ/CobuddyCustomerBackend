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
      { id: 'f1', categoryId: '1', question: 'How do I cancel a booking?', answer: 'Go to your booking details and tap "Cancel Booking". Cancellations made 24 hours prior are fully refunded.' },
      { id: 'f2', categoryId: '1', question: "What if a companion doesn't show up?", answer: "If a companion is a no-show, please report it immediately. You will receive a full refund, and the companion's profile will be penalized." },
      { id: 'f3', categoryId: '1', question: 'Can I reschedule my meetup?', answer: 'Yes, you can modify your booking time up to 12 hours before the meetup, provided the companion accepts the new schedule.' },
      { id: 'f4', categoryId: '1', question: 'Are there extra charges for overtime?', answer: 'Yes, if your session exceeds the booked time, you can negotiate an extension directly in the app and pay the difference.' },
      { id: 'f5', categoryId: '2', question: 'How is my payment secured?', answer: 'We use bank-level AES-256 encryption. Your money is held securely in escrow until the session is successfully completed.' },
      { id: 'f6', categoryId: '2', question: 'When will I get my refund?', answer: 'Refunds are processed immediately by our system but may take 3-5 business days to reflect in your bank account depending on your bank.' },
      { id: 'f7', categoryId: '2', question: 'What payment methods do you accept?', answer: 'We accept all major Credit/Debit Cards, UPI, Net Banking, and popular mobile wallets.' },
      { id: 'f8', categoryId: '3', question: 'How does the SOS feature work?', answer: 'Tapping SOS immediately alerts your Trusted Contacts with your live location and notifies our 24/7 internal security team.' },
      { id: 'f9', categoryId: '3', question: 'Are the companions identity-verified?', answer: 'Yes! Look for the blue tick badge. This means they have completed a strict KYC process including Govt ID verification.' },
      { id: 'f10', categoryId: '3', question: 'Can I hide my profile?', answer: 'Yes, go to Safety Settings and enable "Incognito Mode". Your profile will only be visible to people you message.' },
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

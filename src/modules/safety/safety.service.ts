import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class SafetyService {
  constructor(private prisma: PrismaService) {}

  // ── SOS ───────────────────────────────────────────────────────────────────
  async triggerSOS(customerId: string, sessionId?: string, lat?: number, lng?: number) {
    const sos = await this.prisma.customerSOS.create({
      data: {
        customerId,
        sessionId: sessionId ?? null,
        lat: lat ?? null,
        lng: lng ?? null,
        status: 'active',
      },
    });

    // Get trusted contacts to notify
    const contacts = await this.prisma.customerTrustedContact.findMany({
      where: { customerId },
    });

    // In production: send SMS/call to trusted contacts via Twilio
    // In dev: just log
    console.log(`🚨 SOS triggered for customer ${customerId}. Contacts to notify:`, contacts.map(c => c.phone));

    return { message: 'SOS triggered. Your trusted contacts have been alerted.', sosId: sos.id };
  }

  async resolveSOS(customerId: string, sosId: string) {
    const sos = await this.prisma.customerSOS.findFirst({
      where: { id: sosId, customerId },
    });
    if (!sos) throw new NotFoundException('SOS event not found');

    return this.prisma.customerSOS.update({
      where: { id: sosId },
      data: { status: 'resolved', resolvedAt: new Date() },
    });
  }

  async getSOSHistory(customerId: string) {
    return this.prisma.customerSOS.findMany({
      where: { customerId },
      orderBy: { createdAt: 'desc' },
    });
  }

  // ── TRUSTED CONTACTS ──────────────────────────────────────────────────────
  async getTrustedContacts(customerId: string) {
    return this.prisma.customerTrustedContact.findMany({
      where: { customerId },
      orderBy: { createdAt: 'asc' },
    });
  }

  async addTrustedContact(customerId: string, data: { name: string; phone: string; relationship: string }) {
    return this.prisma.customerTrustedContact.create({
      data: { customerId, ...data },
    });
  }

  async updateTrustedContact(
    customerId: string,
    contactId: string,
    data: Partial<{ name: string; phone: string; relationship: string }>,
  ) {
    const contact = await this.prisma.customerTrustedContact.findFirst({
      where: { id: contactId, customerId },
    });
    if (!contact) throw new NotFoundException('Contact not found');

    return this.prisma.customerTrustedContact.update({
      where: { id: contactId },
      data,
    });
  }

  async deleteTrustedContact(customerId: string, contactId: string) {
    const contact = await this.prisma.customerTrustedContact.findFirst({
      where: { id: contactId, customerId },
    });
    if (!contact) throw new NotFoundException('Contact not found');

    await this.prisma.customerTrustedContact.delete({ where: { id: contactId } });
    return { message: 'Contact removed' };
  }

  // ── INCIDENT REPORTS ──────────────────────────────────────────────────────
  async createIncidentReport(
    customerId: string,
    data: {
      companionId?: string;
      bookingId?: string;
      description: string;
      evidenceUrls?: string[];
    },
  ) {
    return this.prisma.customerIncident.create({
      data: {
        customerId,
        companionId: data.companionId,
        bookingId: data.bookingId,
        description: data.description,
        evidenceUrls: data.evidenceUrls ?? [],
        status: 'submitted',
      },
    });
  }

  async getIncidentReports(customerId: string) {
    return this.prisma.customerIncident.findMany({
      where: { customerId },
      orderBy: { createdAt: 'desc' },
    });
  }
}

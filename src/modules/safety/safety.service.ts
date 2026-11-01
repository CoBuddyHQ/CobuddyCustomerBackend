import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class SafetyService {
  private readonly logger = new Logger(SafetyService.name);

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

    const contactCount = contacts.length;
    // The trusted-contact list is only stored in this service. No SMS, push, or
    // emergency-dispatch provider is configured, so do not claim delivery.

    return {
      message: 'SOS event recorded. Emergency contacts and dispatch were not notified because no delivery provider is configured.',
      sosId: sos.id,
      trustedContactCount: contactCount,
      contactsNotified: false,
      dispatchStatus: 'NOT_CONFIGURED',
    };
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
      incidentType?: string;
      description: string;
      evidenceUrls?: string[];
    },
  ) {
    const report = await this.prisma.customerIncident.create({
      data: {
        customerId,
        companionId: data.companionId,
        bookingId: data.bookingId,
        incidentType: data.incidentType || 'other',
        description: data.description,
        evidenceUrls: data.evidenceUrls ?? [],
        status: 'submitted',
      },
    });

    // Synchronize the persisted report to Admin only when both server-side
    // settings are present. Never send a built-in key or expose response bodies.
    if (!data.companionId) {
      this.logger.warn('Admin S2S report sync skipped because the report has no reported-user ID.');
      return report;
    }
    const adminUrl = process.env.ADMIN_API_URL;
    const secret = process.env.INTERNAL_SERVICE_SECRET;
    if (!adminUrl || !secret) {
      this.logger.warn('Admin S2S report sync skipped because required configuration is missing.');
      return report;
    }

    const abortController = new AbortController();
    const timeout = setTimeout(() => abortController.abort(), 5000);
    try {
      const baseUrl = adminUrl.replace(/\/+$/, '');
      const resp = await fetch(`${baseUrl}/api/internal/reports/sync`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-internal-service-key': secret,
        },
        body: JSON.stringify({
          reporterId: customerId,
          reporterType: 'CUSTOMER',
          reportedUserId: data.companionId,
          reportedUserType: 'COMPANION',
          categoryCode: (data.incidentType || 'general').toUpperCase(),
          description: data.description,
          evidenceUrls: data.evidenceUrls ?? [],
          bookingId: data.bookingId,
          reportRef: `REP-${report.id.slice(0, 8).toUpperCase()}`,
        }),
        signal: abortController.signal,
      });
      if (!resp.ok) {
        this.logger.warn(`Admin S2S report sync returned HTTP ${resp.status}.`);
      }
    } catch {
      this.logger.warn('Admin S2S report sync failed or timed out.');
    } finally {
      clearTimeout(timeout);
    }

    return report;
  }

  async getIncidentReports(customerId: string) {
    return this.prisma.customerIncident.findMany({
      where: { customerId },
      orderBy: { createdAt: 'desc' },
    });
  }
}

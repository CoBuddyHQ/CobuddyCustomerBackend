import {
  Injectable,
  Logger,
  NotFoundException,
  ConflictException,
  ServiceUnavailableException,
} from '@nestjs/common';
import * as crypto from 'crypto';

@Injectable()
export class CompanionClientService {
  private readonly logger = new Logger(CompanionClientService.name);

  private get companionApiUrl(): string {
    return (process.env.COMPANION_API_URL || 'http://localhost:4001').replace(
      /\/+$/,
      '',
    );
  }

  private get adminApiUrl(): string {
    return (process.env.ADMIN_API_URL || 'http://localhost:4000').replace(
      /\/+$/,
      '',
    );
  }

  private get internalSecret(): string {
    return process.env.INTERNAL_SERVICE_SECRET || '';
  }

  private getHeaders(correlationId?: string): Record<string, string> {
    if (!this.internalSecret) {
      throw new ServiceUnavailableException(
        'Inter-service authentication is not configured.',
      );
    }

    return {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      'X-Internal-Service-Key': this.internalSecret,
      'X-Correlation-Id': correlationId || crypto.randomUUID(),
    };
  }

  // ── GET /api/v1/internal/companions ─────────────────────────────────────────
  async getCompanions(filter?: Record<string, any>) {
    const correlationId = crypto.randomUUID();
    const primaryUrl = new URL(
      `${this.companionApiUrl}/api/v1/internal/companions`,
    );
    if (filter) {
      Object.entries(filter).forEach(([k, v]) => {
        if (v !== undefined && v !== null && v !== '') {
          primaryUrl.searchParams.append(k, String(v));
        }
      });
    }

    try {
      let res = await fetch(primaryUrl.toString(), {
        headers: this.getHeaders(correlationId),
        signal: AbortSignal.timeout(5000),
      });

      if (!res.ok) {
        throw new ServiceUnavailableException(
          `Companion service responded with status ${res.status}.`,
        );
      }

      const json = await res.json();
      return json.data !== undefined ? json.data : json;
    } catch (err: any) {
      this.logger.warn(
        `[CompanionClient] [${correlationId}] Connection/timeout error fetching companions: ${err.message}`,
      );
      if (err instanceof ServiceUnavailableException) throw err;
      throw new ServiceUnavailableException(
        'Companion discovery is unavailable.',
      );
    }
  }

  // ── GET /api/v1/internal/companions/:id ─────────────────────────────────────
  async getCompanionById(companionId: string) {
    const correlationId = crypto.randomUUID();
    const primaryUrl = `${this.companionApiUrl}/api/v1/internal/companions/${encodeURIComponent(companionId)}`;

    try {
      const res = await fetch(primaryUrl, {
        headers: this.getHeaders(correlationId),
        signal: AbortSignal.timeout(5000),
      });

      if (res.status === 404) {
        throw new NotFoundException(`Companion ${companionId} not found`);
      }
      if (!res.ok) {
        throw new Error(
          `Companion service responded with status ${res.status}`,
        );
      }

      const json = await res.json();
      return json.data !== undefined ? json.data : json;
    } catch (err: any) {
      if (
        err instanceof NotFoundException ||
        err instanceof ServiceUnavailableException
      )
        throw err;
      this.logger.warn(
        `[CompanionClient] [${correlationId}] Error fetching companion ${companionId}: ${err.message}`,
      );
      throw new ServiceUnavailableException(
        'Companion profile service is unavailable.',
      );
    }
  }

  // ── GET /api/internal/announcements/customers/active ───────────────────────
  async getCampaigns(customerCity?: string) {
    const correlationId = crypto.randomUUID();
    try {
      const url = new URL(
        `${this.adminApiUrl}/api/internal/announcements/customers/active`,
      );
      const normalizedCity = customerCity?.trim().toLowerCase();
      if (normalizedCity && normalizedCity.length <= 200) {
        url.searchParams.set('city', customerCity!.trim());
      }
      const res = await fetch(url.toString(), {
        headers: this.getHeaders(correlationId),
        signal: AbortSignal.timeout(5000),
        redirect: 'error',
      });
      if (!res.ok) {
        throw new Error(
          `Admin announcement service responded with status ${res.status}`,
        );
      }

      const payload: unknown = await res.json();
      const envelope =
        payload && typeof payload === 'object'
          ? (payload as Record<string, unknown>)
          : {};
      const list = Array.isArray(payload)
        ? payload
        : Array.isArray(envelope.data)
          ? envelope.data
          : Array.isArray(envelope.announcements)
            ? envelope.announcements
            : null;
      if (!list)
        throw new Error(
          'Admin announcement service returned an invalid payload',
        );

      const now = Date.now();
      const campaigns = list
        .filter(
          (item: unknown): item is Record<string, unknown> =>
            !!item && typeof item === 'object' && !Array.isArray(item),
        )
        .filter((announcement) => {
          if (typeof announcement.id !== 'string' || !announcement.id.trim())
            return false;
          if (announcement.isPublished !== true) return false;
          if (
            !['ALL', 'CUSTOMERS'].includes(String(announcement.targetAudience))
          ) {
            if (
              announcement.targetAudience !== 'CITY_SPECIFIC' ||
              !normalizedCity ||
              normalizedCity.length > 200 ||
              typeof announcement.targetCity !== 'string' ||
              announcement.targetCity.trim().toLowerCase() !== normalizedCity
            )
              return false;
          }
          const publishedAt =
            typeof announcement.publishedAt === 'string'
              ? Date.parse(announcement.publishedAt)
              : NaN;
          if (!Number.isFinite(publishedAt) || publishedAt > now) return false;
          if (announcement.scheduledFor) {
            const scheduledFor =
              typeof announcement.scheduledFor === 'string'
                ? Date.parse(announcement.scheduledFor)
                : NaN;
            if (!Number.isFinite(scheduledFor) || scheduledFor > now)
              return false;
          }
          if (
            announcement.expiresAt !== null &&
            announcement.expiresAt !== undefined
          ) {
            const expiresAt =
              typeof announcement.expiresAt === 'string'
                ? Date.parse(announcement.expiresAt)
                : NaN;
            if (!Number.isFinite(expiresAt) || expiresAt <= now) return false;
          }
          const title = this.campaignText(announcement.title);
          const message = this.campaignText(announcement.message);
          if (typeof title !== 'string' || !title.trim()) return false;
          if (typeof message !== 'string' || !message.trim()) return false;
          return true;
        })
        .map((announcement) => ({
          id: announcement.id as string,
          title: this.campaignText(announcement.title),
          message: this.campaignText(announcement.message),
          category:
            typeof announcement.category === 'string'
              ? announcement.category
              : 'GENERAL',
          publishedAt: announcement.publishedAt as string,
          expiresAt:
            (announcement.expiresAt as string | null | undefined) ?? null,
        }));

      return { success: true, campaigns };
    } catch (err: unknown) {
      this.logger.warn(
        '[CompanionClient] Admin announcement service unavailable',
      );
      if (err instanceof ServiceUnavailableException) throw err;
      throw new ServiceUnavailableException(
        'Campaigns are temporarily unavailable.',
      );
    }
  }

  private campaignText(value: unknown): string {
    if (typeof value === 'string') return value;
    if (
      value &&
      typeof value === 'object' &&
      'en' in value &&
      typeof value.en === 'string'
    ) {
      return value.en;
    }
    return '';
  }

  // ── POST /api/v1/internal/booking-requests ──────────────────────────────────
  async createBookingRequest(payload: any) {
    const correlationId = crypto.randomUUID();
    const endpoint = `${this.companionApiUrl}/api/v1/internal/companion/requests`;

    const res = await fetch(endpoint, {
      method: 'POST',
      headers: this.getHeaders(correlationId),
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(5000),
    });

    if (res.status === 409) {
      const errJson = await res.json().catch(() => ({}));
      throw new ConflictException(
        errJson.message ||
          'Companion has an overlapping active session for this time slot (409 Conflict)',
      );
    }

    if (!res.ok) {
      this.logger.warn(
        `[CompanionClient] [${correlationId}] Failed to dispatch booking request: ${res.status}`,
      );
      throw new Error(`Companion service failed with status ${res.status}`);
    }

    return await res.json();
  }

  async modifyBookingRequest(
    bookingId: string,
    payload: Record<string, unknown>,
  ) {
    const correlationId = crypto.randomUUID();
    const endpoint = `${this.companionApiUrl}/api/v1/internal/companion/requests/${encodeURIComponent(bookingId)}`;
    let response: Response;
    try {
      response = await fetch(endpoint, {
        method: 'PATCH',
        headers: this.getHeaders(correlationId),
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(5000),
        redirect: 'error',
      });
    } catch {
      this.logger.warn(
        `[CompanionClient] [${correlationId}] Booking change could not reach Companion Backend.`,
      );
      throw new ServiceUnavailableException(
        'Companion booking update is unavailable. No change was accepted.',
      );
    }
    if (response.status === 409) {
      throw new ConflictException(
        'The Companion already accepted or closed this request. Refresh the booking and try again.',
      );
    }
    if (!response.ok) {
      this.logger.warn(
        `[CompanionClient] [${correlationId}] Companion booking update returned status ${response.status}.`,
      );
      throw new ServiceUnavailableException(
        'Companion booking update was not accepted.',
      );
    }
    return response.json();
  }

  // ── POST /api/v1/internal/companions/:id/reviews ───────────────────────────
  async syncReviewToCompanion(companionId: string, payload: any) {
    const correlationId = crypto.randomUUID();
    const endpoint = `${this.companionApiUrl}/api/v1/internal/companions/${encodeURIComponent(companionId)}/reviews`;
    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: this.getHeaders(correlationId),
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(5000),
      });
      if (!res.ok) {
        this.logger.warn(
          `[CompanionClient] [${correlationId}] Failed to sync review to companion: ${res.status}`,
        );
      }
      return await res.json().catch(() => ({}));
    } catch (e: any) {
      this.logger.warn(
        `[CompanionClient] [${correlationId}] Error syncing review to companion: ${e.message}`,
      );
    }
  }

  // ── POST /api/internal/bookings/sync (Admin Backend) ───────────────────────
  async syncBookingToAdmin(payload: any) {
    const correlationId = crypto.randomUUID();
    const endpoint = `${this.adminApiUrl}/api/internal/bookings/sync`;
    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: this.getHeaders(correlationId),
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(5000),
      });
      if (!res.ok) {
        this.logger.warn(
          `[CompanionClient] [${correlationId}] Failed to sync booking to admin: ${res.status}`,
        );
      }
      return await res.json().catch(() => ({}));
    } catch (e: any) {
      this.logger.warn(
        `[CompanionClient] [${correlationId}] Error syncing booking to admin: ${e.message}`,
      );
    }
  }

  // ── POST /api/internal/reviews/sync (Admin Backend) ────────────────────────
  async syncReviewToAdmin(payload: any) {
    const correlationId = crypto.randomUUID();
    const endpoint = `${this.adminApiUrl}/api/internal/reviews/sync`;
    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: this.getHeaders(correlationId),
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(5000),
      });
      if (!res.ok) {
        this.logger.warn(
          `[CompanionClient] [${correlationId}] Failed to sync review to admin: ${res.status}`,
        );
      }
      return await res.json().catch(() => ({}));
    } catch (e: any) {
      this.logger.warn(
        `[CompanionClient] [${correlationId}] Error syncing review to admin: ${e.message}`,
      );
    }
  }
}

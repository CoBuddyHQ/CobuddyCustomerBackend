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
    return (process.env.COMPANION_API_URL || 'http://localhost:4001').replace(/\/+$/, '');
  }

  private get adminApiUrl(): string {
    return (process.env.ADMIN_API_URL || 'http://localhost:4000').replace(/\/+$/, '');
  }

  private get internalSecret(): string {
    return process.env.INTERNAL_SERVICE_SECRET || '';
  }

  private getHeaders(correlationId?: string): Record<string, string> {
    if (!this.internalSecret) {
      throw new ServiceUnavailableException('Inter-service authentication is not configured.');
    }

    return {
      'Accept': 'application/json',
      'Content-Type': 'application/json',
      'X-Internal-Service-Key': this.internalSecret,
      'X-Correlation-Id': correlationId || crypto.randomUUID(),
    };
  }

  // ── GET /api/v1/internal/companions ─────────────────────────────────────────
  async getCompanions(filter?: Record<string, any>) {
    const correlationId = crypto.randomUUID();
    const primaryUrl = new URL(`${this.companionApiUrl}/api/v1/internal/companions`);
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
        throw new ServiceUnavailableException(`Companion service responded with status ${res.status}.`);
      }

      const json = await res.json();
      return json.data !== undefined ? json.data : json;
    } catch (err: any) {
      this.logger.warn(
        `[CompanionClient] [${correlationId}] Connection/timeout error fetching companions: ${err.message}`
      );
      if (err instanceof ServiceUnavailableException) throw err;
      throw new ServiceUnavailableException('Companion discovery is unavailable.');
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
        throw new Error(`Companion service responded with status ${res.status}`);
      }

      const json = await res.json();
      return json.data !== undefined ? json.data : json;

    } catch (err: any) {
      if (err instanceof NotFoundException || err instanceof ServiceUnavailableException) throw err;
      this.logger.warn(
        `[CompanionClient] [${correlationId}] Error fetching companion ${companionId}: ${err.message}`
      );
      throw new ServiceUnavailableException('Companion profile service is unavailable.');
    }
  }

  // ── GET /api/internal/announcements/customers/active ───────────────────────
  async getCampaigns() {
    const correlationId = crypto.randomUUID();
    try {
      const res = await fetch(
        `${this.adminApiUrl}/api/internal/announcements/customers/active`,
        {
        headers: this.getHeaders(correlationId),
        signal: AbortSignal.timeout(5000),
        },
      );
      if (!res.ok) {
        throw new Error(`Admin announcement service responded with status ${res.status}`);
      }

      const payload: any = await res.json();
      const list = Array.isArray(payload)
        ? payload
        : Array.isArray(payload?.data)
          ? payload.data
          : Array.isArray(payload?.announcements)
            ? payload.announcements
            : null;
      if (!list) throw new Error('Admin announcement service returned an invalid payload');

      const now = Date.now();
      const campaigns = list
        .filter((announcement: any) => {
          if (announcement.isPublished !== true) return false;
          if (!['ALL', 'CUSTOMERS'].includes(announcement.targetAudience)) return false;
          const publishedAt = Date.parse(announcement.publishedAt ?? '');
          if (!Number.isFinite(publishedAt) || publishedAt > now) return false;
          if (announcement.scheduledFor) {
            const scheduledFor = Date.parse(announcement.scheduledFor);
            if (!Number.isFinite(scheduledFor) || scheduledFor > now) return false;
          }
          if (announcement.expiresAt) {
            const expiresAt = Date.parse(announcement.expiresAt);
            if (!Number.isFinite(expiresAt) || expiresAt <= now) return false;
          }
          const title = typeof announcement.title === 'string'
            ? announcement.title
            : announcement.title?.en;
          const message = typeof announcement.message === 'string'
            ? announcement.message
            : announcement.message?.en;
          if (typeof title !== 'string' || !title.trim()) return false;
          if (typeof message !== 'string' || !message.trim()) return false;
          return true;
        })
        .map((announcement: any) => ({
          id: announcement.id,
          title: typeof announcement.title === 'string'
            ? announcement.title
            : announcement.title?.en || '',
          message: typeof announcement.message === 'string'
            ? announcement.message
            : announcement.message?.en || '',
          category: announcement.category || 'GENERAL',
          publishedAt: announcement.publishedAt,
          expiresAt: announcement.expiresAt || null,
        }));

      return { success: true, campaigns };
    } catch (err: any) {
      this.logger.warn(`[CompanionClient] Admin announcement service unavailable: ${err.message}`);
      if (err instanceof ServiceUnavailableException) throw err;
      throw new ServiceUnavailableException('Campaigns are temporarily unavailable.');
    }
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
        errJson.message || 'Companion has an overlapping active session for this time slot (409 Conflict)'
      );
    }

    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      this.logger.warn(
        `[CompanionClient] [${correlationId}] Failed to dispatch booking request: ${res.status} ${errText}`
      );
      throw new Error(`Companion service failed with status ${res.status}`);
    }

    return await res.json();
  }
}

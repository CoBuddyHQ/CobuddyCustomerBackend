import {
  Injectable,
  Logger,
  NotFoundException,
  ConflictException,
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
    return (
      process.env.INTERNAL_SERVICE_SECRET ||
      process.env.INTERNAL_SERVICE_TOKEN ||
      'cobuddy-internal-service-s2s-token-2026'
    );
  }

  private getHeaders(correlationId?: string): Record<string, string> {
    return {
      'Accept': 'application/json',
      'Content-Type': 'application/json',
      'X-Internal-Service-Key': this.internalSecret,
      'x-internal-token': this.internalSecret,
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

      if (res.status === 404) {
        // Fallback to public route if internal endpoint not registered
        const fallbackUrl = new URL(`${this.companionApiUrl}/api/v1/companions/public`);
        if (filter) {
          Object.entries(filter).forEach(([k, v]) => {
            if (v !== undefined && v !== null && v !== '') {
              fallbackUrl.searchParams.append(k, String(v));
            }
          });
        }
        res = await fetch(fallbackUrl.toString(), {
          headers: this.getHeaders(correlationId),
          signal: AbortSignal.timeout(5000),
        });
      }

      if (!res.ok) {
        this.logger.warn(
          `[CompanionClient] [${correlationId}] Failed to fetch companions: status ${res.status}`
        );
        return { companions: [], total: 0, page: 1, limit: 20, totalPages: 0 };
      }

      return await res.json();
    } catch (err: any) {
      this.logger.warn(
        `[CompanionClient] [${correlationId}] Connection/timeout error fetching companions: ${err.message}`
      );
      return { companions: [], total: 0, page: 1, limit: 20, totalPages: 0 };
    }
  }

  // ── GET /api/v1/internal/companions/:id ─────────────────────────────────────
  async getCompanionById(companionId: string) {
    const correlationId = crypto.randomUUID();
    const primaryUrl = `${this.companionApiUrl}/api/v1/internal/companions/${encodeURIComponent(companionId)}`;
    const fallbackUrl = `${this.companionApiUrl}/api/v1/companions/public/${encodeURIComponent(companionId)}`;

    try {
      let res = await fetch(primaryUrl, {
        headers: this.getHeaders(correlationId),
        signal: AbortSignal.timeout(5000),
      });

      if (res.status === 404) {
        res = await fetch(fallbackUrl, {
          headers: this.getHeaders(correlationId),
          signal: AbortSignal.timeout(5000),
        });
      }

      if (res.status === 404) {
        throw new NotFoundException(`Companion ${companionId} not found`);
      }
      if (!res.ok) {
        throw new Error(`Companion service responded with status ${res.status}`);
      }

      return await res.json();
    } catch (err: any) {
      if (err instanceof NotFoundException) throw err;
      this.logger.warn(
        `[CompanionClient] [${correlationId}] Error fetching companion ${companionId}: ${err.message}`
      );
      throw new NotFoundException(`Companion profile not found`);
    }
  }

  // ── GET /api/v1/internal/campaigns ──────────────────────────────────────────
  async getCampaigns() {
    const correlationId = crypto.randomUUID();
    const internalCampaignUrl = `${this.companionApiUrl}/api/v1/internal/campaigns`;

    try {
      const res = await fetch(internalCampaignUrl, {
        headers: this.getHeaders(correlationId),
        signal: AbortSignal.timeout(5000),
      });

      if (res.ok) {
        const data = await res.json();
        const campaigns = Array.isArray(data) ? data : (data.campaigns || []);
        if (campaigns.length > 0) {
          return { success: true, campaigns };
        }
      }
    } catch (err: any) {
      this.logger.debug(
        `[CompanionClient] [${correlationId}] Companion campaign bridge fallback: ${err.message}`
      );
    }

    // Fallback to Admin announcements if companion campaign endpoint returned empty or failed
    try {
      const adminUrl = `${this.adminApiUrl}/api/marketing/announcements/active`;
      const res = await fetch(adminUrl, {
        headers: { Accept: 'application/json' },
        signal: AbortSignal.timeout(4000),
      });
      if (res.ok) {
        const data = await res.json();
        const list = Array.isArray(data) ? data : (data.data || []);
        const campaigns = list
          .filter((c: any) => {
            if (c.status !== 'PUBLISHED' && c.status !== 'SENT') return false;
            if (c.targetAudience && !['ALL', 'CUSTOMERS'].includes(c.targetAudience)) return false;
            if (c.expiresAt && new Date(c.expiresAt) < new Date()) return false;
            return true;
          })
          .map((c: any) => ({
            id: c.id,
            title: typeof c.title === 'string' ? c.title : (c.title?.en || 'Special Offer'),
            message: typeof c.message === 'string' ? c.message : (c.message?.en || ''),
            category: c.category || 'PROMOTION',
            targetAudience: c.targetAudience || 'CUSTOMERS',
            bannerUrl: c.bannerUrl || null,
            actionUrl: c.actionUrl || null,
            startsAt: c.publishedAt,
            endsAt: c.expiresAt,
          }));

        return { success: true, campaigns };
      }
    } catch (err: any) {
      this.logger.warn(`[CompanionClient] Admin announcement fallback failed: ${err.message}`);
    }

    return { success: true, campaigns: [] };
  }

  // ── POST /api/v1/internal/booking-requests ──────────────────────────────────
  async createBookingRequest(payload: any) {
    const correlationId = crypto.randomUUID();
    const primaryUrl = `${this.companionApiUrl}/api/v1/internal/booking-requests`;
    const fallbackUrl = `${this.companionApiUrl}/api/v1/internal/companion/requests`;

    let res = await fetch(primaryUrl, {
      method: 'POST',
      headers: this.getHeaders(correlationId),
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(5000),
    });

    if (res.status === 404) {
      res = await fetch(fallbackUrl, {
        method: 'POST',
        headers: this.getHeaders(correlationId),
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(5000),
      });
    }

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

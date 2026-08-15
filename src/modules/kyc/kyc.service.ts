import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { SubmitKycDocumentDto } from './dto/kyc.dto';

@Injectable()
export class KycService {
  constructor(private prisma: PrismaService) {}

  async getStatus(customerId: string) {
    const kyc = await this.prisma.customerKyc.findUnique({
      where: { customerId },
    });
    const customer = await this.prisma.customer.findUnique({
      where: { id: customerId },
      select: { kycStatus: true },
    });
    return {
      status: customer?.kycStatus ?? 'unverified',
      kyc: kyc ?? null,
    };
  }

  async submitDocument(
    customerId: string,
    dto: SubmitKycDocumentDto,
    frontDocUrl?: string,
    backDocUrl?: string,
  ) {
    // Upsert KYC record
    const kyc = await this.prisma.customerKyc.upsert({
      where: { customerId },
      create: {
        customerId,
        docType: dto.docType as any,
        docNumber: dto.docNumber,
        legalName: dto.legalName,
        frontDocUrl: frontDocUrl ?? null,
        backDocUrl: backDocUrl ?? null,
        status: 'pending',
        submittedAt: new Date(),
      },
      update: {
        docType: dto.docType as any,
        docNumber: dto.docNumber,
        legalName: dto.legalName,
        frontDocUrl: frontDocUrl ?? undefined,
        backDocUrl: backDocUrl ?? undefined,
        status: 'pending',
        submittedAt: new Date(),
      },
    });

    // Update customer status to pending
    await this.prisma.customer.update({
      where: { id: customerId },
      data: { kycStatus: 'pending' },
    });

    return { message: 'Document submitted for review', kyc };
  }

  async submitSelfie(customerId: string, selfieUrl: string) {
    await this.prisma.customerKyc.upsert({
      where: { customerId },
      create: { customerId, selfieUrl, status: 'pending', submittedAt: new Date() },
      update: { selfieUrl },
    });
    return { message: 'Selfie uploaded' };
  }

  async submitLiveness(customerId: string, livenessUrl: string) {
    await this.prisma.customerKyc.upsert({
      where: { customerId },
      create: { customerId, livenessUrl, status: 'pending', submittedAt: new Date() },
      update: { livenessUrl },
    });

    // Auto-approve in development
    if (process.env.NODE_ENV === 'development') {
      await this.prisma.customerKyc.update({
        where: { customerId },
        data: { status: 'verified', verifiedAt: new Date() },
      });
      await this.prisma.customer.update({
        where: { id: customerId },
        data: { kycStatus: 'verified' },
      });
    }

    return { message: 'Liveness check complete. Verification submitted.' };
  }

  async resubmit(customerId: string) {
    const kyc = await this.prisma.customerKyc.findUnique({ where: { customerId } });
    if (!kyc) throw new BadRequestException('No KYC record found');

    await this.prisma.customerKyc.update({
      where: { customerId },
      data: { status: 'pending', submittedAt: new Date(), rejectionReason: null },
    });
    await this.prisma.customer.update({
      where: { id: customerId },
      data: { kycStatus: 'pending' },
    });

    return { message: 'KYC resubmitted' };
  }
}

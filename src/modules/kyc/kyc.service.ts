import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { SubmitKycDocumentDto } from './dto/kyc.dto';

@Injectable()
export class KycService {
  private readonly logger = new Logger(KycService.name);

  constructor(private prisma: PrismaService) {}

  async getStatus(customerId: string) {
    const kyc = await this.prisma.customerKyc.findUnique({
      where: { customerId },
    });
    const customer = await this.prisma.customer.findUnique({
      where: { id: customerId },
      select: { kycStatus: true },
    });

    const status = customer?.kycStatus ?? 'unverified';
    const documentSubmitted = Boolean(kyc?.docNumber || kyc?.frontDocUrl);
    const selfieSubmitted = Boolean(kyc?.selfieUrl);
    const livenessSubmitted = Boolean(kyc?.livenessUrl);

    let currentStep: 'DOCUMENT' | 'SELFIE' | 'LIVENESS' | 'PENDING_REVIEW' | 'VERIFIED' | 'REJECTED' | 'RESUBMISSION_REQUIRED' = 'DOCUMENT';
    if (status === 'verified') {
      currentStep = 'VERIFIED';
    } else if (status === 'rejected') {
      currentStep = 'REJECTED';
    } else if (!documentSubmitted) {
      currentStep = 'DOCUMENT';
    } else if (!selfieSubmitted) {
      currentStep = 'SELFIE';
    } else if (!livenessSubmitted) {
      currentStep = 'LIVENESS';
    } else {
      currentStep = 'PENDING_REVIEW';
    }

    const maskedKyc = kyc
      ? {
          ...kyc,
          docNumber:
            kyc.docNumber && kyc.docNumber.length > 4
              ? `****${kyc.docNumber.slice(-4)}`
              : '****',
        }
      : null;

    return {
      status,
      currentStep,
      documentSubmitted,
      selfieSubmitted,
      livenessSubmitted,
      kyc: maskedKyc,
    };
  }

  async submitDocument(
    customerId: string,
    dto: SubmitKycDocumentDto,
    frontDocUrl?: string,
    backDocUrl?: string,
  ) {
    try {
      const rawType = (dto.docType || dto.documentType || 'AADHAAR').toUpperCase();
      const docType = rawType === 'DRIVING_LICENSE' ? 'DL' : rawType;
      const rawDocNum = dto.docNumber || dto.documentNumber;
      if (!rawDocNum || !rawDocNum.trim()) {
        throw new BadRequestException('Document number is required');
      }
      const docNumber = rawDocNum.trim();
      const legalName = dto.legalName.trim();

      const finalFront = frontDocUrl;
      if (!finalFront) {
        throw new BadRequestException('Front document image or file is required');
      }
      const finalBack = backDocUrl || null;

      // Mask PII in logs: show only doc type + last-4 of docNumber
      const maskedDoc = docNumber.length > 4 ? `****${docNumber.slice(-4)}` : '****';
      this.logger.log(`KYC document evidence received for customer ${customerId} (type ${docType}, number ${maskedDoc}).`);

      // Upsert KYC record
      const kyc = await this.prisma.customerKyc.upsert({
        where: { customerId },
        create: {
          customerId,
          docType: docType as any,
          docNumber,
          legalName,
          frontDocUrl: finalFront,
          backDocUrl: finalBack,
          status: 'pending',
          submittedAt: new Date(),
        },
        update: {
          docType: docType as any,
          docNumber,
          legalName,
          frontDocUrl: finalFront,
          backDocUrl: finalBack,
          status: 'pending',
          submittedAt: new Date(),
        },
      });

      // Update customer status to pending
      await this.prisma.customer.update({
        where: { id: customerId },
        data: { kycStatus: 'pending' },
      });

      this.logger.log('KYC document evidence stored; administrative review is not connected to this service.');
      return {
        message: 'Document evidence was stored and marked pending. Administrative review is not connected.',
        kyc: { ...kyc, docNumber: maskedDoc },
      };
    } catch (err: any) {
      this.logger.error('KYC document evidence could not be stored.');
      throw err;
    }
  }

  async submitSelfie(customerId: string, selfieUrl?: string) {
    if (!selfieUrl) {
      throw new BadRequestException('Selfie file or URL is required');
    }
    const kyc = await this.prisma.customerKyc.upsert({
      where: { customerId },
      create: { customerId, selfieUrl, status: 'pending', submittedAt: new Date() },
      update: { selfieUrl },
    });
    return { message: 'Selfie uploaded', kyc };
  }

  async submitLiveness(customerId: string, livenessUrl?: string) {
    if (!livenessUrl) {
      throw new BadRequestException('Liveness verification video or file is required');
    }
    await this.prisma.customerKyc.upsert({
      where: { customerId },
      create: { customerId, livenessUrl, status: 'pending', submittedAt: new Date() },
      update: { livenessUrl },
    });

    return {
      message: 'Liveness evidence was stored. No automated assessment or Admin review was performed.',
    };
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

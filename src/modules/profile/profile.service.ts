import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { UpdateProfileDto, CompleteOnboardingDto } from './dto/profile.dto';

@Injectable()
export class ProfileService {
  constructor(private prisma: PrismaService) {}

  async getProfile(customerId: string) {
    const customer = await this.prisma.customer.findUnique({
      where: { id: customerId },
      include: {
        kyc: true,
        settings: true,
        wallet: true,
      },
    });
    if (!customer) throw new NotFoundException('Customer not found');
    return this.buildProfileResponse(customer);
  }

  async updateProfile(customerId: string, dto: UpdateProfileDto) {
    const customer = await this.prisma.customer.update({
      where: { id: customerId },
      data: {
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.bio !== undefined && { bio: dto.bio }),
        ...(dto.age !== undefined && { age: dto.age }),
        ...(dto.gender !== undefined && { gender: dto.gender }),
        ...(dto.city !== undefined && { city: dto.city }),
      },
      include: { kyc: true, settings: true, wallet: true },
    });
    return this.buildProfileResponse(customer);
  }

  async completeOnboarding(customerId: string, dto: CompleteOnboardingDto) {
    const customer = await this.prisma.customer.update({
      where: { id: customerId },
      data: {
        isOnboardingComplete: true,
        ...(dto.name && { name: dto.name }),
        ...(dto.city && { city: dto.city }),
        ...(dto.gender && { gender: dto.gender }),
        ...(dto.age && { age: dto.age }),
      },
    });
    return { message: 'Onboarding complete', customer };
  }

  async updatePhoto(customerId: string, photoUrl: string) {
    const customer = await this.prisma.customer.update({
      where: { id: customerId },
      data: { photoUrl },
    });
    return { photoUrl: customer.photoUrl };
  }

  async deletePhoto(customerId: string) {
    await this.prisma.customer.update({
      where: { id: customerId },
      data: { photoUrl: null },
    });
    return { message: 'Photo removed' };
  }

  async getCompletionStatus(customerId: string) {
    const customer = await this.prisma.customer.findUnique({
      where: { id: customerId },
      include: { kyc: true },
    });
    if (!customer) throw new NotFoundException('Customer not found');

    const steps = {
      name: !!customer.name,
      bio: !!customer.bio,
      photo: !!customer.photoUrl,
      city: !!customer.city,
      age: !!customer.age,
      gender: !!customer.gender,
      kyc: customer.kycStatus === 'verified',
    };

    const completed = Object.values(steps).filter(Boolean).length;
    const total = Object.keys(steps).length;
    const percentage = Math.round((completed / total) * 100);

    return { steps, completed, total, percentage };
  }

  async updateLocation(customerId: string, data: { latitude?: number; longitude?: number; address?: string; city?: string }) {
    const customer = await this.prisma.customer.update({
      where: { id: customerId },
      data: {
        ...(data.city && { city: data.city }),
      },
    });
    return { success: true, message: 'Location updated successfully', city: customer.city, latitude: data.latitude, longitude: data.longitude };
  }

  async updateInterests(customerId: string, interests: string[]) {
    const customer = await this.prisma.customer.update({
      where: { id: customerId },
      data: { interests },
    });
    return { success: true, message: 'Interests updated successfully', interests: customer.interests };
  }

  private buildProfileResponse(customer: any) {
    return {
      id: customer.id,
      phone: customer.phone,
      countryCode: customer.countryCode,
      name: customer.name,
      bio: customer.bio,
      age: customer.age,
      gender: customer.gender,
      city: customer.city,
      photoUrl: customer.photoUrl,
      kycStatus: customer.kycStatus,
      accountStatus: customer.accountStatus,
      isOnboardingComplete: customer.isOnboardingComplete,
      referralCode: customer.referralCode,
      createdAt: customer.createdAt,
      wallet: customer.wallet ? {
        balance: customer.wallet.balance,
        pendingRefunds: customer.wallet.pendingRefunds,
        escrowHeld: customer.wallet.escrowHeld,
        kycStatus: customer.kycStatus,
      } : null,
    };
  }
}

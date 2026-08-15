import {
  Controller,
  Get,
  Patch,
  Post,
  Delete,
  Body,
  UseGuards,
  UseInterceptors,
  UploadedFile,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname } from 'path';
import { v4 as uuidv4 } from 'uuid';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiConsumes } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentCustomer } from '../../common/decorators/current-customer.decorator';
import { ProfileService } from './profile.service';
import { UpdateProfileDto, CompleteOnboardingDto } from './dto/profile.dto';

@ApiTags('Profile')
@ApiBearerAuth('customer-jwt')
@UseGuards(JwtAuthGuard)
@Controller('profile')
export class ProfileController {
  constructor(private readonly profileService: ProfileService) {}

  @Get()
  @ApiOperation({ summary: 'Get my profile' })
  getProfile(@CurrentCustomer() customer: any) {
    return this.profileService.getProfile(customer.id);
  }

  @Patch()
  @ApiOperation({ summary: 'Update my profile' })
  updateProfile(@CurrentCustomer() customer: any, @Body() dto: UpdateProfileDto) {
    return this.profileService.updateProfile(customer.id, dto);
  }

  @Post('complete-onboarding')
  @ApiOperation({ summary: 'Mark onboarding complete' })
  completeOnboarding(@CurrentCustomer() customer: any, @Body() dto: CompleteOnboardingDto) {
    return this.profileService.completeOnboarding(customer.id, dto);
  }

  @Get('completion')
  @ApiOperation({ summary: 'Get profile completion percentage' })
  getCompletion(@CurrentCustomer() customer: any) {
    return this.profileService.getCompletionStatus(customer.id);
  }

  @Post('photo')
  @ApiOperation({ summary: 'Upload profile photo' })
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        destination: './uploads/profiles',
        filename: (req, file, cb) => {
          const uniqueName = `${uuidv4()}${extname(file.originalname)}`;
          cb(null, uniqueName);
        },
      }),
      fileFilter: (req, file, cb) => {
        if (!file.mimetype.match(/\/(jpg|jpeg|png|webp)$/)) {
          return cb(new Error('Only image files are allowed'), false);
        }
        cb(null, true);
      },
      limits: { fileSize: 10 * 1024 * 1024 },
    }),
  )
  uploadPhoto(@CurrentCustomer() customer: any, @UploadedFile() file: Express.Multer.File) {
    const photoUrl = `/uploads/profiles/${file.filename}`;
    return this.profileService.updatePhoto(customer.id, photoUrl);
  }

  @Delete('photo')
  @ApiOperation({ summary: 'Remove profile photo' })
  deletePhoto(@CurrentCustomer() customer: any) {
    return this.profileService.deletePhoto(customer.id);
  }
}

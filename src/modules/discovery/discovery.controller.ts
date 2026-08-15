import { Controller, Get, Post, Delete, Param, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentCustomer } from '../../common/decorators/current-customer.decorator';
import { DiscoveryService } from './discovery.service';
import { CompanionFilterDto } from './dto/discovery.dto';

@ApiTags('Discovery')
@Controller('discovery')
export class DiscoveryController {
  constructor(private readonly discoveryService: DiscoveryService) {}

  @Get('companions')
  @ApiOperation({ summary: 'List and filter companion profiles' })
  @ApiQuery({ name: 'category', required: false })
  @ApiQuery({ name: 'gender', required: false })
  @ApiQuery({ name: 'search', required: false })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'limit', required: false })
  getCompanions(@Query() query: CompanionFilterDto) {
    return this.discoveryService.getCompanions(query);
  }

  @Get('featured')
  @ApiOperation({ summary: 'Get featured top-rated companions' })
  getFeatured() {
    return this.discoveryService.getFeaturedCompanions();
  }

  @Get('companions/:id')
  @ApiOperation({ summary: 'Get companion detail by ID' })
  getCompanionDetail(@Param('id') id: string) {
    return this.discoveryService.getCompanionDetail(id);
  }

  @Get('favorites')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('customer-jwt')
  @ApiOperation({ summary: 'Get my favorite companions' })
  getFavorites(@CurrentCustomer() customer: any) {
    return this.discoveryService.getFavorites(customer.id);
  }

  @Post('favorites/:companionId')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('customer-jwt')
  @ApiOperation({ summary: 'Add companion to favorites' })
  addFavorite(@CurrentCustomer() customer: any, @Param('companionId') companionId: string) {
    return this.discoveryService.addFavorite(customer.id, companionId);
  }

  @Delete('favorites/:companionId')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('customer-jwt')
  @ApiOperation({ summary: 'Remove companion from favorites' })
  removeFavorite(@CurrentCustomer() customer: any, @Param('companionId') companionId: string) {
    return this.discoveryService.removeFavorite(customer.id, companionId);
  }

  @Get('interests')
  @ApiOperation({ summary: 'Get list of available interest tags for discovery and onboarding' })
  getInterests() {
    return this.discoveryService.getInterests();
  }

  @Get('activities')
  @ApiOperation({ summary: 'Get list of available booking activities and pricing' })
  getActivities() {
    return this.discoveryService.getActivities();
  }
}

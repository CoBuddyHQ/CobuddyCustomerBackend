import { Controller, Get, Patch, Post, Delete, Param, Body, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentCustomer } from '../../common/decorators/current-customer.decorator';
import { AccountService } from './account.service';

@ApiTags('Account')
@ApiBearerAuth('customer-jwt')
@UseGuards(JwtAuthGuard)
@Controller('account')
export class AccountController {
  constructor(private readonly accountService: AccountService) {}

  @Get('settings')
  @ApiOperation({ summary: 'Get account settings' })
  getSettings(@CurrentCustomer() customer: any) {
    return this.accountService.getSettings(customer.id);
  }

  @Patch('settings')
  @ApiOperation({ summary: 'Update account settings' })
  updateSettings(@CurrentCustomer() customer: any, @Body() body: any) {
    return this.accountService.updateSettings(customer.id, body);
  }

  @Get('sessions')
  @ApiOperation({ summary: 'Get active logged-in device sessions' })
  getActiveSessions(@CurrentCustomer() customer: any) {
    return this.accountService.getActiveSessions(customer.id);
  }

  @Delete('sessions/:id')
  @ApiOperation({ summary: 'Revoke active session' })
  revokeSession(@CurrentCustomer() customer: any, @Param('id') id: string) {
    return this.accountService.revokeSession(customer.id, id);
  }

  @Get('blocked')
  @ApiOperation({ summary: 'List blocked users' })
  getBlockedUsers(@CurrentCustomer() customer: any) {
    return this.accountService.getBlockedUsers(customer.id);
  }

  @Post('block/:id')
  @ApiOperation({ summary: 'Block user' })
  blockUser(@CurrentCustomer() customer: any, @Param('id') id: string) {
    return this.accountService.blockUser(customer.id, id);
  }

  @Delete('unblock/:id')
  @ApiOperation({ summary: 'Unblock user' })
  unblockUser(@CurrentCustomer() customer: any, @Param('id') id: string) {
    return this.accountService.unblockUser(customer.id, id);
  }

  @Post('deactivate')
  @ApiOperation({ summary: 'Deactivate account' })
  deactivateAccount(@CurrentCustomer() customer: any) {
    return this.accountService.deactivateAccount(customer.id);
  }

  @Delete('delete')
  @ApiOperation({ summary: 'Delete account' })
  deleteAccount(@CurrentCustomer() customer: any) {
    return this.accountService.deleteAccount(customer.id);
  }

  @Get('notification-preferences')
  @ApiOperation({ summary: 'Get notification preferences' })
  getNotificationPreferences(@CurrentCustomer() customer: any) {
    return this.accountService.getNotificationPreferences(customer.id);
  }

  @Patch('notification-preferences')
  @ApiOperation({ summary: 'Update notification preferences' })
  updateNotificationPreferences(@CurrentCustomer() customer: any, @Body() body: any) {
    return this.accountService.updateNotificationPreferences(customer.id, body);
  }

  @Get('languages')
  @ApiOperation({ summary: 'Get spoken and app languages' })
  getLanguages(@CurrentCustomer() customer: any) {
    return this.accountService.getLanguages(customer.id);
  }

  @Patch('languages')
  @ApiOperation({ summary: 'Update language settings' })
  updateLanguages(@CurrentCustomer() customer: any, @Body() body: { appLanguage?: string; spokenLanguages?: string[] }) {
    return this.accountService.updateLanguages(customer.id, body);
  }

  @Post('reactivate-request')
  @ApiOperation({ summary: 'Submit account reactivation review request' })
  submitReactivationRequest(@Body() body: { phone?: string; email?: string; reason?: string }) {
    return this.accountService.submitReactivationRequest(body);
  }
}

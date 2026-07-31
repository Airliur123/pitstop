import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { AdminModerationController } from './admin-moderation.controller';
import { AdminModerationRepository } from './admin-moderation.repository';
import { AdminModerationService } from './admin-moderation.service';
import { AdminModerationRateLimitService } from './admin-moderation-rate-limit.service';

@Module({
  imports: [AuthModule],
  controllers: [AdminModerationController],
  providers: [AdminModerationRepository, AdminModerationRateLimitService, AdminModerationService],
  exports: [AdminModerationRateLimitService],
})
export class AdminModerationModule {}

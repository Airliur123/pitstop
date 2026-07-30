import { Module } from '@nestjs/common';

import { CacheModule } from '../../common/cache/cache.module';
import { DatabaseModule } from '../../common/database/database.module';
import { RedisModule } from '../../common/redis/redis.module';
import { AdminModerationModule } from '../admin-moderation/admin-moderation.module';
import { AuthModule } from '../auth/auth.module';
import { AdminReportsController } from './admin-reports.controller';
import { ReportsController } from './reports.controller';
import { ReportsRepository } from './reports.repository';
import { ReportsService } from './reports.service';
import { ReportsRateLimitService } from './reports-rate-limit.service';

@Module({
  imports: [AuthModule, AdminModerationModule, CacheModule, DatabaseModule, RedisModule],
  controllers: [ReportsController, AdminReportsController],
  providers: [ReportsRateLimitService, ReportsRepository, ReportsService],
})
export class ReportsModule {}

import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { ContributionsController } from './contributions.controller';
import { ContributionsRepository } from './contributions.repository';
import { ContributionsService } from './contributions.service';
import { ContributionsRateLimitService } from './contributions-rate-limit.service';

@Module({
  imports: [AuthModule],
  controllers: [ContributionsController],
  providers: [ContributionsRateLimitService, ContributionsRepository, ContributionsService],
})
export class ContributionsModule {}

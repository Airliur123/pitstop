import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { AdminGoogleFormController } from './admin-google-form.controller';
import { GoogleFormController } from './google-form.controller';
import { GoogleFormRepository } from './google-form.repository';
import { GoogleFormService } from './google-form.service';
import { GoogleFormRateLimitService } from './google-form-rate-limit.service';

@Module({
  imports: [AuthModule],
  controllers: [GoogleFormController, AdminGoogleFormController],
  providers: [GoogleFormRepository, GoogleFormRateLimitService, GoogleFormService],
})
export class GoogleFormModule {}

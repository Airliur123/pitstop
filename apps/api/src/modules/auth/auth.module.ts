import { Module } from '@nestjs/common';

import { AuthController } from './auth.controller';
import { RoleGuard, SessionAuthGuard, SessionCsrfGuard } from './auth.guards';
import { AuthRepository } from './auth.repository';
import { AuthService } from './auth.service';
import { AuthRateLimitService } from './auth-rate-limit.service';
import { AUTH_MAILER } from './mailer.port';
import { SmtpMailerService } from './smtp-mailer.service';

@Module({
  controllers: [AuthController],
  providers: [
    AuthRepository,
    AuthRateLimitService,
    AuthService,
    SmtpMailerService,
    SessionAuthGuard,
    SessionCsrfGuard,
    RoleGuard,
    { provide: AUTH_MAILER, useExisting: SmtpMailerService },
  ],
  exports: [AuthService, SessionAuthGuard, SessionCsrfGuard, RoleGuard],
})
export class AuthModule {}

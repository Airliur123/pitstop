import { Global, Module } from '@nestjs/common';
import { parseApiEnvironment } from '@pitstop/config';

import { API_ENVIRONMENT } from './configuration';

@Global()
@Module({
  providers: [
    {
      provide: API_ENVIRONMENT,
      useFactory: () => parseApiEnvironment(process.env),
    },
  ],
  exports: [API_ENVIRONMENT],
})
export class ConfigurationModule {}

import { Global, Module } from '@nestjs/common';

import { PublicCacheService } from './public-cache.service';

@Global()
@Module({
  providers: [PublicCacheService],
  exports: [PublicCacheService],
})
export class CacheModule {}

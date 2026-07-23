import { Module } from '@nestjs/common';

import { PublicPlacesController } from './public-places.controller';
import { PublicPlacesService } from './public-places.service';

@Module({
  controllers: [PublicPlacesController],
  providers: [PublicPlacesService],
  exports: [PublicPlacesService],
})
export class PublicPlacesModule {}

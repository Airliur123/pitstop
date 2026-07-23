import { Module } from '@nestjs/common';

import { PublicCategoriesController } from './public-categories.controller';
import { PublicCategoriesService } from './public-categories.service';

@Module({
  controllers: [PublicCategoriesController],
  providers: [PublicCategoriesService],
})
export class PublicCategoriesModule {}

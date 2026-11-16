import { Module } from '@nestjs/common';
import { ProjectsModule } from '../projects/projects.module';
import { ThumbnailsController } from './thumbnails.controller';
import { ThumbnailsService } from './thumbnails.service';

@Module({ imports: [ProjectsModule], controllers: [ThumbnailsController], providers: [ThumbnailsService] })
export class ThumbnailsModule {}

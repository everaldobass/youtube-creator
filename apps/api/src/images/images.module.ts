import { Module } from '@nestjs/common';
import { ProjectsModule } from '../projects/projects.module';
import { ImagesController } from './images.controller';
import { ImagesService } from './images.service';

@Module({ imports: [ProjectsModule], controllers: [ImagesController], providers: [ImagesService] })
export class ImagesModule {}

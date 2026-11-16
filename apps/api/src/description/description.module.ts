import { Module } from '@nestjs/common';
import { ProjectsModule } from '../projects/projects.module';
import { DescriptionController } from './description.controller';
import { DescriptionService } from './description.service';

@Module({ imports: [ProjectsModule], controllers: [DescriptionController], providers: [DescriptionService] })
export class DescriptionModule {}

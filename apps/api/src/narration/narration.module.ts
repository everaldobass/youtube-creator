import { Module } from '@nestjs/common';
import { ProjectsModule } from '../projects/projects.module';
import { NarrationController } from './narration.controller';
import { NarrationService } from './narration.service';

@Module({ imports: [ProjectsModule], controllers: [NarrationController], providers: [NarrationService] })
export class NarrationModule {}

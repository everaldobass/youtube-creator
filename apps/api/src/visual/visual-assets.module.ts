import { Module } from '@nestjs/common';
import { AiModule } from '../ai/ai.module';
import { JobsModule } from '../jobs/jobs.module';
import { ProjectsModule } from '../projects/projects.module';
import { VisualAssetsController } from './visual-assets.controller';
import { VisualAssetsService } from './visual-assets.service';

@Module({
  imports: [AiModule, JobsModule, ProjectsModule],
  controllers: [VisualAssetsController],
  providers: [VisualAssetsService],
})
export class VisualAssetsModule {}

import { Module } from '@nestjs/common';
import { AiModule } from '../ai/ai.module';
import { JobsModule } from '../jobs/jobs.module';
import { ProjectsModule } from '../projects/projects.module';
import { EditorialController } from './editorial.controller';
import { EditorialService } from './editorial.service';

@Module({
  imports: [AiModule, JobsModule, ProjectsModule],
  controllers: [EditorialController],
  providers: [EditorialService],
})
export class EditorialModule {}

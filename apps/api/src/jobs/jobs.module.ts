import { Global, Module } from '@nestjs/common';
import { ProjectsModule } from '../projects/projects.module';
import { JobsController } from './jobs.controller';
import { JobsService } from './jobs.service';

@Global()
@Module({
  imports: [ProjectsModule],
  controllers: [JobsController],
  providers: [JobsService],
  exports: [JobsService],
})
export class JobsModule {}

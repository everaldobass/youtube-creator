import { Module } from '@nestjs/common';
import { ProjectsModule } from '../projects/projects.module';
import { ImportController } from './import.controller';
import { ImportService } from './import.service';

@Module({
  imports: [ProjectsModule],
  controllers: [ImportController],
  providers: [ImportService],
})
export class ImportModule {}

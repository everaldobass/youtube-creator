import { Module } from '@nestjs/common';
import { ProjectsModule } from '../projects/projects.module';
import { TitlesController } from './titles.controller';
import { TitlesService } from './titles.service';

@Module({ imports: [ProjectsModule], controllers: [TitlesController], providers: [TitlesService] })
export class TitlesModule {}

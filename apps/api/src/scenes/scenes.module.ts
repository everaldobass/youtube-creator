import { Module } from '@nestjs/common';
import { ProjectsModule } from '../projects/projects.module';
import { ScenesController } from './scenes.controller';
import { ScenesService } from './scenes.service';

@Module({ imports: [ProjectsModule], controllers: [ScenesController], providers: [ScenesService] })
export class ScenesModule {}

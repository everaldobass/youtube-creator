import { Module } from '@nestjs/common';
import { ProjectsModule } from '../projects/projects.module';
import { MusicController } from './music.controller';
import { MusicService } from './music.service';

@Module({
  imports: [ProjectsModule],
  controllers: [MusicController],
  providers: [MusicService],
})
export class MusicModule {}

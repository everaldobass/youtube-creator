import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from './prisma/prisma.module';
import { StorageModule } from './storage/storage.module';
import { HealthController } from './health/health.controller';
import { ProjectsModule } from './projects/projects.module';
import { AiModule } from './ai/ai.module';
import { TitlesModule } from './titles/titles.module';
import { ScenesModule } from './scenes/scenes.module';
import { JobsModule } from './jobs/jobs.module';
import { MediaModule } from './media/media.module';
import { NarrationModule } from './narration/narration.module';
import { ImagesModule } from './images/images.module';
import { TagsModule } from './tags/tags.module';
import { ThumbnailsModule } from './thumbnails/thumbnails.module';
import { DescriptionModule } from './description/description.module';
import { ExportModule } from './export/export.module';
import { MusicModule } from './music/music.module';
import { EditorialModule } from './editorial/editorial.module';
import { VisualAssetsModule } from './visual/visual-assets.module';
import { QualityModule } from './quality/quality.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    StorageModule,
    ProjectsModule,
    AiModule,
    TitlesModule,
    ScenesModule,
    JobsModule,
    MediaModule,
    NarrationModule,
    ImagesModule,
    TagsModule,
    ThumbnailsModule,
    DescriptionModule,
    ExportModule,
    MusicModule,
    EditorialModule,
    VisualAssetsModule,
    QualityModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}

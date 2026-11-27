import { Controller, Get, Param, Query, StreamableFile } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { QualityService } from './quality.service';

@ApiTags('qualidade')
@Controller()
export class QualityController {
  constructor(private readonly quality: QualityService) {}

  @Get('projects/:id/quality/audio')
  audio(@Param('id') id: string) {
    return this.quality.analisarAudio(id);
  }

  @Get('projects/:id/quality/audio/preview')
  async preview(@Param('id') id: string, @Query('segundos') segundos?: string) {
    const segundosNum = segundos ? Number(segundos) : 60;
    return new StreamableFile(
      await this.quality.previaMixagem(id, Number.isFinite(segundosNum) ? segundosNum : 60),
      { type: 'audio/mpeg' },
    );
  }

  @Get('projects/:id/quality/captions')
  captions(@Param('id') id: string) {
    return this.quality.analisarLegendas(id);
  }

  @Get('projects/:id/quality/review')
  review(@Param('id') id: string) {
    return this.quality.revisaoFinal(id);
  }
}

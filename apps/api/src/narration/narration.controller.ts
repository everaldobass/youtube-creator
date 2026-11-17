import { Controller, Get, Param, Post, Query, StreamableFile } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { NarrationService } from './narration.service';

@ApiTags('narração')
@Controller()
export class NarrationController {
  constructor(private readonly narration: NarrationService) {}

  @Get('projects/:id/narration')
  get(@Param('id') id: string) {
    return this.narration.response(id);
  }

  @Post('projects/:id/narration/generate')
  generate(@Param('id') id: string, @Query('todas') todas?: string) {
    return this.narration.generateAll(id, todas === '1');
  }

  @Post('projects/:id/narration/approve')
  approve(@Param('id') id: string) {
    return this.narration.approve(id);
  }

  @Post('projects/:id/narration/sample')
  async sample(@Param('id') id: string) {
    return new StreamableFile(await this.narration.sample(id), { type: 'audio/wav' });
  }

  @Post('scenes/:sceneId/narration')
  scene(@Param('sceneId') sceneId: string) {
    return this.narration.generateScene(sceneId);
  }

  @Post('scenes/:sceneId/narration/approve')
  approveScene(@Param('sceneId') sceneId: string) {
    return this.narration.aprovarCena(sceneId);
  }

  @Get('scenes/:sceneId/audio')
  async audio(@Param('sceneId') sceneId: string) {
    return new StreamableFile(await this.narration.audio(sceneId), { type: 'audio/wav' });
  }

  @Get('scenes/:sceneId/audio/versions')
  versions(@Param('sceneId') sceneId: string) {
    return this.narration.versoes(sceneId);
  }

  @Get('scenes/:sceneId/audio/versions/:versaoId')
  async audioVersion(@Param('sceneId') sceneId: string, @Param('versaoId') versaoId: string) {
    return new StreamableFile(await this.narration.audioDaVersao(sceneId, versaoId), {
      type: 'audio/wav',
    });
  }

  @Post('scenes/:sceneId/audio/versions/:versaoId/use')
  useVersion(@Param('sceneId') sceneId: string, @Param('versaoId') versaoId: string) {
    return this.narration.usarVersao(sceneId, versaoId);
  }
}

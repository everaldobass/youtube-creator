import { Body, Controller, Delete, Get, Param, Patch, Post, StreamableFile } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import {
  AddSceneInput,
  ReorderScenesInput,
  UpdateSceneInput,
  addSceneSchema,
  reorderScenesSchema,
  updateSceneSchema,
} from '@yt/shared';
import { ZodValidationPipe } from '../projects/zod-validation.pipe';
import { ScenesService } from './scenes.service';

@ApiTags('roteiro')
@Controller()
export class ScenesController {
  constructor(private readonly scenes: ScenesService) {}

  @Get('projects/:id/scenes')
  list(@Param('id') id: string) {
    return this.scenes.list(id);
  }

  @Post('projects/:id/script/generate')
  generate(@Param('id') id: string) {
    return this.scenes.generate(id);
  }

  /** Baixa o roteiro em Markdown (texto, direção visual e referências). */
  @Get('projects/:id/script.md')
  async scriptMarkdown(@Param('id') id: string) {
    const { nome, markdown } = await this.scenes.roteiroMarkdown(id);
    return new StreamableFile(Buffer.from(markdown, 'utf8'), {
      type: 'text/markdown; charset=utf-8',
      disposition: `attachment; filename="${nome}"`,
      length: Buffer.byteLength(markdown, 'utf8'),
    });
  }

  @Post('projects/:id/scenes')
  add(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(addSceneSchema)) body: AddSceneInput,
  ) {
    return this.scenes.add(id, body.depoisDaCena);
  }

  @Post('projects/:id/scenes/reorder')
  reorder(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(reorderScenesSchema)) body: ReorderScenesInput,
  ) {
    return this.scenes.reorder(id, body.ids);
  }

  @Patch('scenes/:sceneId')
  update(
    @Param('sceneId') sceneId: string,
    @Body(new ZodValidationPipe(updateSceneSchema)) body: UpdateSceneInput,
  ) {
    return this.scenes.update(sceneId, body);
  }

  @Delete('scenes/:sceneId')
  remove(@Param('sceneId') sceneId: string) {
    return this.scenes.remove(sceneId);
  }

  @Post('scenes/:sceneId/regenerate')
  regenerate(@Param('sceneId') sceneId: string) {
    return this.scenes.regenerate(sceneId);
  }
}

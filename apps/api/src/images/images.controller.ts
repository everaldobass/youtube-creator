import { Body, Controller, Get, Param, Patch, Post, Query, Req, StreamableFile } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { StyleInput, UploadImageInput, styleSchema, uploadImageSchema } from '@yt/shared';
import { ZodValidationPipe } from '../projects/zod-validation.pipe';
import { ImagesService } from './images.service';

@ApiTags('imagens')
@Controller()
export class ImagesController {
  constructor(private readonly images: ImagesService) {}

  @Get('projects/:id/images')
  get(@Param('id') id: string) {
    return this.images.response(id);
  }

  @Get('projects/:id/images/prompts.md')
  async prompts(@Param('id') id: string, @Req() req: Request) {
    const base = `${req.protocol}://${req.get('host')}`;
    const { nome, markdown } = await this.images.promptsMarkdown(id, base);
    return new StreamableFile(Buffer.from(markdown, 'utf8'), {
      type: 'text/markdown; charset=utf-8',
      disposition: `attachment; filename="${nome}"`,
    });
  }

  @Patch('projects/:id/style')
  style(@Param('id') id: string, @Body(new ZodValidationPipe(styleSchema)) body: StyleInput) {
    return this.images.updateStyle(id, body.estiloVisual);
  }

  @Post('projects/:id/images/generate')
  generate(@Param('id') id: string, @Query('todas') todas?: string) {
    return this.images.generateAll(id, todas === '1');
  }

  @Post('projects/:id/images/approve')
  approve(@Param('id') id: string) {
    return this.images.approve(id);
  }

  @Post('scenes/:sceneId/image')
  scene(@Param('sceneId') sceneId: string) {
    return this.images.generateScene(sceneId);
  }

  @Post('scenes/:sceneId/image/upload')
  upload(
    @Param('sceneId') sceneId: string,
    @Body(new ZodValidationPipe(uploadImageSchema)) body: UploadImageInput,
  ) {
    return this.images.upload(sceneId, body);
  }

  @Get('scenes/:sceneId/image')
  async image(@Param('sceneId') sceneId: string) {
    const { data, mime } = await this.images.imagem(sceneId);
    return new StreamableFile(data, { type: mime });
  }
}

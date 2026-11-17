import { Body, Controller, Get, Param, Patch, Post, Query, StreamableFile } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { UpdateThumbInput, UploadImageInput, updateThumbSchema, uploadImageSchema } from '@yt/shared';
import { ZodValidationPipe } from '../projects/zod-validation.pipe';
import { ThumbnailsService } from './thumbnails.service';

@ApiTags('thumbnails')
@Controller()
export class ThumbnailsController {
  constructor(private readonly thumbs: ThumbnailsService) {}

  @Get('projects/:id/thumbnails')
  list(@Param('id') id: string) {
    return this.thumbs.response(id);
  }

  @Post('projects/:id/thumbnails/generate')
  generate(@Param('id') id: string) {
    return this.thumbs.generateAll(id);
  }

  @Patch('thumbnails/:thumbId')
  update(
    @Param('thumbId') thumbId: string,
    @Body(new ZodValidationPipe(updateThumbSchema)) body: UpdateThumbInput,
  ) {
    return this.thumbs.updateText(thumbId, body.textoNaImagem);
  }

  @Post('thumbnails/:thumbId/select')
  select(@Param('thumbId') thumbId: string) {
    return this.thumbs.select(thumbId);
  }

  @Post('thumbnails/:thumbId/regenerate')
  regenerate(@Param('thumbId') thumbId: string) {
    return this.thumbs.regenerate(thumbId);
  }

  @Post('thumbnails/:thumbId/image/upload')
  upload(
    @Param('thumbId') thumbId: string,
    @Body(new ZodValidationPipe(uploadImageSchema)) body: UploadImageInput,
  ) {
    return this.thumbs.upload(thumbId, body);
  }

  @Get('thumbnails/:thumbId/image')
  async image(@Param('thumbId') thumbId: string, @Query('download') download?: string) {
    const { data, variacao } = await this.thumbs.imagem(thumbId);
    return new StreamableFile(data, {
      type: 'image/jpeg',
      disposition: download === '1' ? `attachment; filename="thumbnail-${variacao}.jpg"` : undefined,
    });
  }
}

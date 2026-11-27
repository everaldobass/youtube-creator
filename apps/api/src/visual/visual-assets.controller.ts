import { Body, Controller, Delete, Get, Param, Patch, Post, StreamableFile } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import {
  CreateVisualAssetInput,
  UpdateVisualAssetInput,
  createVisualAssetSchema,
  updateVisualAssetSchema,
  uploadImageSchema,
} from '@yt/shared';
import { ZodValidationPipe } from '../projects/zod-validation.pipe';
import { VisualAssetsService } from './visual-assets.service';

@ApiTags('elementos visuais')
@Controller()
export class VisualAssetsController {
  constructor(private readonly visual: VisualAssetsService) {}

  @Get('projects/:id/visual')
  list(@Param('id') id: string) {
    return this.visual.response(id);
  }

  @Post('projects/:id/visual')
  create(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(createVisualAssetSchema)) body: CreateVisualAssetInput,
  ) {
    return this.visual.create(id, body);
  }

  @Patch('visual/:assetId')
  update(
    @Param('assetId') assetId: string,
    @Body(new ZodValidationPipe(updateVisualAssetSchema)) body: UpdateVisualAssetInput,
  ) {
    return this.visual.update(assetId, body);
  }

  @Post('visual/:assetId/regenerate')
  regenerate(@Param('assetId') assetId: string) {
    return this.visual.regenerate(assetId);
  }

  @Post('visual/:assetId/upload')
  upload(
    @Param('assetId') assetId: string,
    @Body(new ZodValidationPipe(uploadImageSchema)) body: { base64: string; mime: string },
  ) {
    return this.visual.upload(assetId, body.base64, body.mime);
  }

  @Delete('visual/:assetId')
  remove(@Param('assetId') assetId: string) {
    return this.visual.remove(assetId);
  }

  @Get('visual/:assetId/image')
  async image(@Param('assetId') assetId: string) {
    const { data, mime } = await this.visual.imagem(assetId);
    return new StreamableFile(data, { type: mime });
  }
}

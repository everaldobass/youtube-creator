import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
  StreamableFile,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import {
  MusicConfigInput,
  MusicLibraryInput,
  MusicUploadInput,
  musicConfigSchema,
  musicLibrarySchema,
  musicUploadSchema,
} from '@yt/shared';
import { ZodValidationPipe } from '../projects/zod-validation.pipe';
import { MusicService } from './music.service';

@ApiTags('música')
@Controller()
export class MusicController {
  constructor(private readonly music: MusicService) {}

  @Get('projects/:id/music')
  get(@Param('id') id: string) {
    return this.music.response(id);
  }

  /** Envia um arquivo de música próprio (base64, até 30 MB). */
  @Post('projects/:id/music/upload')
  upload(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(musicUploadSchema)) body: MusicUploadInput,
  ) {
    return this.music.upload(id, body);
  }

  /** Copia para o projeto uma música da pasta local `storage/musicas`. */
  @Post('projects/:id/music/library')
  library(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(musicLibrarySchema)) body: MusicLibraryInput,
  ) {
    return this.music.escolherDaBiblioteca(id, body);
  }

  @Patch('projects/:id/music')
  configure(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(musicConfigSchema)) body: MusicConfigInput,
  ) {
    return this.music.configurar(id, body);
  }

  @Delete('projects/:id/music')
  @HttpCode(204)
  async remove(@Param('id') id: string) {
    await this.music.remover(id);
  }

  /** Prévia da música escolhida, para tocar no navegador. */
  @Get('projects/:id/music/audio')
  async audio(@Param('id') id: string) {
    const { data, mime } = await this.music.audio(id);
    return new StreamableFile(data, { type: mime });
  }

  /** Prévia de uma música da biblioteca antes de escolhê-la. */
  @Get('music/library/audio')
  async libraryAudio(@Query('arquivo') arquivo: string) {
    const { data, mime } = await this.music.audioDaBiblioteca(arquivo ?? '');
    return new StreamableFile(data, { type: mime });
  }
}

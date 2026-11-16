import { Controller, Get, Param, Post, Query, Res, StreamableFile } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { ExportService } from './export.service';

@ApiTags('exportação')
@Controller('projects/:id')
export class ExportController {
  constructor(private readonly exp: ExportService) {}

  @Get('export')
  status(@Param('id') id: string) {
    return this.exp.status(id);
  }

  @Post('render')
  render(@Param('id') id: string) {
    return this.exp.render(id);
  }

  @Get('export/mp4')
  async mp4(@Param('id') id: string, @Query('download') download?: string) {
    const { data, nome } = await this.exp.mp4(id);
    return new StreamableFile(data, {
      type: 'video/mp4',
      disposition: download === '1' ? `attachment; filename="${nome}"` : undefined,
    });
  }

  @Get('export/zip')
  async zip(@Param('id') id: string, @Res() res: Response) {
    const arquivo = await this.exp.montarZip(id);
    res.set({ 'Content-Type': 'application/zip', 'Content-Disposition': 'attachment; filename="pacote-video.zip"' });
    arquivo.on('error', () => res.end());
    arquivo.pipe(res);
  }
}

import {
  BadRequestException,
  Controller,
  Post,
  UploadedFile,
  UseFilters,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiTags } from '@nestjs/swagger';
import { promises as fs } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { IMPORT_MAX_MB_PADRAO } from '@yt/shared';
import { ImportService } from './import.service';
import { ImportUploadFilter } from './import-upload.filter';

/** O arquivo chega em pasta temporária; nunca é extraído para o storage por nome. */
interface ArquivoZip {
  originalname: string;
  size: number;
  path: string;
}

const maxMb = () => {
  const valor = Number(process.env.IMPORT_MAX_MB);
  return Number.isFinite(valor) && valor > 0 ? valor : IMPORT_MAX_MB_PADRAO;
};

const opcoesUpload = () => ({
  dest: join(tmpdir(), 'youstudio-import'),
  limits: { fileSize: maxMb() * 1024 * 1024, files: 1 },
});

@ApiTags('importação')
@Controller('projects')
@UseFilters(ImportUploadFilter)
export class ImportController {
  constructor(private readonly importacao: ImportService) {}

  @Post('import/preview')
  @UseInterceptors(FileInterceptor('arquivo', opcoesUpload()))
  async preview(@UploadedFile() arquivo?: ArquivoZip) {
    if (!arquivo) throw new BadRequestException('Envie o arquivo .zip do projeto.');
    try {
      return await this.importacao.preview(arquivo.path, arquivo.originalname, arquivo.size);
    } finally {
      await fs.unlink(arquivo.path).catch(() => undefined);
    }
  }

  @Post('import')
  @UseInterceptors(FileInterceptor('arquivo', opcoesUpload()))
  async importar(@UploadedFile() arquivo?: ArquivoZip) {
    if (!arquivo) throw new BadRequestException('Envie o arquivo .zip do projeto.');
    try {
      return await this.importacao.importar(arquivo.path, arquivo.originalname, arquivo.size);
    } finally {
      await fs.unlink(arquivo.path).catch(() => undefined);
    }
  }
}

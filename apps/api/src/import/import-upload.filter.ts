import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
} from '@nestjs/common';
import type { Response } from 'express';
import { IMPORT_MAX_MB_PADRAO } from '@yt/shared';

const maxMb = () => {
  const valor = Number(process.env.IMPORT_MAX_MB);
  return Number.isFinite(valor) && valor > 0 ? valor : IMPORT_MAX_MB_PADRAO;
};

/**
 * Traduz o erro do multer para português e mantém o corpo JSON que o front lê.
 * Sem isso, um ZIP acima do limite viraria um 413 em inglês.
 */
@Catch()
export class ImportUploadFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const res = host.switchToHttp().getResponse<Response>();
    const codigo = (exception as { code?: string } | null)?.code;

    if (codigo === 'LIMIT_FILE_SIZE') {
      res.status(413).json({
        statusCode: 413,
        message: `Arquivo grande demais. O limite para importar é ${maxMb()} MB.`,
      });
      return;
    }

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const resposta = exception.getResponse();
      res
        .status(status)
        .json(typeof resposta === 'string' ? { statusCode: status, message: resposta } : resposta);
      return;
    }

    res.status(500).json({
      statusCode: 500,
      message: 'Não foi possível importar o pacote. Verifique se o ZIP está íntegro.',
    });
  }
}

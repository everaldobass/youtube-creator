import { Injectable } from '@nestjs/common';
import { execFile } from 'child_process';
import { promises as fs } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

const AJUDA = 'FFmpeg não encontrado. No Ubuntu instale com: sudo apt install ffmpeg';

@Injectable()
export class FfmpegService {
  run(args: string[]): Promise<void> {
    return new Promise((resolve, reject) => {
      execFile('ffmpeg', ['-hide_banner', '-loglevel', 'error', ...args], { maxBuffer: 20 * 1024 * 1024 }, (err, _out, stderr) => {
        if (!err) return resolve();
        if ((err as NodeJS.ErrnoException).code === 'ENOENT') return reject(new Error(AJUDA));
        reject(new Error(`FFmpeg falhou: ${stderr.trim().split('\n').slice(-3).join(' ') || err.message}`));
      });
    });
  }

  /** Igual a `run`, mas devolve a saída padrão em binário (ex.: quadro cru do rawvideo). */
  runBuffer(args: string[], limiteMb = 128): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      execFile(
        'ffmpeg',
        ['-hide_banner', '-loglevel', 'error', ...args],
        { encoding: 'buffer', maxBuffer: limiteMb * 1024 * 1024 },
        (err, stdout, stderr) => {
          if (!err) return resolve(stdout as Buffer);
          if ((err as NodeJS.ErrnoException).code === 'ENOENT') return reject(new Error(AJUDA));
          const detalhe = (stderr as Buffer).toString().trim().split('\n').slice(-3).join(' ');
          reject(new Error(`FFmpeg falhou: ${detalhe || err.message}`));
        },
      );
    });
  }

  /** Igual a `run`, mas devolve o stderr (é onde o silencedetect informa as pausas). */
  capture(args: string[]): Promise<string> {
    return new Promise((resolve, reject) => {
      execFile('ffmpeg', ['-hide_banner', '-loglevel', 'info', ...args], { maxBuffer: 20 * 1024 * 1024 }, (err, _out, stderr) => {
        if (!err) return resolve(stderr);
        if ((err as NodeJS.ErrnoException).code === 'ENOENT') return reject(new Error(AJUDA));
        reject(new Error(`FFmpeg falhou: ${stderr.trim().split('\n').slice(-3).join(' ') || err.message}`));
      });
    });
  }

  async comPastaTemporaria<T>(fn: (dir: string) => Promise<T>): Promise<T> {
    const dir = await fs.mkdtemp(join(tmpdir(), 'ytc-'));
    try {
      return await fn(dir);
    } finally {
      await fs.rm(dir, { recursive: true, force: true });
    }
  }

  /** Recorta e redimensiona a imagem para o tamanho exato (ex.: 1280x720), em JPEG. */
  redimensionar(entrada: Buffer, largura: number, altura: number): Promise<Buffer> {
    return this.comPastaTemporaria(async (dir) => {
      const inp = join(dir, 'in');
      const out = join(dir, 'out.jpg');
      await fs.writeFile(inp, entrada);
      await this.run([
        '-y', '-i', inp,
        '-vf', `scale=${largura}:${altura}:force_original_aspect_ratio=increase,crop=${largura}:${altura}`,
        '-frames:v', '1', '-q:v', '2', out,
      ]);
      return fs.readFile(out);
    });
  }
}

import { promises as fs } from 'fs';
import { dirname, join, normalize, resolve, sep } from 'path';
import { StorageDriver } from './storage.service';

export class LocalStorageDriver implements StorageDriver {
  private readonly root: string;

  constructor(rootDir: string) {
    this.root = resolve(rootDir);
  }

  private pathFor(key: string): string {
    const full = resolve(join(this.root, normalize(key)));
    if (full !== this.root && !full.startsWith(this.root + sep)) {
      throw new Error('Chave de arquivo inválida');
    }
    return full;
  }

  async put(key: string, data: Buffer): Promise<void> {
    const file = this.pathFor(key);
    await fs.mkdir(dirname(file), { recursive: true });
    await fs.writeFile(file, data);
  }

  get(key: string): Promise<Buffer> {
    return fs.readFile(this.pathFor(key));
  }

  async remove(key: string): Promise<void> {
    await fs.rm(this.pathFor(key), { force: true });
  }

  async removePrefix(prefix: string): Promise<void> {
    await fs.rm(this.pathFor(prefix), { recursive: true, force: true });
  }

  async exists(key: string): Promise<boolean> {
    try {
      await fs.access(this.pathFor(key));
      return true;
    } catch {
      return false;
    }
  }
}

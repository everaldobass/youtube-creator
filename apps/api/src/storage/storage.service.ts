/**
 * Camada de armazenamento de arquivos (imagens, áudios, exports).
 * O banco guarda só a "key". No MVP o driver é o disco local; para o
 * Supabase Storage basta implementar esta interface e trocar STORAGE_DRIVER.
 */
export interface StorageDriver {
  put(key: string, data: Buffer, contentType?: string): Promise<void>;
  get(key: string): Promise<Buffer>;
  remove(key: string): Promise<void>;
  /** Remove tudo sob um prefixo (ex.: `projects/<id>` ao apagar um projeto). */
  removePrefix(prefix: string): Promise<void>;
  exists(key: string): Promise<boolean>;
}

export const STORAGE_DRIVER = Symbol('STORAGE_DRIVER');

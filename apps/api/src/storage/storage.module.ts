import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { LocalStorageDriver } from './local-storage.driver';
import { STORAGE_DRIVER } from './storage.service';

@Global()
@Module({
  providers: [
    {
      provide: STORAGE_DRIVER,
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const driver = config.get<string>('STORAGE_DRIVER') ?? 'local';
        if (driver === 'local') {
          return new LocalStorageDriver(config.get<string>('STORAGE_LOCAL_DIR') ?? '../../storage');
        }
        // Fase 6: return new SupabaseStorageDriver(...)
        throw new Error(`STORAGE_DRIVER "${driver}" ainda não implementado`);
      },
    },
  ],
  exports: [STORAGE_DRIVER],
})
export class StorageModule {}

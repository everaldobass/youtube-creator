import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

/** Usuário único do MVP. Com login (Fase 6), o usuário vem da sessão. */
export const LOCAL_USER_EMAIL = 'local@youtube-creator.app';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  async onModuleInit() {
    await this.$connect();
  }
  async onModuleDestroy() {
    await this.$disconnect();
  }

  async localUserId(): Promise<string> {
    const user = await this.user.upsert({
      where: { email: LOCAL_USER_EMAIL },
      update: {},
      create: { email: LOCAL_USER_EMAIL, nome: 'Usuário local' },
    });
    return user.id;
  }
}

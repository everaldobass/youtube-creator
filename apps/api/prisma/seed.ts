import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  await prisma.user.upsert({
    where: { email: 'local@youtube-creator.app' },
    update: {},
    create: { email: 'local@youtube-creator.app', nome: 'Usuário local' },
  });
  console.log('Usuário local pronto.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());

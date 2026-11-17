-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Project" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "ideia" TEXT NOT NULL DEFAULT '',
    "tema" TEXT NOT NULL DEFAULT '',
    "publico" TEXT NOT NULL DEFAULT '',
    "formato" TEXT NOT NULL DEFAULT 'longo',
    "duracaoMinutos" INTEGER NOT NULL DEFAULT 5,
    "tituloEscolhido" TEXT NOT NULL DEFAULT '',
    "vozNome" TEXT NOT NULL DEFAULT 'voz-masculina-1',
    "vozInstrucaoTom" TEXT NOT NULL DEFAULT 'suave, claro, bem explicado',
    "estiloVisual" TEXT NOT NULL DEFAULT '3D estilizado, cores quentes, iluminação suave, sem texto na imagem',
    "descricao" TEXT NOT NULL DEFAULT '',
    "efeitoCamera" TEXT NOT NULL DEFAULT 'alternado',
    "musicaPath" TEXT,
    "musicaNome" TEXT NOT NULL DEFAULT '',
    "musicaArtista" TEXT NOT NULL DEFAULT '',
    "musicaOrigem" TEXT NOT NULL DEFAULT '',
    "musicaCredito" TEXT NOT NULL DEFAULT '',
    "musicaVolume" INTEGER NOT NULL DEFAULT 20,
    "musicaDucking" BOOLEAN NOT NULL DEFAULT true,
    "legendasAtivas" BOOLEAN NOT NULL DEFAULT true,
    "legendaTamanho" INTEGER NOT NULL DEFAULT 100,
    "etapaAtual" TEXT NOT NULL DEFAULT 'definicoes',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Project_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_Project" ("createdAt", "descricao", "duracaoMinutos", "efeitoCamera", "estiloVisual", "etapaAtual", "formato", "id", "ideia", "legendasAtivas", "musicaArtista", "musicaCredito", "musicaDucking", "musicaNome", "musicaOrigem", "musicaPath", "musicaVolume", "publico", "tema", "tituloEscolhido", "updatedAt", "userId", "vozInstrucaoTom", "vozNome") SELECT "createdAt", "descricao", "duracaoMinutos", "efeitoCamera", "estiloVisual", "etapaAtual", "formato", "id", "ideia", "legendasAtivas", "musicaArtista", "musicaCredito", "musicaDucking", "musicaNome", "musicaOrigem", "musicaPath", "musicaVolume", "publico", "tema", "tituloEscolhido", "updatedAt", "userId", "vozInstrucaoTom", "vozNome" FROM "Project";
DROP TABLE "Project";
ALTER TABLE "new_Project" RENAME TO "Project";
CREATE INDEX "Project_userId_updatedAt_idx" ON "Project"("userId", "updatedAt");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

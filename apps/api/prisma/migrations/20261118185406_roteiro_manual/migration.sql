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
    "idioma" TEXT NOT NULL DEFAULT 'pt-BR',
    "tituloEscolhido" TEXT NOT NULL DEFAULT '',
    "vozNome" TEXT NOT NULL DEFAULT 'voz-masculina-1',
    "vozInstrucaoTom" TEXT NOT NULL DEFAULT 'suave, claro, bem explicado',
    "narracaoNatural" BOOLEAN NOT NULL DEFAULT true,
    "narracaoVelocidade" INTEGER NOT NULL DEFAULT 97,
    "pronuncia" TEXT NOT NULL DEFAULT '',
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
    "legendaPosicao" TEXT NOT NULL DEFAULT 'baixo',
    "legendaEstilo" TEXT NOT NULL DEFAULT 'negrito',
    "legendaFonte" TEXT NOT NULL DEFAULT 'Noto Sans',
    "legendaCor" TEXT NOT NULL DEFAULT '#C4B5FD',
    "usarCameraSugerida" BOOLEAN NOT NULL DEFAULT false,
    "editorialStatus" TEXT NOT NULL DEFAULT 'nao_revisado',
    "roteiroManual" BOOLEAN NOT NULL DEFAULT false,
    "fontesRoteiro" TEXT NOT NULL DEFAULT '',
    "revisaoFinalEm" DATETIME,
    "etapaAtual" TEXT NOT NULL DEFAULT 'definicoes',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Project_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_Project" ("createdAt", "descricao", "duracaoMinutos", "editorialStatus", "efeitoCamera", "estiloVisual", "etapaAtual", "fontesRoteiro", "formato", "id", "ideia", "idioma", "legendaCor", "legendaEstilo", "legendaFonte", "legendaPosicao", "legendaTamanho", "legendasAtivas", "musicaArtista", "musicaCredito", "musicaDucking", "musicaNome", "musicaOrigem", "musicaPath", "musicaVolume", "narracaoNatural", "narracaoVelocidade", "pronuncia", "publico", "revisaoFinalEm", "tema", "tituloEscolhido", "updatedAt", "usarCameraSugerida", "userId", "vozInstrucaoTom", "vozNome") SELECT "createdAt", "descricao", "duracaoMinutos", "editorialStatus", "efeitoCamera", "estiloVisual", "etapaAtual", "fontesRoteiro", "formato", "id", "ideia", "idioma", "legendaCor", "legendaEstilo", "legendaFonte", "legendaPosicao", "legendaTamanho", "legendasAtivas", "musicaArtista", "musicaCredito", "musicaDucking", "musicaNome", "musicaOrigem", "musicaPath", "musicaVolume", "narracaoNatural", "narracaoVelocidade", "pronuncia", "publico", "revisaoFinalEm", "tema", "tituloEscolhido", "updatedAt", "usarCameraSugerida", "userId", "vozInstrucaoTom", "vozNome" FROM "Project";
DROP TABLE "Project";
ALTER TABLE "new_Project" RENAME TO "Project";
CREATE INDEX "Project_userId_updatedAt_idx" ON "Project"("userId", "updatedAt");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateTable
CREATE TABLE "SceneAudio" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sceneId" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "duracaoMs" INTEGER NOT NULL DEFAULT 0,
    "atual" BOOLEAN NOT NULL DEFAULT false,
    "criadoEm" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SceneAudio_sceneId_fkey" FOREIGN KEY ("sceneId") REFERENCES "Scene" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "EditorialReview" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "projectId" TEXT NOT NULL,
    "classificacao" TEXT NOT NULL,
    "resumo" TEXT NOT NULL DEFAULT '',
    "criadoEm" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "EditorialReview_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "EditorialIssue" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "reviewId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "cenaNumero" INTEGER,
    "tipo" TEXT NOT NULL,
    "trecho" TEXT NOT NULL DEFAULT '',
    "problema" TEXT NOT NULL,
    "explicacao" TEXT NOT NULL DEFAULT '',
    "sugestao" TEXT NOT NULL DEFAULT '',
    "fonte" TEXT NOT NULL DEFAULT '',
    "confianca" TEXT NOT NULL DEFAULT 'media',
    "status" TEXT NOT NULL DEFAULT 'pendente',
    CONSTRAINT "EditorialIssue_reviewId_fkey" FOREIGN KEY ("reviewId") REFERENCES "EditorialReview" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "EditorialIssue_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "VisualAsset" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "projectId" TEXT NOT NULL,
    "sceneNumero" INTEGER,
    "tipo" TEXT NOT NULL DEFAULT 'mapa',
    "titulo" TEXT NOT NULL DEFAULT '',
    "periodo" TEXT NOT NULL DEFAULT '',
    "descricao" TEXT NOT NULL DEFAULT '',
    "prompt" TEXT NOT NULL DEFAULT '',
    "imagemPath" TEXT,
    "criadoEm" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "VisualAsset_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

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
    "legendaFonte" TEXT NOT NULL DEFAULT 'Noto Sans',
    "legendaCor" TEXT NOT NULL DEFAULT '#C4B5FD',
    "usarCameraSugerida" BOOLEAN NOT NULL DEFAULT false,
    "editorialStatus" TEXT NOT NULL DEFAULT 'nao_revisado',
    "fontesRoteiro" TEXT NOT NULL DEFAULT '',
    "revisaoFinalEm" DATETIME,
    "etapaAtual" TEXT NOT NULL DEFAULT 'definicoes',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Project_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_Project" ("createdAt", "descricao", "duracaoMinutos", "efeitoCamera", "estiloVisual", "etapaAtual", "formato", "id", "ideia", "idioma", "legendaTamanho", "legendasAtivas", "musicaArtista", "musicaCredito", "musicaDucking", "musicaNome", "musicaOrigem", "musicaPath", "musicaVolume", "narracaoNatural", "publico", "tema", "tituloEscolhido", "updatedAt", "userId", "vozInstrucaoTom", "vozNome") SELECT "createdAt", "descricao", "duracaoMinutos", "efeitoCamera", "estiloVisual", "etapaAtual", "formato", "id", "ideia", "idioma", "legendaTamanho", "legendasAtivas", "musicaArtista", "musicaCredito", "musicaDucking", "musicaNome", "musicaOrigem", "musicaPath", "musicaVolume", "narracaoNatural", "publico", "tema", "tituloEscolhido", "updatedAt", "userId", "vozInstrucaoTom", "vozNome" FROM "Project";
DROP TABLE "Project";
ALTER TABLE "new_Project" RENAME TO "Project";
CREATE INDEX "Project_userId_updatedAt_idx" ON "Project"("userId", "updatedAt");
CREATE TABLE "new_Scene" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "projectId" TEXT NOT NULL,
    "numero" INTEGER NOT NULL,
    "textoNarrado" TEXT NOT NULL DEFAULT '',
    "duracaoSegundos" INTEGER NOT NULL DEFAULT 0,
    "descricaoVisual" TEXT NOT NULL DEFAULT '',
    "promptImagem" TEXT NOT NULL DEFAULT '',
    "imagemPath" TEXT,
    "audioPath" TEXT,
    "audioDuracaoMs" INTEGER,
    "versaoMidia" INTEGER NOT NULL DEFAULT 0,
    "statusNarracao" TEXT NOT NULL DEFAULT 'pendente',
    "statusImagem" TEXT NOT NULL DEFAULT 'pendente',
    "sugestaoCamera" TEXT NOT NULL DEFAULT '',
    "alertaImagem" TEXT NOT NULL DEFAULT '',
    CONSTRAINT "Scene_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_Scene" ("audioDuracaoMs", "audioPath", "descricaoVisual", "duracaoSegundos", "id", "imagemPath", "numero", "projectId", "promptImagem", "statusImagem", "statusNarracao", "textoNarrado", "versaoMidia") SELECT "audioDuracaoMs", "audioPath", "descricaoVisual", "duracaoSegundos", "id", "imagemPath", "numero", "projectId", "promptImagem", "statusImagem", "statusNarracao", "textoNarrado", "versaoMidia" FROM "Scene";
DROP TABLE "Scene";
ALTER TABLE "new_Scene" RENAME TO "Scene";
CREATE UNIQUE INDEX "Scene_projectId_numero_key" ON "Scene"("projectId", "numero");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "SceneAudio_sceneId_atual_idx" ON "SceneAudio"("sceneId", "atual");

-- CreateIndex
CREATE INDEX "EditorialReview_projectId_criadoEm_idx" ON "EditorialReview"("projectId", "criadoEm");

-- CreateIndex
CREATE INDEX "EditorialIssue_projectId_status_idx" ON "EditorialIssue"("projectId", "status");

-- CreateIndex
CREATE INDEX "VisualAsset_projectId_idx" ON "VisualAsset"("projectId");

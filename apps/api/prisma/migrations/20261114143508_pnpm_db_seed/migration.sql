-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "email" TEXT NOT NULL,
    "nome" TEXT NOT NULL DEFAULT '',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "Project" (
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
    "etapaAtual" TEXT NOT NULL DEFAULT 'definicoes',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Project_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Title" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "projectId" TEXT NOT NULL,
    "texto" TEXT NOT NULL,
    "estilo" TEXT NOT NULL DEFAULT '',
    "nota" REAL NOT NULL DEFAULT 0,
    "escolhido" BOOLEAN NOT NULL DEFAULT false,
    CONSTRAINT "Title_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Scene" (
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
    CONSTRAINT "Scene_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Tag" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "projectId" TEXT NOT NULL,
    "texto" TEXT NOT NULL,
    "ordem" INTEGER NOT NULL,
    CONSTRAINT "Tag_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Thumbnail" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "projectId" TEXT NOT NULL,
    "variacao" INTEGER NOT NULL,
    "textoNaImagem" TEXT NOT NULL DEFAULT '',
    "imagemPath" TEXT,
    "escolhida" BOOLEAN NOT NULL DEFAULT false,
    CONSTRAINT "Thumbnail_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Chapter" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "projectId" TEXT NOT NULL,
    "tempo" TEXT NOT NULL,
    "titulo" TEXT NOT NULL,
    CONSTRAINT "Chapter_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Job" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "projectId" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "alvoId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'fila',
    "tentativas" INTEGER NOT NULL DEFAULT 0,
    "erro" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Job_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Export" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "projectId" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "path" TEXT,
    "status" TEXT NOT NULL DEFAULT 'fila',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Export_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "Project_userId_updatedAt_idx" ON "Project"("userId", "updatedAt");

-- CreateIndex
CREATE INDEX "Title_projectId_idx" ON "Title"("projectId");

-- CreateIndex
CREATE UNIQUE INDEX "Scene_projectId_numero_key" ON "Scene"("projectId", "numero");

-- CreateIndex
CREATE INDEX "Tag_projectId_idx" ON "Tag"("projectId");

-- CreateIndex
CREATE INDEX "Thumbnail_projectId_idx" ON "Thumbnail"("projectId");

-- CreateIndex
CREATE INDEX "Chapter_projectId_idx" ON "Chapter"("projectId");

-- CreateIndex
CREATE INDEX "Job_projectId_status_idx" ON "Job"("projectId", "status");

-- CreateIndex
CREATE INDEX "Export_projectId_idx" ON "Export"("projectId");

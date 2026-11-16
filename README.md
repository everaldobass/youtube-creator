# Criador de Vídeos YouTube

App web fullstack (MVP): do título ao vídeo pronto para o YouTube, em 9 etapas.

- **Web:** Next.js (App Router) + Tailwind CSS + shadcn/ui, tema "Studio Red Stream"
- **API:** NestJS + Prisma
- **Banco:** SQLite no MVP, pronto para Supabase (Postgres)
- **Arquivos:** `StorageService` com driver local, interface pronta para Supabase Storage
- **IA:** Gemini (texto e imagem) + Fish Audio (narração/TTS), sempre chamada pelo backend

## Requisitos
- Node 20+ e pnpm 9+ (`sudo npm install -g pnpm@9`)
- **FFmpeg 5+** (montagem do vídeo, movimento de câmera, mixagem da música, legendas queimadas e recorte das thumbnails): `sudo apt install ffmpeg`
- **Fonte Noto Sans Bold** para as legendas (já vem com o pacote de fontes do Ubuntu): `sudo apt install fonts-noto-core`
- Chave da Gemini API e nomes dos modelos (ver abaixo)

## Rodar
```bash
pnpm install
cp .env.example apps/api/.env          # preencha GEMINI_* e FISH_*
echo 'NEXT_PUBLIC_API_URL=http://localhost:3001' > apps/web/.env.local
pnpm db:migrate                         # aplica o schema (se pedir nome: midia-das-cenas)
pnpm db:seed                            # cria o usuário local do MVP
pnpm dev                                # web em :3000, API em :3001 (Swagger em /docs)
```
Teste rápido: `curl http://localhost:3001/health` deve responder `{"status":"ok",...}`.
Reinicie `pnpm dev` sempre que mudar o `.env` ou o pacote `shared`.

## Variáveis da IA (apps/api/.env)

**Gemini** (títulos, roteiro, tags, textos de thumbnail e descrição; imagens das cenas/thumbnails):

| Variável | Para quê |
| :-- | :-- |
| `GEMINI_API_KEY` | chave do Google AI Studio (só no backend) |
| `GEMINI_MODEL_TEXT` | títulos, roteiro, tags, textos de thumbnail e descrição |
| `GEMINI_MODEL_IMAGE` | imagens das cenas e thumbnails (ex.: `gemini-3.1-flash-image`) |

Use os nomes de modelo exatamente como aparecem em `ai.google.dev/gemini-api/docs/models`.
Os modelos de imagem **não** estão inclusos no free tier: habilite billing no Google AI Studio para usá-los. Modelos `imagen-*` não são compatíveis com o endpoint `generateContent` usado pelo app.

**Fish Audio** (narração):

| Variável | Para quê |
| :-- | :-- |
| `FISH_API_KEY` | chave da Fish Audio |
| `FISH_VOICE_ID` | id da voz usada em todas as cenas |
| `FISH_MODEL_TTS` | modelo de TTS (padrão `s2.1-pro-free`) |

A Fish Audio é um TTS: o texto do roteiro é lido literalmente. O app usa as marcações `[calm]` e
`[break]` do modelo S2 para deixar a leitura mais natural, com pausas curtas depois das vírgulas e
no fim das frases (a opção **Narração mais humana** fica ligada por padrão na etapa 4).

## As 9 etapas
1. **Definições:** idioma (**Português do Brasil** ou **English**), formato (longo ou Shorts), tema, público, duração e voz, com salvamento automático.
2. **Títulos:** 10 alternativas com nota; editar e escolher.
3. **Roteiro:** cenas com texto, duração e descrição visual; editar, reordenar, apagar, adicionar e refazer cena.
4. **Narração:** voz fixa em todas as cenas, opção **Narração mais humana** (pausas e respiro), amostra de voz, player por cena e refazer individual.
5. **Imagens:** guia de estilo único, uma imagem por cena, copiar prompt (Google Flow), **exportar todos os prompts em um .md** e enviar imagem própria. Cada prompt traz a narração da cena e regras de fidelidade: as pessoas/povos citados aparecem como protagonistas, nunca uma paisagem vazia.
6. **Tags:** 15 a 25 tags, limite de 500 caracteres, edição manual.
7. **Thumbnails:** 2 variações 1280×720 com até 4 palavras; escolher, editar texto, refazer e baixar.
8. **Descrição:** gancho, resumo, capítulos com os tempos reais das cenas, chamada para se inscrever e hashtags.
9. **Vídeo:** prévia no navegador com o movimento escolhido, legendas sincronizadas, música de fundo (upload ou biblioteca local), MP4 (H.264 + AAC) montado no servidor e pacote ZIP (imagens, áudios, música, .srt, tempos).

Gerações longas (narração, imagens, thumbnails, vídeo) rodam em uma fila no servidor, com no máximo 2 ao mesmo tempo, progresso na tela e "Tentar de novo" em caso de erro. Dá para fechar a aba durante a geração.

## Idioma do vídeo

Na etapa 1, **Idioma do vídeo** define o idioma de todo o conteúdo gerado:

- **Português (Brasil)** (padrão) ou **English** — a escolha fica salva no projeto e aparece no card da
  home e no resumo da etapa 9.
- Vale para títulos, roteiro, narração (incluindo a normalização de números e a amostra de voz),
  tags, textos das thumbnails, capítulos e descrição.
- Mudar o idioma depois de gerar **não** refaz os textos já criados: use os botões de gerar/refazer de
  cada etapa para produzir o conteúdo no novo idioma.

## Narração mais humana

Na etapa 4, a opção **Narração mais humana** (ligada por padrão) deixa a leitura menos robótica:

- Insere `[calm]` no início e `[break]` depois das vírgulas e no fim das frases — marcações que o
  modelo S2 da Fish Audio entende como tom calmo e pausas curtas (o texto limpo continua nas legendas).
- Diminui a velocidade para 97% (`prosody.speed`), sem mudar a voz.
- Vale para as próximas narrações e para a amostra de voz; use **Refazer todas** para ouvir as cenas
  antigas com a nova configuração. O ajuste fica salvo no projeto.

## Prompts das imagens (.md)

Na etapa 5, o botão **Exportar prompts (.md)** baixa um arquivo markdown com:

- o guia de estilo, a proporção e a lista de todas as cenas na ordem;
- o prompt completo de cada imagem dentro de um bloco de código;
- o nome de arquivo sugerido (`cena-001.png`, `cena-002.png`…), o mesmo usado no ZIP;
- uma prévia das imagens já geradas, quando a API estiver rodando.

Use o arquivo para gerar as imagens no Google Flow/Nano Banana e salve cada uma com o nome da cena antes
de enviar na etapa 5.

## Movimento de câmera nas imagens

Na etapa 9, o card **Movimento de câmera nas imagens** aplica um efeito "Ken Burns" na montagem:

| Opção | O que faz |
| :-- | :-- |
| Imagem parada | Mantém o vídeo como era antes |
| Zoom de aproximação / afastamento | Aproxima ou afasta devagar |
| Panorâmica à esquerda/direita/cima/baixo | Desliza a câmera pela imagem |
| Rotação suave | Gira levemente para os lados |
| Deslocamento 3D | Junta zoom, deslocamento e rotação (sensação de profundidade) |
| Alternado (recomendado) | Varia o efeito a cada cena para não ficar repetitivo |

A prévia do seletor e o player usam CSS; o MP4 reproduz o mesmo movimento com filtros do FFmpeg
(`zoompan`, `crop` e `rotate`), com sobra de imagem para não aparecer borda. A escolha fica salva no
projeto e vale para a próxima montagem.

## Legendas sincronizadas

Na etapa 9, o card **Legendas sincronizadas** liga e desliga a legenda queimada no MP4 (o padrão é
ligada; a escolha fica salva no projeto):

- Texto da narração em **negrito** (Noto Sans Bold), dentro de uma **caixa escura semitransparente**
  atrás do texto, e **cada palavra destacada em lilás** no momento em que é falada (karaokê do libass).
- **Tamanho da fonte ajustável** de 60% a 160% (100% é o recomendado), com prévia na hora; a escolha
  fica salva no projeto e vale para a próxima montagem.
- A prévia do player no navegador imita o resultado; o MP4 usa os mesmos tempos.

Como o TTS devolve só o WAV (sem marcação de palavras), o tempo de cada palavra é estimado pelas
sílabas e pelas pausas de pontuação. O FFmpeg roda `silencedetect` em cada áudio e encaixa as trocas de
frase no meio das pausas reais, então o destaque acompanha a narração. O ZIP continua trazendo
`legendas.srt` com os mesmos tempos, mesmo com as legendas desligadas no vídeo.

A queima acontece depois da música, em uma última passada de vídeo (reencode H.264, áudio copiado), por
isso o vídeo final pode levar um pouco mais de tempo para ficar pronto.

## Música de fundo

Na etapa 9, o card **Música de fundo** permite:

- **Enviar uma música própria** (MP3, M4A, WAV, OGG ou FLAC, até 30 MB).
- **Escolher da biblioteca local** de músicas livres em `storage/musicas` (ou na pasta definida em
  `MUSIC_LIBRARY_DIR`). Crie um `musicas.json` nessa pasta para definir nome, artista, licença e crédito
  de cada faixa; sem ele, o app usa o nome do arquivo.
- Ajustar o **volume** (padrão 20%), **abaixar a música sob a narração** e editar os **créditos** para
  colar na descrição do YouTube.

Na montagem, a música entra depois do vídeo concatenado: repete se for mais curta que o vídeo, faz fade
no início/fim e é mixada com a narração. O MP4 final fica com H.264 + AAC e o ZIP inclui a música e um
`musica.txt` com os créditos.

> A Biblioteca de Áudio do YouTube é gratuita para criadores, mas **não tem API pública** para o app
> baixar as faixas. Baixe o arquivo em <https://www.youtube.com/audiolibrary> e coloque-o em
> `storage/musicas` ou envie pelo card. Algumas faixas exigem atribuição: confira a licença de cada uma e
> cole o crédito no campo de créditos.

## Estrutura
```
apps/web        Next.js: telas das 9 etapas
apps/api        NestJS: projetos, títulos, roteiro, narração, imagens, tags, thumbnails, descrição, música, exportação, fila de jobs
packages/shared tipos e schemas Zod usados pelos dois lados
storage/        arquivos gerados (imagens, áudios, thumbnails, vídeo)
storage/musicas músicas livres para a biblioteca local (opcional, com musicas.json)
```

## Migrar para o Supabase
1. No `schema.prisma`, troque `provider = "sqlite"` por `"postgresql"`.
2. Aponte `DATABASE_URL` para o Postgres do Supabase e rode as migrations de novo.
3. Implemente `SupabaseStorageDriver` (interface em `storage.service.ts`) e use `STORAGE_DRIVER=supabase`.
4. Adicione login (Supabase Auth) usando a coluna `userId` que já existe em `Project`.

## Limitações conhecidas
- Sem login: usuário único local.
- Mudar título ou roteiro não marca tags, thumbnails e descrição como desatualizadas (narração e imagens são marcadas).
- Mudar o efeito de câmera, as legendas ou a música não avisa que o MP4 está desatualizado; basta montar de novo.
- O MP4 é montado em um único processo no servidor, sem exportar em partes; vídeos de 20 minutos levam alguns minutos e usam bastante memória.
- A biblioteca de músicas lê uma pasta local: ao migrar para o Supabase, as faixas precisam ser enviadas pelo card (o upload próprio já usa o storage).
- A Biblioteca de Áudio do YouTube não tem API pública; o download da faixa é manual.
- Uma única voz (configurada por `FISH_VOICE_ID`), sem seletor.
- Modelos de imagem às vezes erram o texto escrito na thumbnail; use Refazer ou edite o texto.
- Teste A/B real de CTR e publicação direta no YouTube ficam para uma fase seguinte.

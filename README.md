# YouStudio — Criador de Vídeos YouTube

# Desbloquear porta
- fuser -k 3001/tcp

App web fullstack (MVP): do título ao vídeo pronto para o YouTube, em 9 etapas.

- **Web:** Next.js (App Router) + Tailwind CSS + shadcn/ui, tema "Studio Red Stream"
- **API:** NestJS + Prisma
- **Banco:** SQLite no MVP, pronto para Supabase (Postgres)
- **Arquivos:** `StorageService` com driver local, interface pronta para Supabase Storage
- **IA:** Gemini (texto e imagem) + Fish Audio (narração/TTS), sempre chamada pelo backend

## Requisitos
- Node 20+ e pnpm 9+ (`sudo npm install -g pnpm@9`)
- **FFmpeg 5+** (montagem do vídeo, movimento de câmera, mixagem da música, legendas queimadas e recorte das thumbnails): `sudo apt install ffmpeg`
- **Fonte Noto Sans** (normal, negrito e itálico) para as legendas (já vem com o pacote de fontes do Ubuntu): `sudo apt install fonts-noto-core`
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
1. **Definições:** idioma (**Português do Brasil** ou **English**), formato (longo ou Shorts), tema com contexto de 3 a 4 linhas, público, duração (até 30 minutos) e voz, com salvamento automático. O botão **Salvar e gerar títulos** já cria as 10 alternativas ao abrir a etapa 2.
2. **Títulos:** 10 alternativas com nota; editar e escolher.
3. **Roteiro:** cenas com texto, duração, descrição visual, sugestão de movimento de câmera, **revisão editorial** (classificação, apontamentos com trecho/problema/explicação/sugestão/fonte e aceitar/rejeitar individual) e **referências** retornadas pelo roteiro. Editar, reordenar, apagar, adicionar e refazer cena, com **download do roteiro em Markdown** (`.md`) para revisar ou gravar fora do app.
4. **Narração:** voz fixa em todas as cenas, **velocidade de 85% a 110%**, **dicionário de pronúncia**, opção **Narração mais humana**, amostra de voz, player por cena, refazer individual, **versões para comparar**, **aprovação por cena** e ajuste da duração planejada ao áudio real.
5. **Imagens:** guia de estilo único, uma imagem por cena, copiar prompt (Google Flow), **exportar todos os prompts em um .md** (completo ou no formato enxuto `prompt-criar_img.md`), **enviar uma pasta inteira de imagens** (o número em `cena-001...` define a cena), enviar imagem própria, **verificar correspondência entre narração e imagem** e **mapas/linhas do tempo** gerados por IA. Cada prompt traz a narração da cena e regras de fidelidade: as pessoas/povos citados aparecem como protagonistas, nunca uma paisagem vazia.
6. **Tags:** 20 a 25 tags, limite de 500 caracteres, edição manual.
7. **Thumbnails:** 2 variações 1280×720 com até 10 palavras; escolher, editar texto, refazer e baixar.
8. **Descrição:** gancho, resumo, capítulos a cada ~3 minutos cobrindo o vídeo inteiro (no início de cenas reais), chamada para se inscrever e hashtags.
9. **Vídeo:** prévia no navegador com o movimento escolhido, legendas sincronizadas (posição, fonte, cor e verificação de legibilidade), música de fundo (upload ou biblioteca local), **análise de áudio e prévia da mixagem**, **checklist de revisão final**, MP4 (H.264 + AAC) montado no servidor e pacote ZIP reimportável (imagens, áudios, música, .srt, tempos, elementos visuais e `projeto.json`).

Gerações longas (narração, thumbnails e vídeo) rodam em uma fila no servidor, com no máximo 2 ao mesmo tempo, progresso na tela e "Tentar de novo" em caso de erro. Dá para fechar a aba durante a geração. As imagens das cenas são enviadas manualmente na etapa 5.

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

O card também permite ajustar a **velocidade** (85% a 110%) e preencher o **dicionário de pronúncia**
(uma regra por linha, `como está = como se fala`). O ajuste entra apenas no texto enviado ao TTS —
siglas, nomes próprios e números — e o roteiro continua intacto. Cada nova geração guarda uma
**versão** do áudio: use **Versões** no card da cena para ouvir as anteriores e escolher qual fica.
A cena pode ser **aprovada individualmente**; ao continuar, a etapa aprova todas as que já têm áudio
atualizado.

> A velocidade e a pronúncia dependem dos parâmetros aceitos pelo modelo de TTS configurado. As
> marcações `[calm]`/`[break]` são específicas do modelo S2 da Fish Audio; em outro modelo, a opção
> **Narração mais humana** continua enviando a velocidade, mas as marcações podem ser lidas ou ignoradas.

## Revisão editorial e referências

Na etapa 3, o card **Revisão editorial** roda uma análise do roteiro inteiro e devolve uma
classificação: **Aprovado**, **Aprovado com ressalvas** ou **Necessita de correção**. Para cada
problema, são apresentados:

- trecho original;
- tipo (precisão histórica, geográfica, científica, fonte, contradição, generalização ou contexto);
- problema, explicação e sugestão de correção;
- fonte indicada e grau de confiança (**alta**, **média**, **baixa** ou **NÃO VERIFICADA**).

A IA é instruída a não inventar fontes nem tratar informação incerta como fato. Quando o modelo não
consegue verificar, o apontamento aparece como **NÃO VERIFICADA**. Você **aceita ou rejeita cada
sugestão individualmente**: ao aceitar, o trecho é substituído na cena e a narração/imagem ficam
marcadas como desatualizadas; ao rejeitar, o texto não muda. Enquanto houver apontamentos pendentes,
a etapa fica bloqueada — o botão **Continuar sem concluir a revisão** libera a etapa com confirmação,
mantendo os apontamentos registrados.

As **referências** retornadas pelo roteiro ficam listadas abaixo do card. Elas são o que o modelo
declarou ter consultado: o app não acessa nem valida o conteúdo desses links, então confirme cada
fonte antes de publicar. A revisão depende do modelo de texto configurado em `GEMINI_MODEL_TEXT`.

## Verificação imagem × narração

Na etapa 5, o botão **Verificar correspondência** envia a imagem de cada cena e o texto narrado ao
modelo de visão (Gemini) e registra um alerta no card quando a imagem não representa o conteúdo — por
exemplo, um mapa atual usado para falar de uma divisão territorial antiga, ou uma espécie diferente da
citada. Imagens **idênticas** (mesmo arquivo, detectado por SHA-256) também aparecem no checklist
final. O alerta é apagado quando a imagem da cena é trocada.

> A verificação usa `GEMINI_MODEL_TEXT` com entrada de imagem. Se o modelo configurado não aceitar
> imagens ou a cota estiver esgotada, o job falha com a mensagem da API e o alerta anterior é mantido.

## Mapas e linhas do tempo

Ainda na etapa 5, o card **Mapas e linhas do tempo** cria elementos visuais explicativos:

- escolha do tipo (**mapa histórico** ou **linha do tempo**), cena (opcional), título, período e
  descrição do que deve aparecer;
- geração da imagem pelo modelo de imagem do Gemini, com o período e o estilo visual do projeto no
  prompt (para não usar mapas atuais em contextos históricos diferentes);
- editar a descrição, copiar o prompt para gerar manualmente, refazer, enviar uma imagem própria ou
  remover.

Na montagem do MP4, o elemento da cena aparece como inserção no canto inferior direito, ocupando 62%
da largura. O ZIP inclui a pasta `elementos-visuais/`.

## Prompts das imagens (.md)

Na etapa 5, o botão **Exportar prompts (.md)** baixa um arquivo markdown com:

- o guia de estilo, a proporção e a lista de todas as cenas na ordem;
- o prompt completo de cada imagem dentro de um bloco de código;
- o nome de arquivo sugerido (`cena-001.png`, `cena-002.png`…), o mesmo usado no ZIP;
- uma prévia das imagens já geradas, quando a API estiver rodando.

Use o arquivo para gerar as imagens no Google Flow/Nano Banana e salve cada uma com o nome da cena antes
de enviar na etapa 5.

O botão **Exportar prompt IMG (.md)** baixa o `prompt-criar_img.md`, uma versão enxuta no formato:

```text
Observação: Criar as imagens e renomear referente a cena que ela pertence.
Proporção: 16:9
Estilo visual: ...

Cenas 1 a 10
Arquivo sugerido: cena-001.png
Descrição visual: ...

Arquivo sugerido: cena-002.png
Descrição visual: ...
```

As cenas são agrupadas de 10 em 10 e cada bloco traz apenas o arquivo sugerido e a descrição visual,
sem o prompt completo — útil para colar em ferramentas externas de geração de imagem.

Na mesma tela, o botão **Enviar pasta de imagens** permite escolher uma pasta inteira. O número no
nome do arquivo define a cena: `cena-001.png`, `cena-001.png_057e23b3.jpg` e `001.png` vão para a
Cena 1, e assim por diante. O envio mostra o progresso e avisa quais arquivos foram ignorados
(formato, tamanho ou cena não encontrada).

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

- Texto da narração no **traço escolhido** (Normal, Negrito ou Itálico, com Noto Sans como fonte padrão),
  dentro de uma **caixa escura semitransparente** atrás do texto, e **cada palavra destacada** na cor
  escolhida no momento em que é falada (karaokê do libass).
- **Tamanho da fonte ajustável** de 60% a 160% (100% é o recomendado), com prévia na hora.
- **Posição** na parte de baixo (padrão), no meio ou no topo, **família da fonte** e **cor do destaque**;
  a prévia do player acompanha essas escolhas.
- **Verificação de legibilidade**: uma análise com as mesmas regras da queima aponta palavras maiores
  que a linha (risco de corte) e cenas com muitos blocos ou blocos rápidos demais.
- As escolhas ficam salvas no projeto e valem para a próxima montagem.

> A fonte precisa estar instalada no servidor. O padrão é **Noto Sans** (`fonts-noto-core` no Ubuntu);
> se o nome não existir, o libass substitui pela fonte padrão e a prévia do navegador pode não
> corresponder exatamente ao MP4.

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

## Análise de áudio e revisão final

Na etapa 9, o card **Revisão final e áudio** reúne as verificações feitas sobre os arquivos reais do
projeto (depende do FFmpeg instalado):

- **Lista de verificação** com 17 itens: roteiro aprovado, informações verificadas, afirmações sem
  fonte, imagens presentes e correspondentes, imagens repetidas, narração completa, legendas
  sincronizadas e legíveis, música equilibrada, cenas sem áudio, duração, resolução, formato 16:9,
  exportação e qualidade de áudio. Cada item aparece como **OK**, **Alerta**, **Erro** ou **Pendente**.
  Apenas narração ou imagem faltando impedem a exportação; os demais problemas geram alerta.
- **Análise de áudio** mede, por cena e no conjunto, o loudness integrado (LUFS), o true peak, o maior
  silêncio contínuo, a diferença de volume entre cenas e o equilíbrio com a música (considerando volume
  e ducking do projeto).
- **Prévia da mixagem**: junta a narração e a música com os ajustes do projeto nos primeiros 60
  segundos, para conferir o equilíbrio antes de montar o MP4.

As referências iniciais são **-16 LUFS ±2**, true peak **até -1 dBTP**, silêncio contínuo **até 2,5 s**,
diferença entre cenas **até 4 LU** e música **pelo menos 6 dB abaixo da voz**. São referências
ajustáveis em `AUDIO_REFERENCIA` (`packages/shared/src/index.ts`), não regras rígidas — o app mede e
alerta, sem alterar o áudio automaticamente.

## Exportar e importar projeto

Na etapa 9, **Baixar projeto (.zip)** gera um pacote que pode ser importado de volta em outra máquina
ou depois de reinstalar o app. O ZIP mantém o formato de entrega (imagens, áudios, versões de áudio,
elementos visuais, legendas, tempos, música, thumbnails, título, tags e descrição) e acrescenta um
`projeto.json` na raiz:

- `schemaVersion` e `app` para o importador saber o que está lendo;
- definições do projeto (tema, público, formato, idioma, voz, estilo visual, legendas, efeito de câmera);
- títulos sugeridos, roteiro completo, status editorial, fontes e revisão editorial com os problemas;
- tags, capítulos, thumbnails (texto e qual foi escolhida), elementos visuais e metadados da música.

**Nada de segredo vai no pacote:** a tabela `Setting`, o `.env` e as chaves de API ficam só no servidor.

Para importar, use **Importar projeto (.zip)** na tela inicial (cabeçalho ou estado vazio). O app:

1. envia o ZIP para `POST /projects/import/preview` e mostra um resumo (cenas, áudios, imagens, versões,
   thumbnails, tags, capítulos, música), a etapa em que o projeto continua e eventuais avisos;
2. só grava depois da confirmação, em `POST /projects/import`, sempre criando um **projeto novo**;
3. grava os arquivos com chaves novas (`projects/<novoId>/...`), sem confiar nos nomes do ZIP;
4. recalcula o status de cada cena pelo arquivo que realmente existe e escolhe a etapa pelo conteúdo;
5. redireciona para a etapa retomada.

O limite do upload é `IMPORT_MAX_MB` (padrão **500**). ZIPs antigos, sem `projeto.json`, entram em modo
de recuperação parcial a partir de `tempos.json`, `titulo.txt`, `tags.txt`, `descricao.txt`, `imagens/`,
`audios/`, `thumbnails/` e `musica/`.

### Segurança do importador

O diretório central do ZIP é validado antes de qualquer escrita: caminhos com `..`, absolutos ou com
barra invertida, links simbólicos, ZIPs com senha, compressão não suportada, extensões fora da lista,
mais de 5.000 entradas, arquivo acima de 128 MB, conteúdo descompactado acima de 2 GB e taxa de
compressão suspeita (bomba) são recusados com mensagem em português. O `projeto.json` é validado pelo
mesmo schema Zod do export; um `schemaVersion` mais novo que o app é recusado com pedido de atualização.
Se algo falhar no meio, o prefixo `projects/<novoId>` é apagado e nenhum projeto fica pela metade.

Teste de fumaça (não faz parte do build):
```bash
cd apps/api
DATABASE_URL=file:./dev.db npx ts-node -P tsconfig.json src/import/import.smoke.ts
```

## Estrutura
```
apps/web        Next.js: telas das 9 etapas
apps/api        NestJS: projetos, títulos, roteiro, editorial, narração, imagens, elementos visuais, tags, thumbnails, descrição, música, qualidade, exportação, importação, fila de jobs
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
- O MP4 é montado em um único processo no servidor, sem exportar em partes; vídeos de 30 minutos levam alguns minutos e usam bastante memória.
- A importação não restaura o MP4 montado nem a fila de jobs: o vídeo precisa ser montado de novo e as tarefas pendentes são recriadas ao usar cada etapa.
- Importar sempre cria um projeto novo (não sobrescreve nem mescla com um existente) e a etapa retomada nunca é maior do que o conteúdo do pacote sustenta.
- Pacotes antigos (sem `projeto.json`) recuperam só o que o ZIP de entrega trazia: definições, títulos alternativos, prompts e revisão editorial não voltam.
- A biblioteca de músicas lê uma pasta local: ao migrar para o Supabase, as faixas precisam ser enviadas pelo card (o upload próprio já usa o storage).
- A Biblioteca de Áudio do YouTube não tem API pública; o download da faixa é manual.
- Uma única voz (configurada por `FISH_VOICE_ID`), sem seletor.
- Modelos de imagem às vezes erram o texto escrito na thumbnail; use Refazer ou edite o texto.
- A revisão editorial, a verificação de imagens e a geração de mapas dependem das cotas e da
  disponibilidade dos modelos do Gemini; erros de cota/limite aparecem no card e podem ser tentados de novo.
- A revisão editorial verifica o texto com o conhecimento do modelo e as fontes que ele declara: não é
  uma auditoria bibliográfica automática. Confirme as referências antes de publicar.
- A prévia da mixagem cobre os primeiros 60 segundos; a montagem final aplica os mesmos ajustes no vídeo inteiro.
- Teste A/B real de CTR e publicação direta no YouTube ficam para uma fase seguinte.

# CLAUDE.md — Laser Type

> Jogo de digitação arcade: palavras caem do céu, um canhão a laser acerta letra por letra e destrói as palavras.
> Este arquivo é a fonte de verdade do projeto. Leia antes de qualquer tarefa e mantenha-o atualizado ao concluir fases.

---

## 1. Visão do jogo

- Palavras surgem no topo e descem em direção a uma **linha de perímetro** na parte inferior.
- Um **canhão fixo no centro inferior** dispara um laser na palavra travada a cada letra correta digitada.
- A **primeira letra digitada trava o alvo** (prioridade: palavra mais próxima do perímetro que começa com essa letra).
- Ao completar a palavra, ela **explode** com animação (partículas, flash, leve tremor de tela).
- Palavra que cruza o perímetro tira **1 HP do escudo** (padrão: 3 HP). Escudo zerado = fim da partida.
- Ao final: tela **Mission Report** com nota, estatísticas e moedas ganhas.
- Público: desktop primeiro (teclado físico). Mobile é secundário (input invisível para abrir o teclado).
- **Arte 100% original.** Não usar personagens, wallpapers ou artes de terceiros. Fundos são gerados proceduralmente no canvas.

---

## 2. Stack

| Camada | Tecnologia |
|---|---|
| Build | Vite + TypeScript (strict) |
| Jogo | Canvas 2D puro (sem engine) |
| HUD / menus / loja | HTML + CSS sobre o canvas (sem framework de UI) |
| Áudio | Web Audio API — efeitos sonoros **sintetizados proceduralmente em runtime** (osciladores + ruído filtrado), sem arquivos de áudio |
| Backend | Firebase: Auth (anônimo + Google), Firestore (SDK *lite*) e App Check (reCAPTCHA v3), carregados sob demanda só quando há config |
| Admin | `firebase-admin` (devDependency) só em `scripts/seed-shop.ts`, rodado com o TypeScript nativo do Node (sem build) |
| Deploy | GitHub Actions → GitHub Pages |
| Testes | Vitest para lógica pura (pontuação, economia, mira, spawn) |

**Não adicionar dependências novas sem perguntar.** Permitidas por padrão: `vite`, `typescript`, `vitest`, `firebase`, `firebase-admin` (só em `scripts/`).

---

## 3. Comandos

```bash
npm install
npm run dev        # servidor local
npm run build      # build de produção em dist/
npm run preview    # testar o build
npm run test       # vitest
npm run typecheck  # tsc --noEmit (app) + tsc --noEmit -p scripts (scripts Node)
npm run seed:shop  # grava shop/{id} e shop/_config no Firestore (ver §9 "Loja no Firestore"); -- --dry-run só mostra
npm run share:images  # regera public/og-image.jpg e public/apple-touch-icon.png (ver §10 "Página e compartilhamento")
npm run share:images -- --cannons [pasta]  # pranchas dos 4 canhões (1×, 2×, zoom, sequência do tiro, energia) para revisar a arte
```

Antes de dar uma tarefa como concluída: `npm run typecheck && npm run test && npm run build` devem passar.

---

## 4. Estrutura de pastas

```
src/
  main.ts                 # bootstrap (carrega configurações, áudio, App)
  settings/               # modelo puro das configurações + load/save no localStorage
  config.ts               # constantes de balanceamento (velocidades, HP, preços base)
  game/
    Game.ts               # game loop (requestAnimationFrame, delta time fixo)
    state.ts              # estado da partida
    spawner.ts            # geração de palavras, ondas e bosses (aceita seed)
    boss.ts               # regras puras do boss (quando vem, frase, velocidade, bônus)
    testing/typist.ts     # digitador simulado dos testes de balanceamento (o jogo não importa)
    targeting.ts          # lógica de mira/travamento
    input.ts              # captura de teclado, normalização de acentos
    scoring.ts            # pontuação, combo, nota final
    entities/             # Word, Boss, Cannon, Laser, Particle
    effects/              # partículas, screen shake, flash
    render/               # renderer.ts + funções de desenho parametrizadas por cosmético
                          # (drawCannon, drawWord, drawBoss, drawFx, drawBackground) e Skin (cosméticos → sprites/cores)
                          # bossLayout.ts: geometria pura da placa do boss
      cannon/             # camadas do canhão: model (pose e regras puras), kit (peças comuns),
                          # platforms, barrels, heads, muzzle; drawCannon.ts monta tudo (§7 "Canhão")
  modes/                  # survival, timeAttack, daily, zen; daily.ts: seed e dia do Desafio Diário
  words/                  # listas pt-BR.json, en.json (por dificuldade) e bosses.*.json (frases por tamanho)
  cosmetics/
    types.ts              # categorias, raridades, params tipados por categoria
    catalog.ts            # catálogo de itens (dados puros) + DISCOUNT_ORDER
    equip.ts              # resolve o que está equipado (com fallback para o padrão)
  economy/                # lógica pura (sem DOM) + os repositórios (onde o inventário mora)
    types.ts              # Inventory (espelha users/{uid}), ofertas, erros de compra, EconomyChange, SyncConfig
    rewards.ts            # moedas por partida (missões, streak, XP: só os campos por enquanto)
    dailyBonus.ts         # bônus do Desafio Diário (puro: tabela, dias a acertar)
    DailyBonusCollector.ts # acha a posição final nos dias fechados e entrega o bônus ao repositório
    shop.ts               # loja rotativa (dia de jogo, DISCOUNT_ORDER, seed = data)
    inventory.ts          # posse/equipamento/compra (puro: checkPurchase, applyPurchase, parseInventory)
    repository.ts         # interface InventoryRepository (uma operação por tipo de escrita) + versão localStorage (builds offline)
    firestoreRepository.ts # FirestoreInventoryRepository: users/{uid} + cache local, moedas pendentes, fila de escritas
    Economy.ts            # estado + repositório + listeners (a UI só fala com ele)
  firebase/
    app.ts                # config VITE_FIREBASE_* + carregamento sob demanda do SDK (null = offline)
    types.ts              # estado da conta, Board, ScoreFields, RankingConfig
    auth.ts               # AuthService: anônimo automático, vínculo Google por popup (backend atrás de interface)
    leaderboard.ts        # scores: id, documento, validação espelhando as regras, recorde, top 50
    profile.ts            # users/{uid}: campos de cada tipo de escrita (puros), leitura tolerante, UserBackend (transações)
    shopDocs.ts           # documentos da coleção shop (o que o seed grava), validados contra o catálogo
    rules.test.ts         # garante que firestore.rules e o cliente não divergem
  profile/
    nickname.ts           # apelido do ranking (validação, padrão "Piloto" + 4 dígitos)
  ui/                     # app.ts (troca de telas) + telas: menu, hud, combatLog, pause, report, settings, shop
                          # (+ shopPreview, shopModel, previewScript), ranking, account (selo), nicknameDialog, toast
  audio/                  # receitas de som (dados), planejamento puro e AudioEngine (Web Audio)
  utils/                  # rng com seed, math, pool, storage, day (dia de jogo: dayIndex/dayKey)
  styles/
  page.test.ts            # index.html: metadados, imagem de prévia e guarda de inicialização
public/
  music/  fonts/          # sem sfx/: efeitos sonoros são sintetizados em runtime
  favicon.svg             # canhão disparando numa placa de palavra (feito à mão)
  og-image.jpg  apple-touch-icon.png   # gerados por `npm run share:images`
  boot.css                # estilo do aviso de navegador sem suporte (copiado sem processar)
scripts/
  seed-shop.ts            # firebase-admin: grava shop/{id} e shop/_config a partir do catalog.ts
  share-images.ts         # serve share/ com o Vite, abre no Edge/Chrome headless e salva as imagens
  share/                  # cena da imagem de prévia e pranchas dos canhões, desenhadas com o renderer do jogo
  site.ts                 # URLs absolutas das tags de compartilhamento (usado pelo vite.config.ts)
  tsconfig.json           # tipos do Node para os scripts, vite.config.ts e share/ (o app não vê os globais do Node)
index.html                # metadados, Open Graph, <noscript> e guarda de inicialização (ES5)
firestore.rules           # CONTRATO do backend (ver §9)
.github/workflows/deploy.yml
```

---

## 5. Convenções de código

- TypeScript `strict`, sem `any`. Tipos compartilhados em arquivos `types.ts` de cada pasta.
- **Lógica separada de renderização.** `scoring`, `targeting`, `spawner`, `economy` são funções puras e testáveis, sem acesso ao DOM/canvas.
- Game loop com **timestep fixo** (60 updates/s) e render interpolado; nada de lógica dependente de FPS.
- Aleatoriedade sempre via `utils/rng.ts` (seedável) para o Desafio Diário ser idêntico para todos.
- Números de balanceamento ficam em `config.ts`, nunca soltos no código.
- Testes ficam ao lado do código (`*.test.ts`).
- Object pooling para partículas e lasers (evitar garbage collection durante a partida).
- Canvas com suporte a `devicePixelRatio` e redimensionamento.
- Nomes de código em inglês; textos da interface em pt-BR (com suporte a EN via arquivo de strings em `ui/i18n.ts`).
- Commits pequenos, mensagem no formato `feat: ...`, `fix: ...`, `chore: ...`.

---

## 6. Mecânicas

### Digitação e mira
- Entrada normalizada: minúsculas; acentos removidos por padrão (`ação` aceita `acao`). Opção "Acentos obrigatórios" nas configurações.
- Sem alvo travado: a tecla escolhe a palavra que começa com ela, mais próxima do perímetro.
- Com alvo travado: letra certa = tiro + letra acesa; letra errada = erro (zera combo, mantém o alvo).
- `Backspace` destrava o alvo (e zera o progresso daquela palavra). `Esc` pausa/retoma (com a partida pausada, `Enter` encerra). `Tab` reinicia. `Espaço` ativa o EMP (só com a barra cheia).
- Trocar de aba pausa a partida automaticamente.

### Sistemas
- **Combo:** cada palavra destruída digitando, sem nenhum erro enquanto estava travada, +1. Qualquer tecla errada (inclusive sem alvo) zera. Dano no escudo **não** zera. Multiplicador: 1x (0–4), 2x (5–14), 3x (15–29), 4x (30+). Lógica pura em `game/combo.ts` (reducer) e `game/scoring.ts`.
- **Escudo:** 3 HP (também o máximo). Palavra que cruza o perímetro = −1 HP.
- **EMP:** cada palavra destruída digitando carrega `5% × multiplicador` (20 palavras a 1x; bem menos com combo). Com 100%, `Espaço` destrói todas as palavras na tela por metade dos pontos, esvazia a barra e mantém o combo. Sem carga cheia = som de recusa.
- **Ondas** (`game/waves.ts`): cada onda tem uma **cota fixa** de palavras (8, +2 por onda, máx. 30); intervalo ×0,92, velocidade +7%, mais palavras difíceis e especiais a cada onda (com tetos em `config.ts`). Como a cota é fixa, a N-ésima palavra pertence sempre à mesma onda e a sequência depende só da seed. Survival/Diário/Zen: após a última palavra da onda, espera a tela limpar e dá 2,5 s de respiro com o anúncio "Onda N"; Time Attack emenda as ondas. O boss fecha as ondas 5, 10, 15… (ver "Boss").
- **Boss** (`game/boss.ts`, `CONFIG.boss`): a cada 5 ondas, com a tela limpa, uma frase grande entra com **3 s de alerta** e desce devagar. Nada mais cai enquanto ele está na tela; depois há 2 s de calma e a próxima onda. Vale nos modos com `waveBreak` (Survival, Diário, Zen); o Time Attack nunca chega à onda 5.
  - Digita-se palavra por palavra, **em ordem e sem espaços** (Espaço é o EMP); toda tecla vai para ele. Cada palavra é um segmento da vida e pontua como uma palavra comum (combo, altura, carga do EMP, abate). Erro zera o combo e mantém a palavra; `Backspace` recomeça a palavra atual. Durante o alerta as teclas não fazem nada (nem acerto nem erro) e o EMP é recusado sem gastar a carga.
  - EMP: destrói só a palavra atual, por metade dos pontos. Gelo também o desacelera.
  - Perímetro: **−2 HP** (Zen: escapa sem dano), conta como 1 perda; o combo fica. Com 2 HP ou menos, fim de partida.
  - Derrotar: 1.000 pontos, +500 por boss seguinte, até 2.500. O relatório mostra "Bosses derrotados" quando há algum.
  - Frases: 8 por tamanho e idioma (24–30, 32–39 e 40–48 letras; boss 1, 2, e 3 em diante), só letras minúsculas e espaços simples. Sorteio com rng **próprio** (`seed:boss:tamanho`): nunca altera a sequência de palavras de uma seed, e o N-ésimo boss é igual para todos no Diário.
  - Velocidade: `speedMultiplier da onda × preset de dificuldade / 30 s`.
  - **Balanceamento** (`bossBalance.test.ts`, digitador simulado com as regras reais): o boss pede de 30% a 55% da velocidade de quem chega até ele, em todas as dificuldades. No Fácil, um iniciante (14% de erros, 0,8 s para ler cada palavra) vence todas as frases a 20 / 37 / 64 / 77 WPM nos bosses 1 a 4, e só chega a eles com ~36 / 100 / 190 WPM (ao 4º, não chega). Para ver o 1º boss: ~26–30 WPM no Fácil, ~38–42 no Normal, ~52–65 no Difícil. Se um ajuste quebrar esse teste, o boss virou uma parede: mexer em `CONFIG.boss`, não nos números do teste.
- **Palavras especiais:** 💣 Bomba (destrói vizinhas), ❄️ Gelo (slow 3s), 🛡️ Escudo (+1 HP), ☠️ Blindada (digitar 2x).
  - Efeitos só disparam quando a palavra é destruída **digitando**; palavras pegas por bomba/EMP valem metade e não disparam efeito (sem reação em cadeia, EMP não cura).
  - Bomba: elipse de 0,2 largura × 0,22 altura do campo. Gelo: palavras e ritmo de spawn a 40% por 3 s (o relógio do Time Attack não desacelera). Escudo: +1 HP até o máximo. Blindada: 2 passadas, continua travada entre elas, letras contam em dobro na pontuação.
  - Visual: selo no canto da placa (bomba, floco, escudo, barras de blindagem) + cor da borda; blindada mostra uma placa extra atrás.

### Pontuação
```
pontos_palavra = letras × 10 × multiplicador_combo × bonus_altura
bonus_altura   = 1.5 se destruída na metade superior da tela, senão 1.0
```
- O multiplicador usa o combo **já contando** a palavra destruída (a 5ª palavra limpa já vale 2x).
- "Metade superior" = metade superior do campo (y normalizado < 0,5). `letras` soma as passadas (blindada conta 2×).
- Bomba/EMP: `pontos_palavra × 0,5`.
Nota final (S/A/B/C/D) combina precisão, WPM e % de palavras destruídas (fórmula em `scoring.ts`):
```
nota = 0.40 × precisão + 0.35 × min(1, WPM / 60) + 0.25 × defesa
precisão = letras certas / teclas digitadas
WPM      = (letras certas / 5) / minutos jogados (pausas não contam)
defesa   = destruídas / (destruídas + perdidas no perímetro)
S ≥ 0.90 · A ≥ 0.80 · B ≥ 0.65 · C ≥ 0.50 · senão D  (menos de 5 palavras destruídas = D)
```

### Dificuldade (escolhida no menu)
- Fácil / Normal / Difícil são presets (`CONFIG.difficulty`) aplicados ao spawn da onda 1; a curva das ondas continua igual por cima. Fácil: velocidade ×0,8, intervalo ×1,2, +15% de palavras fáceis. Difícil: velocidade ×1,25, intervalo ×0,85, −25% de palavras fáceis.
- A pontuação não muda com a dificuldade → o ranking (Fase 5) separa por modo, dificuldade **e** idioma das palavras. O Desafio Diário usa sempre Normal (`ModeRules.fixedDifficulty`): no menu a dificuldade fica travada e a escolha do jogador volta nos outros modos.

### Modos (`src/modes/`, dados puros)
- **Survival:** infinito até o escudo zerar.
- **Time Attack:** 60 s, maior pontuação.
- **Zen:** sem dano, para treinar (não vale ranking nem moedas cheias). Termina pela pausa (`Esc` → `Enter`).
- Modo, dificuldade e idioma são escolhidos no menu principal (e lembrados nas configurações).
- **Desafio Diário** (`modes/daily.ts`): regras do Survival, dificuldade fixa `normal`, seed `daily:YYYY-MM-DD` do `dayIndex()` de `utils/day.ts` (vira às 03:00 UTC = meia-noite de Brasília, o mesmo calendário da loja). Sequência idêntica para todos, o dia todo; `?seed=` não vale aqui. Um idioma por vez (o do menu): cada idioma é um desafio e um quadro próprios. Tentativas livres, vale o recorde.
  - O `day` fica preso à partida quando ela **começa** (`MatchState.day` → `MatchReport.day` → `MatchResult.day`; 0 nos outros modos). "Jogar de novo"/`Tab` resolvem a seed de novo: depois da virada, jogam o desafio novo.
  - Se o dia virou antes do envio, o resultado **não** é enviado (nem ao dia novo, que é outra sequência) e o relatório avisa. Se o servidor recusa o dia (data do aparelho errada), o aviso é outro.
  - Mudar listas de palavras, spawn ou ondas muda a sequência: um deploy no meio do dia troca o desafio de quem recarregar.

---

## 7. Direção de arte

- Tema base "Orbital Defense": espaço profundo, nebulosa procedural, estrelas em parallax, grade sci-fi sutil.
- Paleta (CSS variables em `styles/tokens.css` e espelhadas em `render/palette.ts`):
  - `--bg: #05070F`
  - `--primary: #22D3EE` (laser, foco, UI ativa)
  - `--danger: #FF2E88` (perímetro, dano)
  - `--combo: #FBBF24` (combo, moedas)
  - `--text: #E2E8F0`, `--muted: #64748B`
- Fontes: **Orbitron** (títulos/HUD), **JetBrains Mono** (palavras). Auto-hospedadas em `public/fonts/`.
- Efeitos: glow com `shadowBlur` + `globalCompositeOperation = 'lighter'`, partículas, screen shake leve, flash curto, recuo do canhão.
  - `shadowBlur` só em poucos elementos (laser, palavra travada, perímetro após dano) e multiplicado pelo DPR (o blur ignora a transformação). Partículas usam sprites de brilho pré-renderizados com `'lighter'`.
  - Aleatoriedade visual também via `utils/rng.ts` (seeds fixas por sistema: `fx`, `sfx`, starfield, nebulosa).
- Acessibilidade: opção "Reduzir efeitos", modo daltônico, volume separado música/efeitos.
  - "Reduzir efeitos" (tela de Configurações): sem screen shake, sem flash de tela, fundo parado (também nos menus) e metade das partículas. O pulso do perímetro continua (é o aviso de dano que substitui o flash). No canhão: sem respiração, pulso do anel, órbita e reflexos animados, sem faíscas nem fumaça; o recuo e o brilho da boca continuam (são o retorno do tiro). Na primeira visita, começa ligado se o sistema pede `prefers-reduced-motion`.

### Canhão (`render/drawCannon.ts` + `render/cannon/`)
- Desenhado em camadas, em Canvas 2D vetorial: plataforma → anel de energia → cano(s) → torre → núcleo de energia → efeitos da boca. Coordenadas locais ao pivô; a luz vem sempre de cima à esquerda (as partes que giram montam o caminho girado e preenchem com gradiente do mundo). Gradientes em cache por `Skin`; brilhos são sprites com `'lighter'`, sem `shadowBlur`. Custo medido: ~0,06–0,09 ms por quadro.
- **Mesmo tamanho para todos:** 60 px de largura (±`LAYOUT.baseRadius`) e a boca do cano a `LAYOUT.barrelLength` (52 px) do pivô, onde o laser nasce (o Gêmeo com os dois canos a ±4,5 px). A base desce até 16 px abaixo do pivô. `drawCannon.test.ts` desenha num contexto falso e confere a área, a boca, o recuo e que o contexto volta como estava.
- Parâmetros (`CannonParams`): `body` (`armored` | `heavy` | `crystal` | `orbital`), `barrel` (`single` | `twin` | `prism` | `rail`), `hull` (3 tons, escuro → claro), `edge`, `highlight`, `trim`, `opacity` (< 1 = translúcido). O anel e o núcleo usam sempre a cor do laser equipado; num erro de digitação ficam em `--danger`.
- Identidades: **Sentinela** (padrão) bunker de aço cinza-azulado com torre esférica, rebites, respiros e cano com aletas, cinta e freio de boca; **Gêmeo** base pesada com células de energia (as barras acendem com a energia), cabeça quadrada e dois canos que alternam os tiros (cada um recua sozinho); **Cristal** prismas translúcidos com facetas, reflexos e lascas, o núcleo aparece através da gema; **Halo** torre branca com visor, trilhos com bobinas e linha de energia, e um anel orbital inclinado com 3 nós girando (metade de trás atrás da torre).
- Movimento (`entities/Cannon.ts`): giro por mola criticamente amortecida (acelera e assenta sem passar do alvo); no tiro, a mira encaixa no alvo (feixe e cano alinhados), o cano recua e volta com suavização (`recoilKick`), a boca brilha ~0,12 s, com clarão, faíscas e fumaça curta (aleatoriedade por `hashUnit` com o número do tiro: repetível, sem alocar). Parado, as luzes "respiram".
- **Núcleo de energia:** `coreEnergy(multiplicador, carga do EMP)` vai de 0,2 (brasa) a 0,95; EMP pronto = 1, com ondas saindo do núcleo. Menus: 0,3. A prévia da loja carrega o núcleo conforme a palavra é atirada.
  - Modo daltônico e volume de música ficam para quando houver música/cosméticos de cor.

### Boss (`render/drawBoss.ts` + `render/bossLayout.ts`)
- Casco blindado em camadas (lâminas → coroa com o núcleo → casco → um encaixe por palavra), só com cores de jogo (`--danger`; a palavra atual com o contorno de alvo travado). Palavra destruída = buraco com rachaduras (`hashUnit`, repetível); o núcleo enfraquece com a vida. Frase em linhas equilibradas, sempre dentro do campo (fonte 1,25× a das palavras; 1× em campos < 520 px). `y` = borda **inferior** do casco.
- Cada palavra solta **fragmentos visuais** (letras e pedaços de casco que caem; não são ameaça). Derrota: o casco fica na tela tremendo e esquentando durante 6 explosões em cadeia e se desfaz numa explosão final (cores do cosmético, ondas até a tela toda). `Effects.wreck` + fila de efeitos com atraso.
- HUD: barra de vida segmentada (some durante o alerta), faixa de alerta, faixa de resultado, palavras e bônus no registro de combate. O alerta pulsa devagar (< 1 Hz) e nunca escurece; parado com "Reduzir efeitos" (`.is-reduced` na camada da UI) ou `prefers-reduced-motion`. Com "Reduzir efeitos" não há tremor nem flash na luta inteira.
- Sons: `bossAlert` (sirene de 3 s), `bossWord`, `bossDown`; a quebra do perímetro usa `breach` mais grave.
- Custo medido (Edge headless): +0,2 a 0,3 ms por quadro com o boss na tela.

### Configurações (`src/settings/`)
- Salvas no `localStorage` em `lasertype.settings.v1` a cada mudança: idioma (interface **e** palavras), volume dos efeitos, reduzir efeitos, acentos obrigatórios, último modo e última dificuldade do menu.
- Leitura tolerante (`parseSettings`): cada campo inválido/ausente volta ao padrão; storage indisponível (aba anônima, bloqueio) = padrões em memória, sem erro.

### Áudio (decisão da Fase 2)
- **Sem arquivos de efeitos sonoros:** cada som é uma *receita* de dados (`audio/recipes.ts`) com camadas de oscilador (`tone`: forma de onda, frequência, glide) e de ruído filtrado (`noise`: filtro, cutoff, sweep), cada uma com envelope ataque → release exponencial.
- `audio/plan.ts` (puro, testado) aplica pitch/jitter e cooldown; `audio/AudioEngine.ts` sintetiza com Web Audio (master gain → compressor). O `AudioContext` só é criado/retomado no primeiro gesto do usuário (tecla ou clique).
- O jogo depende só da interface `SoundPlayer`; eventos de jogo → sons em `Game.flushEvents`.
- Cosmético `soundPack` = outro conjunto de receitas (mesmo formato), sem arquivos.
- Música ainda não decidida (pasta `public/music/` mantida).

---

## 8. Economia e cosméticos

**Regra de ouro: cosméticos nunca dão vantagem de jogo.**

### Ganho de moedas
- Partida: `floor((min(floor(pontos / 100), 80) + bônus de nota) × fator do modo)`; bônus S +20, A +10, B +5, C/D 0; fator 1 (Survival, Time Attack, Diário) ou 0,25 (Zen). Máximo 100 por partida. Creditado uma vez, ao abrir o Mission Report (que mostra o detalhe e o saldo). Números em `CONFIG.economy`, lógica em `economy/rewards.ts`.
- Online, as moedas aparecem na hora e ficam **pendentes** até o servidor aceitar: cada escrita de recompensa leva no máximo 150 e espera 30 s desde a anterior (limites das regras, em `CONFIG.sync`); o resto vai nas escritas seguintes, sem perder nada (ver §9 "Sync de users/{uid}").
- Missões diárias (3 por dia, geradas pela data), streak de login, nível por XP. **Por enquanto só os campos existem** em `users/{uid}` (`xp`, `level`, `streak`, `lastLogin`, `stats`, criados com valores iniciais; de `stats` só `dailyDay` é atualizado); a lógica fica para depois.

### Bônus do Desafio Diário (`CONFIG.dailyBonus`, `economy/dailyBonus.ts`)
- Moedas pela posição **final**: 1º 150 · 2º 120 · 3º 100 · 4º–10º 70 · 11º–25º 40 · 26º–50º 20. Só no quadro **pt-BR** e a partir de 1.000 pontos (abrir e encerrar não paga). Todo valor cabe numa escrita de recompensa (≤ 150).
- Pago **depois que o dia fecha** (5 min de folga): durante o dia, o primeiro a jogar à meia-noite estaria sempre em 1º. O quadro de um dia fechado não muda mais (as regras só aceitam o dia atual). Durante o dia, o relatório e a aba "Diário" mostram a posição e a **previsão** ("+100 moedas se terminar assim").
- Posição = 1 + quantos têm score maior (`getCount`: 1 leitura, vale também fora do top 50); empates dividem a posição.
- `DailyBonusCollector` roda ao abrir, ao trocar de conta e ao voltar ao menu, só com conta Google: lê o score do jogador nos dias fechados ainda não acertados (até 7 para trás, do mais antigo ao mais novo, 1 leitura por dia) e para no primeiro erro, sem pular dia. Dia acertado não é relido (`dailySettled` no cache).
- Cada bônus é **uma escrita de recompensa só dele**, que grava também `stats.dailyDay` (último dia pago) na mesma transação: não paga duas vezes em dois dispositivos. Só entra no saldo quando o servidor confirma; aí sai o aviso (nunca por cima de uma partida). Builds offline jogam o desafio, mas sem ranking nem bônus.

### Dia de jogo (`utils/day.ts`)
- Um único calendário para a loja e o Desafio Diário: o dia vira às **03:00 UTC** (meia-noite de Brasília) para todos.
- `dayIndex = floor((epochMillis − 3 h) / 86 400 000)`; `dayKey()` = `YYYY-MM-DD` do dia de jogo (data UTC em que ele começa). Nunca recalcular datas por conta própria: usar estas funções.

### Raridades
| Raridade | Preço |
|---|---|
| Comum | 300 |
| Raro | 900 |
| Épico | 2.500 |
| Lendário | 6.000 |

### Categorias (`type` no catálogo)
`cannon`, `theme`, `laserColor`, `shotStyle`, `impact`, `explosion`, `wordBorder`, `reticle`, `comboAura`, `perimeter`, `font`, `soundPack`, `music`, `title`, `avatarFrame`, `victoryAnim`.
- Implementadas (Fase 4.5): `cannon`, `theme`, `laserColor`, `explosion`, `wordBorder` — 4 itens cada, o primeiro é o padrão grátis (preço 0, possuído por todos) e 3 estão à venda. Nova categoria = tipo em `cosmetics/types.ts` + itens + renderer.

### Item do catálogo
```ts
interface CosmeticItem<T extends CosmeticType> {
  id: string;              // ex: "cannon_crystal" (estável: vai para inventários e Firestore)
  type: T;
  name: { 'pt-BR': string; en: string }; // nome localizado fica no próprio dado
  rarity: 'common' | 'rare' | 'epic' | 'legendary';
  price: number | null;    // 0 = padrão (todos possuem), null = só por conquista
  unlock?: string;         // id da conquista, se aplicável
  set?: string;            // coleção
  params: CosmeticParams[T]; // tipados por categoria (cosmetics/types.ts), lidos pelos renderers
}
```
- Renderers recebem `params`; adicionar item novo = só adicionar dados (e incluir em `DISCOUNT_ORDER` se for vendável).
- Preço dos vendáveis = tabela de raridade (`CONFIG.economy.rarityPrice`).
- Cosméticos mudam só a aparência e mantêm as pistas de jogo: o tema muda só o fundo do canvas (não o HUD); a borda muda a forma e a cor das palavras normais, mas travada/especiais mantêm suas cores; o canhão tem sempre o mesmo tamanho (a boca do cano não muda) e o brilho do núcleo é igual em todos (mostra combo/EMP, não dá vantagem); dano/perímetro continuam em `--danger`.
- Itens de conquista não são compráveis (ex: Canhão Dourado ao atingir 100 WPM).

### Loja rotativa (`economy/shop.ts`)
- 4 itens por dia de jogo, iguais para todos; o item com desconto vem primeiro.
- **Item com desconto, sem rng** (para as regras do Firestore refazerem a conta):
  `discountedId = DISCOUNT_ORDER[dayIndex % DISCOUNT_ORDER.length]`, preço em aritmética inteira, exatamente como nas regras: `Math.floor(price * 7 / 100) * 10` (300→210, 900→630, 2.500→1.750, 6.000→4.200). Essa expressão fica **literal** em `discountedPrice` (é contrato, não balanceamento); `rules.test.ts` compara o texto com o das regras (`int(math.floor(base * 7 / 100)) * 10`).
  `DISCOUNT_ORDER` (em `cosmetics/catalog.ts`) lista todos os itens compráveis em ordem fixa, alternando categorias. As regras leem a mesma lista em `shop/_config.discountOrder` (gravada por `npm run seed:shop`). Mudar a lista (ou um preço) muda o desconto de todos os dias futuros: rodar o seed junto, senão as compras são recusadas.
- **Os outros 3** são sorteados com seed `shop:YYYY-MM-DD` (`dayKey`), excluindo o item com desconto e preferindo categorias que ainda não estão na loja.
- Compra só de itens da loja do dia, pelo preço do dia; em dois cliques (Comprar → Confirmar → "Comprando…"). Comprar não equipa. Uma compra por vez.
- Online a compra é uma **transação** no Firestore e só vale quando o servidor aceita (nada é cobrado antes). Se a loja que o jogador via é de outro dia, nada é enviado; se o servidor recusa (ex.: o dia virou no caminho e o preço mudou), a loja é **recarregada** e o jogador é avisado ("A loja virou o dia… Nada foi cobrado"). Outros avisos: sem conexão, moedas ainda sincronizando, item já comprado em outro dispositivo, saldo atualizado pelo servidor.
- Tela da loja: abas "Loja do dia" e "Inventário" (todas as categorias; equipar o que possui), contagem até a próxima rotação e **prévia ao vivo** do item selecionado (mini canvas com a cena roteirizada de `ui/previewScript.ts`, desenhada com as mesmas funções do jogo, por cima do que está equipado).

### Inventário
- `Inventory = { coins, owned, equipped, lastPurchase }` (mesmos campos de `users/{uid}`); `owned` guarda só compras (padrões são implícitos, nunca entram em `owned`); `equipped` sem a categoria = padrão.
- Leitura tolerante (`parseInventory`): moedas inválidas → 0, ids desconhecidos descartados, equipado precisa existir, ser da categoria e estar possuído.
- `InventoryRepository` (`economy/repository.ts`) tem **uma operação por tipo de escrita** (`reward`, `purchase`, `equip`, mais `load` e `subscribe`), porque as regras aceitam um só tipo de mudança por escrita; salvar o inventário inteiro não caberia nelas. Duas implementações:
  - **Build offline** (sem `VITE_FIREBASE_*`): `localInventoryRepository`, tudo no `localStorage` em `lasertype.inventory.v1`.
  - **Build online**: `FirestoreInventoryRepository` — a verdade é `users/{uid}`; o `localStorage` é só cache (§9). O progresso antigo de `lasertype.inventory.v1` (testes das fases offline) é ignorado, não migrado.
- `Economy` emite mudanças tipadas (`reward`, `purchase`, `equip` e `sync` = versão do servidor chegou: carga, outro dispositivo, troca de conta).

---

## 9. Firebase

### `firestore.rules` é o contrato
- O arquivo na raiz é a fonte da verdade do backend: **o cliente se adapta a ele, exatamente**. Mudar qualquer regra = perguntar antes.
- Só podem ser ajustados (avisando) as listas de identificadores (`mode`/`diff`/`lang`) para bater com os nomes do código e `maxPointsPerSecond`, calculado pelo máximo teórico de `scoring.ts`.
- `firebase/rules.test.ts` lê o arquivo e falha se divergir do cliente: listas, limites (WPM, duração, nome, precisão), `maxPointsPerSecond`, campos e id do documento, dia de jogo (03:00 UTC), fórmula do desconto, campos de cada escrita em `users/{uid}` (criação, recompensa, compra, equipar, perfil), limites da recompensa (150 / 30 s = `CONFIG.sync`) e os campos da coleção `shop` que o seed grava.
- Publicar: Console → Firestore Database → Regras → colar o arquivo → Publicar (o deploy não publica regras).

### Autenticação (`firebase/auth.ts`)
- Sem `VITE_FIREBASE_*` o SDK nem é baixado: o jogo funciona offline, sem conta nem ranking, sem erros.
- Login **anônimo** automático ao abrir o jogo (em segundo plano; o jogo nunca espera).
- "Entrar com Google" (menu, ranking e Mission Report) → `linkWithPopup(GoogleAuthProvider)` chamado **direto no clique** (sem redirect), depois `getIdToken(true)` para o token trazer a identidade `google.com` que as regras exigem.
- `auth/credential-already-in-use`: entra na conta Google existente com `GoogleAuthProvider.credentialFromError` + `signInWithCredential`, mantém o progresso dela e avisa: "Você entrou na sua conta Google existente. O progresso desta sessão anônima não foi transferido." Moedas e itens passam a ser os do `users/{uid}` da conta Google; os da sessão anônima ficam no documento (e no cache) dela.
- Vincular pela primeira vez (`linkWithPopup`) mantém o **mesmo uid**: o `users/{uid}` da sessão anônima continua sendo o da conta, então não há progresso a transferir.
- Popup fechado = cancelamento silencioso; popup bloqueado e outros erros = aviso.

### Apelido (privacidade)
- **Nunca usar o nome real nem a foto do Google** (alunos podem jogar); `photo` nunca é enviado.
- Mora em `users/{uid}.name`. Toda conta (anônima também) nasce com `"Piloto" + 4 dígitos` (`defaultNickname`: dígitos derivados do uid por hash, iguais em qualquer dispositivo).
- No primeiro vínculo com o Google o jogador escolhe um apelido de 3 a 12 caracteres (letras, números, `_` e espaço), sugerido com o nome atual; cancelar mantém o atual. Ao entrar numa conta Google já existente não pergunta (ela já tem nome). Editável depois pelo selo de conta.
- Salvar = escrita de **perfil** (só `name`), aplicada na hora e enviada em segundo plano. O antigo `lasertype.nicknames.v1` não é mais lido. Trocar o apelido não altera recordes já enviados (as regras só aceitam atualizar com score maior).

### Ranking (`firebase/leaderboard.ts`, `ui/ranking.ts`)
- Só contas Google enviam; Zen nunca envia. Um documento por jogador/quadro: id `${uid}_${mode}_${diff}_${lang}_${day}` (`day = dayIndex()` no modo daily, 0 nos outros). Os do modo daily ficam guardados (um por jogador, idioma e dia).
- Ao fim da partida: lê o documento e só grava se **superar o recorde**; `createdAt = serverTimestamp()`, `duration` em segundos (sem pausas), `accuracy` em %, sem `photo`.
- Antes de enviar, o cliente aplica as mesmas checagens das regras (`scoreProblems`); partidas fora dos limites (ex.: Survival com mais de 1 h, WPM > 250) não são enviadas.
- O Mission Report mostra o resultado (novo recorde, recorde atual, entre com Google, Zen não conta, erro); entrando com Google pelo relatório, a partida é enviada em seguida.
- Tela: abas por modo (Survival, Time Attack, Diário), filtros de dificuldade e idioma, top 50, linha do jogador destacada (ou abaixo da tabela, fora do top). Empates dividem a posição. Leituras em cache por 30 s por quadro.
- Aba "Diário": só o dia atual, sem filtro de dificuldade; contagem até o próximo desafio, posição exata do jogador (também fora do top 50), previsão e tabela do bônus. Recarrega sozinha na virada.
- **Índice composto** (Console → Firestore → Índices): coleção `scores`, campos `mode` ↑, `diff` ↑, `lang` ↑, `day` ↑, `score` ↓, escopo Coleção. Serve ao top e à contagem da posição (que ordena por `score` ↓ para usar o mesmo). Sem ele a consulta do top falha com `failed-precondition` (a mensagem do erro traz o link de criação).

### Coleções
```
users/{uid}     # criado na primeira sessão (firebase/profile.ts → newUserFields)
  name ("Piloto" + 4 dígitos), coins 0, xp 0, level 1, streak 0, lastLogin null   # photo nunca é gravado
  owned:    { [itemId]: true }        # começa {}; itens padrão não entram
  equipped: { [type]: itemId }        # começa {}
  lastReward: timestamp               # serverTimestamp() na criação e em cada recompensa
  lastPurchase: itemId | null
  stats: { games: 0, bestScore: 0, bestWpm: 0 }   # só os campos, sem lógica ainda
    + stats.dailyDay: dayIndex                     # último dia do Desafio Diário com bônus pago

shop/{itemId}   → { price, rarity, type }      # somente leitura para clientes
shop/_config    → { discountOrder: [itemId, ...] }  # mesma ordem de DISCOUNT_ORDER
scores/{uid}_{mode}_{diff}_{lang}_{day}
                → { uid, name, score (int), wpm (≤ 250), accuracy (0–100), mode, diff, lang,
                    duration (s, 0 < d ≤ 3600; Time Attack ≤ 65), day, createdAt (= request.time), photo? }
```

### O que as regras exigem (resumo; o arquivo manda)
- `users/{uid}`: só o dono lê/escreve; criação com moedas/xp 0, `owned` vazio, nome válido e `lastReward == request.time`. Cada atualização é de **um** tipo:
  - **Recompensa:** só `coins, xp, level, stats, streak, lastLogin, lastReward`; ganho de 0 a 150 moedas e 0 a 2.000 XP; `lastReward == request.time` e mais de 30 s desde a anterior.
  - **Compra:** só `coins, owned, lastPurchase`; exatamente 1 item novo (= `lastPurchase`); `coins` cai exatamente o preço do dia (`shop/{id}.price`, ou `floor(price * 7 / 100) * 10` se for o item de `shop/_config.discountOrder[dayIndex % n]`); saldo ≥ 0. (As regras não conferem se os outros 3 itens estavam na loja do dia: isso exigiria o rng no servidor.)
  - **Equipar:** só o mapa `equipped`. **Perfil:** só `name` (3–12) e `photo`.
- `scores`: leitura pública; criação/atualização só por conta Google, com `uid` próprio, campos e limites validados, `score ≤ duration × maxPointsPerSecond` (1977, ver §11 Fase 5) e id no formato acima; atualização só com score maior.
- `shop/*` somente leitura (gravado pelo script admin).
- App Check (reCAPTCHA v3) no cliente desde a Fase 6; a **imposição** é ligada no console (ver "App Check" abaixo).
- As chaves de config do Firebase podem ficar no front-end; a segurança está nas regras.
- **Não implementar venda de moedas por dinheiro real** (exigiria validação em servidor / Cloud Functions).

### App Check (`firebase/app.ts`)
- Liga só com `VITE_RECAPTCHA_SITE_KEY` (chave de **site** do reCAPTCHA v3; a chave **secreta** vai só no console do Firebase). Sem ela, ou sem `VITE_FIREBASE_*`, nada de App Check e o jogo segue igual.
- `loadFirebase` baixa `firebase/app-check` junto com os outros módulos (import dinâmico, nada no bundle inicial) e chama `initializeAppCheck(app, { provider: new ReCaptchaV3Provider(chave), isTokenAutoRefreshEnabled: true })` logo depois de `initializeApp` e **antes** de `getAuth`/`getFirestore`: nenhuma requisição sai sem token. Todo uso do SDK passa por `loadFirebase`.
- **Desenvolvimento** (`import.meta.env.DEV`): `self.FIREBASE_APPCHECK_DEBUG_TOKEN = true` antes do `initializeAppCheck`. O SDK gera um token de depuração, guarda no IndexedDB daquele navegador e o imprime no console ("Firebase App Check debug token: …"). Registrar em Console → App Check → Apps → app web → ⋮ → Gerenciar tokens de depuração. É secreto: não commitar; revogar quando não usar mais. Some do build de produção (código morto).
- O Firebase esconde o selo do reCAPTCHA; os termos do Google pedem então o aviso na página: o menu mostra "Protegido pelo reCAPTCHA do Google: Privacidade · Termos" (só quando o App Check está ligado).
- Imposição (Console → App Check → APIs → Cloud Firestore e Authentication → Aplicar): ligar só depois de ver nas métricas que quase todo o tráfego chega com token válido. Imposta, requisição sem token é recusada e o jogo trata como sem rede (moedas pendentes, ranking indisponível). Bloqueadores que barram o reCAPTCHA caem nesse caso.

### Sync de `users/{uid}` (`economy/firestoreRepository.ts`)
- **Uma escrita = um tipo, só com os campos dele** (construtores puros em `firebase/profile.ts`, conferidos por `rules.test.ts`):
  - criação: transação que lê e, se não existe, grava `newUserFields` (moedas 0, xp 0, `owned` {}, `lastReward = serverTimestamp()`);
  - recompensa: transação com `coins` (saldo do servidor + até 150) e `lastReward = serverTimestamp()`;
  - bônus do Desafio Diário: a mesma recompensa mais `stats.dailyDay` (caminho de campo); se `dailyDay` já é aquele dia ou depois, nada é gravado;
  - compra: transação que lê o saldo/itens do servidor e grava `coins` (− preço exato), `owned.<id>` (caminho de campo: o resto do mapa fica intacto) e `lastPurchase`;
  - equipar: `updateDoc` só com `equipped`; perfil: `updateDoc` só com `name`.
- Todas as escritas passam por **uma fila** (uma por vez), sempre para o uid conectado.
- **Cache** no `localStorage` em `lasertype.cloud.v1`, por uid (`{ last, users: { [uid]: { inventory, pending, bonuses, dailySettled, equipDirty, name, nameDirty, nextRewardAt } } }`): mostra moedas e cosméticos na hora (inclusive sem rede) com o último uid enquanto o Auth responde. Leitura tolerante.
- Ao abrir: o documento do servidor vence, exceto o que ainda não foi enviado (moedas pendentes, equipar/apelido "sujos"), que é reenviado em seguida.
- **Moedas pendentes:** saldo mostrado = confirmado + pendente. Escrita de recompensa com `min(pendente, 150)`, no mínimo 30 s (+2 s de margem, relógio local) depois da anterior ou da criação; recusada ou sem rede → continua pendente e tenta de novo com espera crescente. Moedas ganhas antes de qualquer conta responder (primeira visita sem rede) vão para a primeira conta que responder.
- **Bônus na fila** (`bonuses` no cache, do dia mais antigo ao mais novo): vão antes das moedas pendentes, no mesmo ritmo de 30 s; se um falha, as moedas passam na frente na vez seguinte (um bônus nunca as bloqueia).
- Equipar e apelido aparecem na hora e são reenviados quando a conexão volta. Sem rede, a compra responde "sem conexão" (compras precisam do servidor).
- `App` chama `setUser(uid)` a cada mudança de conta (`null` = conectando/sem rede: mantém o cache). Configurações continuam só locais (não há campos para elas nas regras).

### Loja no Firestore (`scripts/seed-shop.ts`)
- As regras precisam de `shop/{id} = { price, rarity, type }` (só itens compráveis) e `shop/_config = { discountOrder }`. Sem eles toda compra é recusada.
- Gerados por `firebase/shopDocs.ts` (puro, valida que `DISCOUNT_ORDER` lista cada comprável uma vez) e gravados com `firebase-admin` num batch. Lista documentos antigos que saíram do catálogo (apagar à mão no console).
- Chave: Console → Configurações do projeto → Contas de serviço → Gerar nova chave privada. Guardar **fora do repositório**; `.gitignore` cobre `*service-account*.json`, `*-admin.json` e `*firebase-adminsdk*.json`.
- Rodar (Windows/PowerShell): `$env:GOOGLE_APPLICATION_CREDENTIALS = "C:\caminho\chave.json"; npm run seed:shop` (bash: `GOOGLE_APPLICATION_CREDENTIALS=... npm run seed:shop`). `npm run seed:shop -- --dry-run` mostra o que seria gravado sem credencial. Requer Node ≥ 22.18 (TypeScript nativo).

---

## 10. Deploy (GitHub Pages)

- `vite.config.ts`: `base: '/lasertype/'`.
- Workflow `.github/workflows/deploy.yml`: build no push para `main` e publica `dist/` com `actions/deploy-pages`.
- Config do Firebase via variáveis `VITE_FIREBASE_*` (arquivo `.env.local` fora do git; no CI, os 6 secrets `VITE_FIREBASE_API_KEY`, `_AUTH_DOMAIN`, `_PROJECT_ID`, `_STORAGE_BUCKET`, `_MESSAGING_SENDER_ID`, `_APP_ID` entram no passo de build). Sem eles o build sai offline (sem conta/ranking).
- App Check: secret `VITE_RECAPTCHA_SITE_KEY` (mais o `.env.local` para desenvolvimento). Sem ele, build sem App Check.
- Adicionar o domínio `<usuario>.github.io` em Authentication → Domínios autorizados no Firebase e na lista de domínios da chave do reCAPTCHA v3.

### Página e compartilhamento (`index.html`)
- `<title>`, `description`, `theme-color` (= `--bg`), `color-scheme: dark`, favicon SVG e `apple-touch-icon`.
- Open Graph + `twitter:card` com `og-image.jpg` (1200×630, JPEG < 300 KB por causa do WhatsApp). Previews só seguem URL absoluta: no build, o plugin do `vite.config.ts` (`scripts/site.ts`) troca `og:url`, `og:image` e `twitter:image` por `https://<dono>.github.io/lasertype/...`, com o dono vindo de `GITHUB_REPOSITORY_OWNER` (o Actions sempre define) ou `SITE_ORIGIN` (outro domínio). Build local = caminhos relativos.
- `og-image.jpg` e `apple-touch-icon.png` saem de `npm run share:images`: o Vite serve `scripts/share/` (cena desenhada com as funções do jogo: fundo, palavras, laser, partículas, canhão + título e slogan do `i18n.ts`) e o Edge/Chrome instalado roda em modo headless (`CHROME_PATH` para outro executável); a página devolve as imagens por POST e o script grava em `public/`. Rodar de novo quando o visual do jogo ou o favicon mudar.
- **Aviso de navegador** (`boot.css` + script ES5 no fim do `index.html`): `<noscript>` pede para ativar o JavaScript (pt-BR + EN). O guarda confere o que o jogo usa (módulos ES, canvas 2D com `roundRect`, `DOMMatrix`, `ResizeObserver`, `Array.prototype.at`, `replaceChildren`, `requestSubmit`) e marca `<html data-boot>`:
  - `unsupported`: mostra "Navegador sem suporte" e o `main.ts` nem inicia o jogo;
  - `failed`: erro antes do fim da inicialização (script que não carrega, erro de sintaxe ou exceção) → "Não foi possível iniciar" + Recarregar;
  - `ready`: o `main.ts` marca no fim do `start()`; dali em diante o aviso fica escondido.
  - Idioma do aviso = o salvo nas configurações (`lasertype.settings.v1`), português por padrão. O CSS fica em `public/` porque o Vite reescreveria um `<style>` inline com sintaxe moderna (`inset`, cor hex de 8 dígitos); `page.test.ts` cobre o guarda num DOM falso.
- Usar uma API nova do navegador na inicialização ou no loop = incluir no `supported()` do guarda.

---

## 11. Roadmap

Trabalhar **uma fase por vez**. Ao concluir, marcar `[x]` aqui e resumir o que foi feito.

- [x] **Fase 1 — Base:** Vite + TS, game loop, spawn de palavras, digitação, mira, laser básico, perímetro, escudo.
  - Loop com timestep fixo (`game/timestep.ts`) + render interpolado; canvas com DPR e resize (`render/renderer.ts`).
  - **Coordenadas normalizadas:** `x ∈ [0,1]` na largura do campo, `y = 0` no topo e `y = 1` no perímetro; velocidades em "alturas de campo por segundo" (tempo de queda igual em qualquer tela). Conversão para pixels só em `render/layout.ts`.
  - **Spawner determinístico:** a sequência (palavra, x, velocidade) depende só da seed e do histórico do próprio spawner, nunca das ações do jogador; o timing é separado. Evita repetir palavras recentes e, quando possível, iniciais das últimas 5 palavras.
  - Lógica emite `GameEvent`s (`hit`, `destroy`, `breach`, `miss`...) que a apresentação consome — ponto de encaixe para partículas/sons da Fase 2.
  - Listas: ~100 palavras por dificuldade (fácil 3–5 letras, média 6–8, difícil 9–14) em pt-BR e en.
  - Parâmetro de URL para testes: `?seed=abc` fixa a sequência de palavras (os demais viraram Configurações na Fase 4).
  - Fontes Orbitron/JetBrains Mono ainda não estão em `public/fonts/`; CSS e canvas usam fallbacks do sistema.
- [x] **Fase 2 — Juice:** laser com glow, partículas, explosão, screen shake, recuo do canhão, sons.
  - `game/effects/`: pool de partículas pré-alocado (`utils/pool.ts`, sem alocação durante a partida) com faíscas, brilhos, anéis e letras; emissores puros para impacto por letra, explosão (as letras da palavra voam) e breach (letras vermelhas no perímetro); `ScreenShake` por trauma (offset ∝ trauma², máx. 8 px); `ScreenFlash`; pulso do perímetro. A camada de fundo não treme (só o "mundo").
  - Canhão com recuo e retenção da mira enquanto o feixe está visível (feixe e cano sempre alinhados).
  - Fundo procedural (`render/background.ts`): nebulosa por fBm de ruído periódico (textura 256² emendável, desenhada como `CanvasPattern` repetido) + 3 camadas de estrelas em parallax; offsets interpolados.
  - Sons procedurais (ver §7 Áudio): tiro (pitch sobe a cada letra), erro, destravar, explosão, dano no escudo, fim de jogo.
- [x] **Fase 3 — Sistemas:** combo, ondas, palavras especiais, EMP, pausa, modos.
  - Lógica pura e testada: `scoring.ts` (multiplicador, pontos, bônus de altura), `combo.ts` (reducer de combo + carga do EMP), `waves.ts` (curva de dificuldade), `specials.ts` (sorteio de tipo, vizinhas da bomba), `modes/`. `state.ts` integra tudo (EMP, pausa, fim por escudo/tempo/desistência).
  - Spawner com ondas: conteúdo determinístico por cota, timing separado (pausa entre ondas só nos modos com `waveBreak`).
  - HUD mínimo (o completo é da Fase 4): pontos, combo/multiplicador, onda, cronômetro do Time Attack, chip "Lento", barra de EMP (também em arco no canhão) e anúncio de onda. Telas de pausa e de fim com motivo e estatísticas.
  - Sons procedurais novos: armadura, bomba, gelo, escudo, EMP, EMP pronto, multiplicador, onda.
  - Áudio só é criado/retomado com gesto de ativação real (`navigator.userActivation`); teclas modificadoras não contam.
  - Gancho de desenvolvimento `window.__lasertype` só em `npm run dev`; removido do build de produção. Desde a Fase 4 é o `App` (`__lasertype.game.state` = estado da partida ou `null` nos menus).
- [x] **Fase 4 — Telas:** menu, HUD completo, Mission Report, configurações (localStorage).
  - `ui/app.ts` troca as telas (menu ↔ configurações ↔ partida) sobre o canvas, que continua animando a estação ociosa nos menus (`Game` sem partida). Teclado: o input do jogo só fica ligado durante a partida; nos menus vale a navegação nativa (Tab, setas nos grupos, Enter joga, Esc volta).
  - Menu: modo (cards), dificuldade e idioma; Configurações: idioma, volume (com prévia), reduzir efeitos, acentos obrigatórios. Trocar o idioma reconstrói todas as telas.
  - HUD completo: escudo, carga do EMP, pontos, combo/multiplicador, modo·dificuldade, onda, tempo (ou restante), abates, precisão, WPM, chip "Lento", anúncio de onda e **registro de combate** (últimas 7 palavras destruídas com multiplicador/causa e pontos). Valores contínuos atualizam a cada 0,1 s; o DOM só é tocado quando algo muda.
  - Layout: a partir de 1000 px de largura o campo reserva 262 px de cada lado para os painéis do HUD (palavras nunca nascem atrás deles); abaixo disso a coluna direita some.
  - Mission Report (`game/report.ts` puro + `ui/report.ts`): nota S–D, pontuação e 10 estatísticas; Enter/Tab joga de novo, Esc vai ao menu. Pausa com botões (Continuar/Reiniciar/Encerrar).
  - Textos todos em `ui/i18n.ts` (pt-BR referência, EN completo, placeholders `{n}`); teste garante as mesmas chaves e placeholders nos dois idiomas.
  - Moedas no relatório: feitas na Fase 4.5.
- [x] **Fase 4.5 — Cosméticos offline:** catálogo, renderers parametrizados, loja, inventário, prévia ao vivo.
  - Moedas por partida (§8) creditadas ao abrir o Mission Report, que mostra "+N", o detalhe (pontuação, nota, fator do modo) e o saldo; saldo também no menu e na loja.
  - Catálogo com 20 itens (5 categorias × 4, ver §8) e `params` tipados por categoria. Os padrões reproduzem exatamente o visual anterior.
  - Renderers parametrizados: o desenho saiu do `Renderer` para `drawCannon`/`drawWord`/`drawFx`/`drawBackground`, que recebem um `Skin` (cosméticos resolvidos + sprites de brilho e nebulosa em cache). Partículas usam slots de cor (`laser`, `blast`, `blastAlt`) resolvidos pelo `Skin`; explosões parametrizadas nos emissores (letras `scatter`/`dissolve`/`collapse`, detritos riscos ou pixels, implosão, anéis). Canhão duplo alterna o cano a cada tiro.
  - Loja rotativa com o dia de jogo (03:00 UTC) e desconto determinístico por `DISCOUNT_ORDER` (§8); inventário e equipar; prévia ao vivo num mini canvas (pausa fora da tela da loja, respeita "Reduzir efeitos").
  - `economy/` isolada: lógica pura + `InventoryRepository` (localStorage) + `Economy` com mudanças tipadas (o sync veio na 5.5).
  - Sons procedurais novos: compra e equipar. `__lasertype.economy` no gancho de desenvolvimento.
- [x] **Fase 5 — Firebase:** Auth anônimo, envio de score, ranking, regras.
  - `firestore.rules` copiado do contrato com os dois ajustes autorizados: `diff` `'medium'` → `'normal'` (nome do código) e `maxPointsPerSecond` 1500 → **1977**.
  - `maxPointsPerSecond` = `ceil(maior palavra × 2 passadas (blindada) × 10 × 4x × 1,5 / intervalo mínimo de spawn)` = `ceil(14 × 2 × 10 × 4 × 1,5 / 0,85)` = 1977 (`scoring.ts → maxPointsPerSecond`). O spawner solta no máximo 1 palavra por `waves.minInterval` em qualquer dificuldade; bomba/EMP pagam metade da mesma palavra; a rampa do combo só reduz (o teste simula a partida perfeita). O boss não muda o limite: tudo o que ele vale (frase mais longa a 4x no alto + bônus máximo) cabe no que o limite permite durante os 3 s do alerta, em que não se pontua (teste em `rules.test.ts`). Mudar o balanceamento → o teste de sincronia aponta o novo valor.
  - Firebase carregado sob demanda (`firebase/app.ts`); sem config, nada é baixado. Auth anônimo + vínculo Google por popup, apelido local, envio de recorde, tela de ranking, aviso de conta trocada (§9).
  - Desconto da loja passou para a aritmética inteira do contrato (`Math.floor(price * 7 / 100) * 10`; mesmos valores).
  - Workflow com os secrets `VITE_FIREBASE_*`. Testado no navegador: login anônimo real e leitura do ranking (falha até o índice composto existir).
  - Pendências no console: publicar `firestore.rules`, criar o índice composto de `scores` (§9) e autorizar o domínio do GitHub Pages no Auth.
- [x] **Fase 5.5 — Contas e economia online:** vínculo Google, sync de perfil, regras de moedas/compra, missões, streak.
  - `FirestoreInventoryRepository` (§9 "Sync de users/{uid}") com a mesma interface do repositório local, que passou a ter uma operação por tipo de escrita. `localStorage` virou cache (`lasertype.cloud.v1`); o antigo `lasertype.inventory.v1` só vale em builds offline.
  - `users/{uid}` criado na primeira sessão (anônima também) com moedas 0, xp 0, `owned` {} e `lastReward = serverTimestamp()`; nome inicial `"Piloto" + 4 dígitos`, editável (escrita de perfil). O apelido saiu do `localStorage`.
  - Cada escrita é de um tipo só, com os campos permitidos: recompensa (transação, ≤ 150, 30 s, excedente pendente sem perder moedas), compra (transação; recusa na virada do dia recarrega a loja e avisa), equipar, perfil.
  - Desconto literal `Math.floor(price * 7 / 100) * 10` em `shop.ts` (saíram `discountKeepTenths`/`discountStep` do `CONFIG`).
  - `scripts/seed-shop.ts` (`npm run seed:shop`) com `firebase-admin` (devDependency autorizada) e `GOOGLE_APPLICATION_CREDENTIALS`; `scripts/tsconfig.json` dá os tipos do Node só aos scripts.
  - Missões, streak e XP: **só os campos** (lógica pendente).
  - Testado com servidor falso que aplica os limites das regras (`firestoreRepository.test.ts`); não testado contra o Firebase real.
  - Pendências no console: publicar `firestore.rules` e rodar `npm run seed:shop` (sem `shop/*` toda compra é recusada).
- [x] **Fase 6 — Deploy:** GitHub Actions + Pages, App Check, acabamento da página.
  - Workflow `.github/workflows/deploy.yml` (antecipado com autorização em 2026-11-21): no push para `main` roda `npm ci`, testes e build (Node 26) e publica `dist/` com `actions/deploy-pages`. Requer Settings → Pages → Source = "GitHub Actions". Secrets `VITE_FIREBASE_*` (Fase 5) e `VITE_RECAPTCHA_SITE_KEY` no passo de build.
  - App Check com reCAPTCHA v3 iniciado dentro de `loadFirebase`, antes de Auth/Firestore, com debug token em desenvolvimento (§9 "App Check"); crédito do reCAPTCHA no menu. Testado com o SDK simulado (ordem das chamadas, provedor, auto refresh, debug token); não testado contra o Firebase real.
  - Acabamento (§10 "Página e compartilhamento"): título, descrição, `theme-color`, favicon SVG do canhão, `apple-touch-icon`, Open Graph com imagem gerada pelo renderer do jogo, aviso de navegador sem suporte / sem JavaScript / falha ao iniciar. Os avisos foram conferidos no Edge headless (desktop e 360 px).
  - Desempenho do build (2026-11-22, gzip): carga inicial ≈ 56 KB (JS 48,2 + CSS 4,9 + HTML 2,5 + `boot.css`). Firebase fora do bundle inicial, em chunks dinâmicos pedidos logo após a inicialização, sem bloquear a primeira tela: núcleo 11,4, Auth 36,6, Firestore lite 39,0, App Check 5,5 (≈ 92 KB). O script do reCAPTCHA vem do Google, também em segundo plano. Nenhum `modulepreload` do Firebase no HTML; a ativação do debug token não entra no build de produção.
  - Pendências no console: registrar o app no App Check com a chave secreta do reCAPTCHA, registrar o debug token de desenvolvimento, criar o secret `VITE_RECAPTCHA_SITE_KEY` no GitHub e, depois de conferir as métricas, aplicar a imposição no Firestore e no Authentication.
- [x] **Arte dos canhões (fora das fases, 2026-11-22):** os 4 canhões redesenhados em camadas (§7 "Canhão"), com o mesmo tamanho e a mesma boca; giro por mola, recuo por cano, clarão/faíscas/fumaça na boca, núcleo ligado ao combo e ao EMP. Revisado com as pranchas de `npm run share:images -- --cannons` e no jogo real (Edge headless). A imagem de compartilhamento foi regerada com o canhão novo. Custo: JS inicial 48,2 → 53,3 KB gzip.
- [ ] **Fase 7 — Extras:** Desafio Diário (feito), boss (feito), conquistas, coleções, suporte mobile.
  - **Desafio Diário** (2026-11-22; §6 Modos, §8 "Bônus do Desafio Diário", §9 Ranking): modo `daily`, envio com `mode` 'daily' e `day = dayIndex()`, aba "Diário", contagem no card do menu e no ranking, bônus por posição. `firestore.rules` não mudou.
  - Testado com servidores falsos que aplicam os limites das regras, com o `App` completo no Edge headless (virada do dia com a tela aberta e no meio da partida, data do aparelho errada, dois bônus em sequência, fora do top 50, anônimo, build offline, 360 px) e conferindo o que o SDK do Firestore envia (com `fetch` simulado). Não testado contra o Firebase real.
  - Junto: o menu mais alto que a tela (celular) rola desde o topo (`justify-content: safe center`); antes, conta e saldo ficavam inalcançáveis.
  - **Boss** (2026-11-22; §6 "Boss", §7 "Boss"): logo após cada 5ª onda. `firestore.rules` e a sequência de palavras não mudaram. Simulado com digitadores de várias velocidades nas 3 dificuldades e conferido no jogo real (Edge headless: alerta, teclas no alerta, fragmentos, EMP, derrota, −2 HP, fim de partida, pausa, reinício, "Reduzir efeitos", Zen, 360 px, 1366×640, 1920×1080). JS inicial 56,6 → ~63 KB gzip.
  - Publicar o boss no meio do dia mistura, no quadro do Diário, partidas com e sem ele: publicar logo após as 00:00 de Brasília.

---

## 12. Regras de trabalho para o Claude

- Antes de implementar uma fase, apresentar um plano curto e esperar aprovação.
- Não pular fases nem adiantar funcionalidades de fases futuras (mas deixar a arquitetura pronta para elas).
- Não adicionar dependências sem perguntar.
- Escrever testes Vitest para toda lógica pura nova.
- Ao terminar: rodar typecheck, testes e build; listar o que mudou e como testar no navegador.
- Manter este arquivo atualizado quando uma decisão de projeto mudar.

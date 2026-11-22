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
| Backend | Firebase: Auth (anônimo + Google) e Firestore (SDK *lite*), carregados sob demanda só quando há config |
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
    spawner.ts            # geração de palavras e ondas (aceita seed)
    targeting.ts          # lógica de mira/travamento
    input.ts              # captura de teclado, normalização de acentos
    scoring.ts            # pontuação, combo, nota final
    entities/             # Word, Cannon, Laser, Particle
    effects/              # partículas, screen shake, flash
    render/               # renderer.ts + funções de desenho parametrizadas por cosmético
                          # (drawCannon, drawWord, drawFx, drawBackground) e Skin (cosméticos → sprites/cores)
  modes/                  # survival, timeAttack, zen, daily
  words/                  # listas pt-BR.json, en.json (por dificuldade)
  cosmetics/
    types.ts              # categorias, raridades, params tipados por categoria
    catalog.ts            # catálogo de itens (dados puros) + DISCOUNT_ORDER
    equip.ts              # resolve o que está equipado (com fallback para o padrão)
  economy/                # lógica pura (sem DOM) + os repositórios (onde o inventário mora)
    types.ts              # Inventory (espelha users/{uid}), ofertas, erros de compra, EconomyChange, SyncConfig
    rewards.ts            # moedas por partida (missões, streak, XP: só os campos por enquanto)
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
public/
  music/  fonts/          # sem sfx/: efeitos sonoros são sintetizados em runtime
scripts/
  seed-shop.ts            # firebase-admin: grava shop/{id} e shop/_config a partir do catalog.ts
  tsconfig.json           # tipos do Node para os scripts (o app não vê os globais do Node)
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
- **Ondas** (`game/waves.ts`): cada onda tem uma **cota fixa** de palavras (8, +2 por onda, máx. 30); intervalo ×0,92, velocidade +7%, mais palavras difíceis e especiais a cada onda (com tetos em `config.ts`). Como a cota é fixa, a N-ésima palavra pertence sempre à mesma onda e a sequência depende só da seed. Survival/Zen: após a última palavra da onda, espera a tela limpar e dá 2,5 s de respiro com o anúncio "Onda N"; Time Attack emenda as ondas. Boss a cada 5 ondas (frase que se divide em palavras) fica para a Fase 7.
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
- A pontuação não muda com a dificuldade → o ranking (Fase 5) separa por modo, dificuldade **e** idioma das palavras. O Desafio Diário (Fase 7) usa Normal.

### Modos (`src/modes/`, dados puros)
- **Survival:** infinito até o escudo zerar.
- **Time Attack:** 60 s, maior pontuação.
- **Zen:** sem dano, para treinar (não vale ranking nem moedas cheias). Termina pela pausa (`Esc` → `Enter`).
- Modo, dificuldade e idioma são escolhidos no menu principal (e lembrados nas configurações).
- **Desafio Diário:** seed = `dayKey()` de `utils/day.ts` (`YYYY-MM-DD` do dia de jogo, que vira às 03:00 UTC = meia-noite de Brasília, o mesmo calendário da loja); mesma sequência para todos; ranking próprio.

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
  - "Reduzir efeitos" (tela de Configurações): sem screen shake, sem flash de tela, fundo parado (também nos menus) e metade das partículas. O pulso do perímetro continua (é o aviso de dano que substitui o flash). Na primeira visita, começa ligado se o sistema pede `prefers-reduced-motion`.
  - Modo daltônico e volume de música ficam para quando houver música/cosméticos de cor.

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
- Partida: `floor((min(floor(pontos / 100), 80) + bônus de nota) × fator do modo)`; bônus S +20, A +10, B +5, C/D 0; fator 1 (Survival, Time Attack) ou 0,25 (Zen). Máximo 100 por partida. Creditado uma vez, ao abrir o Mission Report (que mostra o detalhe e o saldo). Números em `CONFIG.economy`, lógica em `economy/rewards.ts`.
- Online, as moedas aparecem na hora e ficam **pendentes** até o servidor aceitar: cada escrita de recompensa leva no máximo 150 e espera 30 s desde a anterior (limites das regras, em `CONFIG.sync`); o resto vai nas escritas seguintes, sem perder nada (ver §9 "Sync de users/{uid}").
- Missões diárias (3 por dia, geradas pela data), streak de login, nível por XP, bônus do Desafio Diário. **Por enquanto só os campos existem** em `users/{uid}` (`xp`, `level`, `streak`, `lastLogin`, `stats`, criados com valores iniciais e nunca atualizados); a lógica fica para depois.

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
- Cosméticos mudam só a aparência e mantêm as pistas de jogo: o tema muda só o fundo do canvas (não o HUD); a borda muda a forma e a cor das palavras normais, mas travada/especiais mantêm suas cores; o canhão tem sempre o mesmo tamanho (a boca do cano não muda); dano/perímetro continuam em `--danger`.
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
- Só contas Google enviam; Zen nunca envia. Um documento por jogador/quadro: id `${uid}_${mode}_${diff}_${lang}_${day}` (`day = dayIndex()` no modo daily, 0 nos outros).
- Ao fim da partida: lê o documento e só grava se **superar o recorde**; `createdAt = serverTimestamp()`, `duration` em segundos (sem pausas), `accuracy` em %, sem `photo`.
- Antes de enviar, o cliente aplica as mesmas checagens das regras (`scoreProblems`); partidas fora dos limites (ex.: Survival com mais de 1 h, WPM > 250) não são enviadas.
- O Mission Report mostra o resultado (novo recorde, recorde atual, entre com Google, Zen não conta, erro); entrando com Google pelo relatório, a partida é enviada em seguida.
- Tela: abas por modo (Survival, Time Attack; Daily na Fase 7), filtros de dificuldade e idioma, top 50, linha do jogador destacada (ou abaixo da tabela, fora do top). Leituras em cache por 30 s por quadro.
- **Índice composto** (Console → Firestore → Índices): coleção `scores`, campos `mode` ↑, `diff` ↑, `lang` ↑, `day` ↑, `score` ↓, escopo Coleção. Sem ele a consulta do top falha com `failed-precondition` (a mensagem do erro traz o link de criação).

### Coleções
```
users/{uid}     # criado na primeira sessão (firebase/profile.ts → newUserFields)
  name ("Piloto" + 4 dígitos), coins 0, xp 0, level 1, streak 0, lastLogin null   # photo nunca é gravado
  owned:    { [itemId]: true }        # começa {}; itens padrão não entram
  equipped: { [type]: itemId }        # começa {}
  lastReward: timestamp               # serverTimestamp() na criação e em cada recompensa
  lastPurchase: itemId | null
  stats: { games: 0, bestScore: 0, bestWpm: 0 }   # só o campo, sem lógica ainda

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
- Ativar App Check (reCAPTCHA v3) quando o deploy estiver no ar.
- As chaves de config do Firebase podem ficar no front-end; a segurança está nas regras.
- **Não implementar venda de moedas por dinheiro real** (exigiria validação em servidor / Cloud Functions).

### Sync de `users/{uid}` (`economy/firestoreRepository.ts`)
- **Uma escrita = um tipo, só com os campos dele** (construtores puros em `firebase/profile.ts`, conferidos por `rules.test.ts`):
  - criação: transação que lê e, se não existe, grava `newUserFields` (moedas 0, xp 0, `owned` {}, `lastReward = serverTimestamp()`);
  - recompensa: transação com `coins` (saldo do servidor + até 150) e `lastReward = serverTimestamp()`;
  - compra: transação que lê o saldo/itens do servidor e grava `coins` (− preço exato), `owned.<id>` (caminho de campo: o resto do mapa fica intacto) e `lastPurchase`;
  - equipar: `updateDoc` só com `equipped`; perfil: `updateDoc` só com `name`.
- Todas as escritas passam por **uma fila** (uma por vez), sempre para o uid conectado.
- **Cache** no `localStorage` em `lasertype.cloud.v1`, por uid (`{ last, users: { [uid]: { inventory, pending, equipDirty, name, nameDirty, nextRewardAt } } }`): mostra moedas e cosméticos na hora (inclusive sem rede) com o último uid enquanto o Auth responde. Leitura tolerante.
- Ao abrir: o documento do servidor vence, exceto o que ainda não foi enviado (moedas pendentes, equipar/apelido "sujos"), que é reenviado em seguida.
- **Moedas pendentes:** saldo mostrado = confirmado + pendente. Escrita de recompensa com `min(pendente, 150)`, no mínimo 30 s (+2 s de margem, relógio local) depois da anterior ou da criação; recusada ou sem rede → continua pendente e tenta de novo com espera crescente. Moedas ganhas antes de qualquer conta responder (primeira visita sem rede) vão para a primeira conta que responder.
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
- Adicionar o domínio `<usuario>.github.io` em Authentication → Domínios autorizados no Firebase.

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
  - `maxPointsPerSecond` = `ceil(maior palavra × 2 passadas (blindada) × 10 × 4x × 1,5 / intervalo mínimo de spawn)` = `ceil(14 × 2 × 10 × 4 × 1,5 / 0,85)` = 1977 (`scoring.ts → maxPointsPerSecond`). O spawner solta no máximo 1 palavra por `waves.minInterval` em qualquer dificuldade; bomba/EMP pagam metade da mesma palavra; a rampa do combo só reduz (o teste simula a partida perfeita). Mudar o balanceamento → o teste de sincronia aponta o novo valor.
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
- [ ] **Fase 6 — Deploy:** GitHub Actions + Pages, App Check.
  - [x] Workflow `.github/workflows/deploy.yml` (antecipado com autorização em 2026-11-21): no push para `main` roda `npm ci`, testes e build (Node 26) e publica `dist/` com `actions/deploy-pages`. Requer Settings → Pages → Source = "GitHub Actions".
  - [x] Secrets `VITE_FIREBASE_*` no passo de build (Fase 5).
  - [ ] Falta: App Check.
- [ ] **Fase 7 — Extras:** Desafio Diário, boss, conquistas, coleções, suporte mobile.

---

## 12. Regras de trabalho para o Claude

- Antes de implementar uma fase, apresentar um plano curto e esperar aprovação.
- Não pular fases nem adiantar funcionalidades de fases futuras (mas deixar a arquitetura pronta para elas).
- Não adicionar dependências sem perguntar.
- Escrever testes Vitest para toda lógica pura nova.
- Ao terminar: rodar typecheck, testes e build; listar o que mudou e como testar no navegador.
- Manter este arquivo atualizado quando uma decisão de projeto mudar.

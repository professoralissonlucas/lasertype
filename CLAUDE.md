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
| Áudio | Web Audio API (efeitos em `public/sfx/`, gerados com jsfxr) |
| Backend | Firebase: Auth (anônimo + Google) e Firestore |
| Deploy | GitHub Actions → GitHub Pages |
| Testes | Vitest para lógica pura (pontuação, economia, mira, spawn) |

**Não adicionar dependências novas sem perguntar.** Permitidas por padrão: `vite`, `typescript`, `vitest`, `firebase`.

---

## 3. Comandos

```bash
npm install
npm run dev        # servidor local
npm run build      # build de produção em dist/
npm run preview    # testar o build
npm run test       # vitest
npm run typecheck  # tsc --noEmit
```

Antes de dar uma tarefa como concluída: `npm run typecheck && npm run test && npm run build` devem passar.

---

## 4. Estrutura de pastas

```
src/
  main.ts                 # bootstrap, troca de telas
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
    render/               # funções de desenho parametrizadas por cosmético
  modes/                  # survival, timeAttack, zen, daily
  words/                  # listas pt-BR.json, en.json (por dificuldade)
  cosmetics/
    catalog.ts            # catálogo de itens (dados puros)
    equip.ts              # resolve o que está equipado
  economy/
    rewards.ts            # moedas por partida, missões, streak
    shop.ts               # loja rotativa (seed = data)
    inventory.ts          # posse/equipamento (local + sync)
  firebase/
    app.ts                # init
    auth.ts               # anônimo, vínculo Google
    profile.ts            # users/{uid}
    leaderboard.ts        # scores
  ui/                     # telas: menu, hud, pause, report, shop, ranking, settings
  audio/
  utils/                  # rng com seed, math, storage
  styles/
public/
  sfx/  music/  fonts/
scripts/
  seed-shop.ts            # envia preços do catalog.ts para a coleção shop
firestore.rules
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
- `Backspace` destrava o alvo (e zera o progresso daquela palavra). `Esc` pausa. `Tab` reinicia. `Espaço` ativa o EMP (se carregado).

### Sistemas
- **Combo:** cada palavra sem erro +1. Multiplicador: 1x (0–4), 2x (5–14), 3x (15–29), 4x (30+).
- **Escudo:** 3 HP. Palavra que cruza o perímetro = −1 HP.
- **EMP:** barra de charge enche com combo; ao ativar, destrói todas as palavras na tela (pontua metade).
- **Ondas:** velocidade e frequência sobem a cada onda; boss a cada 5 ondas (frase que se divide em palavras).
- **Palavras especiais:** 💣 Bomba (destrói vizinhas), ❄️ Gelo (slow 3s), 🛡️ Escudo (+1 HP), ☠️ Blindada (digitar 2x).

### Pontuação
```
pontos_palavra = letras × 10 × multiplicador_combo × bonus_altura
bonus_altura   = 1.5 se destruída na metade superior da tela, senão 1.0
```
Nota final (S/A/B/C/D) combina precisão, WPM e % de palavras destruídas (fórmula em `scoring.ts`).

### Modos
- **Survival:** infinito até o escudo zerar.
- **Time Attack:** 60 s, maior pontuação.
- **Zen:** sem dano, para treinar (não vale ranking nem moedas cheias).
- **Desafio Diário:** seed = data UTC (`YYYY-MM-DD`); mesma sequência para todos; ranking próprio.

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
- Acessibilidade: opção "Reduzir efeitos" (sem shake/flash), modo daltônico, volume separado música/efeitos.

---

## 8. Economia e cosméticos

**Regra de ouro: cosméticos nunca dão vantagem de jogo.**

### Ganho de moedas
- Partida: `min(floor(pontos / 100), 80)` + bônus de nota (S +20, A +10, B +5). Zen: 25%.
- Missões diárias (3 por dia, geradas pela data), streak de login, nível por XP, bônus do Desafio Diário.

### Raridades
| Raridade | Preço |
|---|---|
| Comum | 300 |
| Raro | 900 |
| Épico | 2.500 |
| Lendário | 6.000 |

### Categorias (`type` no catálogo)
`cannon`, `theme`, `laserColor`, `shotStyle`, `impact`, `explosion`, `wordBorder`, `reticle`, `comboAura`, `perimeter`, `font`, `soundPack`, `music`, `title`, `avatarFrame`, `victoryAnim`.

### Item do catálogo
```ts
interface CosmeticItem {
  id: string;            // ex: "cannon_crystal"
  type: CosmeticType;
  name: string;
  rarity: 'common' | 'rare' | 'epic' | 'legendary';
  price: number | null;  // null = só por conquista
  unlock?: string;       // id da conquista, se aplicável
  set?: string;          // coleção
  params: Record<string, unknown>; // usados pelo renderer
}
```
- Renderers recebem `params`; adicionar item novo = só adicionar dados.
- **Loja rotativa:** 4 itens/dia (1 com desconto), seed = data.
- **Prévia ao vivo** do item na loja (mini canvas).
- Itens de conquista não são compráveis (ex: Canhão Dourado ao atingir 100 WPM).

---

## 9. Firebase

### Autenticação
- Entrar sempre como **anônimo** automaticamente.
- "Salvar progresso" → `linkWithPopup(GoogleAuthProvider)`; fallback `linkWithRedirect` no mobile.
- Tratar `auth/credential-already-in-use`: logar na conta existente e perguntar qual progresso manter.
- Ranking global exibe apenas contas vinculadas ao Google.

### Coleções
```
users/{uid}
  name, photo, coins, xp, level, streak, lastLogin
  owned:    { [itemId]: true }
  equipped: { [type]: itemId }
  lastReward: timestamp
  lastPurchase: itemId
  stats: { games, bestScore, bestWpm, ... }

shop/{itemId}   → { price, rarity, type }      # somente leitura para clientes
scores/{id}     → { uid, name, score, wpm, accuracy, mode, lang, date, createdAt }
```

### Regras de segurança (intenção — implementar em `firestore.rules`)
- Usuário só lê/escreve `users/{uid}` próprio (`request.auth.uid == uid`).
- **Ganho de moedas:** aumento ≤ 150 por escrita e `request.time > lastReward + 30s`.
- **Compra:** exatamente 1 chave nova em `owned` (`diff().addedKeys()`), igual a `lastPurchase`; `coins` diminui exatamente `get(shop/lastPurchase).price`; saldo nunca negativo.
- `shop` é somente leitura.
- `scores`: apenas criação, `uid` igual ao autenticado, campos validados (nome 3–12 chars, score ≤ limite plausível por modo, 1 envio a cada 30 s).
- Ativar App Check (reCAPTCHA v3) quando o deploy estiver no ar.
- As chaves de config do Firebase podem ficar no front-end; a segurança está nas regras.
- **Não implementar venda de moedas por dinheiro real** (exigiria validação em servidor / Cloud Functions).

### Offline-first
- Progresso salvo em `localStorage` primeiro; sincroniza com Firestore quando logado.
- Ao vincular conta pela primeira vez, enviar o progresso local.

---

## 10. Deploy (GitHub Pages)

- `vite.config.ts`: `base: '/lasertype/'`.
- Workflow `.github/workflows/deploy.yml`: build no push para `main` e publica `dist/` com `actions/deploy-pages`.
- Config do Firebase via variáveis `VITE_FIREBASE_*` (arquivo `.env.local` fora do git; secrets no GitHub Actions).
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
  - Parâmetros de URL provisórios (até existir a tela de configurações): `?lang=en`, `?seed=abc`, `?accents=1`.
  - Fontes Orbitron/JetBrains Mono ainda não estão em `public/fonts/`; CSS e canvas usam fallbacks do sistema.
- [ ] **Fase 2 — Juice:** laser com glow, partículas, explosão, screen shake, recuo do canhão, sons.
- [ ] **Fase 3 — Sistemas:** combo, ondas, palavras especiais, EMP, pausa, modos.
- [ ] **Fase 4 — Telas:** menu, HUD completo, Mission Report, configurações (localStorage).
- [ ] **Fase 4.5 — Cosméticos offline:** catálogo, renderers parametrizados, loja, inventário, prévia ao vivo.
- [ ] **Fase 5 — Firebase:** Auth anônimo, envio de score, ranking, regras.
- [ ] **Fase 5.5 — Contas e economia online:** vínculo Google, sync de perfil, regras de moedas/compra, missões, streak.
- [ ] **Fase 6 — Deploy:** GitHub Actions + Pages, App Check.
  - [x] Workflow `.github/workflows/deploy.yml` (antecipado com autorização em 2026-11-21): no push para `main` roda `npm ci`, testes e build (Node 26) e publica `dist/` com `actions/deploy-pages`. Requer Settings → Pages → Source = "GitHub Actions".
  - [ ] Falta: secrets `VITE_FIREBASE_*` no passo de build e App Check (dependem da Fase 5).
- [ ] **Fase 7 — Extras:** Desafio Diário, boss, conquistas, coleções, suporte mobile.

---

## 12. Regras de trabalho para o Claude

- Antes de implementar uma fase, apresentar um plano curto e esperar aprovação.
- Não pular fases nem adiantar funcionalidades de fases futuras (mas deixar a arquitetura pronta para elas).
- Não adicionar dependências sem perguntar.
- Escrever testes Vitest para toda lógica pura nova.
- Ao terminar: rodar typecheck, testes e build; listar o que mudou e como testar no navegador.
- Manter este arquivo atualizado quando uma decisão de projeto mudar.

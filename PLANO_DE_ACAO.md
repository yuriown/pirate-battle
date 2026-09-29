# 🏴‍☠️ PLANO DE AÇÃO MESTRE — PIRATE BATTLE (100/100)
> **Desafio Técnico React & PixiJS — Jungle Gaming**

---

## 📊 1. MATRIZ DE AVALIAÇÃO (100 PONTOS)

| Critério de Avaliação | Pontos | Nosso Foco e Estratégia |
| :--- | :---: | :--- |
| **Gameplay, regras, colisões e IA** | **35** | Física náutica com inércia, colisão precisa com ilhas, disparo frontal (1x) e lateral (3x), IA avançada de Chaser e Shooter, balanceamento determinístico. |
| **PixiJS, arquitetura e ciclo de vida** | **20** | PixiJS v8 puro desacoplado do React, simulação delta-time, pooling de projéteis/partículas, limpeza com `destroy(true)` (zero memory leaks). |
| **Interface, feedback, responsividade e a11y** | **15** | Design temático pirata em TailwindCSS, controles táteis para mobile, navegação completa por teclado, suporte a leitor de tela e foco semântico. |
| **TanStack Query, Axios e Consistência** | **10** | Contratos tipados, paginação de ranking e histórico, cache inteligente, invalidação automática, idempotência de envio e retry offline. |
| **MSW e Cenários de Falha de Rede** | **5** | Service Worker ativo em dev e build com painel Dev para simular latência, jitter, erro 500, timeout e persistência no localStorage. |
| **Testes com Playwright (12 Fluxos + Visual)** | **10** | 12 testes E2E cobrindo todas as regras com simulação determinística (clock seed) e baselines de regressão visual. |
| **Performance e Documentação** | **5** | 60 FPS cravados, profiling de 5 ciclos sem memory leak, `README.md` e `ARCHITECTURE.md` em inglês impecável. |
| **TOTAL** | **100** | **Meta: 100 Pontos** |

---

## 🗺️ 2. ETAPAS DE EXECUÇÃO EM 7 FASES

```
[Fase 1: Setup & Arquitetura Base]
         │
         ▼
[Fase 2: Motor PixiJS & Gameplay 60 FPS]
         │
         ▼
[Fase 3: HUD, Menus & Controles Mobile/Desktop]
         │
         ▼
[Fase 4: MSW + Axios + TanStack Query]
         │
         ▼
[Fase 5: Painel Dev & Simulação de Falhas]
         │
         ▼
[Fase 6: Playwright E2E & Regressão Visual]
         │
         ▼
[Fase 7: Profiling, Docs & Deploy Vercel]
```

---

### ⚓ FASE 1: Setup do Ambiente e Arquitetura Base
- [ ] Inicializar projeto Vite com React 18 e TypeScript estrito (`strict: true`).
- [ ] Configurar TailwindCSS e ícones Lucide.
- [ ] Estruturar pastas modulares:
  - `src/game/` (Engine PixiJS, física, entidades, cena, partículas).
  - `src/components/` (Menus, HUD, Ranking, Histórico, Painel Dev).
  - `src/services/` (Axios client, API contracts).
  - `src/mocks/` (MSW handlers, fixtures, browser worker).
  - `src/hooks/` (TanStack Query hooks, game controller hook).
  - `src/types/` (TypeScript definitions).

---

### 🚢 FASE 2: Motor de Jogo PixiJS (Core 60 FPS & Física)
- [ ] **Scene Graph & Arena:** Oceano animado com shaders/tiles, limites da arena e ilhas sólidas com colisão SAT/AABB.
- [ ] **Navio do Jogador:**
  - Movimento para frente com aceleração náutica e inércia.
  - Rotação suave para bombordo e estibordo.
  - Barra de vida flutuante sobre o navio com feedback de dano.
- [ ] **Sistema de Combate e Canhões:**
  - **Tiro Frontal:** 1 bala de canhão direta.
  - **Tiro Lateral:** 3 balas paralelas simultâneas (bombordo / estibordo).
  - Cooldowns visíveis, alcance máximo e rastro de fumaça.
- [ ] **Inimigos Inteligentes:**
  - **Chaser:** Persegue o navio do jogador, desvia de ilhas e explode ao contato causando dano.
  - **Shooter:** Aproxima-se, mantém distância estratégica e dispara quando tem linha de visão.
- [ ] **Spawns e Limpeza:** Spawner seguro longe do jogador e fora de ilhas; projéteis removidos ao atingir alvos/obstáculos.

---

### 🖥️ FASE 3: Telas React, HUD e Controles Híbridos
- [ ] **Main Menu:** Visual pirata náutico elegante com ações Play, Options, Ranking e Match History.
- [ ] **Options:** Duração da partida (60s a 180s) e intervalo de spawn dos inimigos com persistência no `localStorage`.
- [ ] **HUD em Tempo Real:** Placar, tempo restante, barra de HP, mini-mapa/radar e botão de pausa.
- [ ] **Controles:**
  - Desktop: Teclado (WASD / Setas + Espaço / J / K / L).
  - Mobile: Joypad virtual e botões táteis dedicados para disparo frontal e lateral.
- [ ] **Tela de Resultado (Game Over / Vitória):** Pontuação final, tempo jogado, motivo de encerramento, status do envio da partida e botões *Play Again* e *Main Menu*.

---

### 🌐 FASE 4: Integração Remota (TanStack Query + Axios + MSW)
- [ ] Contratos REST tipados:
  - `GET /api/ranking` (paginado, ordenado por pontuação com desempate determinístico).
  - `GET /api/matches` (histórico paginado do jogador).
  - `POST /api/matches` (registro seguro com idempotência).
- [ ] Handlers MSW com fixtures de outros jogadores e persistência local (IndexedDB/localStorage).
- [ ] Query Hooks com cache, invalidação automática após envio de partida e retries com backoff.
- [ ] Fila de envio offline para partidas pendentes caso a rede falhe.

---

### 🧪 FASE 5: Painel Dev & Simulação de Falhas de Rede
- [ ] Painel lateral retrátil para testar cenários de rede em tempo real:
  - Latência ajustável (0ms a 3000ms) com simulação de jitter.
  - Injeção de Erro HTTP 4xx / 5xx.
  - Simulação de Timeout e Queda de Conexão.
  - Teste de idempotência (cliques múltiplos sem duplicar registros).
  - Reset de fixtures para o estado original.

---

### 🎭 FASE 6: Suíte de Testes Playwright (12 Cenários E2E)
- [ ] Configuração do Playwright com simulação de tempo determinístico (clock mock com seed).
- [ ] **12 Testes E2E Automatizados:**
  1. Navegação, validação e persistência das opções.
  2. Carregamento de assets, falhas e retentativa.
  3. Início de partida, movimento, rotação e colisão com ilhas.
  4. Disparos frontal e lateral, cooldowns e contagem de pontos.
  5. Comportamentos de IA (Chaser e Shooter) e spawn.
  6. Encerramento por tempo e por morte com reinício limpo.
  7. Pausa manual, perda de foco (blur da aba) e retomada.
  8. Exibição do resultado e persistência após refresh.
  9. Abandono de partida e controles de toque.
  10. Consulta e paginação das abas Ranking e Match History.
  11. Registro de partida e sincronização de envio pendente.
  12. Reenvio após timeout sem duplicação.
- [ ] Testes de regressão visual com snapshots das telas principais.

---

### 🚀 FASE 7: Performance, Documentação e Deploy
- [ ] **Profiling de Performance:** Teste contínuo a 60 FPS e validação de 5 ciclos de jogo sem crescimento de memória.
- [ ] **`README.md` (em inglês):** Setup, controles, scripts (`dev`, `build`, `preview`, `lint`, `test`), e guia dos cenários de teste.
- [ ] **`ARCHITECTURE.md` (em inglês):** Detalhamento da separação React/PixiJS, simulação delta-time, pooling, MSW e estratégia de cache.
- [ ] **Deploy Vercel:** Publicação com URL ativa e Service Worker funcional no ambiente de produção.

---

## 🎯 PRONTO PARA COMEÇAR?
Vamos executar cada fase com máxima qualidade e precisão técnica.

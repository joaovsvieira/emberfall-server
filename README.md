# Emberfall — Ecos da Floresta

Jogo de plataforma e combate 2D com modo solo e cooperativo online para **dois jogadores**. Phaser 3.90.0, TypeScript e servidor autoritativo Node.js com Colyseus 0.18.

## Executar

Requer Node.js 22 ou superior.

```bash
npm ci
npm start
```

Abra `http://localhost:2567` em dois navegadores ou dispositivos na mesma rede (no segundo dispositivo, use o IP do computador servidor). Em cada um, clique em **Jogar em dupla**, informe um apelido e crie uma sala ou entre pelo código. Marquem **Estou pronto**. O anfitrião inicia a jornada.

O servidor entrega também o jogo e configura sua própria conexão automaticamente. Não exige banco de dados, Redis, API de IA, chave de API ou arquivo `.env`. Em hospedagem, escuta em `0.0.0.0:$PORT`.

## Controles

- A/D ou setas: mover.
- W, seta para cima ou espaço: pulo e pulo duplo.
- F: combo de três golpes.
- Shift/K: dash com esquiva.
- Q/U: Corte Solar.
- E/I: Nova Rúnica.
- Escape: pausar. Online, a pausa vale para os dois.
- O som começa ativado após iniciar a jornada.

## Cooperativo

- Sala privada com código aleatório de seis caracteres, capacidade de dois jogadores e sem listagem pública.
- Apelidos de 2 a 18 caracteres, confirmação de prontidão e contagem regressiva.
- Cada jogador tem posição, vida, combo e recargas independentes.
- Inimigos, projéteis, dano, coleta de cura, chefe e resultado são controlados pelo servidor.
- Inimigos mais resistentes para a dupla; ambos os jogadores vivos devem chegar ao santuário para ativar o chefe.
- Aproxime-se de um companheiro caído por 2,5 segundos para reanimá-lo com 40 de vida. Se ambos caírem, a partida termina.
- Reconexão automática por até 25 segundos, com a partida pausada durante a queda. Após o prazo, o jogador restante pode continuar sozinho ou sair.
- O anfitrião pode reiniciar a fase após vitória/derrota; a sala e os jogadores são preservados.
- Sair definitivamente libera a vaga no lobby; durante uma partida iniciada, novas entradas são bloqueadas.

## Publicar gratuitamente no Render

Este projeto inclui `render.yaml` com um único **Web Service / Free** na região **Virginia**. Não crie Static Site: ele não executa o servidor multiplayer.

1. Envie estes arquivos para um repositório GitHub, GitLab ou Bitbucket. Mantenha `dist/`, `server/`, `package.json` e `package-lock.json` na raiz; não envie `node_modules/`.
2. No Render, use **New → Web Service** e conecte o repositório.
3. Configure:

| Campo | Valor |
|---|---|
| Runtime | Node |
| Region | Virginia |
| Branch | main |
| Build Command | `npm ci --omit=dev` |
| Start Command | `npm start` |
| Instance Type | Free |
| Health Check Path | `/health` |
| NODE_VERSION | `22.16.0` |
| NODE_ENV | `production` |

4. Publique e abra a URL HTTPS fornecida pelo Render. Esse endereço já inclui o jogo e o multiplayer.
5. Para conectar o endereço Sites anterior ao mesmo servidor, configure `dist/multiplayer-config.js` com a origem HTTPS exata do Render e publique uma nova versão no Sites. Não inclua caminhos, tokens ou credenciais. O Node ignora esse arquivo e fornece automaticamente `location.origin`.

O plano gratuito é adequado a testes de protótipo, não uma garantia de disponibilidade para um jogo comercial. Ele suspende o serviço após 15 minutos sem tráfego recebido, desperta em aproximadamente um minuto e disponibiliza 750 horas gratuitas mensais por workspace. Salas e partidas são temporárias em memória: reiniciar/republicar o servidor encerra as partidas. Não há progressão persistente para perder. Não adicione monitoramento artificial para contornar a suspensão gratuita.

Fontes: https://render.com/docs/free e https://render.com/docs/websocket

## Arquitetura

- `src/engine.ts`: simulação compartilhada. Solo roda a 120 Hz; servidor cooperativo roda a 60 Hz.
- `src/game.ts`: cena Phaser, controles, HUD, lobby, áudio e renderização.
- `src/network.ts`: cliente Colyseus, predição local e reconciliação com inputs ainda não reconhecidos.
- `server/room.mjs`: autoridade da sala, prontidão, vagas, reconexão, pausa, validação de inputs e snapshots a 20 Hz.
- `server/main.mjs`: HTTP, WebSocket, assets estáticos, configuração automática e `/health`.
- `dist/`: distribuição compilada, rastreada no Git para publicação sem dependências de desenvolvimento.
- `scripts/build.mjs`: transpila TypeScript e empacota o SDK de navegador.

O cliente envia comandos, nunca posição, dano ou vida. O servidor executa a simulação em intervalo fixo, limita fila e tamanho de mensagens, descarta sequência repetida e valida ações. Há limite de 32 salas por processo e de 30 tentativas de matchmaking por IP por minuto. As salas inativas no lobby expiram em 10 minutos e a sessão tem limite de duas horas. Esses limites são proteção básica de protótipo, não substituem proteção de infraestrutura contra ataques volumétricos.

## Desenvolvimento e verificação

```bash
npm run build
npm test
```

Os testes cobrem a lógica do modo solo, comandos inválidos e repetidos, habilidades independentes, reanimação, entrada conjunta no chefe e duas conexões WebSocket reais: sala, prontidão, limite de vagas, movimento, dano compartilhado, pausa, reconexão, vitória e reinício.

As animações usam poucos quadros com movimento procedural. O jogo é otimizado para teclado e tela horizontal. A versão não inclui PvP, conta de usuário, inventário persistente ou matchmaking público.

## Assets e licenças

Arte e marca originais geradas para este projeto; sem assets de Grand Chase. Sons sintetizados localmente via Web Audio. Phaser é MIT (licença incorporada no arquivo distribuído); Colyseus e demais dependências mantêm as licenças de seus pacotes. Fontes web são opcionais e têm fallback de sistema.


## Atualização 0.3 — PvP e controles

- Clique esquerdo na área do jogo executa o combo; segurar repete os golpes. F não ataca mais.
- Teclado, mouse e botões de habilidade só atuam durante a partida ativa. Em menus e pausa, os campos preservam digitação e atalhos nativos. Esc pausa durante a partida; use Continuar para retomar.
- Duelo PvP cria uma sala privada para dois jogadores com o mesmo fluxo de código ou link de convite do cooperativo.
- A arena usa o Santuário, sem monstros, com jogadores em lados opostos. Espada, corte solar e nova atingem apenas o adversário; não há reanimação ou cura de chefe.
- Cada derrota soma uma vitória ao adversário no servidor. O anfitrião pode iniciar uma revanche ou encerrar a sala; a revanche restaura vida e habilidades e mantém o placar.
- Quedas de conexão têm 25 segundos de tolerância com a partida pausada. Saída definitiva durante o duelo conta como desistência. Placar existe em memória enquanto a sala existir; encerrar a sala ou reiniciar o servidor encerra a sessão.
- Links de convite usam `?room=CODIGO&mode=pvp` (ou `coop`). O modo real é definido pela sala no servidor.

O repositório GitHub conectado ao Render é `joaovsvieira/emberfall-server`, branch `main`. O Render publica automaticamente alterações nessa branch. Como o deploy usa dependências de produção, execute `npm run build` e inclua `dist/` antes de publicar mudanças em `src/`.

Validação: `npm test` cobre controles em menus/pausa, simulação solo/cooperativa e duas conexões WebSocket para PvP com revanche, placar, reconexão e desistência.

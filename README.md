# Emberfall — Ecos da Floresta

Jogo de plataforma e combate 2D com modo solo e cooperativo online para **2 a 4 jogadores** e PvP 1 contra 1. Phaser 3.90.0, TypeScript e servidor autoritativo Node.js com Colyseus 0.18.

## Executar

Requer Node.js 22 ou superior. Configure `ACCOUNT_DATA_URL` e `DATA_SERVICE_KEY` no ambiente para usar o banco de contas. `.env.example` documenta as chaves; o processo não carrega `.env` automaticamente.

```bash
npm ci
npm start
```

Abra `http://localhost:2567` em dois a quatro navegadores ou dispositivos na mesma rede (no segundo dispositivo, use o IP do computador servidor). Em cada um, clique em **Jogar PvE**, informe um apelido e crie uma sala ou entre pelo código. Todos na sala marcam **Estou pronto**. Com pelo menos dois jogadores, o anfitrião inicia a jornada.

O servidor entrega também o jogo e configura sua conexão automaticamente. As contas exigem o banco Cloudflare D1 gerenciado pelo Sites e uma chave de serviço compartilhada com o Render. Não exige Redis ou API de IA. Em hospedagem, escuta em `0.0.0.0:$PORT`.

## Controles

- A/D ou setas: mover.
- W, seta para cima ou espaço: pulo e pulo duplo.
- Clique esquerdo: ataque do herói (segure para repetir).
- Shift/K: dash com esquiva.
- Q/U: primeira habilidade do herói.
- E/I: segunda habilidade do herói.
- Escape: pausar. Online, a pausa vale para todos.
- O som começa ativado após iniciar a jornada.

## Cooperativo

- Sala privada com código aleatório de seis caracteres, capacidade de quatro jogadores e sem listagem pública.
- Apelidos de 2 a 18 caracteres, confirmação de prontidão e contagem regressiva.
- Cada jogador tem posição, vida, combo e recargas independentes.
- Inimigos, projéteis, dano, coleta de cura, chefe e resultado são controlados pelo servidor.
- Vida dos inimigos aumenta conforme o número de participantes; todos os jogadores vivos devem chegar ao santuário para ativar o chefe.
- Aproxime-se de um companheiro caído por 2,5 segundos para reanimá-lo com 40 de vida. Se todos caírem, a partida termina.
- Reconexão automática por até 25 segundos, com a partida pausada durante a queda. Após o prazo, os jogadores restantes podem retomar a jornada ou sair.
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

Os testes cobrem a lógica do modo solo, comandos inválidos e repetidos, habilidades independentes, reanimação, entrada conjunta no chefe e duas e quatro conexões WebSocket reais: sala, prontidão, limite de vagas, movimento, dano compartilhado, pausa, reconexão, vitória e reinício.

As animações usam poucos quadros com movimento procedural. O jogo é otimizado para teclado e tela horizontal. Contas e capítulos são persistentes; inventário, evolução de níveis e matchmaking público ainda não estão implementados.

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


## Atualização 0.4 — Lyra e Caldeira de Obsidiana

Escolha Kael ou Lyra no menu inicial. A preferência é salva neste navegador e enviada ao servidor ao entrar em uma sala; cada jogador pode escolher seu próprio herói.

Lyra é uma maga de fogo com ataque básico à distância, orbe incandescente (Q/U) e explosão ígnea (E/I). Seus projéteis não causam dano nem são bloqueados pelo companheiro no cooperativo. No PvP, o servidor valida dano, cooldowns e colisões.

Ao vencer o primeiro chefe, escolha avançar ao capítulo II, reiniciar o capítulo ou voltar ao menu. No cooperativo, o anfitrião decide avançar e todos entram juntos com seus heróis, vida e habilidades restauradas. Caldeira de Obsidiana tem plataformas diferentes, mais inimigos, chefe mais resistente/agressivo e saídas de vapor incandescente com aviso antes de causar dano. Reiniciar o capítulo II mantém a fase selecionada.

O menu de pausa e as telas de resultado oferecem Menu principal. Quando alguém sai do cooperativo, os restantes recebem um aviso com a partida pausada e podem continuar (cada um retoma a pausa) ou sair. Encerrar PvP retorna o anfitrião ao menu e preserva o resultado final no cliente convidado, que também pode voltar ao menu. A interface distingue sessão solo, online e menu; callbacks da conexão anterior são invalidados antes de limpar a cena.

Arte original gerada com o recurso integrado de geração de imagens:
- `dist/assets/lyra.png`: folha transparente 2×2, quatro poses completas de maga adulta com trança ruiva, roupa violeta, armadura de cobre e capa carmesim, voltada à direita; poses parada, duas corridas e conjuração de fogo. O jogo recorta as quatro células preservando transparência.
- `dist/assets/caldera.png`: cenário lateral de cidadela vulcânica em obsidiana, arcos azul-violeta, lava distante e faixa contínua de basalto no chão; sem personagens, textos ou interface.

Validação inclui testes de saída de todos os modos, mensagens tardias de salas antigas, resultado PvP ao encerrar, combate mágico, travessia da fase II e progressão cooperativa entre capítulos.


## Atualização 0.5 — Aurel, Sylva, Cidadela da Geada e equipe de quatro

Os quatro heróis estão disponíveis no seletor inicial, com preferência local por navegador. A escolha acompanha cada jogador em todos os capítulos e reinícios.

| Herói | Clique esquerdo | Q / U | E / I |
|---|---|---|---|
| Aurel — suporte dourado | Centelha de luz, 20 de dano | Égide solar: absorve 40 de dano por até 5 s; recarga 9 s | Cura da aurora: +35 de vida em raio de 300 unidades, incluindo a si próprio; recarga 12 s |
| Sylva — arqueira verde | Flecha, 21 de dano | Flecha perfurante, 55 de dano; recarga 5 s | Cinco flechas caem à frente, 25 de dano cada; recarga 11 s |

Cura não excede 100 de vida e não reanima caídos. Projéteis atravessam aliados sem feri-los. No PvP, Aurel só cura a si próprio (+22), escudo absorve 22 e ataque causa 12; Sylva causa 12/25/9 por flecha básica/perfurante/chuva. Saúde, escudos, colisões e recargas são controlados no servidor.

PvE admite até quatro pessoas e inicia com duas, três ou quatro, desde que **todos os presentes** estejam conectados e prontos. PvP permanece com dois. O HUD mostra todos os colegas. O chefe espera todos os vivos no santuário. A vida dos inimigos escala por participante adicional: +35% para comuns e +65% para chefes. Sair durante a jornada pausa os restantes; cada um deve retomar para continuar, inclusive após transferência de anfitrião.

Ao derrotar o chefe II, o anfitrião (ou jogador solo) escolhe avançar ao capítulo III, reiniciar ou menu. Cidadela da Geada tem 18 inimigos, plataformas novas, seis erupções de gelo com sinalização prévia e o Soberano da Geada, com sete disparos em leque e ondas mais rápidas. Sua vida base é 1.032; os demais inimigos têm 1,75× a vida do capítulo I. O terceiro capítulo encerra a campanha e oferece reinício/menu.

Artes geradas para esta atualização: `aurel.png` (paladino de marfim e ouro, cajado solar), `sylva.png` (arqueira adulta de capuz verde e arco de madeira), folhas transparentes com quatro poses; `frosthold.png` (catedral congelada, aurora e piso de pedra coberto de geada). A extração de quadros preserva a ponta do arco de Sylva que ultrapassa o limite regular da célula.

Validação: combate dos dois heróis, limites e exclusões da cura, absorção/expiração do escudo, PvP, travessia de todos os capítulos e quatro clientes WebSocket locais com prontidão, limite de vagas, cura sincronizada, progressão, saída e retomada. Testes de interface usam uma fachada de cena, sem navegador.

## Atualização 0.8

Amizades, chat global/privado, XP por herói, loot individual, equipamentos, mercado por gold, histórico, ranking semanal e admin. Veja [docs/GAME_SYSTEMS.md](docs/GAME_SYSTEMS.md) para regras, fórmulas, catálogo, transações, limites e acesso administrativo. Para habilitar sua conta no admin, configure `ADMIN_ACCOUNT_IDS` no Render; o ID aparece em Configurações no jogo.

## Atualização 0.9

Loja Pix (10 cristais por R$ 0,01, configuração do vendedor pendente), capítulos/chaves por herói, Mítica+, clãs e histórico do mercado. [Regras](docs/MYTHIC_CLANS.md) · [Ativar Pix no Render](docs/PIX_SETUP.md) · [Continuidade](PROJECT_STATUS.md).

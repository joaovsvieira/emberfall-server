# Emberfall 0.10 — profissões, economia e jornadas

Este documento substitui as regras divergentes de 0.9. O catálogo de IDs é persistente: adicionar novos IDs é seguro; renomear IDs existentes exige migração.

## Escopo e experiência

Menu desktop: Loja, Profissões, Heróis, Conquistas, Histórico, Mapa, Mercado, Ranking, Clã, Email, Configurações. Mapa continua sendo a primeira tela após autenticação. Buscar partida é uma página interna acessada pelo mapa. As telas preservam a arte de fantasia escura com dourado. Não foram adicionados serviços pagos nem credenciais.

Profissões, receitas aprendidas, gold, gemas, skins compradas, correio e conquistas de conta pertencem à conta. XP, capítulos, inventário, equipamentos, atalhos, chaves, resgate semanal, títulos e aparência escolhida pertencem ao herói.

## Catálogo e extensão

`server/catalog.mjs` é compartilhado pelo Worker e servidor:

- `PROFESSIONS` e `PROFESSION_COST`: seis profissões, 100 gold por profissão; desbloqueio único por conta.
- `RECIPES`: profissão, nome, item de saída e mapa `materials` de ID para quantidade. Craft verifica todos os materiais dentro da transação. Nesta versão, Alquimia produz uma poção de cura menor com duas ervas da aurora.
- `ITEMS`: equipamentos, materiais, receitas e consumíveis. `kind` e `slot` controlam apresentação e uso. Equipamentos exigem classe e nível. Itens universais usam `hero:null`.
- `CHAPTER_DROPS`: drops garantidos adicionais ao equipamento e gold de conclusão: duas ervas e uma receita de poção. Receitas repetidas podem ser negociadas. IDs com sufixos estáveis evitam entrega duplicada nos retries. Alterar uma tabela de drops deve preservar os sufixos já usados; mudanças de economia que exijam retroatividade precisam de migração própria.
- `POTION`: cura 20% da vida máxima, cooldown compartilhado de 30 segundos por herói.
- `BALANCE.mobXp`: XP por espécie; multiplicador de capítulo em `chapterXp`. A progressão mantém a curva crescente já existente.
- `qualityBand` e `itemDefinition`: atributos efetivos calculados a partir do catálogo e da qualidade persistida na instância. Não criar novos IDs para variantes míticas.
- `SKINS`: Kael Guardião Astral, 10 gemas, sem bônus de atributos.
- `ACHIEVEMENTS`: define nome, escopo, objetivo e disponibilidade de título. Para adicionar uma conquista com novo evento, adicionar também sua condição autoritativa e um teste de idempotência.

Adicionar uma receita: criar ingredientes/saída em ITEMS, adicionar RECIPES, criar item kind recipe com campo recipe apontando ao ID e incluir esse item na tabela de drops desejada. Receitas só aparecem na profissão depois de aprendidas pelo inventário. A UI é alimentada pelo catálogo enviado no perfil.

## Inventário e consumo

Cada unidade mantém um ID persistente próprio para evitar duplicações. Materiais e consumíveis marcados com stackable:true no catálogo são agrupados em pilhas na mochila por herói, catálogo e qualidade. Equipamentos e receitas não empilham. Os atalhos mostram o total de unidades livres e continuam vinculados ao tipo mesmo quando esgotam; novas unidades repõem o mesmo atalho. Não há limite de mochila.

`items.location` assume inventory, bank ou consumed. Itens consumidos permanecem como registros para manter referências históricas e impedir que um retry os recrie. Itens equipados e anúncios ativos não aparecem na mochila, mas permanecem no perfil para os slots e validação de atributos. Cancelar anúncio ou desequipar devolve o item à visualização da mochila. Abas separam compatíveis/universais de outras classes.

Atalhos 1–5 guardam um ID de catálogo em `hero_hotbar`. A seleção reserva toda a pilha livre desse tipo para os atalhos. As unidades continuam no perfil com hotbar=1, mas ficam fora da mochila e não podem ser anunciadas nem depositadas no clã. Remover o último vínculo devolve as unidades restantes à mochila; novos drops/crafts do tipo abastecem o mesmo atalho. Se o mesmo tipo ocupar vários slots, todos compartilham quantidade e cooldown. Segurar Shift e passar o mouse sobre equipamento exibe o tooltip de atributos.

O cliente envia apenas o número do atalho ao Colyseus. A sala confere partida ativa, ausência de pausa, personagem vivo e vida faltante. `potion-use` é RPC interna, sem rota HTTP pública: consome exatamente uma unidade elegível e grava cooldown no mesmo batch. Mesmo herói em duas sessões não burla o cooldown. A aplicação da cura é limitada à vida máxima. Se a morte ou fim da partida ocorrer durante a confirmação de armazenamento, a poção já consumida não ressuscita nem altera um resultado final; o consumo permanece registrado.

## Chaves e resgate semanal

- Chave é do herói, capítulo e semana; somente a chave ativada pelo líder é consumida/resolvida. Convidados preservam suas chaves.
- Após quebra, uma NOVA conclusão normal concede +2 novamente. Repetir o processamento de uma conclusão antiga não concede chave. Conclusão normal nunca substitui uma chave disponível ou ativa.
- Morte nos capítulos não encerra a partida: renascimento com vida cheia após três segundos no checkpoint e dois segundos de invulnerabilidade. Inimigos, abates e tempo não reiniciam. Isso também se aplica quando todos morrem.
- Normal não tem limite de duração da jornada. Mítica continua com relógio real durante pausas e mortes; o prazo esgotado encerra a fase e quebra a chave. Abandono/encerramento da sala também resolve a chave como quebrada. PvP mantém morte terminal.
- Resgate: uma vez por herói por semana, no botão da página Heróis. Usa a maior chave válida da SEMANA IMEDIATAMENTE ANTERIOR do herói; desempate pelo capítulo mais alto. Chaves quebradas, ativas, da semana atual ou mais antigas não tornam o baú elegível. As chaves atuais preparam o resgate seguinte. O resgate não consome a chave.
- Uma chave quebrada não oferece recompensa pendente. Recompensa já coletada não é retirada. Se outra chave válida existir, ela continua elegível.
- Segunda-feira 00:00 de Brasília inicia nova semana, junto do ranking. Não existe acúmulo de baús antigos: durante a semana W, só chaves de W−7 dias são elegíveis. weekly_claims.week identifica a semana do resgate e impede duplicação. Resgates realizados antes da versão 0.11 continuam respeitados.

| Chave da conclusão / resgate | Qualidade | Multiplicador dos bônus do item |
| --- | --- | --- |
| Normal e +1–9 | 0 | 1,00 |
| +10–14 | 1 | 1,15 |
| +15–19 | 2 | 1,30 |
| +20 em diante | 3 | 1,50 |

Bônus arredondados; catálogo base e limites finais de velocidade permanecem. Drop de conclusão usa a chave com que a partida começou, enquanto baú usa a melhor chave válida da semana anterior. Qualidade acompanha o item no mercado e baú do clã. Não altera retroativamente itens antigos.

## Correio e mercado

Novas contas recebem mensagem de boas-vindas na mesma transação do cadastro. Email é correio INTERNO do jogo, não SMTP, e não altera login/recuperação de senha.

Compra no mercado debita comprador, transfere item, encerra anúncio e cria mensagem `sale:<sale-id>` para vendedor atomicamente. Gold fica no anexo até coletar. Coleta individual ou global atualiza carteira e marca mensagens no mesmo batch; repetir coleta não gera saldo. Somente o destinatário pode ler/coletar. Vendas anteriores à migração já foram pagas na carteira e não geram mensagens retroativas.

Mercado separa outros vendedores de meus anúncios. Filtros por nome, categoria e herói, iniciando no herói selecionado; materiais/receitas/poções universais passam pelo filtro de qualquer herói. Histórico de transações permanece paginado e restrito às partes.

## Clã e baú

Quatro abas grátis criadas no primeiro acesso. Até oito abas: aba 5 custa 500 gold; 6 custa 1.000; 7 custa 1.500; 8 custa 2.000. UI mostra abas abertas e somente a próxima bloqueada. Fundador paga da própria carteira e pode renomear (1–24 caracteres). Outros administradores não podem gastar pelo fundador.

Todos os membros depositam itens livres e retiram para um herói escolhido. Equipado, listado, consumido ou já transferido não pode ser depositado. Destino e associação ao clã são conferidos dentro do SQL. Duas retiradas simultâneas têm um único vencedor. Sem limite de espaço ou permissões por aba nesta versão.

O item depositado mantém o proprietário/herói de origem nos registros, mas fica inacessível à mochila enquanto location=bank. Ao retirar, atualiza proprietário/herói e volta a inventory. Excluir o clã devolve os itens remanescentes aos inventários de origem na mesma transação. Sair do clã individualmente não retira itens já depositados do baú. Log detalhado de ações e permissões customizadas são extensões futuras.

## Conquistas, aparência e combate

Três dragões da floresta substituem as criaturas voadoras do capítulo I. Cinco abates únicos liberam Caçador de dragões para o herói, contando jornadas diferentes e abates compartilhados PvE. Retry de XP não duplica abates. Lyra/Sylva usam Caçadora; Kael/Aurel, Caçador. O título é opcional. Primeiro ofício é uma conquista de conta ao aprender a primeira profissão.

Avisos temporários aparecem no topo; removida a mensagem persistente do rodapé. Conquistas inéditas são notificadas na atualização de perfil após XP/conclusão. Sons de menu respeitam mute. No resultado, foco vai ao container neutro; Espaço não aciona saída, Tab/Enter permitem navegação intencional.

Capítulo II: diabrete de lava, asa de cinzas, mago das brasas, guardião de obsidiana. Capítulo III: ceifador de gelo, serpe alada, feiticeiro glacial, dragão de gelo. Artes separadas, movimento, animação de preparação/recuo e padrões de chefe já diferenciados por capítulo. A espécie determina XP; kind mantém o comportamento compartilhado.

## Salas públicas

Visibilidade é opt-in do líder de lobby PvE. Busca autenticada mostra apenas salas visíveis, não iniciadas, com vaga e capítulo liberado para o herói escolhido. Exibe nível da chave selecionada e filtros por capítulo. Convites privados continuam funcionando. Líder pode remover convidados no lobby; não é banimento permanente. Todos os presentes precisam dar pronto. A presença de duas pessoas prontas já permite iniciar.

Registro de salas é local ao processo atual do Render, compatível com a implantação de instância única. Antes de escalar horizontalmente, substituir pelo driver/matchmaking distribuído do Colyseus. Salas e simulação ainda não sobrevivem ao encerramento de processo; chaves ativas de processo perdido requerem rotina de reconciliação futura, conforme limitações de 0.9.

## Persistência, validação e publicação

Migração 0005 adiciona dez tabelas e colunas em hero_progress, items e reward_events; mantém os registros existentes. Não reescrever migrações após publicação. Autoridade e atomicidade residem em worker/adventure-data.mjs, worker/game-data.mjs e server/room.mjs. Catálogo não aceita preço, cura, XP ou atributos fornecidos pelo navegador.

Testes em tests/adventure.test.mjs cobrem moeda, crafts concorrentes, receitas, consumo/cooldown, correio, baú, qualidade, resgate, refarm, títulos, skins, descoberta e remoção de membros com clientes WebSocket reais. Regressões de controles/respawn/resultados foram atualizadas. Não houve teste visual em navegador.

Publicar Worker/D1 primeiro, depois GitHub/Render. Build gera dist rastreado. Endpoint /health informa release 0.10.0. Nenhuma credencial de pagamento nova é necessária para gastar gemas já existentes; recarregar continua dependendo da configuração Pix documentada em PIX_SETUP.md.

Limites atuais: inventários e catálogos completos no perfil (paginar antes de grandes volumes); unidades individuais aumentam volume; rotinas de retenção de recibos/consumidos precisam preservar idempotência; sem ledger de auditoria geral do baú; não há recuperação automática de salas após restart.


## Atualização 0.10.1 — pilhas, lotes e feedback de fabricação

Correção visual: áreas de grid explícitas para personagem/equipamentos, detalhes, atalhos, XP/atributos, seleção de heróis e inventário. Cada seção ocupa sua própria área; painel lateral pode crescer sem sobrepor a progressão.

Materiais e poções empilham visualmente via `src/inventory.ts`; as unidades continuam individuais no banco para preservar IDs de drops e recibos existentes. Atalhos consomem uma unidade livre por uso e mantêm o vínculo após cada uso/cooldown.

Mercado: vendedor escolhe 1–999 unidades disponíveis do mesmo herói, catálogo e qualidade e informa o PREÇO TOTAL DO LOTE. Comprador vê quantidade e total, e compra o lote inteiro. Não há compra parcial de um anúncio. `listing_items` reserva todas as unidades do lote; crafting, atalhos, baú e equipamento consultam essa reserva. Cancelar devolve todas as unidades à pilha. Compra transfere todas atomicamente e envia um único anexo de gold ao vendedor. Quantidade fica no histórico de vendas. Migração 0006 converte anúncios antigos em lotes de uma unidade sem alterar o item nem preço.

Craft: botão mostra progresso por 1,5 segundo e permanece bloqueado até receber a confirmação. Som inicial e som de sucesso respeitam mute. Falhas exibem o erro e não tocam o som de sucesso. Tempo visual é feedback de interface; a autoridade de materiais e entrega continua no servidor. Baú do clã continua com transferências unitárias nesta versão.

Testes específicos em `tests/stacks.test.mjs`: agrupamento, reservas de todo o lote, consumo repetido do atalho, cancelamento, transferência concorrente, entrega ao herói, correio e validação de quantidades.

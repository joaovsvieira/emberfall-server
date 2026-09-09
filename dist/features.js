import { itemStacks } from './inventory.js';
import { HEROES, CHAPTERS } from './engine.js';
const $ = (id) => document.getElementById(id);
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const slots = { consumable: 'Poção', recipe: 'Receita', material: 'Material', head: 'Cabeça', armor: 'Armadura', weapon: 'Arma', gloves: 'Luvas', boots: 'Botas', accessory: 'Acessório' };
const attr = { maxHp: 'Vida', damage: 'Dano', defense: 'Defesa', speed: 'Movimento', attackSpeed: 'Vel. ataque' };
const modeNames = { solo: 'Solo', coop: 'Equipe', pvp: 'PvP' };
const outcomes = { won: 'Vitória', lost: 'Derrota', dead: 'Derrota', left: 'Saiu da partida' };
const duration = (ms) => `${Math.floor(ms / 60000)}:${String(Math.floor(ms / 1000) % 60).padStart(2, '0')}.${String(ms % 1000).padStart(3, '0')}`;
const date = (ms) => new Date(ms).toLocaleString('pt-BR');
export class Features {
    constructor(hub) {
        this.hub = hub;
        this.inventoryTab = 'class';
        this.friends = { friends: [], incoming: [], outgoing: [] };
        this.chatTarget = '';
        this.chatEpoch = 0;
        this.searchEpoch = 0;
        this.page = 1;
        this.marketPage = 1;
        this.loading = false;
        this.accountId = '';
        this.historyEpoch = 0;
        this.rankingEpoch = 0;
        this.marketEpoch = 0;
        $('footer-chat').onclick = () => { this.hub.toggleWidget('chat'); void this.loadChat(); };
        $('footer-friends').onclick = () => { this.hub.toggleWidget('friends'); void this.loadFriends(); };
        $('chat-close').onclick = () => this.hub.closeWidgets();
        $('friends-close').onclick = () => this.hub.closeWidgets();
        document.querySelectorAll('[data-chat-tab]').forEach(b => b.onclick = () => { this.hub.chatTab = b.dataset.chatTab; document.querySelectorAll('[data-chat-tab]').forEach(el => el.classList.toggle('active', el === b)); void this.loadChat(); });
        document.querySelectorAll('[data-friend-tab]').forEach(b => b.onclick = () => { this.hub.friendTab = b.dataset.friendTab; document.querySelectorAll('[data-friend-tab]').forEach(el => el.classList.toggle('active', el === b)); this.renderFriends(); });
        $('chat-form').onsubmit = e => { e.preventDefault(); void this.sendChat(); };
        $('chat-recipient').onchange = () => { this.chatTarget = $('chat-recipient').value; void this.loadChat(); };
        $('history-mode').onchange = () => { this.page = 1; void this.loadHistory(); };
        for (const id of ['ranking-mode', 'ranking-chapter', 'ranking-mythic'])
            $(id).onchange = () => void this.loadRanking();
        $('market-search').onsubmit = e => { e.preventDefault(); this.marketPage = 1; void this.loadMarket(); };
        document.querySelectorAll('[data-inventory-tab]').forEach(b => b.onclick = () => { this.inventoryTab = b.dataset.inventoryTab; this.renderInventory(); });
        $('market-hero').onchange = () => { this.marketPage = 1; void this.loadMarket(); };
        $('market-slot').onchange = () => { this.marketPage = 1; void this.loadMarket(); };
        $('market-mine').onchange = () => { this.marketPage = 1; void this.loadMarket(); };
        this.timer = setInterval(() => { if (!this.hub.profile || document.hidden)
            return; if (!$('friends-widget').classList.contains('hidden'))
            void this.loadFriends(); if (!$('chat-widget').classList.contains('hidden'))
            void this.loadChat(false); }, 5000);
        this.heartbeat = setInterval(() => { if (this.hub.profile)
            void this.request('presence', {}).then(() => { if (this.hub.scene.session === 'menu')
                return this.hub.refresh(false); }).catch(() => { }); }, 25000);
    }
    async request(path, value) { return this.hub.api('game/' + path, value); }
    notice(message) { $('hub-status').textContent = message; }
    async action(fn, target) { if (target)
        target.disabled = true; try {
        await fn();
    }
    catch (e) {
        this.notice(e.message);
        const status = $('social-status');
        status.textContent = e.message;
        $('chat-status').textContent = e.message;
    }
    finally {
        if (target)
            target.disabled = false;
    } }
    accepted() { if (this.accountId !== this.hub.profile.id) {
        this.accountId = this.hub.profile.id;
        this.friends = { friends: [], incoming: [], outgoing: [] };
        this.chatTarget = '';
        this.chatEpoch++;
        void this.request('presence', {}).catch(() => { });
        void this.loadFriends();
    } this.renderInventory(); }
    reset() { this.historyEpoch++; this.marketEpoch++; this.rankingEpoch++; for (const id of ['history-content', 'market-content', 'inventory-list', 'friends-content'])
        $(id).replaceChildren(); const dialog = $('trade-dialog'); if (dialog.open)
        dialog.close(); this.accountId = ''; this.chatEpoch++; this.searchEpoch++; this.friends = { friends: [], incoming: [], outgoing: [] }; this.chatTarget = ''; $('chat-messages').replaceChildren(); $('chat-input').value = ''; $('social-status').textContent = ''; $('chat-status').textContent = ''; }
    renderInventory() {
        const hero = this.hub.scene.selectedHero, owned = this.hub.profile?.heroes.find((h) => h.id === hero);
        if (!owned)
            return;
        const xp = owned.xp ?? 0, next = owned.nextXp ?? 100;
        $('hero-xp-label').textContent = next ? `${xp} / ${next} XP · próximo nível` : 'Nível máximo';
        $('hero-xp').max = next || 1;
        $('hero-xp').value = next ? xp : 1;
        const stats = owned.attributes ?? { maxHp: 100, damage: 100, defense: 0, speed: 100, attackSpeed: 100 };
        $('hero-power').textContent = `PODER ${Number(owned.power ?? 0).toLocaleString('pt-BR')}`;
        $('hero-attributes').innerHTML = Object.entries(stats).map(([key, value]) => `<div><span>${attr[key] ?? esc(key)}</span><strong>${esc(value)}${['damage', 'speed', 'attackSpeed'].includes(key) ? '%' : ''}</strong></div>`).join('');
        const items = owned.inventory ?? [], backpack = items.filter((i) => !i.equipped && !i.listed && !i.hotbar), filtered = itemStacks(backpack).filter((i) => this.inventoryTab === 'other' ? (i.definition.hero && i.definition.hero !== hero) : (!i.definition.hero || i.definition.hero === hero));
        document.querySelectorAll('[data-inventory-tab]').forEach(b => { b.classList.toggle('active', b.dataset.inventoryTab === this.inventoryTab); b.setAttribute('aria-pressed', String(b.dataset.inventoryTab === this.inventoryTab)); });
        document.querySelectorAll('[data-slot]').forEach(b => { const slot = b.dataset.slot, item = items.find((i) => i.slot === slot && i.equipped); b.innerHTML = `${slots[slot]}<small>${item ? esc(item.definition.name) : 'Vazio'}</small>${item ? `<span class="equipment-tooltip" role="tooltip"><strong>${esc(item.definition.name)}</strong>${Object.entries(item.definition.attributes).map(([k, v]) => `<span>+${v} ${attr[k]}</span>`).join('')}<small>Qualidade mítica ${item.quality ?? 0}</small></span>` : ''}`; b.disabled = !item; b.title = item ? 'Shift + passar o mouse: atributos. Clique: desequipar.' : 'Equipe pelo inventário'; b.onclick = () => void this.action(async () => { await this.request('equip', { hero, item: item.id, equip: false }); await this.hub.refresh(false); }, b); });
        $('inventory-count').textContent = `${backpack.length} itens na mochila · inventário de ${HEROES[hero].name}`;
        $('inventory-list').innerHTML = filtered.length ? filtered.map((i) => { const d = i.definition, gear = d.kind === 'equipment', recipe = d.kind === 'recipe'; return `<article class="item-card tier-${d.tier ?? 0}"><small>${slots[d.slot] ?? ''} · ${d.hero ? HEROES[d.hero].name : 'Todas as classes'}${i.quality ? ` · Mítica ${['', 'I', 'II', 'III'][i.quality]}` : ''}</small><strong>${esc(d.name)}${i.quantity > 1 ? ` <span class="stack-count">×${i.quantity}</span>` : ''}</strong><p>${Object.entries(d.attributes).map(([k, v]) => `+${v} ${attr[k]}`).join(' · ') || esc(d.description ?? '')}</p><div class="item-actions">${gear ? `<button class="mini-primary" data-equip="${esc(i.id)}" ${d.hero !== hero || owned.level < d.requiredLevel ? 'disabled' : ''}>${d.hero !== hero ? 'Outra classe' : 'Equipar'}</button>` : recipe ? `<button class="mini-primary" data-learn="${esc(i.id)}" ${this.hub.profile.recipes?.includes(d.recipe) ? 'disabled' : ''}>${this.hub.profile.recipes?.includes(d.recipe) ? 'Já aprendida' : 'Aprender receita'}</button>` : d.kind === 'consumable' ? '<small>Selecione nos atalhos 1–5 acima.</small>' : ''}<button class="mini-button" data-sell="${esc(i.id)}">Vender</button></div></article>`; }).join('') : '<p class="empty-state">Nenhum item nesta categoria. Itens equipados, consumíveis nos atalhos e anúncios ativos ficam fora da mochila.</p>';
        $('inventory-list').querySelectorAll('[data-equip]').forEach(b => b.onclick = () => void this.action(async () => { await this.request('equip', { hero, item: b.dataset.equip, equip: true }); await this.hub.refresh(false); }, b));
        $('inventory-list').querySelectorAll('[data-learn]').forEach(b => b.onclick = () => void this.hub.adventure.mutate('recipes/learn', { hero, item: b.dataset.learn }, b));
        $('inventory-list').querySelectorAll('[data-sell]').forEach(b => b.onclick = () => this.sellDialog(filtered.find((i) => i.id === b.dataset.sell)));
    }
    sellDialog(item) {
        const dialog = $('trade-dialog');
        $('trade-content').innerHTML = `<span class="eyebrow">MERCADO</span><h2>Vender item</h2><p>${esc(item.definition.name)}</p><label>Quantidade<input id="trade-quantity" type="number" min="1" max="${Math.min(999, item.quantity ?? 1)}" step="1" required value="1" ${(item.quantity ?? 1) === 1 ? 'readonly' : ''}/></label><label>Preço total do lote em gold<input id="trade-price" type="number" min="1" max="1000000000" step="1" required value="50" /></label><p>As unidades escolhidas ficam reservadas até vender ou cancelar. O comprador recebe o lote inteiro pelo preço total informado.</p><p id="trade-error" role="status"></p><div class="item-actions"><button type="button" id="trade-cancel" class="outline-button">Cancelar</button><button id="trade-confirm" class="primary-button">ANUNCIAR</button></div>`;
        $('trade-cancel').onclick = () => dialog.close();
        $('trade-content').onsubmit = async (e) => { e.preventDefault(); const b = $('trade-confirm'); b.disabled = true; try {
            await this.request('market/sell', { item: item.id, quantity: Number($('trade-quantity').value), price: Number($('trade-price').value) });
            dialog.close();
            await this.hub.refresh(false);
            this.notice('Item anunciado no mercado.');
        }
        catch (e) {
            $('trade-error').textContent = e.message;
        }
        finally {
            b.disabled = false;
        } };
        dialog.showModal();
    }
    async loadFriends() { if (!this.hub.profile)
        return; const id = this.accountId; try {
        const data = await this.request('friends');
        if (id !== this.accountId)
            return;
        this.friends = data;
        if (this.hub.friendTab !== 'add')
            this.renderFriends();
        const count = data.incoming.length;
        $('friend-request-count').textContent = count ? String(count) : '';
        this.renderRecipients();
    }
    catch (e) {
        $('social-status').textContent = e.message;
        $('chat-status').textContent = e.message;
    } }
    renderFriends() {
        const box = $('friends-content');
        if (this.hub.friendTab === 'add') {
            box.innerHTML = '<form id="friend-search-form" class="friend-add"><label for="friend-query">Buscar pelo nome de usuário</label><div class="friend-add-row"><input id="friend-query" class="mp-input" minlength="3" maxlength="18" required placeholder="Mínimo de 3 caracteres"/><button class="outline-button">Buscar</button></div></form><div id="friend-search-results"></div>';
            $('friend-search-form').onsubmit = e => { e.preventDefault(); void this.searchFriends(); };
            return;
        }
        const requests = this.hub.friendTab === 'requests', rows = requests ? [...this.friends.incoming, ...this.friends.outgoing] : this.friends.friends;
        box.innerHTML = rows.length ? rows.map((f) => { const incoming = f.requester !== this.accountId; return `<div class="friend-row"><span class="presence ${f.online ? 'online' : 'offline'}"></span><div><strong>${esc(f.name)}</strong><small>${requests ? (incoming ? 'Quer adicionar você' : 'Convite enviado') : (f.online ? 'Online' : 'Offline')}</small></div><div class="request-actions">${requests ? `${incoming ? `<button class="mini-primary" data-friend-action="accept" data-id="${esc(f.id)}">Aceitar</button>` : ''}<button class="mini-button" data-friend-action="${incoming ? 'reject' : 'cancel'}" data-id="${esc(f.id)}">${incoming ? 'Recusar' : 'Cancelar'}</button>` : `<button class="friend-more" aria-label="Opções de ${esc(f.name)}">•••</button><div class="friend-menu hidden"><button data-message="${esc(f.id)}">Conversar</button><button data-friend-action="remove" data-id="${esc(f.id)}">Remover amigo</button><button disabled>Convidar para sala</button><button disabled>Ver perfil</button></div>`}</div></div>`; }).join('') : `<p class="empty-state">${requests ? 'Nenhuma solicitação pendente.' : 'Adicione amigos para conversar e ver quem está online.'}</p>`;
        this.bindFriendActions(box);
        box.querySelectorAll('.friend-more').forEach(b => b.onclick = () => b.nextElementSibling?.classList.toggle('hidden'));
        box.querySelectorAll('[data-message]').forEach(b => b.onclick = () => { this.chatTarget = b.dataset.message; this.hub.chatTab = 'friends'; document.querySelectorAll('[data-chat-tab]').forEach(el => el.classList.toggle('active', el.dataset.chatTab === 'friends')); this.hub.toggleWidget('chat'); void this.loadChat(); });
    }
    bindFriendActions(box) { box.querySelectorAll('[data-friend-action]').forEach(b => b.onclick = () => void this.action(async () => { await this.request('friends/action', { target: b.dataset.id, action: b.dataset.friendAction }); await this.loadFriends(); if (this.hub.friendTab === 'add')
        await this.searchFriends(); }, b)); }
    async searchFriends() { const query = $('friend-query')?.value; if (!query)
        return; const epoch = ++this.searchEpoch, id = this.accountId; await this.action(async () => { const data = await this.request('friends/search?q=' + encodeURIComponent(query)); if (epoch !== this.searchEpoch || id !== this.accountId || !$('friend-search-results'))
        return; $('friend-search-results').innerHTML = data.users.length ? data.users.map((u) => `<div class="friend-row"><div><strong>${esc(u.name)}</strong><small>@${esc(u.username)}</small></div>${u.status ? `<small>${u.status === 'accepted' ? 'Já é seu amigo' : u.requester === this.accountId ? 'Convite enviado' : 'Solicitação recebida'}</small>` : `<button class="mini-primary" data-friend-action="add" data-id="${esc(u.id)}">Adicionar</button>`}</div>`).join('') : '<p class="empty-state">Nenhum jogador encontrado.</p>'; this.bindFriendActions($('friend-search-results')); }); }
    renderRecipients() { const select = $('chat-recipient'); select.classList.toggle('hidden', this.hub.chatTab !== 'friends'); const html = '<option value="">Selecione um amigo</option>' + this.friends.friends.map((f) => `<option value="${esc(f.id)}">${esc(f.name)} · ${f.online ? 'Online' : 'Offline'}</option>`).join(''); if (select.innerHTML !== html)
        select.innerHTML = html; select.value = this.chatTarget; }
    async loadChat(clear = true) {
        if (!this.hub.profile)
            return;
        const epoch = ++this.chatEpoch, channel = this.hub.chatTab, target = this.chatTarget;
        this.renderRecipients();
        const disabled = channel === 'clan' && !this.hub.profile.clan || channel === 'friends' && !target;
        $('chat-input').disabled = disabled;
        $('chat-form').querySelector('button').disabled = disabled;
        if (disabled) {
            $('chat-messages').innerHTML = `<p class="empty-state">${channel === 'clan' ? 'Entre em um clã para conversar neste canal.' : 'Selecione um amigo para iniciar uma conversa privada.'}</p>`;
            return;
        }
        if (clear)
            $('chat-messages').textContent = 'Carregando mensagens…';
        try {
            const data = await this.request(`chat?channel=${channel}&target=${encodeURIComponent(target)}`);
            if (epoch !== this.chatEpoch)
                return;
            this.showMessages(data.messages);
            $('social-status').textContent = '';
            $('chat-status').textContent = '';
        }
        catch (e) {
            if (epoch === this.chatEpoch) {
                $('social-status').textContent = e.message;
                $('chat-status').textContent = e.message;
            }
        }
    }
    showMessages(messages) { const box = $('chat-messages'), nearBottom = box.scrollHeight - box.scrollTop - box.clientHeight < 70; const markup = messages.length ? messages.map(m => `<div class="chat-message ${m.sender === this.accountId ? 'own' : ''}"><strong>${esc(m.name)} <small>${new Date(m.created_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</small></strong><p>${esc(m.text)}</p></div>`).join('') : '<p class="empty-state">Ainda não há mensagens. Comece a conversa.</p>'; if (box.innerHTML !== markup) {
        box.innerHTML = markup;
        if (nearBottom)
            box.scrollTop = box.scrollHeight;
    } }
    async sendChat() { const input = $('chat-input'), body = input.value.trim(); if (!body)
        return; const channel = this.hub.chatTab, target = this.chatTarget, account = this.accountId; await this.action(async () => { const data = await this.request('chat/send', { channel, target, body }); if (channel === this.hub.chatTab && target === this.chatTarget && account === this.accountId) {
        if (input.value.trim() === body)
            input.value = '';
        this.showMessages(data.messages);
        $('chat-messages').scrollTop = $('chat-messages').scrollHeight;
    } }); }
    open(tab) { if (tab === 'history')
        void this.loadHistory(); if (tab === 'ranking')
        void this.loadRanking(); if (tab === 'market') {
        $('market-hero').value = this.hub.scene.selectedHero;
        this.marketPage = 1;
        void this.loadMarket();
    } }
    pager(id, page, hasMore, change) { $(id).innerHTML = `<button class="outline-button" data-prev ${page === 1 ? 'disabled' : ''}>← Anterior</button><span>Página ${page}</span><button class="outline-button" data-next ${!hasMore ? 'disabled' : ''}>Próxima →</button>`; $(id).querySelector('[data-prev]').onclick = () => change(page - 1); $(id).querySelector('[data-next]').onclick = () => change(page + 1); }
    async loadHistory() { const epoch = ++this.historyEpoch, id = this.accountId; $('history-content').textContent = 'Carregando partidas…'; await this.action(async () => { const data = await this.request(`history?page=${this.page}&mode=${$('history-mode').value}`); if (epoch !== this.historyEpoch || id !== this.accountId)
        return; $('history-content').innerHTML = data.matches.length ? `<table><thead><tr><th>Data</th><th>Modo</th><th>Fase</th><th>Herói</th><th>Resultado</th><th>Tempo</th><th>Gold</th></tr></thead><tbody>${data.matches.map((m) => `<tr><td>${date(m.created_at)}</td><td>${modeNames[m.mode]}</td><td>${CHAPTERS[m.chapter].name}${m.mythic_level ? ` · Mítica +${m.mythic_level}` : ''}</td><td>${HEROES[m.hero].name}</td><td>${outcomes[m.player_outcome]}</td><td>${duration(m.duration_ms)}</td><td>+${m.gold}</td></tr>`).join('')}</tbody></table>` : '<p class="empty-state">Suas partidas concluídas aparecerão aqui.</p>'; this.pager('history-pages', data.page, data.hasMore, p => { this.page = p; void this.loadHistory(); }); }); }
    async loadRanking() { const epoch = ++this.rankingEpoch, mode = $('ranking-mode').value; $('ranking-chapter').disabled = mode === 'pvp'; $('ranking-mythic').disabled = mode === 'pvp'; $('ranking-content').textContent = 'Carregando classificação…'; await this.action(async () => { const data = await this.request(`ranking?mode=${mode}&mythic=${$('ranking-mythic').value}&chapter=${$('ranking-chapter').value}`); if (epoch !== this.rankingEpoch)
        return; $('ranking-reset').textContent = `Semana atual · próxima virada: ${date(data.nextReset)} (horário do seu navegador)`; $('ranking-content').innerHTML = data.entries.length ? `<table><thead><tr><th>#</th><th>${mode === 'coop' ? 'Equipe' : 'Jogador'}</th>${mode === 'pvp' ? '<th>Abates</th>' : '<th>Fase</th><th>Melhor tempo</th>'}</tr></thead><tbody>${data.entries.map((m, i) => `<tr><td>${i + 1}</td><td>${esc(m.name)}</td>${mode === 'pvp' ? `<td>${m.kills}</td>` : `<td>${CHAPTERS[m.chapter].name}${m.mythic_level ? ` · Mítica +${m.mythic_level}` : ''}</td><td>${duration(m.duration_ms)}</td>`}</tr>`).join('')}</tbody></table>` : '<p class="empty-state">Ainda não há resultados nesta semana.</p>'; }); }
    async loadMarket() { void this.hub.expansion?.transactions(); const epoch = ++this.marketEpoch, id = this.accountId; $('market-content').textContent = 'Carregando anúncios…'; await this.action(async () => { const q = $('market-query').value, slot = $('market-slot').value, mine = $('market-mine').value === '1', hero = $('market-hero').value; const data = await this.request(`market?page=${this.marketPage}&q=${encodeURIComponent(q)}&slot=${slot}&hero=${hero}${mine ? '&mine=1' : ''}`); if (epoch !== this.marketEpoch || id !== this.accountId)
        return; $('market-content').innerHTML = data.listings.length ? data.listings.map((l) => `<article class="item-card tier-${l.definition.tier}"><small>${slots[l.definition.slot]} · ${l.definition.hero ? HEROES[l.definition.hero].name : 'Todas as classes'}</small><strong>${esc(l.definition.name)}${l.quantity > 1 ? ` ×${l.quantity}` : ''}</strong><p>${Object.entries(l.definition.attributes).map(([k, v]) => `+${v} ${attr[k]}`).join(' · ')}</p><small>Vendedor: ${esc(l.seller_name)}</small><div class="item-actions"><b>✦ ${l.price} gold${l.quantity > 1 ? ' / lote' : ''}</b><button class="mini-primary" data-listing="${esc(l.id)}">${l.seller === this.accountId ? 'Cancelar anúncio' : 'Comprar'}</button></div></article>`).join('') : '<p class="empty-state">Nenhum anúncio encontrado. Você pode vender itens pelo inventário do herói.</p>'; $('market-content').querySelectorAll('[data-listing]').forEach(b => b.onclick = () => { const listing = data.listings.find((l) => l.id === b.dataset.listing); if (listing.seller === this.accountId)
        void this.action(async () => { await this.request('market/cancel', { listing: listing.id }); await this.hub.refresh(false); await this.loadMarket(); }, b);
    else
        this.buyDialog(listing); }); this.pager('market-pages', data.page, data.hasMore, p => { this.marketPage = p; void this.loadMarket(); }); }); }
    buyDialog(listing) { const dialog = $('trade-dialog'); $('trade-content').innerHTML = `<span class="eyebrow">MERCADO</span><h2>Comprar item</h2><p>${esc(listing.definition.name)} · ${listing.quantity ?? 1} unidade(s)</p><strong>✦ ${listing.price} gold · total do lote</strong><label>Entregar no inventário de<select id="trade-hero">${Object.entries(HEROES).map(([id, h]) => `<option value="${id}" ${id === this.hub.scene.selectedHero ? 'selected' : ''}>${h.name}</option>`).join('')}</select></label><p>${listing.definition.hero ? `Somente ${HEROES[listing.definition.hero].name} pode equipar este item.` : 'Este item pode ser usado por todas as classes.'} Após comprar, ele ficará no inventário do herói escolhido.</p><p id="trade-error" role="status"></p><div class="item-actions"><button type="button" id="trade-cancel" class="outline-button">Cancelar</button><button id="trade-confirm" class="primary-button">CONFIRMAR COMPRA</button></div>`; $('trade-cancel').onclick = () => dialog.close(); $('trade-content').onsubmit = async (e) => { e.preventDefault(); const b = $('trade-confirm'); b.disabled = true; try {
        await this.request('market/buy', { listing: listing.id, hero: $('trade-hero').value });
        dialog.close();
        await this.hub.refresh(false);
        await this.loadMarket();
        this.notice('Compra concluída. Equipe o item no inventário do herói.');
    }
    catch (e) {
        $('trade-error').textContent = e.message;
    }
    finally {
        b.disabled = false;
    } }; dialog.showModal(); }
}

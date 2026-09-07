import { HEROES, CHAPTERS } from './engine.js';
const $ = (id) => document.getElementById(id);
const visible = (id, on) => $(id).classList.toggle('hidden', !on);
export class Hub {
    constructor(scene) {
        this.scene = scene;
        this.profile = null;
        this.chapter = 1;
        this.tab = 'heroes';
        this.authMode = 'login';
        this.busy = false;
        this.generation = 0;
        this.heroSave = Promise.resolve();
        for (const tab of ['heroes', 'map', 'settings'])
            $('tab-' + tab).onclick = () => this.setTab(tab);
        $('auth-switch').onclick = () => { this.authMode = this.authMode === 'login' ? 'register' : 'login'; this.renderAuth(); };
        $('auth-form').onsubmit = e => { e.preventDefault(); void this.submit(); };
        $('auth-retry').onclick = () => void this.refresh();
        $('settings-fullscreen').onclick = () => $('fullscreen').click();
        $('settings-sound').onclick = () => { $('sound').click(); this.syncSound(); };
        $('settings-logout').onclick = () => void this.logout();
        $('map-1').onclick = () => this.selectChapter(1);
        $('map-2').onclick = () => this.selectChapter(2);
        $('map-3').onclick = () => this.selectChapter(3);
        $('start').onclick = () => void this.playSolo();
        $('hero-to-map').onclick = () => this.setTab('map');
        this.scene.net.onProgress = () => void this.refresh(false);
        this.renderAuth();
        visible('auth-screen', true);
        $('auth-status').textContent = 'Verificando sua sessão…';
        void this.refresh();
    }
    async api(path, value) { const response = await fetch('/api/' + path, { method: value === undefined ? 'GET' : 'POST', headers: value === undefined ? {} : { 'Content-Type': 'application/json' }, body: value === undefined ? undefined : JSON.stringify(value), signal: AbortSignal.timeout(75000) }); let data; try {
        data = await response.json();
    }
    catch {
        throw new Error('O servidor está despertando. Aguarde um momento e tente novamente.');
    } if (!response.ok)
        throw Object.assign(new Error(data.error ?? 'Não foi possível concluir.'), { status: response.status }); return data; }
    renderAuth() { const register = this.authMode === 'register'; $('auth-title').textContent = register ? 'Sua jornada começa aqui.' : 'Bem-vindo de volta.'; $('auth-submit').textContent = register ? 'CRIAR CONTA' : 'ENTRAR'; $('auth-switch').textContent = register ? 'Já tenho conta' : 'Criar uma conta'; $('auth-password').autocomplete = register ? 'new-password' : 'current-password'; $('auth-status').textContent = ''; }
    async submit() {
        if (this.busy)
            return;
        this.busy = true;
        this.generation++;
        for (const id of ['auth-submit', 'auth-switch'])
            $(id).disabled = true;
        $('auth-status').textContent = 'Conectando… O primeiro acesso pode levar um minuto.';
        try {
            const data = await this.api(this.authMode, { username: $('auth-username').value.trim(), password: $('auth-password').value });
            $('auth-password').value = '';
            this.accept(data.profile);
        }
        catch (e) {
            $('auth-status').textContent = e.message;
        }
        finally {
            this.busy = false;
            for (const id of ['auth-submit', 'auth-switch'])
                $(id).disabled = false;
        }
    }
    async refresh(showLogin = true) { const generation = this.generation; try {
        const data = await this.api('me');
        if (generation === this.generation)
            this.accept(data.profile, false);
    }
    catch (e) {
        if (generation !== this.generation)
            return;
        if (e.status === 401) {
            this.profile = null;
            visible('auth-screen', true);
            visible('start-screen', false);
            $('auth-status').textContent = 'Entre para continuar sua jornada.';
        }
        else if (showLogin) {
            visible('auth-screen', true);
            visible('start-screen', false);
            $('auth-status').textContent = e.message;
        }
        else
            $('hub-status').textContent = 'Não foi possível atualizar seu progresso. Tente novamente ao voltar ao menu.';
    } }
    accept(profile, initial = true) {
        const first = !this.profile;
        this.profile = profile;
        visible('auth-screen', false);
        $('account-name').textContent = profile.name;
        $('mp-name').value = profile.name;
        $('mp-name').readOnly = true;
        if (first || initial)
            this.scene.selectHero(profile.preferredHero);
        this.renderHeroes();
        this.renderMap();
        if (this.scene.session === 'menu') {
            visible('start-screen', true);
            this.setTab(this.tab);
        }
        if (first) {
            const invite = new URL(location.href);
            if (invite.searchParams.has('room')) {
                $(invite.searchParams.get('mode') === 'pvp' ? 'pvp' : 'multiplayer').click();
                $('mp-code').value = invite.searchParams.get('room') ?? '';
            }
        }
    }
    setTab(tab) { this.tab = tab; for (const name of ['heroes', 'map', 'settings']) {
        visible('panel-' + name, name === tab);
        $('tab-' + name).setAttribute('aria-selected', String(name === tab));
    } this.syncSound(); this.renderHeroes(); this.renderMap(); }
    syncSound() { $('settings-sound').textContent = $('sound').getAttribute('aria-label') === 'Desativar som' ? 'Som: ativado' : 'Som: desativado'; }
    heroSelected(hero) { if (!this.profile)
        return; this.profile.preferredHero = hero; this.renderHeroes(); this.heroSave = this.heroSave.catch(() => { }).then(async () => { try {
        await this.api('hero', { hero });
    }
    catch (e) {
        $('hub-status').textContent = 'Não foi possível salvar o herói padrão: ' + e.message;
    } }); }
    renderHeroes() {
        if (!this.profile)
            return;
        const id = this.scene.selectedHero, hero = HEROES[id], owned = this.profile.heroes.find((h) => h.id === id);
        $('roster-name').textContent = hero.name;
        $('roster-role').textContent = hero.role;
        $('roster-level').textContent = `NÍVEL ${owned?.level ?? 1}`;
        $('roster-image').src = this.scene.textures.get(this.scene.heroKey(id, 'idle')).getSourceImage().toDataURL();
        $('roster-basic').textContent = hero.attack;
        $('roster-q').textContent = hero.skill1;
        $('roster-e').textContent = hero.skill2;
        for (const h of Object.keys(HEROES))
            $('hero-' + h).disabled = !this.profile.heroes.some((owned) => owned.id === h);
    }
    selectChapter(id) { this.chapter = id; this.renderMap(); }
    renderMap() {
        if (!this.profile)
            return;
        const unlocked = this.profile.unlockedChapter;
        for (let id = 1; id <= 3; id++) {
            const button = $('map-' + id);
            button.classList.toggle('locked', id > unlocked);
            button.classList.toggle('selected', id === this.chapter);
            button.setAttribute('aria-pressed', String(id === this.chapter));
            $('map-state-' + id).textContent = id > unlocked ? 'BLOQUEADO · CONCLUA O ANTERIOR' : id < unlocked ? 'CONCLUÍDO · JOGAR NOVAMENTE' : 'DISPONÍVEL';
        }
        const selected = CHAPTERS[this.chapter];
        $('selected-map-name').textContent = selected.name;
        $('selected-map-copy').textContent = this.chapter > unlocked ? 'Conclua o capítulo anterior para liberar este destino.' : `${selected.boss} espera por você. Escolha como entrar no mapa.`;
        for (const id of ['start', 'multiplayer', 'pvp'])
            $(id).disabled = this.chapter > unlocked || this.scene.net.connecting;
    }
    canPlay() { return !!this.profile && this.chapter <= this.profile.unlockedChapter && !this.scene.net.connecting; }
    async playSolo() { if (!this.canPlay())
        return; this.scene.unlockAudio(); await this.heroSave; this.scene.session = 'online'; this.scene.selectedMode = 'solo'; visible('mp-panel', true); visible('mp-entry', false); visible('mp-lobby', false); $('mp-status').textContent = 'Preparando sua jornada…'; await this.scene.net.connect(this.profile.name, '', 'solo', this.scene.selectedHero, this.chapter); }
    async logout() { if (this.busy)
        return; this.busy = true; this.generation++; $('settings-logout').disabled = true; try {
        await this.heroSave;
        await this.api('logout', {});
        this.profile = null;
        await this.scene.goToMenu();
        visible('start-screen', false);
        visible('mp-panel', false);
        visible('auth-screen', true);
        this.renderAuth();
        $('auth-username').focus();
    }
    catch (e) {
        $('hub-status').textContent = e.message;
    }
    finally {
        this.busy = false;
        $('settings-logout').disabled = false;
    } }
}

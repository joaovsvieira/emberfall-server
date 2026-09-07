import { GameControls } from './controls.js';
import { Multiplayer } from './network.js';
import { World, platforms, LEVEL_WIDTH } from './engine.js';
const $ = (id) => document.getElementById(id);
const show = (id, visible) => $(id).classList.toggle('hidden', !visible);
let scene;
let soundEnabled = true;
let context = null;
let musicClock = 0;
function audioUnlock() { try {
    context ?? (context = new AudioContext());
    if (context.state === 'suspended')
        void context.resume();
}
catch { } }
function tone(freq, duration = .15, shape = 'sine', volume = .035, slide = 0) { if (!soundEnabled || !context)
    return; try {
    const o = context.createOscillator(), g = context.createGain();
    o.type = shape;
    o.frequency.value = freq;
    if (slide)
        o.frequency.exponentialRampToValueAtTime(Math.max(30, freq + slide), context.currentTime + duration);
    g.gain.setValueAtTime(volume, context.currentTime);
    g.gain.exponentialRampToValueAtTime(.0001, context.currentTime + duration);
    o.connect(g);
    g.connect(context.destination);
    o.start();
    o.stop(context.currentTime + duration);
}
catch { } }
function playSound(type) { if (type === 'slash') {
    tone(390, .12, 'triangle', .04, -280);
    tone(100, .1, 'sawtooth', .012, -55);
} if (type === 'hit')
    tone(130, .11, 'triangle', .05, -85); if (type === 'jump')
    tone(330, .15, 'sine', .025, 240); if (type === 'dash')
    tone(240, .17, 'triangle', .035, -160); if (type === 'solar') {
    tone(420, .35, 'sawtooth', .02, -220);
    tone(840, .4, 'sine', .025, -420);
} if (type === 'nova') {
    tone(120, .8, 'sine', .09, 350);
    tone(680, .6, 'triangle', .03, -550);
} if (type === 'hurt')
    tone(90, .25, 'sawtooth', .04, -50); if (type === 'heal') {
    tone(660, .2);
    setTimeout(() => tone(880, .3), 100);
} if (type === 'slam') {
    tone(60, .6, 'triangle', .1, -30);
} if (type === 'won') {
    [330, 440, 550, 660, 880].forEach((f, i) => setTimeout(() => tone(f, .9, 'sine', .04), i * 150));
} }
class ForestScene extends Phaser.Scene {
    constructor() {
        super('forest');
        this.world = new World();
        this.actors = new Map();
        this.ambient = [];
        this.paused = false;
        this.modalMode = '';
        this.controlsOpen = false;
        this.pending = [];
        this.held = { left: false, right: false };
        this.selectedMode = 'coop';
        this.lastHud = 0;
        this.lastZone = -1;
        this.accumulator = 0;
        this.uiReady = false;
        this.lastMusic = -3;
        this.net = new Multiplayer();
        this.remoteActors = new Map();
        this.activeRound = -1;
        this.networkLost = false;
        this.resultShown = false;
    }
    preload() { this.load.image('forest', 'assets/forest.png'); this.load.image('atlas', 'assets/characters.png'); this.load.on('progress', (v) => { $('load-fill').style.width = `${v * 100}%`; }); this.load.on('loaderror', () => { $('loading').querySelector('p').textContent = 'Não foi possível carregar a arte. Recarregue a página para tentar novamente.'; }); }
    create() {
        scene = this;
        if (!this.textures.exists('forest') || !this.textures.exists('atlas'))
            return;
        this.createTextures();
        this.bg = this.add.tileSprite(0, 0, 1280, 720, 'forest').setOrigin(0).setScrollFactor(0).setDepth(-10);
        this.bg.setTileScale(1280 / 1536, 720 / 1024);
        this.add.rectangle(0, 0, 1280, 720, 0x082432, .22).setOrigin(0).setScrollFactor(0).setDepth(-9);
        for (const gap of [[1120, 210], [2340, 210], [3090, 190]]) {
            this.add.rectangle(gap[0], 608, gap[1], 200, 0x061720, .96).setOrigin(0).setDepth(-3);
        }
        for (const b of platforms) {
            const h = b.ground ? 135 : 48;
            this.add.tileSprite(b.x, b.y, b.w, h, 'terrain').setOrigin(0).setDepth(0).setTileScale(.7, .7);
            this.add.rectangle(b.x, b.y + 1, b.w, 2, 0xb8d195, .6).setOrigin(0).setDepth(1);
            if (!b.ground)
                this.add.rectangle(b.x + 4, b.y + h - 9, b.w - 8, 9, 0x061e26, .7).setOrigin(0);
        }
        // Atmospheric particles are code-driven effects; world artwork uses generated raster assets.
        for (let i = 0; i < 58; i++) {
            const dot = this.add.circle((i * 173) % 1280, (i * 83) % 720, i % 4 === 0 ? 2 : 1, i % 3 === 0 ? 0xecd99b : 0xa6edc9, .15 + (i % 5) * .08).setScrollFactor(0).setDepth(i % 2 ? -2 : 8);
            this.ambient.push({ dot, x: dot.x, y: dot.y, speed: 8 + i % 15, phase: i });
        }
        this.add.text(215, 535, 'O LIMIAR', { fontFamily: 'Georgia', fontSize: '12px', color: '#dbd7b0', letterSpacing: 4 }).setAlpha(.5);
        this.add.text(1790, 419, 'RUÍNAS DO VÉU', { fontFamily: 'Georgia', fontSize: '12px', color: '#dbd7b0', letterSpacing: 3 }).setAlpha(.65);
        this.add.text(4080, 335, 'SANTUÁRIO DA CHAMA', { fontFamily: 'Georgia', fontSize: '15px', color: '#d8b579', letterSpacing: 4 }).setAlpha(.7);
        this.shadow = this.add.ellipse(190, 615, 66, 12, 0x001419, .5).setDepth(2);
        this.hero = this.add.image(190, 615, 'idle').setOrigin(.5, 1).setDepth(5);
        this.sizeActor(this.hero, 'idle', 126);
        for (const e of this.world.enemies) {
            const image = this.add.image(e.x, e.y, e.kind).setOrigin(.5, 1).setDepth(4);
            this.sizeActor(image, e.kind, e.kind === 'boss' ? 244 : e.kind === 'goblin' ? 88 : e.kind === 'bat' ? 100 : 135);
            this.actors.set(e.id, image);
        }
        this.fx = this.add.graphics().setDepth(7);
        this.projectileArt = this.add.graphics().setDepth(6);
        this.cameras.main.setBounds(0, 0, LEVEL_WIDTH, 720);
        this.input.keyboard.clearCaptures();
        this.input.keyboard.enabled = false;
        this.controls = new GameControls(() => this.canControl(), () => this.togglePause(), window, this.game.canvas);
        const idleCanvas = this.textures.get('idle').getSourceImage();
        $('portrait').src = idleCanvas.toDataURL();
        $('loading').classList.add('hidden');
        this.bindUI();
        this.bindMultiplayer();
        this.uiReady = true;
    }
    createTextures() {
        const source = this.textures.get('atlas').getSourceImage();
        const cells = { idle: [0, 80, 380, 405], run1: [380, 125, 380, 355], run2: [760, 125, 350, 355], slash: [1100, 95, 436, 390], goblin: [0, 660, 350, 335], wraith: [350, 545, 380, 430], bat: [710, 550, 390, 360], boss: [940, 495, 596, 515] };
        for (const [name, [x, y, w, h]] of Object.entries(cells)) {
            const canvas = document.createElement('canvas');
            canvas.width = w;
            canvas.height = h;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(source, x, y, w, h, 0, 0, w, h);
            let d = ctx.getImageData(0, 0, w, h);
            let minX = w, minY = h, maxX = 0, maxY = 0;
            for (let cy = 0; cy < h; cy++)
                for (let cx = 0; cx < w; cx++) {
                    const n = (cy * w + cx) * 4;
                    if (d.data[n + 3] < 75 || (name === 'boss' && cx < 200 && cy < 305) || (name === 'bat' && cy > 320 && cx > 240)) {
                        d.data[n + 3] = 0;
                    }
                    if (d.data[n + 3] > 0) {
                        minX = Math.min(minX, cx);
                        maxX = Math.max(maxX, cx);
                        minY = Math.min(minY, cy);
                        maxY = Math.max(maxY, cy);
                    }
                }
            ctx.putImageData(d, 0, 0);
            const tex = this.textures.createCanvas(name, Math.max(1, maxX - minX + 1), Math.max(1, maxY - minY + 1));
            tex.context.drawImage(canvas, minX, minY, maxX - minX + 1, maxY - minY + 1, 0, 0, maxX - minX + 1, maxY - minY + 1);
            tex.refresh();
        }
        const tex = this.textures.createCanvas('terrain', 700, 150);
        tex.context.drawImage(this.textures.get('forest').getSourceImage(), 400, 848, 700, 150, 0, 0, 700, 150);
        tex.refresh();
    }
    sizeActor(actor, key, height) { actor.setTexture(key); const source = this.textures.get(key).getSourceImage(); actor.setDisplaySize(height * source.width / source.height, height); }
    bindUI() {
        $('start').onclick = () => { audioUnlock(); this.startGame(); };
        $('controls').onclick = () => this.openControls();
        $('pause').onclick = () => this.togglePause();
        $('brand').onclick = (e) => { e.preventDefault(); this.togglePause(); };
        $('sound').onclick = () => { audioUnlock(); soundEnabled = !soundEnabled; $('sound').setAttribute('aria-label', soundEnabled ? 'Desativar som' : 'Ativar som'); $('sound').title = soundEnabled ? 'Desativar som' : 'Ativar som'; $('sound').querySelector('.mute-slash').style.display = soundEnabled ? 'none' : 'block'; if (soundEnabled)
            tone(440, .15); };
        $('fullscreen').onclick = async () => { try {
            if (document.fullscreenElement)
                await document.exitFullscreen();
            else
                await $('shell').requestFullscreen();
        }
        catch {
            this.toast('A tela cheia não está disponível neste navegador.');
        } };
        $('modal-primary').onclick = () => { audioUnlock(); if (this.networkLost) {
            void this.leaveOnline();
            return;
        } if (this.controlsOpen)
            this.closeControls();
        else if (this.world.status === 'dead' || this.world.status === 'won')
            this.restart();
        else
            this.resume(); };
        $('modal-secondary').onclick = () => { if (this.net.active || this.networkLost) {
            void this.leaveOnline();
            return;
        } if (this.controlsOpen)
            this.closeControls();
        else
            this.restart(); };
        for (const button of document.querySelectorAll('[data-action]')) {
            button.addEventListener('pointerdown', (e) => { if (!this.canControl())
                return; e.preventDefault(); audioUnlock(); this.pending.push(button.dataset.action); });
        }
        for (const button of document.querySelectorAll('[data-hold]')) {
            const dir = button.dataset.hold;
            button.addEventListener('pointerdown', e => { if (!this.canControl())
                return; e.preventDefault(); button.setPointerCapture(e.pointerId); this.held[dir] = true; });
            const release = () => this.held[dir] = false;
            button.addEventListener('pointerup', release);
            button.addEventListener('pointercancel', release);
            button.addEventListener('lostpointercapture', release);
        }
        if (matchMedia('(pointer: coarse)').matches) {
            $('shell').classList.add('is-touch');
        }
        document.addEventListener('visibilitychange', () => { if (document.hidden && this.world.status === 'playing' && !this.paused)
            this.togglePause(); });
        window.addEventListener('blur', () => { this.held = { left: false, right: false }; this.pending = []; this.controls.reset(); if (this.world.status === 'playing' && !this.paused)
            this.togglePause(); });
        $('modal').addEventListener('keydown', (e) => { if (e.key !== 'Tab')
            return; const items = [...$('modal').querySelectorAll('button')].filter(el => !el.classList.contains('hidden')); const first = items[0], last = items[items.length - 1]; if (e.shiftKey && document.activeElement === first) {
            e.preventDefault();
            last.focus();
        }
        else if (!e.shiftKey && document.activeElement === last) {
            e.preventDefault();
            first.focus();
        } });
    }
    startGame() { show('start-screen', false); show('hud', true); show('pause', true); show('touch', $('shell').classList.contains('is-touch')); $('shell').classList.add('playing'); this.world.start(); this.cameras.main.scrollX = 0; this.hero.setAlpha(1); this.sizeActor(this.hero, 'idle', 126); this.pending = []; this.controls.reset(); $('start').blur(); this.updateHUD(); }
    restart() { if (this.net.active) {
        this.net.command('restart');
        return;
    } this.world = new World(); this.lastMusic = -3; this.paused = false; this.controlsOpen = false; this.pending = []; this.held = { left: false, right: false }; this.accumulator = 0; this.cameras.main.scrollX = 0; this.tweens.killTweensOf(this.hero); this.hero.setAlpha(1); for (const e of this.world.enemies) {
        const a = this.actors.get(e.id);
        this.tweens.killTweensOf(a);
        a.setVisible(true).setAlpha(1).setTint(0xffffff);
        this.sizeActor(a, e.kind, e.kind === 'boss' ? 244 : e.kind === 'goblin' ? 88 : e.kind === 'bat' ? 100 : 135);
    } show('modal', false); show('boss-hud', false); this.world.start(); this.updateHUD(); this.controls.reset(); $('modal-primary').blur(); }
    togglePause() { if (this.world.status !== 'playing')
        return; if (this.paused) {
        this.resume();
        return;
    } this.paused = true; this.controls.reset(); if (this.net.active)
        this.net.command('pause', true); this.pending = []; this.held = { left: false, right: false }; this.showModal('UMA PAUSA NA JORNADA', 'Respire, viajante.', this.net.active ? 'A partida fica pausada para os dois jogadores.' : 'A floresta pode esperar.', 'CONTINUAR'); if (this.net.active)
        $('modal-secondary').textContent = this.world.mode === 'pvp' && this.net.lobby?.host === this.net.id ? 'Encerrar sala' : 'Sair da sala'; }
    resume() { this.paused = false; if (this.net.active)
        this.net.command('pause', false); this.pending = []; this.controls.reset(); show('modal', false); $('modal-primary').blur(); }
    openControls() { this.controlsOpen = true; this.showModal('PREPARE SUA ESPADA', 'Como jogar', 'Domine o movimento. Encontre o ritmo dos golpes.', 'ENTENDI'); show('controls-list', true); show('modal-secondary', false); }
    closeControls() { this.controlsOpen = false; show('modal', false); show('controls-list', false); $('controls').focus(); }
    showModal(eyebrow, title, copy, button) { this.controls.reset(); this.pending = []; this.held = { left: false, right: false }; show('pvp-result', false); $('modal-eyebrow').textContent = eyebrow; $('modal-title').textContent = title; $('modal-copy').textContent = copy; $('modal-primary').textContent = button; show('controls-list', false); show('modal-secondary', true); $('modal-primary').disabled = false; show('modal', true); requestAnimationFrame(() => $('modal-primary').focus()); }
    toast(text) { $('toast').textContent = text; $('toast').style.opacity = '1'; clearTimeout(this.toastTimer); this.toastTimer = setTimeout(() => $('toast').style.opacity = '0', 4200); }
    update(_time, delta) {
        if (!this.uiReady)
            return;
        const dt = Math.min(delta / 1000, .05);
        const t = _time / 1000;
        for (const a of this.ambient) {
            a.dot.x = (a.x + t * a.speed) % 1300 - 10;
            a.dot.y = a.y + Math.sin(t * .5 + a.phase) * 18;
            a.dot.alpha = .12 + (Math.sin(t + a.phase) + 1) * .16;
        }
        if (!this.controls.sync()) {
            this.pending = [];
            this.held = { left: false, right: false };
            this.accumulator = 0;
        }
        if (this.world.status === 'ready' && this.activeRound < 1) {
            this.hero.setPosition(930, 615 + Math.sin(t * 2) * 2);
            this.sizeActor(this.hero, 'idle', 175);
            this.shadow.setPosition(930, 615).setScale(1.3);
            for (const [id, a] of this.actors)
                a.setVisible(id === 0).setPosition(1130, 615);
            return;
        }
        if (this.canControl()) {
            const sampled = this.controls.sample();
            const actions = [...new Set([...(sampled.actions ?? []), ...this.pending.splice(0)])];
            const input = { ...sampled, left: sampled.left || this.held.left, right: sampled.right || this.held.right, actions };
            this.accumulator += dt;
            let first = true;
            const tick = this.net.active ? 1 / 60 : 1 / 120;
            while (this.accumulator >= tick) {
                const nextInput = this.paused ? {} : { ...input, actions: first ? actions : [] };
                if (this.net.active) {
                    this.net.step(nextInput);
                    if (this.net.snapshot?.players.some((p) => p.id === this.net.id))
                        this.world.player = this.net.predictor.player;
                }
                else
                    this.world.update(tick, nextInput);
                this.accumulator -= tick;
                first = false;
            }
            if (first)
                this.pending.unshift(...actions);
            if (!this.net.active)
                for (const event of this.world.events.splice(0))
                    this.event(event);
            if (soundEnabled && !this.paused && (!this.net.active || this.net.canSimulate) && this.world.time - this.lastMusic > 2.8) {
                this.lastMusic = this.world.time;
                const notes = [164.81, 196, 220, 146.83, 164.81, 130.81];
                tone(notes[musicClock++ % notes.length], 2.6, 'sine', .014);
                tone(notes[(musicClock + 2) % notes.length] * 2, 2, 'sine', .007);
            }
        }
        this.renderActors(t);
        this.renderPeers(t);
        if (_time - this.lastHud > 80) {
            this.updateHUD();
            this.lastHud = _time;
        }
    }
    canControl() { return this.world.status === 'playing' && !this.paused && !this.controlsOpen && !this.networkLost && $('modal').classList.contains('hidden') && $('mp-panel').classList.contains('hidden') && $('start-screen').classList.contains('hidden') && (!this.net.active || this.net.canSimulate); }
    renderActors(t) {
        const p = this.world.player;
        const target = this.world.mode === 'pvp' ? LEVEL_WIDTH - 1280 : Phaser.Math.Clamp(p.x - 460, 0, LEVEL_WIDTH - 1280);
        this.cameras.main.scrollX = Phaser.Math.Linear(this.cameras.main.scrollX, target, .09);
        this.bg.tilePositionX = this.cameras.main.scrollX * .13;
        const key = p.attack > 0 ? 'slash' : !p.grounded || Math.abs(p.vx) > 45 ? (Math.floor(this.world.time * 10) % 2 ? 'run1' : 'run2') : 'idle';
        this.sizeActor(this.hero, key, 126);
        this.hero.setPosition(p.x, p.y + (p.grounded && key === 'idle' ? Math.sin(t * 3) * 1.2 : 0)).setFlipX(p.dir < 0).setAlpha(p.invincible > 0 ? (Math.floor(t * 17) % 2 ? .45 : 1) : 1).setAngle(p.dash > 0 ? p.dir * 8 : 0);
        this.shadow.setPosition(p.x, Math.min(615, p.y + 8)).setAlpha(p.grounded ? .5 : .15).setScale(p.grounded ? 1 : .65);
        this.fx.clear();
        if (p.dash > 0 && !this.paused && Math.floor(t * 60) % 2 === 0) {
            const ghost = this.add.image(p.x - p.dir * 24, p.y, key).setOrigin(.5, 1).setFlipX(p.dir < 0).setDisplaySize(this.hero.displayWidth, 126).setTint(0x83f4e1).setAlpha(.35).setDepth(3);
            this.tweens.add({ targets: ghost, alpha: 0, duration: 200, onComplete: () => ghost.destroy() });
        }
        for (const [id, a] of this.actors)
            if (!this.world.enemies.some(e => e.id === id))
                a.setVisible(false);
        for (const e of this.world.enemies) {
            const a = this.actors.get(e.id);
            if (e.dead) {
                if (this.net.active)
                    a.setVisible(false);
                continue;
            }
            a.setVisible(true).setPosition(e.x, e.y + (e.kind === 'bat' ? Math.sin(t * 13 + e.id) * 5 : e.kind === 'goblin' ? Math.sin(t * 5 + e.id) * 1 : 0)).setFlipX(e.dir > 0).setTint(e.flash > 0 ? 0xffe5b3 : e.windup > 0 ? 0xffb580 : 0xffffff);
            if (e.kind === 'bat')
                a.setScale(a.scaleX, Math.abs(a.scaleX) * (1 + Math.sin(t * 16) * .10));
            if (e.active && e.kind !== 'boss' && e.hp < e.maxHp) {
                this.fx.fillStyle(0x04161f, .8);
                this.fx.fillRect(e.x - 24, e.y - a.displayHeight - 15, 48, 4);
                this.fx.fillStyle(0xe9be83);
                this.fx.fillRect(e.x - 24, e.y - a.displayHeight - 15, 48 * (e.hp / e.maxHp), 4);
            }
            if (e.windup > 0) {
                if (e.kind === 'boss' && e.phase % 2 === 0) {
                    this.fx.fillStyle(0xef7844, .16 + .15 * Math.sin(t * 25));
                    this.fx.fillEllipse(e.attackX, 610, 290, 35);
                    this.fx.lineStyle(2, 0xffa361, .8);
                    this.fx.strokeEllipse(e.attackX, 610, 290, 35);
                }
                else {
                    this.fx.lineStyle(2, 0xffaf74, .9);
                    this.fx.strokeCircle(e.x, e.y - a.displayHeight - 22, 6);
                }
            }
        }
        if ((this.world.bossActive || this.world.mode === 'pvp') && this.world.status === 'playing') {
            this.fx.lineStyle(3, 0xe8bd80, .5 + Math.sin(t * 4) * .2);
            this.fx.lineBetween(3820, 360, 3820, 615);
            this.fx.lineBetween(4770, 360, 4770, 615);
        }
        this.projectileArt.clear();
        for (const s of this.world.projectiles) {
            const color = s.friendly ? 0xffe3a3 : 0xd895f1;
            this.projectileArt.fillStyle(color, .1);
            this.projectileArt.fillCircle(s.x, s.y, s.friendly ? 45 : 17);
            this.projectileArt.fillStyle(color, .4);
            this.projectileArt.fillCircle(s.x, s.y, s.friendly ? 22 : 9);
            this.projectileArt.fillStyle(0xffffff, .9);
            if (s.friendly) {
                this.projectileArt.fillEllipse(s.x, s.y, 12, 104);
                this.projectileArt.lineStyle(4, color, .8);
                this.projectileArt.lineBetween(s.x, s.y - 45, s.x - Math.sign(s.vx) * 38, s.y);
            }
            else
                this.projectileArt.fillCircle(s.x, s.y, 4);
        }
        for (const h of this.world.pickups) {
            const y = h.y + Math.sin(t * 4 + h.x) * 5;
            this.projectileArt.fillStyle(0x8cedad, .13);
            this.projectileArt.fillCircle(h.x, y, 17);
            this.projectileArt.fillStyle(0xaaffcc, .8);
            this.projectileArt.fillCircle(h.x, y, 5);
            this.projectileArt.fillStyle(0xffffff, .9);
            this.projectileArt.fillCircle(h.x - 1, y - 1, 2);
        }
    }
    bindMultiplayer() {
        const openOnline = (mode) => { this.selectedMode = mode; audioUnlock(); show('mp-panel', true); show('mp-entry', true); show('mp-lobby', false); this.setModeTitle(mode); $('mp-status').textContent = ''; this.controls.reset(); $('mp-name').focus(); };
        $('multiplayer').onclick = () => openOnline('coop');
        $('pvp').onclick = () => openOnline('pvp');
        const connect = (join) => { const name = $('mp-name').value.trim(), raw = $('mp-code').value.trim(); let code = raw.toUpperCase(); try {
            code = new URL(raw).searchParams.get('room')?.toUpperCase() ?? code;
        }
        catch { } ; if (name.length < 2) {
            $('mp-status').textContent = 'Informe um apelido de 2 a 18 caracteres.';
            return;
        } if (join && !/^[A-Z2-9]{6}$/.test(code)) {
            $('mp-status').textContent = 'Informe o código de 6 caracteres.';
            return;
        } audioUnlock(); void this.net.connect(name, join ? code : '', this.selectedMode); };
        $('mp-create').onclick = () => connect(false);
        $('mp-join-form').onsubmit = e => { e.preventDefault(); connect(true); };
        $('mp-back').onclick = () => void this.leaveOnline();
        $('mp-ready').onclick = () => { const own = this.net.lobby?.members.find((m) => m.id === this.net.id); this.net.command('ready', !own?.ready); };
        $('mp-start').onclick = () => { audioUnlock(); this.net.command('start'); };
        $('mp-copy').onclick = async () => { try {
            await navigator.clipboard.writeText(this.net.lobby?.code ?? '');
            $('mp-status').textContent = 'Código copiado. Envie para seu amigo.';
        }
        catch {
            $('mp-status').textContent = 'Selecione e copie o código exibido acima.';
        } };
        $('mp-copy-link').onclick = async () => { const url = new URL(location.href); url.searchParams.set('room', this.net.lobby?.code ?? ''); url.searchParams.set('mode', this.net.lobby?.mode ?? 'coop'); try {
            await navigator.clipboard.writeText(url.href);
            $('mp-status').textContent = 'Convite copiado. Envie para seu amigo.';
        }
        catch {
            $('mp-status').textContent = 'Copie o código da sala para convidar seu amigo.';
        } };
        const invite = new URL(location.href);
        if (invite.searchParams.has('room')) {
            openOnline(invite.searchParams.get('mode') === 'pvp' ? 'pvp' : 'coop');
            $('mp-code').value = invite.searchParams.get('room') ?? '';
        }
        $('mp-panel').addEventListener('keydown', (e) => { if (e.key === 'Escape') {
            void this.leaveOnline();
            return;
        } if (e.key !== 'Tab')
            return; const items = [...$('mp-panel').querySelectorAll('button,input')].filter(el => el.offsetParent !== null && !el.disabled); const first = items[0], last = items[items.length - 1]; if (e.shiftKey && document.activeElement === first) {
            e.preventDefault();
            last.focus();
        }
        else if (!e.shiftKey && document.activeElement === last) {
            e.preventDefault();
            first.focus();
        } });
        this.net.onNotice = text => { $('mp-status').textContent = text; this.toast(text); };
        this.net.onConnection = state => {
            const busy = state === 'connecting';
            for (const id of ['mp-create', 'mp-join', 'mp-name', 'mp-code'])
                $(id).disabled = busy;
            if (busy)
                $('mp-status').textContent = 'Conectando à floresta… Na primeira visita, o servidor pode levar um minuto para despertar.';
            if (state === 'connected') {
                $('mp-status').textContent = '';
                this.networkLost = false;
                show('network-banner', false);
            }
            if (state === 'reconnecting') {
                $('network-banner').textContent = 'Conexão interrompida. Tentando reconectar…';
                show('network-banner', true);
            }
            if (state === 'disconnected') {
                this.networkLost = true;
                this.paused = true;
                show('mp-panel', false);
                this.showModal('CONEXÃO ENCERRADA', 'A sala foi encerrada.', 'Você pode voltar ao menu e criar uma nova sala.', 'VOLTAR AO MENU');
                show('modal-secondary', false);
            }
        };
        this.net.onLobby = s => this.renderLobby(s);
        this.net.onSnapshot = s => {
            if (s.round !== this.activeRound && s.round > 0) {
                this.activeRound = s.round;
                this.resultShown = false;
                this.lastMusic = -3;
                this.paused = false;
                this.accumulator = 0;
                show('modal', false);
                this.pending = [];
                this.controls.reset();
                this.cameras.main.scrollX = s.mode === 'pvp' ? LEVEL_WIDTH - 1280 : 0;
                for (const [id, a] of this.actors) {
                    this.tweens.killTweensOf(a);
                    a.setAlpha(1).setVisible(true).setTint(0xffffff);
                }
                for (const a of this.remoteActors.values()) {
                    a.image.destroy();
                    a.label.destroy();
                }
                this.remoteActors.clear();
            }
            if (!s.players.some((p) => p.id === this.net.id))
                return;
            this.world.mode = s.mode ?? 'coop';
            this.world.winnerId = s.winnerId;
            this.world.players = s.players.map((p) => ({ ...p }));
            this.world.player = this.net.predictor.player;
            this.world.status = s.status;
            this.world.time = s.time;
            this.world.elapsed = s.elapsed;
            this.world.kills = s.kills;
            this.world.bossActive = s.bossActive;
            this.world.enemies = s.enemies.map((e) => ({ ...e }));
            this.world.projectiles = s.projectiles;
            this.world.pickups = s.pickups;
            if (s.stage === 'countdown') {
                show('mp-panel', true);
                show('mp-lobby', true);
                show('mp-entry', false);
            }
            if (s.stage === 'playing') {
                show('start-screen', false);
                show('mp-panel', false);
                show('hud', true);
                show('pause', true);
                show('session-hud', true);
                show('touch', $('shell').classList.contains('is-touch'));
                $('shell').classList.add('playing');
                $('mp-start').blur();
            }
            if (['dead', 'won'].includes(s.status) && !this.resultShown) {
                if (s.mode === 'pvp')
                    this.showPvpResult(s);
                else
                    this.event({ type: s.status });
            }
        };
        this.net.onEvents = events => { for (const ev of events) {
            if (['dead', 'won'].includes(ev.type) && (this.resultShown || this.world.mode === 'pvp'))
                continue;
            this.event(ev);
        } };
    }
    renderLobby(s) {
        if (s.stage === 'lobby' && this.net.active)
            show('mp-panel', true);
        this.setModeTitle(s.mode ?? 'coop');
        $('mp-start').textContent = s.mode === 'pvp' ? 'INICIAR DUELO' : 'INICIAR JORNADA';
        show('mp-entry', false);
        show('mp-lobby', true);
        $('mp-room-code').textContent = s.code;
        $('session-code').textContent = `SALA ${s.code}`;
        $('mp-members').replaceChildren();
        for (let i = 0; i < 2; i++) {
            const member = s.members[i];
            const card = document.createElement('div');
            card.className = 'member-card';
            if (member) {
                card.classList.toggle('ready', member.ready);
                const name = document.createElement('strong');
                name.textContent = member.name + (member.id === this.net.id ? ' · você' : '');
                const state = document.createElement('span');
                state.textContent = !member.connected ? 'Reconectando…' : member.ready ? 'Pronto' : 'Preparando';
                card.append(name, state);
            }
            else {
                card.classList.add('empty');
                card.textContent = s.mode === 'pvp' ? 'Aguardando seu adversário…' : 'Aguardando seu companheiro…';
            }
            $('mp-members').append(card);
        }
        if (this.resultShown && s.mode === 'pvp')
            this.updatePvpResultButtons(s);
        const own = s.members.find((m) => m.id === this.net.id), host = s.host === this.net.id;
        $('mp-ready').textContent = own?.ready ? 'PRONTO ✓ · CANCELAR' : 'ESTOU PRONTO';
        $('mp-ready').disabled = s.stage !== 'lobby';
        show('mp-start', host);
        $('mp-start').disabled = s.stage !== 'lobby' || s.members.length !== 2 || s.members.some((m) => !m.ready || !m.connected);
        $('mp-lobby-hint').textContent = s.stage === 'countdown' ? 'A partida está começando…' : s.members.length < 2 ? 'Envie o código para um amigo entrar.' : host ? 'Quando os dois estiverem prontos, inicie a jornada.' : 'Marque-se como pronto. O anfitrião inicia a jornada.';
        show('mp-countdown', s.stage === 'countdown');
        $('mp-countdown').textContent = String(s.countdown);
        if (s.stage === 'playing' && this.net.connected) {
            const dropped = s.members.find((m) => !m.connected), paused = s.members.find((m) => m.paused);
            const message = dropped ? `${dropped.name} está reconectando. A partida está pausada.` : paused && paused.id !== this.net.id ? `${paused.name} pausou a partida.` : '';
            if (message) {
                $('network-banner').textContent = message;
                show('network-banner', true);
            }
            else if (!this.networkLost)
                show('network-banner', false);
        }
    }
    async leaveOnline() { if (this.net.active && this.net.lobby?.host === this.net.id && this.net.lobby?.mode === 'pvp')
        this.net.command('close'); await this.net.leave(); this.networkLost = false; this.activeRound = -1; this.paused = false; this.resultShown = false; this.world = new World(); this.accumulator = 0; this.pending = []; this.held = { left: false, right: false }; this.controls.reset(); this.cameras.main.scrollX = 0; this.bg.tilePositionX = 0; this.fx.clear(); this.projectileArt.clear(); this.hero.setAlpha(1).setAngle(0).setTint(0xffffff); for (const a of this.remoteActors.values()) {
        a.image.destroy();
        a.label.destroy();
    } this.remoteActors.clear(); for (const a of this.actors.values()) {
        this.tweens.killTweensOf(a);
        a.setAlpha(1).setTint(0xffffff);
    } for (const id of ['mp-panel', 'modal', 'hud', 'pause', 'touch', 'peer-hud', 'session-hud', 'network-banner', 'duel-hud'])
        show(id, false); show('start-screen', true); $('shell').classList.remove('playing'); $('modal-secondary').textContent = 'Reiniciar jornada'; $('modal-primary').disabled = false; $('multiplayer').focus(); }
    renderPeers(t) {
        if (!this.net.active)
            return;
        const ids = new Set(this.world.players.filter(p => p.id !== this.net.id).map(p => p.id));
        for (const [id, a] of this.remoteActors) {
            if (!ids.has(id)) {
                a.image.destroy();
                a.label.destroy();
                this.remoteActors.delete(id);
            }
        }
        const own = this.world.player;
        this.hero.setTint(own.hp <= 0 ? 0x829da4 : 0xffffff);
        this.hero.setAngle(own.hp <= 0 ? -75 : own.dash > 0 ? own.dir * 8 : 0);
        for (const p of this.world.players) {
            if (p.id === this.net.id)
                continue;
            let a = this.remoteActors.get(p.id);
            if (!a) {
                a = { image: this.add.image(p.x, p.y, 'idle').setOrigin(.5, 1).setDepth(4), label: this.add.text(p.x, p.y - 145, p.name, { fontFamily: 'Arial', fontSize: '13px', color: '#c9e4ff', stroke: '#0b2029', strokeThickness: 4 }).setOrigin(.5).setDepth(8) };
                this.remoteActors.set(p.id, a);
            }
            const key = p.attack > 0 ? 'slash' : !p.grounded || Math.abs(p.vx) > 45 ? (Math.floor(t * 10) % 2 ? 'run1' : 'run2') : 'idle';
            this.sizeActor(a.image, key, 126);
            const distance = Math.hypot(a.image.x - p.x, a.image.y - p.y);
            a.image.setPosition(distance > 220 ? p.x : Phaser.Math.Linear(a.image.x, p.x, .38), distance > 220 ? p.y : Phaser.Math.Linear(a.image.y, p.y, .38)).setFlipX(p.dir < 0).setTint(p.hp > 0 ? 0xbed9ff : 0x718f9a).setAlpha(p.invincible > 0 ? .65 : 1).setAngle(p.hp > 0 ? 0 : -75);
            a.label.setPosition(a.image.x, a.image.y - (p.hp > 0 ? 145 : 70)).setText(p.hp > 0 ? p.name : this.world.mode === 'pvp' ? `${p.name} · derrotado` : `${p.name} · reanimar ${Math.round(p.revive / 2.5 * 100)}%`);
        }
        const peer = this.world.players.find(p => p.id !== this.net.id);
        show('peer-hud', !!peer);
        if (peer) {
            $('peer-name').textContent = peer.name;
            $('peer-health').textContent = peer.hp > 0 ? `${Math.ceil(peer.hp)} / 100` : 'CAÍDO';
            $('peer-fill').style.width = `${peer.hp}%`;
        }
        $('session-ping').textContent = `${this.net.ping} ms`;
    }
    burst(x, y, color, count = 12, range = 70) { for (let i = 0; i < count; i++) {
        const a = (i / count) * Math.PI * 2 + Math.random() * .4;
        const d = range * (.3 + Math.random() * .7);
        const dot = this.add.circle(x, y, 1 + Math.random() * 3, color, .9).setDepth(10);
        this.tweens.add({ targets: dot, x: x + Math.cos(a) * d, y: y + Math.sin(a) * d + 15, alpha: 0, scale: 0, duration: 250 + Math.random() * 270, onComplete: () => dot.destroy() });
    } }
    event(ev) {
        if (this.net.active && ['zone', 'toast'].includes(ev.type) && ev.playerId && ev.playerId !== this.net.id)
            return;
        const x = ev.x ?? 0, y = ev.y ?? 0;
        playSound(ev.type);
        if (ev.type === 'downed' && this.net.active && this.world.mode !== 'pvp') {
            this.toast(ev.playerId === this.net.id ? 'Você caiu. Seu companheiro pode reanimar você.' : 'Aproxime-se do companheiro caído por 3 segundos para reanimá-lo.');
            return;
        }
        if (ev.type === 'revived') {
            this.toast('De volta à jornada!');
            this.burst(x, y, 0xacffcf, 20);
            return;
        }
        if (ev.type === 'toast') {
            this.toast(ev.text);
            return;
        }
        if (ev.type === 'slash') {
            const g = this.add.graphics().setDepth(9);
            g.lineStyle(ev.value === 3 ? 8 : 4, ev.value === 3 ? 0xffe3a0 : 0xb9f7ef, .95);
            const angle = ev.dir === 1 ? 0 : Math.PI;
            g.beginPath();
            g.arc(x, y, ev.value === 3 ? 112 : 91, angle - 1.1, angle + 1.1);
            g.strokePath();
            g.lineStyle(2, 0xffffff, .8);
            g.beginPath();
            g.arc(x, y, ev.value === 3 ? 103 : 84, angle - 1.05, angle + 1.05);
            g.strokePath();
            this.tweens.add({ targets: g, alpha: 0, duration: 180, onComplete: () => g.destroy() });
        }
        if (ev.type === 'hit' || ev.type === 'hurt' || ev.type === 'heal') {
            this.burst(x, y, ev.type === 'hurt' ? 0xfb8d73 : ev.type === 'heal' ? 0x9bf6bf : 0xffe5a3, ev.type === 'hit' ? 11 : 7);
            const text = this.add.text(x, y - 15, ev.type === 'heal' ? `+${ev.value}` : `${ev.value}`, { fontFamily: 'Georgia', fontSize: ev.value > 35 ? '29px' : '23px', color: ev.type === 'hurt' ? '#ff9885' : ev.type === 'heal' ? '#abf8c9' : '#fff2c5', stroke: '#12232b', strokeThickness: 3 }).setOrigin(.5).setDepth(12);
            this.tweens.add({ targets: text, y: y - 80, x: x + (Math.random() - .5) * 30, alpha: 0, duration: 700, onComplete: () => text.destroy() });
            if (ev.type === 'hurt')
                this.cameras.main.shake(120, .004);
            if (ev.type === 'hit')
                this.cameras.main.shake(65, .0015);
        }
        if (ev.type === 'jump') {
            this.burst(x, y, ev.value === 2 ? 0xacffe4 : 0xb5d4c7, 7, 30);
            if (ev.value === 2) {
                const ring = this.add.ellipse(x, y, 55, 12).setStrokeStyle(2, 0xaeecd9, .8).setDepth(6);
                this.tweens.add({ targets: ring, scaleX: 1.7, alpha: 0, duration: 280, onComplete: () => ring.destroy() });
            }
        }
        if (ev.type === 'nova') {
            const circle = this.add.circle(x, y, 10, 0xbaf7ec, .16).setStrokeStyle(5, 0xc1ffe9, .9).setDepth(8);
            this.tweens.add({ targets: circle, radius: 285, alpha: 0, duration: 500, onComplete: () => circle.destroy() });
            this.burst(x, y, 0xc3fff1, 42, 280);
            this.cameras.main.shake(200, .005);
        }
        if (ev.type === 'solar')
            this.burst(x, y, 0xffdb92, 18, 90);
        if (ev.type === 'kill') {
            this.burst(x, y, 0xc4e8c6, 24, 90);
            const e = this.world.enemies.find(e => e.dead && Math.abs(e.x - x) < 1);
            if (e) {
                const a = this.actors.get(e.id);
                this.tweens.add({ targets: a, alpha: 0, y: a.y - 25, duration: 360, onComplete: () => a.setVisible(false) });
            }
        }
        if (ev.type === 'slam') {
            this.cameras.main.shake(250, .008);
            this.burst(x, y - 5, 0xffc285, 35, 160);
        }
        if (ev.type === 'zone') {
            this.toast(ev.value === 1 ? 'Ruínas do Véu · Q lança um corte de energia. E atinge os inimigos ao redor.' : 'Santuário da Chama · O guardião está à sua espera.');
        }
        if (ev.type === 'boss') {
            show('boss-hud', true);
            this.cameras.main.shake(500, .003);
        }
        if (ev.type === 'dead') {
            this.showModal('A CHAMA AINDA VIVE', 'Sua jornada não acabou.', `Você derrotou ${this.world.kills} inimigos. Tente esquivar com Shift e usar suas habilidades.`, 'TENTAR NOVAMENTE');
            show('modal-secondary', false);
        }
        if (ev.type === 'won') {
            const seconds = Math.floor(this.world.elapsed);
            this.showModal('CAPÍTULO CONCLUÍDO', 'A floresta respira.', 'Guardião derrotado. ' + `${this.world.kills} inimigos vencidos · ${Math.floor(seconds / 60)}min ${String(seconds % 60).padStart(2, '0')}s · Melhor combo: ${this.world.bestCombo}`, 'JOGAR NOVAMENTE');
            show('modal-secondary', false);
            this.burst(x || this.world.player.x, 360, 0xffdd92, 65, 350);
        }
        if (this.net.active && ['dead', 'won'].includes(ev.type)) {
            this.resultShown = true;
            show('modal-secondary', true);
            $('modal-secondary').textContent = 'Sair da sala';
            const host = this.net.lobby?.host === this.net.id;
            $('modal-primary').disabled = !host;
            $('modal-primary').textContent = host ? 'JOGAR NOVAMENTE' : 'AGUARDANDO O ANFITRIÃO';
        }
    }
    setModeTitle(mode) { $('mp-eyebrow').textContent = mode === 'pvp' ? 'PVP ONLINE · 1 CONTRA 1' : 'COOPERATIVO ONLINE · 2 JOGADORES'; $('mp-title').textContent = mode === 'pvp' ? 'Duas espadas. Um vencedor.' : 'Duas espadas. Uma jornada.'; }
    scoreText(scores = []) { return scores.map(p => `${p.name}: ${p.wins}`).join('  ×  '); }
    showPvpResult(s) {
        this.resultShown = true;
        const winner = s.scores?.find((p) => p.id === s.result?.winnerId);
        const won = winner?.id === this.net.id;
        this.showModal(`DUELO ${s.round} CONCLUÍDO`, winner ? (won ? 'Vitória!' : 'Derrota.') : 'Duelo encerrado', winner ? `${winner.name} venceu${s.result?.reason === 'forfeit' ? ' por desistência' : ''}.` : 'A partida foi encerrada.', 'REVANCHE');
        $('pvp-score').textContent = this.scoreText(s.scores);
        show('pvp-result', true);
        this.updatePvpResultButtons(this.net.lobby);
        if (won)
            playSound('won');
    }
    updatePvpResultButtons(lobby) {
        const host = lobby?.host === this.net.id, canRestart = lobby?.members.length === 2 && lobby.members.every((m) => m.connected);
        $('modal-primary').disabled = !host || !canRestart;
        $('modal-primary').textContent = !canRestart ? 'ADVERSÁRIO SAIU' : host ? 'REVANCHE' : 'AGUARDANDO O ANFITRIÃO';
        $('modal-secondary').textContent = host ? 'Encerrar sala' : 'Sair da sala';
        show('modal-secondary', true);
    }
    updateHUD() { const p = this.world.player; const pvp = this.world.mode === 'pvp'; show('duel-hud', pvp && this.net.active); $('duel-score').textContent = this.scoreText(this.net.snapshot?.scores); $('duel-round').textContent = `DUELO ${this.activeRound}`; $('peer-role').textContent = pvp ? 'SEU ADVERSÁRIO' : 'SEU COMPANHEIRO'; $('level-progress').parentElement.classList.toggle('hidden', pvp); $('hero-name').textContent = this.net.active ? p.name : 'KAEL'; $('health-fill').style.width = `${p.hp}%`; $('health-value').textContent = `${Math.ceil(p.hp)} / 100`; $('level-progress').style.width = `${Math.min(100, p.x / 4500 * 100)}%`; const labels = ['01 — LIMIAR DA FLORESTA', '02 — RUÍNAS DO VÉU', '03 — SANTUÁRIO DA CHAMA']; $('area-label').textContent = labels[this.world.zone]; $('objective-text').textContent = this.world.status === 'won' ? 'A floresta está em paz' : this.world.bossActive ? 'Derrote o Guardião Ancestral' : this.net.active && p.x > 3780 ? 'Aguarde seu companheiro no santuário' : 'Atravesse a floresta →'; if (pvp) {
        $('area-label').textContent = 'ARENA · SANTUÁRIO DA CHAMA';
        $('objective-text').textContent = this.world.status === 'won' ? 'Duelo concluído' : 'Derrote seu adversário';
    } for (const [i, key] of [[1, 'skill1'], [2, 'skill2']]) {
        const el = $('cooldown' + i);
        el.style.display = p[key] > 0 ? 'flex' : 'none';
        el.textContent = Math.ceil(p[key]).toString();
        $('skill' + i).setAttribute('aria-label', `${i === 1 ? 'Corte solar' : 'Nova rúnica'}${p[key] > 0 ? `, recarrega em ${Math.ceil(p[key])} segundos` : `, disponível`}`);
    } const boss = this.world.enemies.find(e => e.kind === 'boss'); if (boss) {
        $('boss-fill').style.width = `${boss.hp / boss.maxHp * 100}%`;
        $('boss-value').textContent = `${boss.hp} / ${boss.maxHp}`;
    } show('boss-hud', this.world.bossActive && this.world.status === 'playing'); $('combo').innerHTML = this.world.hitCount >= 2 ? `${this.world.hitCount}<small>ACERTOS</small>` : ''; }
}
try {
    new Phaser.Game({ type: Phaser.AUTO, parent: 'game', width: 1280, height: 720, backgroundColor: '#0b2631', antialias: true, render: { roundPixels: false }, scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH }, scene: ForestScene, input: { activePointers: 4 }, fps: { target: 60, forceSetTimeOut: false }, audio: { noAudio: true } });
}
catch (error) {
    $('loading').querySelector('p').textContent = 'Não foi possível iniciar o jogo. Atualize seu navegador e tente novamente.';
    console.error(error);
}

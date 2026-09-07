import { Client } from './assets/colyseus.js';
import { World } from './engine.js';
export class Multiplayer {
    constructor() {
        this.room = null;
        this.client = null;
        this.snapshot = null;
        this.lobby = null;
        this.connected = false;
        this.connecting = false;
        this.ping = 0;
        this.seq = 0;
        this.pending = [];
        this.predictor = new World();
        this.round = -1;
        this.leaving = false;
        this.lastPing = 0;
        this.generation = 0;
        this.onLobby = () => { };
        this.onSnapshot = () => { };
        this.onEvents = () => { };
        this.onConnection = () => { };
        this.onNotice = () => { };
    }
    get configured() { return !!window.EMBERFALL_MULTIPLAYER_URL; }
    get id() { return this.room?.sessionId ?? ''; }
    get active() { return !!this.room; }
    get canSimulate() { return this.connected && this.snapshot?.stage === 'playing' && !this.snapshot?.paused && this.snapshot?.status === 'playing'; }
    async connect(name, code = '') {
        if (this.connecting || this.room)
            return;
        this.connecting = true;
        this.leaving = false;
        const generation = ++this.generation;
        this.onConnection('connecting');
        try {
            const endpoint = window.EMBERFALL_MULTIPLAYER_URL;
            if (!endpoint)
                throw new Error('O modo cooperativo ainda está sendo preparado. Você já pode jogar a jornada solo.');
            const url = new URL(endpoint);
            if (!['http:', 'https:'].includes(url.protocol))
                throw new Error('Endereço do servidor inválido.');
            const response = await fetch(new URL('/health', url), { signal: AbortSignal.timeout(75000) });
            if (!response.ok)
                throw new Error('O servidor está despertando. Tente novamente em instantes.');
            if (generation !== this.generation)
                return;
            this.client = new Client(url.origin);
            const room = code ? await this.client.joinById(code.toUpperCase(), { name }) : await this.client.create('forest', { name });
            if (generation !== this.generation) {
                await room.leave();
                return;
            }
            room.reconnection.minUptime = 0;
            room.reconnection.maxDelay = 2000;
            this.room = room;
            this.connected = true;
            this.seq = 0;
            this.pending = [];
            this.round = -1;
            room.onMessage('lobby', (value) => { this.lobby = value; this.onLobby(value); });
            room.onMessage('snapshot', (value) => this.receive(value));
            room.onMessage('events', (events) => this.onEvents(events.filter(e => !(e.playerId === this.id && ['jump', 'dash', 'slash', 'solar', 'nova'].includes(e.type)))));
            room.onMessage('notice', (value) => this.onNotice(value));
            room.onMessage('pong', (value) => this.ping = Math.round(performance.now() - value));
            room.onDrop(() => { this.connected = false; this.pending = []; this.onConnection('reconnecting'); });
            room.onReconnect(() => { this.connected = true; this.pending = []; room.send('sync'); this.onConnection('connected'); });
            room.onLeave(() => { this.connected = false; this.room = null; this.pending = []; if (!this.leaving)
                this.onConnection('disconnected'); });
            room.onError((_code, message) => this.onNotice(message || 'Não foi possível manter a conexão.'));
            room.send('sync');
            this.onConnection('connected');
        }
        catch (error) {
            if (generation === this.generation) {
                this.onConnection('error');
                let message = error?.message ?? '';
                if (/locked|full/i.test(message))
                    message = 'A sala está cheia ou a partida já começou.';
                else if (/not found|not exist|invalid room/i.test(message))
                    message = 'Sala não encontrada. Confira o código de 6 caracteres.';
                else if (/fetch|network|timeout|aborted/i.test(message))
                    message = 'Não foi possível conectar. O servidor pode estar despertando; tente novamente.';
                this.onNotice(message || 'Não foi possível entrar na sala.');
            }
        }
        finally {
            if (generation === this.generation)
                this.connecting = false;
        }
    }
    receive(s) {
        if (!Array.isArray(s.players))
            return;
        this.snapshot = s;
        if (s.round !== this.round) {
            this.round = s.round;
            this.pending = [];
        }
        const ack = s.acks?.[this.id] ?? 0;
        this.pending = this.pending.filter(p => p.seq > ack);
        const own = s.players.find((p) => p.id === this.id);
        if (own) {
            this.predictor = new World();
            this.predictor.status = s.status;
            this.predictor.players = s.players.map((p) => ({ ...p }));
            this.predictor.player = this.predictor.players.find(p => p.id === this.id);
            this.predictor.time = s.time;
            this.predictor.bossActive = s.bossActive;
            this.predictor.enemies = [];
            for (const packet of this.pending)
                this.predict(packet.input, false);
        }
        this.onSnapshot(s);
    }
    predict(input, emit) { if (!this.predictor.player)
        return; this.predictor.time += 1 / 60; this.predictor.stepPlayer(1 / 60, input); const events = this.predictor.events.splice(0); this.predictor.projectiles = []; if (emit)
        this.onEvents(events.filter(e => ['jump', 'dash', 'slash', 'solar', 'nova'].includes(e.type))); }
    step(input) {
        if (!this.room || !this.connected)
            return;
        if (performance.now() - this.lastPing > 1500) {
            this.lastPing = performance.now();
            this.room.send('ping', this.lastPing);
        }
        if (!this.canSimulate)
            return;
        // Inputs have no coordinates, damage, health or elapsed time supplied by the client.
        const packet = { seq: ++this.seq, input: { left: !!input.left, right: !!input.right, attack: !!input.attack, actions: [...(input.actions ?? [])] } };
        this.pending.push(packet);
        if (this.pending.length > 120)
            this.pending.shift();
        this.room.send('input', packet);
        this.predict(packet.input, true);
    }
    command(type, value) { if (this.room && this.connected)
        this.room.send(type, value); }
    async leave() { this.leaving = true; this.generation++; this.connecting = false; const room = this.room; this.room = null; this.connected = false; this.pending = []; this.snapshot = null; this.lobby = null; if (room)
        await room.leave(); }
}

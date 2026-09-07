export const LEVEL_WIDTH = 4800;
export const platforms = [
    { x: 0, y: 615, w: 1120, ground: true }, { x: 1330, y: 615, w: 1010, ground: true }, { x: 2550, y: 615, w: 540, ground: true }, { x: 3280, y: 615, w: 1520, ground: true },
    { x: 530, y: 505, w: 240 }, { x: 930, y: 505, w: 180 }, { x: 1150, y: 432, w: 180 }, { x: 1390, y: 508, w: 190 }, { x: 1750, y: 475, w: 230 }, { x: 2120, y: 510, w: 190 }, { x: 2350, y: 420, w: 180 }, { x: 2580, y: 510, w: 180 }, { x: 2920, y: 505, w: 170 }, { x: 3080, y: 420, w: 180 }, { x: 3290, y: 505, w: 170 }
];
export function createPlayer(id = 'solo', name = 'Kael', x = 190) { return { id, name, x, y: 615, vx: 0, vy: 0, dir: 1, hp: 100, grounded: true, jumps: 0, invincible: 0, dash: 0, dashCooldown: 0, attack: 0, attackCooldown: 0, skill1: 0, skill2: 0, coyote: .1, jumpBuffer: 0, hitCount: 0, bestCombo: 0, comboTime: 0, comboStep: 0, lastAttack: -10, checkpoint: 190, revive: 0, zone: 0 }; }
export class World {
    get zone() { return this.player.zone; }
    set zone(v) { this.player.zone = v; }
    get hitCount() { return this.player.hitCount; }
    set hitCount(v) { this.player.hitCount = v; }
    get bestCombo() { return Math.max(...this.players.map(p => p.bestCombo), 0); }
    set bestCombo(v) { this.player.bestCombo = v; }
    get comboTime() { return this.player.comboTime; }
    set comboTime(v) { this.player.comboTime = v; }
    get comboStep() { return this.player.comboStep; }
    set comboStep(v) { this.player.comboStep = v; }
    get lastAttack() { return this.player.lastAttack; }
    set lastAttack(v) { this.player.lastAttack = v; }
    get checkpoint() { return this.player.checkpoint; }
    set checkpoint(v) { this.player.checkpoint = v; }
    constructor() {
        this.status = 'ready';
        this.time = 0;
        this.elapsed = 0;
        this.kills = 0;
        this.bossActive = false;
        this.events = [];
        this.player = createPlayer();
        this.players = [this.player];
        this.enemies = [];
        this.projectiles = [];
        this.pickups = [];
        const specs = [['goblin', 760, 615], ['goblin', 1030, 615], ['bat', 1480, 492], ['goblin', 1630, 615], ['wraith', 1900, 490], ['goblin', 2190, 615], ['bat', 2690, 450], ['wraith', 2850, 505], ['goblin', 3460, 615], ['bat', 3640, 460], ['boss', 4390, 615]];
        this.enemies = specs.map(([kind, x, y], id) => ({ id, kind, x, y, home: x, baseY: y, hp: kind === 'boss' ? 480 : kind === 'bat' ? 34 : kind === 'wraith' ? 65 : 52, maxHp: kind === 'boss' ? 480 : kind === 'bat' ? 34 : kind === 'wraith' ? 65 : 52, dir: -1, timer: 1.1 + id * .13, windup: 0, flash: 0, knock: 0, phase: 0, active: false, dead: false, attackX: x }));
    }
    emit(type, extra = {}) { this.events.push({ type, playerId: this.player.id, ...extra }); }
    start() { this.status = 'playing'; this.emit('toast', { text: 'A / D para mover · W / ↑ / Espaço para pulo duplo · F para atacar' }); }
    damagePlayer(amount, sourceX) { const p = this.player; if (p.invincible > 0 || this.status !== 'playing')
        return; p.hp = Math.max(0, p.hp - amount); p.invincible = 1.15; p.vx = (p.x >= sourceX ? 1 : -1) * 240; this.hitCount = 0; this.emit('hurt', { x: p.x, y: p.y - 65, value: amount }); if (p.hp <= 0) {
        p.vx = 0;
        p.vy = 0;
        p.y = platforms.filter(b => p.x > b.x && p.x < b.x + b.w && b.y >= p.y).sort((a, b) => a.y - b.y)[0]?.y ?? 615;
        this.emit('downed');
        if (this.players.every(p => p.hp <= 0)) {
            this.status = 'dead';
            this.emit('dead');
        }
    } }
    hitEnemy(e, damage, dir) { if (e.dead || (e.kind === 'boss' && !this.bossActive))
        return; e.hp = Math.max(0, e.hp - damage); e.flash = .16; e.knock = dir * (e.kind === 'boss' ? 60 : 210); this.hitCount++; this.comboTime = 2.5; this.bestCombo = Math.max(this.bestCombo, this.hitCount); this.emit('hit', { x: e.x, y: e.y - (e.kind === 'boss' ? 140 : 60), value: damage, kind: e.kind }); if (e.hp <= 0) {
        e.dead = true;
        this.kills++;
        this.emit('kill', { x: e.x, y: e.y - 40, kind: e.kind });
        if (e.kind === 'boss') {
            this.status = 'won';
            this.emit('won');
        }
        else
            this.pickups.push({ x: e.x, y: e.y - 40, life: 30 });
    } }
    action(action) {
        if (this.status !== 'playing' || this.player.hp <= 0)
            return;
        const p = this.player;
        if (action === 'jump') {
            p.jumpBuffer = .13;
            this.tryJump();
        }
        if (action === 'dash' && p.dashCooldown <= 0) {
            p.dash = .19;
            p.dashCooldown = .85;
            p.invincible = Math.max(p.invincible, .25);
            this.emit('dash', { x: p.x, y: p.y - 40, dir: p.dir });
        }
        if (action === 'attack' && p.attackCooldown <= 0) {
            this.comboStep = this.time - this.lastAttack < .72 ? (this.comboStep % 3) + 1 : 1;
            this.lastAttack = this.time;
            p.attack = .24;
            p.attackCooldown = this.comboStep === 3 ? .4 : .27;
            this.emit('slash', { x: p.x, y: p.y - 54, dir: p.dir, value: this.comboStep });
            for (const e of this.enemies) {
                if (e.dead)
                    continue;
                const dx = e.x - p.x, dy = Math.abs((e.y - (e.kind === 'boss' ? 105 : 45)) - (p.y - 55));
                if (dx * p.dir > -35 && Math.abs(dx) < (e.kind === 'boss' ? 175 : 135) && dy < 115)
                    this.hitEnemy(e, [0, 22, 26, 38][this.comboStep], p.dir);
            }
        }
        if (action === 'skill1' && p.skill1 <= 0) {
            p.skill1 = 5;
            p.attack = .4;
            this.projectiles.push({ x: p.x + p.dir * 50, y: p.y - 60, vx: p.dir * 760, vy: 0, life: .9, friendly: true, owner: p.id, hits: new Set() });
            this.emit('solar', { x: p.x, y: p.y - 60, dir: p.dir });
        }
        if (action === 'skill2' && p.skill2 <= 0) {
            p.skill2 = 10;
            p.attack = .45;
            p.invincible = Math.max(p.invincible, .5);
            this.emit('nova', { x: p.x, y: p.y - 45 });
            for (const e of this.enemies) {
                if (!e.dead && Math.hypot(e.x - p.x, e.y - p.y) < 285)
                    this.hitEnemy(e, 76, e.x > p.x ? 1 : -1);
            }
        }
    }
    tryJump() { const p = this.player; if (p.jumpBuffer > 0 && (p.grounded || p.coyote > 0 || p.jumps < 2)) {
        if (!p.grounded && p.coyote <= 0 && p.jumps === 0)
            p.jumps = 1;
        if (p.jumps >= 2)
            return;
        p.vy = p.jumps === 0 ? -580 : -545;
        p.jumps++;
        p.grounded = false;
        p.coyote = 0;
        p.jumpBuffer = 0;
        this.emit('jump', { x: p.x, y: p.y, value: p.jumps });
    } }
    update(dt, input = {}) { this.updateCoop(dt, { [this.player.id]: input }); }
    updateCoop(dt, inputs = {}) {
        if (this.status !== 'playing')
            return;
        dt = Math.min(dt, .034);
        this.time += dt;
        this.elapsed += dt;
        const selected = this.player;
        for (const p of this.players) {
            this.player = p;
            this.stepPlayer(dt, inputs[p.id] ?? {});
        }
        this.stepEnemies(dt);
        this.stepProjectiles(dt);
        this.stepPickups(dt);
        for (const p of this.players) {
            if (p.hp > 0)
                continue;
            const helper = this.players.find(q => q.hp > 0 && Math.hypot(q.x - p.x, q.y - p.y) < 95);
            p.revive = helper ? p.revive + dt : 0;
            if (p.revive >= 2.5) {
                this.player = p;
                p.hp = 40;
                p.invincible = 2;
                p.revive = 0;
                this.emit('revived', { x: p.x, y: p.y - 90 });
            }
        }
        this.player = selected;
    }
    stepPlayer(dt, input = {}) {
        const p = this.player;
        if (p.hp <= 0)
            return;
        for (const key of ['invincible', 'dash', 'dashCooldown', 'attack', 'attackCooldown', 'skill1', 'skill2', 'jumpBuffer', 'coyote'])
            p[key] = Math.max(0, p[key] - dt);
        this.comboTime -= dt;
        if (this.comboTime <= 0)
            this.hitCount = 0;
        for (const a of input.actions ?? [])
            this.action(a);
        if (input.attack)
            this.action('attack');
        const move = (input.right ? 1 : 0) - (input.left ? 1 : 0);
        if (move && p.dash <= 0)
            p.dir = move;
        if (p.dash > 0) {
            p.vx = p.dir * 850;
            p.vy = 0;
        }
        else {
            p.vx += (move * 290 - p.vx) * Math.min(1, dt * (p.grounded ? 18 : 9));
            p.vy += 1510 * dt;
        }
        const oldY = p.y;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.x = Math.max(this.bossActive ? 3850 : 24, Math.min(LEVEL_WIDTH - 50, p.x));
        p.grounded = false;
        if (p.vy >= 0)
            for (const b of platforms) {
                if (p.x + 17 > b.x && p.x - 17 < b.x + b.w && oldY <= b.y + 2 && p.y >= b.y) {
                    p.y = b.y;
                    p.vy = 0;
                    p.grounded = true;
                    p.jumps = 0;
                    p.coyote = .1;
                    break;
                }
            }
        if (p.jumpBuffer > 0)
            this.tryJump();
        if (p.y > 850) {
            p.invincible = 0;
            this.damagePlayer(16, p.x);
            p.x = this.checkpoint;
            p.y = p.hp > 0 ? 430 : 615;
            p.vy = 0;
            p.vx = 0;
            p.jumps = 0;
            this.emit('toast', { text: 'Cuidado com os abismos. Use o pulo duplo e o dash.' });
        }
        if (!this.bossActive && p.grounded && p.x > 2000 && p.x < 2250)
            this.checkpoint = 2030;
        if (!this.bossActive && p.grounded && p.x > 3350 && p.x < 3650)
            this.checkpoint = 3390;
        const zone = p.x < 1600 ? 0 : p.x < 3800 ? 1 : 2;
        if (zone !== this.zone) {
            this.zone = zone;
            this.emit('zone', { value: zone });
        }
        if (p.x > 3890 && !this.bossActive && this.players.filter(p => p.hp > 0).every(p => p.x > 3780)) {
            this.bossActive = true;
            for (const member of this.players) {
                member.checkpoint = 3930;
                member.hp = member.hp > 0 ? Math.min(100, member.hp + 35) : 0;
            }
            this.emit('boss');
            this.emit('toast', { text: 'Guardião Ancestral · Pule sobre as ondas e use o dash para esquivar.' });
        }
    }
    stepEnemies(dt) {
        for (const e of this.enemies) {
            if (e.dead)
                continue;
            const target = this.players.filter(p => p.hp > 0).sort((a, b) => Math.abs(a.x - e.x) - Math.abs(b.x - e.x))[0];
            if (!target)
                continue;
            this.player = target;
            const p = target;
            e.flash = Math.max(0, e.flash - dt);
            e.knock *= Math.max(0, 1 - dt * 10);
            e.x += e.knock * dt;
            const dx = p.x - e.x, dy = Math.abs(p.y - e.y);
            e.active = e.kind === 'boss' ? this.bossActive : Math.abs(dx) < 660;
            if (!e.active)
                continue;
            e.dir = dx >= 0 ? 1 : -1;
            e.timer -= dt;
            if (e.windup > 0) {
                e.windup -= dt;
                if (e.windup <= 0) {
                    if (e.kind === 'boss') {
                        if (e.phase % 2 === 0) {
                            this.emit('slam', { x: e.attackX, y: 615 });
                            for (const member of this.players) {
                                if (member.hp > 0 && Math.abs(member.x - e.attackX) < 145 && member.y > 470) {
                                    this.player = member;
                                    this.damagePlayer(24, e.x);
                                }
                            }
                            this.player = p;
                            for (const dir of [-1, 1])
                                this.projectiles.push({ x: e.attackX, y: 594, vx: dir * 310, vy: 0, life: 2.1, friendly: false, hits: new Set() });
                        }
                        else {
                            for (let n = -1; n <= 1; n++) {
                                const angle = Math.atan2(p.y - 55 - (e.y - 140), p.x - e.x) + n * .26;
                                this.projectiles.push({ x: e.x, y: e.y - 140, vx: Math.cos(angle) * 310, vy: Math.sin(angle) * 310, life: 2.8, friendly: false, hits: new Set() });
                            }
                            this.emit('enemyShot', { x: e.x, y: e.y - 140 });
                        }
                        e.timer = e.hp < 220 ? 1.0 : 1.65;
                        e.phase++;
                    }
                    else {
                        if (Math.abs(dx) < 105 && dy < 110)
                            this.damagePlayer(e.kind === 'bat' ? 9 : 13, e.x);
                        this.emit('enemySwipe', { x: e.x + e.dir * 35, y: e.y - 35, dir: e.dir });
                        e.timer = 1.25;
                    }
                }
            }
            else if (e.kind === 'boss') {
                if (e.timer <= 0) {
                    e.windup = .85;
                    e.attackX = p.x;
                    this.emit('warning', { x: e.attackX, y: 615, value: .85, kind: e.phase % 2 === 0 ? 'slam' : 'shot' });
                }
                else if (Math.abs(dx) > 175)
                    e.x += e.dir * 50 * dt;
                e.x = Math.max(3980, Math.min(4650, e.x));
            }
            else if (e.kind === 'wraith') {
                e.y = e.baseY + Math.sin(this.time * 2 + e.id) * 18;
                if (Math.abs(dx) < 500 && e.timer <= 0) {
                    const angle = Math.atan2(p.y - 50 - e.y, p.x - e.x);
                    this.projectiles.push({ x: e.x, y: e.y - 35, vx: Math.cos(angle) * 235, vy: Math.sin(angle) * 235, life: 3, friendly: false, hits: new Set() });
                    e.timer = 2.6;
                    this.emit('enemyShot', { x: e.x, y: e.y - 35 });
                }
            }
            else {
                if (e.kind === 'bat') {
                    e.y += (Math.max(380, p.y - 40) - e.y) * dt * 1.5;
                    if (Math.abs(dx) > 60)
                        e.x += e.dir * 115 * dt;
                }
                else if (Math.abs(dx) > 64) {
                    const next = e.x + e.dir * 78 * dt;
                    const ground = platforms.find(b => b.ground && next > b.x + 28 && next < b.x + b.w - 28);
                    if (ground)
                        e.x = next;
                }
                if (Math.abs(dx) < 90 && dy < 105 && e.timer <= 0) {
                    e.windup = .42;
                    this.emit('warning', { x: e.x, y: e.y - 80, value: .42, kind: 'melee' });
                }
            }
        }
    }
    stepProjectiles(dt) {
        for (const s of this.projectiles) {
            s.x += s.vx * dt;
            s.y += s.vy * dt;
            s.life -= dt;
            if (s.friendly) {
                this.player = this.players.find(p => p.id === s.owner) ?? this.players[0];
                for (const e of this.enemies) {
                    if (!e.dead && !s.hits.has(e.id) && Math.abs(s.x - e.x) < (e.kind === 'boss' ? 100 : 55) && Math.abs(s.y - (e.y - (e.kind === 'boss' ? 100 : 40))) < 110) {
                        s.hits.add(e.id);
                        this.hitEnemy(e, 58, Math.sign(s.vx));
                    }
                }
            }
            else
                for (const p of this.players) {
                    if (p.hp > 0 && Math.abs(s.x - p.x) < 25 && Math.abs(s.y - (p.y - 45)) < 48) {
                        this.player = p;
                        this.damagePlayer(12, s.x);
                        s.life = 0;
                        break;
                    }
                }
        }
        this.projectiles = this.projectiles.filter(s => s.life > 0);
    }
    stepPickups(dt) {
        for (const h of this.pickups) {
            h.life -= dt;
            const p = this.players.filter(p => p.hp > 0).sort((a, b) => Math.hypot(a.x - h.x, a.y - h.y) - Math.hypot(b.x - h.x, b.y - h.y))[0];
            if (!p)
                continue;
            this.player = p;
            if (Math.hypot(h.x - p.x, h.y - (p.y - 45)) < 160) {
                h.x += (p.x - h.x) * dt * 6;
                h.y += (p.y - 45 - h.y) * dt * 6;
            }
            if (Math.hypot(h.x - p.x, h.y - (p.y - 45)) < 35) {
                p.hp = Math.min(100, p.hp + 12);
                h.life = 0;
                this.emit('heal', { x: p.x, y: p.y - 95, value: 12 });
            }
        }
        this.pickups = this.pickups.filter(h => h.life > 0);
    }
}

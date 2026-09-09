const bindings = { Space: 'jump', KeyW: 'jump', ArrowUp: 'jump', ShiftLeft: 'dash', ShiftRight: 'dash', KeyK: 'dash', KeyQ: 'skill1', KeyU: 'skill1', KeyE: 'skill2', KeyI: 'skill2' };
const movement = new Set(['KeyA', 'KeyD', 'ArrowLeft', 'ArrowRight', 'KeyS']);
export function isEditing(target) { return !!target?.closest?.('input,textarea,select,[contenteditable]:not([contenteditable="false"])'); }
// No global Phaser captures: menus and form fields keep native keyboard behavior.
export class GameControls {
    constructor(active, pause, keys, surface, potion = () => { }) {
        this.active = active;
        this.pause = pause;
        this.potion = potion;
        this.down = new Set();
        this.actions = [];
        this.mouse = false;
        this.enabled = false;
        keys.addEventListener('keydown', ((e) => {
            if (!this.active() || isEditing(e.target))
                return;
            if (e.code === 'Escape') {
                e.preventDefault();
                if (!e.repeat) {
                    this.reset();
                    this.pause();
                }
                return;
            }
            if (/^Digit[1-5]$/.test(e.code)) {
                e.preventDefault();
                if (!e.repeat)
                    this.potion(Number(e.code.slice(-1)));
                return;
            }
            if (!bindings[e.code] && !movement.has(e.code))
                return;
            if (e.repeat && !this.down.has(e.code))
                return;
            e.preventDefault();
            this.down.add(e.code);
            if (!e.repeat && bindings[e.code])
                this.actions.push(bindings[e.code]);
        }));
        keys.addEventListener('keyup', ((e) => this.down.delete(e.code)));
        keys.addEventListener('pointerup', ((e) => { if (e.button === 0)
            this.mouse = false; }));
        keys.addEventListener('pointercancel', () => this.reset());
        keys.addEventListener('blur', () => this.reset());
        surface.addEventListener('pointerdown', ((e) => {
            if (e.button !== 0 || e.pointerType === 'touch' || !this.active())
                return;
            e.preventDefault();
            this.mouse = true;
            this.actions.push('attack');
        }));
    }
    reset() { this.down.clear(); this.actions = []; this.mouse = false; }
    sync() { const enabled = this.active(); if (!enabled)
        this.reset(); this.enabled = enabled; return enabled; }
    sample() {
        if (!this.active()) {
            this.reset();
            return {};
        }
        return { down: this.down.has('KeyS'), left: this.down.has('KeyA') || this.down.has('ArrowLeft'), right: this.down.has('KeyD') || this.down.has('ArrowRight'), attack: this.mouse, actions: [...new Set(this.actions.splice(0))] };
    }
}

/**
 * One shared animation clock for the whole page. Subscribers receive the frame delta
 * in seconds (clamped) and the elapsed time. The loop pauses while the tab is hidden.
 */
export type Tick = (dt: number, t: number) => void;

interface Sub {
  fn: Tick;
  order: number;
}

const subs: Sub[] = [];
let running = false;
let last = 0;
let elapsed = 0;
let raf = 0;

function frame(now: number) {
  raf = requestAnimationFrame(frame);
  const dt = Math.min(0.1, Math.max(0, (now - last) / 1000));
  last = now;
  elapsed += dt;
  for (let i = 0; i < subs.length; i++) subs[i].fn(dt, elapsed);
}

function start() {
  if (running) return;
  running = true;
  last = performance.now();
  raf = requestAnimationFrame(frame);
}

function stop() {
  running = false;
  cancelAnimationFrame(raf);
}

document.addEventListener('visibilitychange', () => {
  if (document.hidden) stop();
  else if (subs.length) start();
});

/** Lower order runs first (simulation before rendering). Returns an unsubscribe function. */
export function onTick(fn: Tick, order = 0): () => void {
  const sub = { fn, order };
  subs.push(sub);
  subs.sort((a, b) => a.order - b.order);
  if (!document.hidden) start();
  return () => {
    const i = subs.indexOf(sub);
    if (i >= 0) subs.splice(i, 1);
    if (!subs.length) stop();
  };
}

export const clockTime = () => elapsed;

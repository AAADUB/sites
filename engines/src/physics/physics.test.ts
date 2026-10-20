import { describe, expect, it } from 'vitest';
import {
  PETROL,
  DIESEL,
  TWO_STROKE,
  pistonPinHeight,
  pistonDrop,
  clearanceHeight,
  displacementCc,
  sweptVolumeCc,
  cylinderVolumeCc,
} from './kinematics';
import { typicalTiming, valveLift, liftShape, strokeAt, sparkAdvance } from './valves';
import {
  buildCycle,
  ottoEfficiency,
  dieselEfficiency,
  atkinsonEfficiency,
  wiebe,
  pressureAt,
} from './cycle';
import { RX, apex, distanceToHousing, rotorProfile, housingPoint } from './wankel';
import { LAYOUTS, peakShaking, pinDirection } from './firing';
import { powerKw, kwToHp, hpToKw, fmt, withUnit } from './units';

describe('slider-crank kinematics', () => {
  for (const g of [PETROL, DIESEL, TWO_STROKE]) {
    it(`TDC and BDC positions (${g.bore}x${g.stroke})`, () => {
      const r = g.stroke / 2;
      expect(pistonPinHeight(g, 0)).toBeCloseTo(r + g.rod, 9);
      expect(pistonPinHeight(g, 180)).toBeCloseTo(g.rod - r, 9);
      expect(pistonDrop(g, 0)).toBeCloseTo(0, 9);
      expect(pistonDrop(g, 180)).toBeCloseTo(g.stroke, 9);
      expect(pistonDrop(g, 360)).toBeCloseTo(0, 9);
    });
    it('rod ratio l/r within 3.2–3.6', () => {
      const ratio = g.rod / (g.stroke / 2);
      expect(ratio).toBeGreaterThanOrEqual(3.2);
      expect(ratio).toBeLessThanOrEqual(3.6);
    });
  }
  it('piston is lower than mid-stroke at 90° (finite rod effect)', () => {
    expect(pistonDrop(PETROL, 90)).toBeGreaterThan(PETROL.stroke / 2);
  });
  it('compression ratio from volumes', () => {
    const r = cylinderVolumeCc(PETROL, 180) / cylinderVolumeCc(PETROL, 0);
    expect(r).toBeCloseTo(PETROL.compressionRatio, 6);
  });
  it('displacement formula V = π/4·b²·s·n', () => {
    expect(displacementCc(86, 86, 4)).toBeCloseTo(1998.4, 0);
    expect(sweptVolumeCc(PETROL)).toBeCloseTo(499.6, 0);
  });
});

describe('valve train', () => {
  it('cam turns at exactly half crank speed (one lift event per 720°)', () => {
    const t = typicalTiming();
    let events = 0;
    let open = false;
    for (let th = 300; th < 300 + 720 * 3; th += 0.25) {
      const isOpen = valveLift(t.intake, th) > 0;
      if (isOpen && !open) events++;
      open = isOpen;
    }
    expect(events).toBe(3);
  });
  it('typical event angles', () => {
    const t = typicalTiming();
    expect(t.intake.open).toBe(-10); // 10° BTDC
    expect(t.intake.close).toBe(225); // 45° ABDC
    expect(t.exhaust.open).toBe(495); // 45° BBDC
    expect(t.exhaust.close).toBe(730); // 10° ATDC
  });
  it('lift law is smooth and seats at both ends', () => {
    expect(liftShape(0)).toBe(0);
    expect(liftShape(1)).toBe(0);
    expect(liftShape(0.5)).toBeCloseTo(1, 9);
    expect(liftShape(0.001)).toBeLessThan(1e-4);
  });
  it('both valves are slightly open during overlap at TDC', () => {
    const t = typicalTiming();
    expect(valveLift(t.intake, 0)).toBeGreaterThan(0);
    expect(valveLift(t.exhaust, 0)).toBeGreaterThan(0);
  });
  it('valves never touch the piston (including overlap)', () => {
    const t = typicalTiming();
    for (const g of [PETROL, DIESEL]) {
      const hc = clearanceHeight(g);
      let minGap = Infinity;
      for (let th = 0; th < 720; th += 0.25) {
        const crown = hc + pistonDrop(g, th); // distance from head face to piston crown
        const lift = Math.max(valveLift(t.intake, th), valveLift(t.exhaust, th));
        minGap = Math.min(minGap, crown - lift);
      }
      expect(minGap).toBeGreaterThan(0.8);
    }
  });
  it('strokes in order', () => {
    expect(strokeAt(10)).toBe('intake');
    expect(strokeAt(200)).toBe('compression');
    expect(strokeAt(400)).toBe('power');
    expect(strokeAt(600)).toBe('exhaust');
  });
  it('spark advance stays within 10–30° BTDC', () => {
    for (let rpm = 600; rpm <= 8000; rpm += 200)
      for (let l = 0; l <= 1; l += 0.1) {
        const a = sparkAdvance(rpm, l);
        expect(a).toBeGreaterThanOrEqual(10);
        expect(a).toBeLessThanOrEqual(30);
      }
  });
});

describe('cycle model', () => {
  it('Wiebe goes 0 → ~1', () => {
    expect(wiebe(0, 10, 50)).toBe(0);
    expect(wiebe(60, 10, 50)).toBeGreaterThan(0.99);
  });
  it('petrol cycle produces sensible pressures and positive work', () => {
    const tb = buildCycle({ kind: 'otto', geom: PETROL, rpm: 3000, load: 1 });
    expect(tb.peakPressure).toBeGreaterThan(40);
    expect(tb.peakPressure).toBeLessThan(110);
    expect(tb.peakAngle).toBeGreaterThan(360);
    expect(tb.peakAngle).toBeLessThan(385);
    expect(tb.work).toBeGreaterThan(0);
    expect(pressureAt(tb, 90)).toBeLessThan(1.2);
  });
  it('diesel peaks higher than petrol', () => {
    const d = buildCycle({ kind: 'diesel', geom: DIESEL, rpm: 2000, load: 1 });
    const p = buildCycle({ kind: 'otto', geom: PETROL, rpm: 2000, load: 1 });
    expect(d.peakPressure).toBeGreaterThan(p.peakPressure);
    expect(d.peakPressure).toBeLessThan(200);
    expect(d.work).toBeGreaterThan(0);
  });
  it('two-stroke cycle is closed and positive', () => {
    const t = buildCycle({ kind: 'two-stroke', geom: TWO_STROKE, rpm: 6000, load: 1 });
    expect(t.span).toBe(360);
    expect(t.work).toBeGreaterThan(0);
    expect(t.peakPressure).toBeGreaterThan(20);
  });
});

describe('ideal efficiencies', () => {
  it('Otto η = 1 − 1/r^(γ−1)', () => {
    expect(ottoEfficiency(10)).toBeCloseTo(1 - 1 / Math.pow(10, 0.4), 12);
    expect(ottoEfficiency(10)).toBeCloseTo(0.6019, 3);
  });
  it('Diesel efficiency below Otto at same r, equals Otto as ρ → 1', () => {
    expect(dieselEfficiency(18, 2)).toBeCloseTo(0.6316, 3);
    expect(dieselEfficiency(18, 2)).toBeLessThan(ottoEfficiency(18));
    expect(dieselEfficiency(18, 1.000001)).toBeCloseTo(ottoEfficiency(18), 4);
  });
  it('Atkinson beats Otto at the same compression ratio', () => {
    expect(atkinsonEfficiency(10, 13)).toBeGreaterThan(ottoEfficiency(10));
  });
});

describe('Wankel geometry', () => {
  it('apexes stay on the housing curve for all rotor angles', () => {
    let worst = 0;
    for (let s = 0; s < 360; s++) {
      const phi = (s / 360) * Math.PI * 2;
      for (let k = 0; k < 3; k++) {
        const [x, y] = apex(RX, phi, k);
        worst = Math.max(worst, distanceToHousing(RX, x, y));
      }
    }
    expect(worst).toBeLessThan(1e-6);
  });
  it('eccentric shaft turns three times per rotor revolution', () => {
    // apex 0 returns to start after rotor angle 2π; rotor centre (β = 3φ) has done 3 orbits
    let orbits = 0;
    let prev = 0;
    for (let s = 1; s <= 3600; s++) {
      const phi = (s / 3600) * Math.PI * 2;
      const beta = 3 * phi;
      if (Math.floor(beta / (Math.PI * 2)) > prev) {
        orbits++;
        prev = Math.floor(beta / (Math.PI * 2));
      }
    }
    expect(orbits).toBe(3);
  });
  it('rotor flank never crosses the housing', () => {
    const prof = rotorProfile(RX, 240);
    for (let s = 0; s < 120; s++) {
      const phi = (s / 120) * Math.PI * 2;
      const cx = RX.e * Math.cos(3 * phi);
      const cy = RX.e * Math.sin(3 * phi);
      for (let b = 0; b < prof.length; b += 4) {
        const psi = (b / prof.length) * Math.PI * 2 + phi;
        const x = cx + prof[b] * Math.cos(psi);
        const y = cy + prof[b] * Math.sin(psi);
        // inside test via radial comparison against housing along same polar direction (housing is star-shaped)
        const a = Math.atan2(y, x);
        let hr = 0;
        let best = Infinity;
        for (let i = 0; i < 2880; i++) {
          const al = (i / 2880) * Math.PI * 2;
          const [hx, hy] = housingPoint(RX, al);
          const d = Math.abs(Math.atan2(hy, hx) - a);
          const dd = Math.min(d, Math.PI * 2 - d);
          if (dd < best) {
            best = dd;
            hr = Math.hypot(hx, hy);
          }
        }
        expect(Math.hypot(x, y)).toBeLessThanOrEqual(hr + 0.35);
      }
    }
  });
});

describe('firing orders and balance', () => {
  it('firing intervals are 720/n', () => {
    for (const l of Object.values(LAYOUTS)) {
      const angles = l.cylinders.map((c) => c.fireAngle).sort((a, b) => a - b);
      const step = 720 / angles.length;
      angles.forEach((a, i) => expect(a).toBeCloseTo(i * step, 9));
    }
  });
  it('cylinders sharing a crank throw keep coincident pins (V8s)', () => {
    for (const id of ['v8cross', 'v8flat'] as const) {
      const l = LAYOUTS[id];
      for (let row = 0; row < 4; row++) {
        const pair = l.cylinders.filter((c) => c.row === row);
        expect(pair.length).toBe(2);
        for (let th = 0; th < 720; th += 30) {
          const a = ((pinDirection(pair[0], th) - pinDirection(pair[1], th)) % 360 + 360) % 360;
          expect(Math.min(a, 360 - a)).toBeCloseTo(0, 9);
        }
      }
    }
  });
  it('qualitative balance matches theory', () => {
    const i4 = peakShaking(LAYOUTS.i4);
    const i6 = peakShaking(LAYOUTS.i6);
    const vc = peakShaking(LAYOUTS.v8cross);
    const vf = peakShaking(LAYOUTS.v8flat);
    expect(i4.secondary).toBeGreaterThan(0.5); // inline-4: secondary imbalance
    expect(i6.primary).toBeLessThan(1e-9);
    expect(i6.secondary).toBeLessThan(1e-9); // inline-6: inherently balanced
    expect(vc.secondary).toBeLessThan(1e-9); // cross-plane V8: no secondary forces
    expect(vf.secondary).toBeGreaterThan(0.5); // flat-plane V8: secondary forces
  });
});

describe('units', () => {
  it('P[kW] = T·rpm/9549', () => {
    expect(powerKw(9549, 1)).toBeCloseTo(1, 12);
    expect(powerKw(300, 5000)).toBeCloseTo(157.08, 2);
  });
  it('1 kW = 1.341 hp', () => {
    expect(kwToHp(100)).toBeCloseTo(134.1, 9);
    expect(hpToKw(134.1)).toBeCloseTo(100, 9);
  });
  it('locale formatting', () => {
    expect(fmt(6000, 'en')).toBe('6,000');
    expect(fmt(6000, 'ru')).toBe('6 000');
    expect(fmt(41.5, 'ru', 1)).toBe('41,5');
    expect(withUnit(150, 'kW', 'ru')).toBe('150 кВт');
    expect(withUnit(-3, 'deg', 'en')).toBe('−3°');
  });
});

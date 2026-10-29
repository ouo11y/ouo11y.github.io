// The math behind the Math* widgets in "The math of observability" blog series.
// Plain functions, no DOM: the widgets call them at build time (for the no-JS render) and in the
// browser, and the numbers in the posts were checked by running these same functions in Node.

// ---------- random numbers (seeded, so every render shows the same picture) ----------

export function rng(seed: number): () => number {
  // mulberry32
  let s = seed | 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function normal(r: () => number): number {
  const u = 1 - r(), v = r();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

// Inverse of the standard normal CDF (Acklam's rational approximation, relative error < 1.2e-9).
export function probit(p: number): number {
  const a = [-39.69683028665376, 220.9460984245205, -275.9285104469687, 138.357751867269, -30.66479806614716, 2.506628277459239];
  const b = [-54.47609879822406, 161.5858368580409, -155.6989798598866, 66.80131188771972, -13.28068155288572];
  const c = [-0.007784894002430293, -0.3223964580411365, -2.400758277161838, -2.549732539343734, 4.374664141464968, 2.938163982698783];
  const d = [0.007784695709041462, 0.3224671290700398, 2.445134137142996, 3.754408661907416];
  const lo = 0.02425;
  if (p < lo) {
    const q = Math.sqrt(-2 * Math.log(p));
    return (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
  }
  if (p > 1 - lo) return -probit(1 - p);
  const q = p - 0.5, r = q * q;
  return ((((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q) / (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1);
}

// ---------- part 1: nines ----------

export const WINDOWS = [
  { key: 'day', label: 'day', minutes: 1440 },
  { key: 'week', label: 'week', minutes: 7 * 1440 },
  { key: 'month', label: '30 days', minutes: 30 * 1440 },
  { key: 'quarter', label: '90 days', minutes: 90 * 1440 },
  { key: 'year', label: '365 days', minutes: 365 * 1440 },
];

export function fmtDuration(minutes: number): string {
  const s = minutes * 60;
  if (s < 1) return `${(s * 1000).toFixed(0)} ms`;
  if (s < 60) return `${s.toFixed(s < 10 ? 1 : 0)} s`;
  if (minutes < 60) { const m = Math.floor(minutes), r = Math.round(s - m * 60); return r === 60 ? `${m + 1} min` : r ? `${m} min ${r} s` : `${m} min`; }
  if (minutes < 48 * 60) { const h = Math.floor(minutes / 60), m = Math.round(minutes - h * 60); return m === 60 ? `${h + 1} h` : m ? `${h} h ${m} min` : `${h} h`; }
  const dd = Math.floor(minutes / 1440), h = Math.round((minutes - dd * 1440) / 60);
  return h ? `${dd} d ${h} h` : `${dd} d`;
}

export const series = (as: number[]) => as.reduce((p, a) => p * a, 1);
export const parallel = (as: number[]) => 1 - as.reduce((p, a) => p * (1 - a), 1);
export const steadyState = (mtbf: number, mttr: number) => mtbf / (mtbf + mttr);

export function binomCdf(k: number, n: number, p: number): number {
  let s = 0, c = 1;
  for (let i = 0; i <= k; i++) {
    s += c * p ** i * (1 - p) ** (n - i);
    c = (c * (n - i)) / (i + 1);
  }
  return s;
}

// Two periods of n incidents each; durations are lognormal with spread sigma (log-space standard
// deviation); the second period's true mean is `improvement` lower. How often does the observed
// MTTR of the second period come out higher than the first, that is, "worse"?
// Simulated pairs of quarters: true where the second quarter's observed MTTR is higher than the first.
export function mttrPairs(n: number, improvement: number, sigma: number, trials = 4000, seed = 7): boolean[] {
  const r = rng(seed);
  const mu = (mean: number) => Math.log(mean) - (sigma * sigma) / 2;
  const m1 = mu(60), m2 = mu(60 * (1 - improvement));
  const out: boolean[] = [];
  for (let t = 0; t < trials; t++) {
    let a = 0, b = 0;
    for (let i = 0; i < n; i++) {
      a += Math.exp(m1 + sigma * normal(r));
      b += Math.exp(m2 + sigma * normal(r));
    }
    out.push(b > a);
  }
  return out;
}

export const mttrLooksWorse = (n: number, improvement: number, sigma: number, trials = 4000) =>
  mttrPairs(n, improvement, sigma, trials).filter(Boolean).length / trials;

// ---------- part 2: percentiles and histograms ----------

// A latency sample, deterministic: a lognormal body (median 80 ms) plus a slow tail (a share
// `tail` of requests, lognormal around `tailMs`). Values sit at evenly spaced quantiles of each part.
export function latencySample(tail: number, tailMs: number, n = 2000, bodyMs = 80): number[] {
  const nt = Math.round(n * tail), nb = n - nt, out: number[] = [];
  for (let i = 0; i < nb; i++) out.push(bodyMs * Math.exp(0.45 * probit((i + 0.5) / nb)));
  for (let i = 0; i < nt; i++) out.push(tailMs * Math.exp(0.25 * probit((i + 0.5) / nt)));
  return out.sort((a, b) => a - b);
}

export const mean = (xs: number[]) => xs.reduce((s, x) => s + x, 0) / xs.length;
// Nearest-rank percentile of a sorted array: the smallest value with at least q of the data at or below it.
export const quantile = (sorted: number[], q: number) => sorted[Math.max(0, Math.ceil(q * sorted.length) - 1)];

export const OTEL_DEFAULT_BOUNDS = [0, 5, 10, 25, 50, 75, 100, 250, 500, 750, 1000, 2500, 5000, 7500, 10000];

// Quantile from explicit buckets, the way Prometheus' histogram_quantile() does it: find the bucket
// that holds the rank, interpolate linearly inside it; in the +Inf bucket, answer the last bound.
export function explicitQuantile(sorted: number[], bounds: number[], q: number): { est: number; lo: number; hi: number } {
  const rank = q * sorted.length;
  let below = 0;
  for (let i = 0; i <= bounds.length; i++) {
    const lo = i === 0 ? 0 : bounds[i - 1], hi = i < bounds.length ? bounds[i] : Infinity;
    const inBucket = sorted.filter((v) => (i === 0 ? v <= hi : v > lo && v <= hi)).length;
    if (below + inBucket >= rank && inBucket > 0) {
      if (hi === Infinity) return { est: lo, lo, hi };
      return { est: lo + ((hi - lo) * (rank - below)) / inBucket, lo, hi };
    }
    below += inBucket;
  }
  return { est: bounds[bounds.length - 1], lo: bounds[bounds.length - 1], hi: Infinity };
}

export const expBase = (scale: number) => 2 ** (2 ** -scale);
export const expRelError = (scale: number) => (expBase(scale) - 1) / (expBase(scale) + 1);
// Bucket index of a positive value: bucket i holds (base^i, base^(i+1)].
export const expIndex = (v: number, scale: number) => Math.ceil(Math.log2(v) * 2 ** scale) - 1;

// The scale an SDK picks: the largest scale <= maxScale whose buckets cover [min, max] within maxSize.
export function autoScale(min: number, max: number, maxSize = 160, maxScale = 20): number {
  for (let s = maxScale; s > -10; s--) if (expIndex(max, s) - expIndex(min, s) + 1 <= maxSize) return s;
  return -10;
}

// Quantile from an exponential histogram: find the bucket that holds the rank and answer the point
// with the smallest worst-case relative error, 2*lo*hi/(lo+hi), off by at most (base-1)/(base+1).
export function expQuantile(sorted: number[], scale: number, q: number): { est: number; lo: number; hi: number } {
  const v = quantile(sorted, q), i = expIndex(v, scale), b = expBase(scale);
  const lo = b ** i, hi = b ** (i + 1);
  return { est: (2 * lo * hi) / (lo + hi), lo, hi };
}

// ---------- part 3: sampling ----------

export function wilson(k: number, n: number, z = 1.96): [number, number] {
  if (n === 0) return [0, 1];
  const p = k / n, d = 1 + (z * z) / n;
  const c = (p + (z * z) / (2 * n)) / d;
  const h = (z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n))) / d;
  return [Math.max(0, c - h), Math.min(1, c + h)];
}

// A binomial draw. Exact (count the geometric gaps between successes) when few successes are expected,
// normal approximation otherwise.
export function binomial(n: number, p: number, r: () => number): number {
  if (p <= 0 || n <= 0) return 0;
  if (p >= 1) return n;
  if (n * p > 50 && n * (1 - p) > 50) return Math.max(0, Math.min(n, Math.round(n * p + Math.sqrt(n * p * (1 - p)) * normal(r))));
  const lq = Math.log(1 - p);
  let k = 0, pos = 0;
  for (;;) {
    pos += Math.floor(Math.log(1 - r()) / lq) + 1;
    if (pos > n) return k;
    k++;
  }
}

const MAX_TH = 1n << 56n;

// OpenTelemetry probability sampling: the rejection threshold T = (1 - p) * 2^56, written in hex
// with trailing zeros dropped, rounded to `precision` significant hex digits of the kept share.
export function thresholdFor(p: number, precision = 4): string {
  if (p >= 1) return '0';
  let keep = BigInt(Math.round(p * 2 ** 56));
  const drop = BigInt(Math.max(0, keep.toString(16).length - precision) * 4);
  if (drop > 0n) keep = ((keep + (1n << (drop - 1n))) >> drop) << drop;
  if (keep <= 0n) keep = 1n;
  return (MAX_TH - keep).toString(16).padStart(14, '0').replace(/0+$/, '') || '0';
}

export function probabilityOf(th: string): number | undefined {
  if (!/^[0-9a-f]{1,14}$/.test(th)) return undefined;
  return Number(MAX_TH - BigInt('0x' + th.padEnd(14, '0'))) / 2 ** 56;
}

// ---------- part 4: queues ----------

// Erlang C: the probability that an arrival waits, for c servers at offered load a = lambda * S.
export function erlangC(c: number, a: number): number {
  if (a >= c) return 1;
  let term = 1, sum = 1;
  for (let k = 1; k < c; k++) { term *= a / k; sum += term; }
  const top = (term * a) / c / (1 - a / c);
  return top / (sum + top);
}

// Mean time in system for M/M/c, in units of the mean service time S.
export const mmcResponse = (c: number, rho: number) => (rho >= 1 ? Infinity : 1 + erlangC(c, rho * c) / (c * (1 - rho)));

// ---------- SVG drawing shared by build time and browser ----------

export interface Marker { label: string; value: number; tone: string; }

// A histogram of latencies on a log axis (10 ms to 10 s) with vertical markers.
// Returns the inside of an <svg viewBox="0 0 720 260">.
export function latencySvg(sorted: number[], markers: Marker[]): string {
  const W = 720, H = 260, L = 16, R = 16, T = 70, B = 34;
  const lo = Math.log10(10), hi = Math.log10(10000), bins = 60;
  const x = (v: number) => L + ((Math.log10(Math.min(Math.max(v, 10), 10000)) - lo) / (hi - lo)) * (W - L - R);
  const counts = new Array(bins).fill(0);
  for (const v of sorted) counts[Math.min(bins - 1, Math.max(0, Math.floor(((Math.log10(v) - lo) / (hi - lo)) * bins)))]++;
  // square-root scale so a 2% tail is still visible next to the body
  const top = Math.sqrt(Math.max(...counts)) || 1, bw = (W - L - R) / bins;
  let s = '';
  for (const t of [10, 100, 1000, 10000]) s += `<line class="tick" x1="${x(t)}" x2="${x(t)}" y1="${T}" y2="${H - B}"/><text class="xt" x="${x(t)}" y="${H - B + 18}" text-anchor="middle">${t >= 1000 ? `${t / 1000} s` : `${t} ms`}</text>`;
  counts.forEach((c, i) => {
    const h = (Math.sqrt(c) / top) * (H - T - B);
    if (c) s += `<rect class="bar" x="${(L + i * bw + 1).toFixed(1)}" y="${(H - B - h).toFixed(1)}" width="${(bw - 2).toFixed(1)}" height="${h.toFixed(1)}"/>`;
  });
  markers.forEach((m, i) => {
    const mx = x(m.value), anchor = mx > W - 120 ? 'end' : 'start', dx = anchor === 'end' ? -4 : 4, y = 14 + i * 14;
    s += `<g class="mk tone-${m.tone}"><line x1="${mx}" x2="${mx}" y1="${y - 4}" y2="${H - B}"/><text x="${mx + dx}" y="${y}" text-anchor="${anchor}">${m.label} ${fmtMs(m.value)}</text></g>`;
  });
  return s;
}

export const fmtMs = (v: number) => (v >= 1000 ? `${(v / 1000).toFixed(2)} s` : `${v.toFixed(v < 100 ? 1 : 0)} ms`);

export interface SampledHour { n: number; k: number; lo: number; hi: number; }

// `hours` simulated hours of `perHour` traces, a share `errRate` of them errors, each trace kept with
// probability p. For each hour: kept traces n, kept errors k and the 95% Wilson interval of k/n.
export function simulateHours(perHour: number, errRate: number, p: number, hours = 24, seed = 1): SampledHour[] {
  const r = rng(seed), errors = Math.round(perHour * errRate), out: SampledHour[] = [];
  for (let h = 0; h < hours; h++) {
    const k = binomial(errors, p, r), n = k + binomial(perHour - errors, p, r);
    const [lo, hi] = wilson(k, n);
    out.push({ n, k, lo, hi });
  }
  return out;
}

// One row per hour: the estimated error rate (dot) and its 95% interval (whisker), against the
// true rate (dashed). Returns the inside of an <svg viewBox="0 0 480 H">, with H = 30 + 16 * hours.
export function samplingSvg(hours: SampledHour[], trueRate: number): string {
  const W = 480, L = 96, R = 16, T = 22, row = 16;
  const max = Math.max(trueRate * 3, ...hours.map((h) => Math.min(h.hi, trueRate * 6)));
  const x = (v: number) => L + (Math.min(v, max) / max) * (W - L - R);
  const pc = (v: number) => `${+(v * 100).toPrecision(2)}%`;
  let s = '';
  for (let i = 0; i <= 4; i++) {
    const v = (max / 4) * i;
    s += `<line class="grid" x1="${x(v)}" x2="${x(v)}" y1="${T - 6}" y2="${T + hours.length * row}"/><text class="xt" x="${x(v)}" y="12" text-anchor="middle">${pc(v)}</text>`;
  }
  hours.forEach((h, i) => {
    const y = T + i * row + row / 2, est = h.n ? h.k / h.n : 0;
    const miss = h.lo > trueRate || h.hi < trueRate;
    s += `<g class="${miss ? 'hr miss' : 'hr'}"><text class="yt" x="${L - 8}" y="${y + 4}" text-anchor="end">${h.k} of ${h.n}</text>`;
    s += `<line class="ci" x1="${x(h.lo).toFixed(1)}" x2="${x(h.hi).toFixed(1)}" y1="${y}" y2="${y}"/>`;
    s += `<circle class="${h.k ? 'pt' : 'pt zero'}" cx="${x(est).toFixed(1)}" cy="${y}" r="4"/></g>`;
  });
  s += `<line class="truth" x1="${x(trueRate)}" x2="${x(trueRate)}" y1="${T - 6}" y2="${T + hours.length * row}"/>`;
  return s;
}

// Mean time in system (in service times) against utilization, for c servers, with c = 1 dashed
// for comparison and a dot at the current utilization. Inside of an <svg viewBox="0 0 720 240">.
export function queueCurveSvg(c: number, rho: number): string {
  const W = 720, H = 240, L = 48, R = 16, T = 14, B = 36, ymax = 20;
  const x = (r: number) => L + r * (W - L - R);
  const y = (v: number) => T + (1 - Math.min(v, ymax) / ymax) * (H - T - B);
  const path = (cc: number) => {
    let d = '';
    for (let r = 0; r <= 0.995; r += 0.005) { const v = mmcResponse(cc, r); if (v > ymax) break; d += `${d ? 'L' : 'M'}${x(r).toFixed(1)},${y(v).toFixed(1)}`; }
    return d;
  };
  let s = '';
  for (const v of [0, 5, 10, 15, 20]) s += `<line class="grid" x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}"/><text x="${L - 8}" y="${y(v) + 4}" text-anchor="end">${v}×</text>`;
  for (const r of [0, 0.25, 0.5, 0.75, 1]) s += `<text x="${x(r)}" y="${H - B + 18}" text-anchor="middle">${r * 100}%</text>`;
  s += `<text class="al" x="${(L + W - R) / 2}" y="${H - 2}" text-anchor="middle">utilization ρ</text>`;
  if (c !== 1) s += `<path class="c1" d="${path(1)}"/>`;
  s += `<path class="cc" d="${path(c)}"/>`;
  const v = mmcResponse(c, rho);
  if (v <= ymax) s += `<circle class="now" cx="${x(rho)}" cy="${y(v)}" r="6"/>`;
  else s += `<text class="now-t" x="${x(rho)}" y="${T + 10}" text-anchor="middle">${v === Infinity ? '∞' : `${v.toFixed(0)}×`} ↑</text>`;
  return s;
}

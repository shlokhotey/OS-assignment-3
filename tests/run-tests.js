// Run with: node tests/run-tests.js
const assert = require('assert');
const CTX = require('../js/context');
const Scheduler = require('../js/scheduler');
const ProdCons = require('../js/prodcons');
const Banker = require('../js/banker');
const Memory = require('../js/memory');
const Integrated = require('../js/integrated');

let pass = 0;
const test = (name, fn) => { fn(); pass++; console.log('PASS  ' + name); };
const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-9, `${a} != ${b}`);

// ---------- CPU scheduling (hand-calculated expected values) ----------
test('FCFS: avg WT 8.2, avg TAT 13', () => {
  const r = Scheduler.schedule(CTX.txns, 'fcfs');
  assert.deepStrictEqual(r.results.map(x => x.ct), [5, 8, 16, 22, 24]);
  near(r.avgWT, 8.2); near(r.avgTAT, 13);
});
test('SJF: avg WT 5.6, avg TAT 10.4', () => {
  const r = Scheduler.schedule(CTX.txns, 'sjf');
  assert.deepStrictEqual(r.results.map(x => x.wt), [0, 6, 14, 7, 1]);
  near(r.avgWT, 5.6); near(r.avgTAT, 10.4);
});
test('Priority: avg WT 7.4, avg TAT 12.2', () => {
  const r = Scheduler.schedule(CTX.txns, 'priority');
  assert.deepStrictEqual(r.results.map(x => x.wt), [0, 4, 6, 15, 12]);
  near(r.avgWT, 7.4); near(r.avgTAT, 12.2);
});
['fcfs', 'sjf', 'srtf', 'priority', 'rr'].forEach(a => test('Scheduler invariants: ' + a, () => {
  const r = Scheduler.schedule(CTX.txns, a, 2);
  const busy = r.gantt.filter(g => g.pid !== 'IDLE').reduce((s, g) => s + g.end - g.start, 0);
  assert.strictEqual(busy, CTX.txns.reduce((s, t) => s + t.bt, 0));
  r.results.forEach(x => { assert.strictEqual(x.tat, x.wt + x.bt); assert.ok(x.ct >= x.at + x.bt); });
}));

// ---------- Banker's algorithm ----------
test("Banker: Need matrix", () => {
  const need = Banker.computeNeed(CTX.banker.max, CTX.banker.alloc);
  assert.deepStrictEqual(need, [[7, 4, 3], [1, 2, 2], [6, 0, 0], [0, 1, 1], [4, 3, 1]]);
});
test("Banker: initial state is safe, sequence is valid", () => {
  const b = CTX.banker, r = Banker.isSafe(b.avail, b.alloc, b.max);
  assert.ok(r.safe);
  assert.deepStrictEqual(r.sequence, [1, 3, 0, 2, 4]);
  // replay sequence manually
  let work = b.avail.slice();
  r.sequence.forEach(i => { assert.ok(Banker.le(r.need[i], work)); work = work.map((v, j) => v + b.alloc[i][j]); });
  assert.deepStrictEqual(work, [10, 5, 7]);
});
test("Banker: request T2 (1,0,2) granted", () => {
  const d = Banker.request(CTX.banker, 1, [1, 0, 2]);
  assert.ok(d.granted); assert.deepStrictEqual(d.newState.avail, [2, 3, 0]);
});
test("Banker: request T5 (3,3,0) on initial state is denied as UNSAFE", () => {
  const d = Banker.request(CTX.banker, 4, [3, 3, 0]);
  assert.ok(!d.granted); assert.strictEqual(d.code, 'UNSAFE');
});
test("Banker: after T2 is granted, T5 (3,3,0) must WAIT (> Available 2,3,0)", () => {
  const after = Banker.request(CTX.banker, 1, [1, 0, 2]).newState;
  const d = Banker.request(after, 4, [3, 3, 0]);
  assert.ok(!d.granted); assert.strictEqual(d.code, 'WAIT');
});
test("Banker: after T2 is granted, T1 (0,2,0) is denied as UNSAFE", () => {
  const after = Banker.request(CTX.banker, 1, [1, 0, 2]).newState;
  const d = Banker.request(after, 0, [0, 2, 0]);
  assert.ok(!d.granted); assert.strictEqual(d.code, 'UNSAFE');
});
test("Integrated: sequential request outcomes are GRANTED, WAIT, UNSAFE", () => {
  const r = Integrated.run(CTX, {});
  assert.deepStrictEqual(r.stage3.requests.map(x => x.code), ['GRANTED', 'WAIT', 'UNSAFE']);
});
test("Banker: request above Need rejected", () => {
  assert.strictEqual(Banker.request(CTX.banker, 1, [2, 0, 0]).code, 'EXCEEDS_NEED');
});
test("Banker: unsafe state detected", () => {
  const r = Banker.isSafe([0, 0, 0], CTX.banker.alloc, CTX.banker.max);
  assert.ok(!r.safe);
});

// ---------- Memory management ----------
const sizes = CTX.txns.map(t => ({ pid: t.pid, size: t.size }));
const assignment = r => Object.fromEntries(r.partitions.filter(p => p.pid).map(p => [p.pid, p.size]));
test('Memory First Fit: T4 left waiting (only 300 KB free, T4 needs 426)', () => {
  const r = Memory.allocate(CTX.partitions, sizes, 'first');
  assert.deepStrictEqual(assignment(r), { T1: 500, T2: 600, T3: 200, T5: 100 });
  assert.deepStrictEqual(r.unallocated.map(u => u.pid), ['T4']);
  assert.strictEqual(r.stats.freePartitionsTotal, 300);
  assert.strictEqual(r.unallocated[0].externalFrag, false);   // not external fragmentation: 426 > 300
});
test('Memory external fragmentation detected when free space is split', () => {
  // two free 300 KB partitions (600 KB total free) cannot hold a 500 KB process
  const r = Memory.allocate([300, 300], [{ pid: 'X', size: 500 }], 'first');
  assert.strictEqual(r.unallocated[0].externalFrag, true);
});
test('Memory Best Fit: all five allocated', () => {
  const r = Memory.allocate(CTX.partitions, sizes, 'best');
  assert.deepStrictEqual(assignment(r), { T1: 300, T2: 500, T3: 200, T4: 600, T5: 100 });
  assert.strictEqual(r.unallocated.length, 0);
  assert.strictEqual(r.stats.internalFrag, 88 + 83 + 88 + 174 + 10);
});
test('Memory Worst Fit: T4 waiting', () => {
  const r = Memory.allocate(CTX.partitions, sizes, 'worst');
  assert.deepStrictEqual(r.unallocated.map(u => u.pid), ['T4']);
});

// ---------- Producer-Consumer ----------
test('Producer-Consumer: invariants hold on every step', () => {
  for (const seed of [1, 7, 42, 99]) for (const N of [1, 2, 4, 8]) {
    const s = ProdCons.create({ bufferSize: N, totalItems: 30, seed, producerBias: 0.7 });
    let guard = 0;
    while (!s.done && guard++ < 5000) {
      ProdCons.step(s);
      assert.ok(s.buffer.length >= 0 && s.buffer.length <= N, 'buffer bounds');
      assert.strictEqual(s.sem.empty + s.sem.full, N, 'empty+full == N');
      assert.strictEqual(s.sem.full, s.buffer.length);
      assert.strictEqual(s.produced - s.consumed, s.buffer.length);
      assert.strictEqual(s.sem.mutex, 1);
    }
    assert.ok(s.done); assert.strictEqual(s.consumed, 30);
  }
});
test('Producer-Consumer: FIFO order preserved, blocking occurs', () => {
  const s = ProdCons.create({ bufferSize: 2, totalItems: 20, seed: 3, producerBias: 0.8 });
  ProdCons.run(s);
  assert.deepStrictEqual(s.consumedItems, Array.from({ length: 20 }, (_, i) => 'Txn-' + (i + 1)));
  assert.ok(s.blocks.producer > 0);
});

// ---------- Integrated ----------
test('Integrated (Best Fit + Priority): all complete', () => {
  const r = Integrated.run(CTX, { memStrategy: 'best', schedAlgo: 'priority' });
  assert.ok(r.stage3.safe);
  assert.deepStrictEqual(r.stage1.order, ['T1', 'T2', 'T3', 'T4', 'T5']);
  assert.ok(r.final.every(f => f.status === 'COMPLETED'));
  near(r.stage4.result.avgWT, 7.4);
});
test('Integrated (First Fit + Priority): T4 waits for memory', () => {
  const r = Integrated.run(CTX, { memStrategy: 'first', schedAlgo: 'priority' });
  assert.strictEqual(r.final.find(f => f.pid === 'T4').status, 'WAITING (no memory partition)');
  assert.deepStrictEqual(r.stage4.runnable, ['T1', 'T2', 'T3', 'T5']);
});
test('Integrated: unsafe Banker state blocks every transaction', () => {
  const bad = JSON.parse(JSON.stringify(CTX)); bad.banker.avail = [0, 0, 0];
  const r = Integrated.run(bad, {});
  assert.ok(!r.stage3.safe);
  assert.ok(r.final.every(f => f.status.startsWith('BLOCKED')));
});

console.log(`\n${pass} tests passed`);

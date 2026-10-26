/* Integrated pipeline: how the four OS mechanisms cooperate in the banking scenario.
   1. Producer-Consumer : incoming transaction requests pass through a bounded buffer (admission order)
   2. Memory management : each admitted transaction needs a memory partition
   3. Banker's algorithm: shared resources are only committed if the system stays in a safe state
   4. CPU scheduling    : transactions that hold memory AND are cleared by Banker's are scheduled      */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('./scheduler'), require('./prodcons'), require('./banker'), require('./memory'));
  } else {
    root.Integrated = factory(root.Scheduler, root.ProdCons, root.Banker, root.Memory);
  }
})(typeof self !== 'undefined' ? self : this, function (Scheduler, ProdCons, Banker, Memory) {

  function run(ctx, opts) {
    const o = Object.assign({ memStrategy: 'best', schedAlgo: 'priority', quantum: 2, bufferSize: 3, seed: 7 }, opts || {});
    const txns = ctx.txns;

    // Stage 1: Producer-Consumer admission (ATM channels produce, dispatchers consume)
    const sim = ProdCons.create({
      bufferSize: o.bufferSize, producers: 2, consumers: 2, seed: o.seed,
      items: txns.slice().sort((a, b) => a.at - b.at).map(t => t.pid)
    });
    ProdCons.run(sim);
    const order = sim.consumedItems.slice();
    const stage1 = { order, produced: sim.produced, consumed: sim.consumed, blocks: sim.blocks, ticks: sim.tick, log: sim.log };

    // Stage 2: Memory allocation in admission order
    const byPid = Object.fromEntries(txns.map(t => [t.pid, t]));
    const mem = Memory.allocate(ctx.partitions, order.map(pid => ({ pid, size: byPid[pid].size })), o.memStrategy);
    const memHeld = new Set(mem.partitions.filter(p => p.pid).map(p => p.pid));
    const stage2 = { strategy: o.memStrategy, result: mem, waiting: mem.unallocated.map(u => u.pid) };

    // Stage 3: Banker's algorithm on the shared resources
    const b = ctx.banker;
    const safety = Banker.isSafe(b.avail, b.alloc, b.max);
    // Requests arrive one after another; every granted request changes the system state.
    let live = { alloc: b.alloc, max: b.max, avail: b.avail };
    const requests = ctx.requests.map(r => {
      const d = Banker.request(live, r.pid, r.req);
      const availBefore = live.avail.slice();
      if (d.granted) live = d.newState;
      return { pid: txns[r.pid].pid, req: r.req, availBefore, granted: d.granted, code: d.code, reason: d.reason,
               sequence: d.check ? d.check.sequence.map(i => txns[i].pid) : null };
    });
    const stage3 = { safe: safety.safe, sequence: safety.sequence.map(i => txns[i].pid), need: safety.need, requests, steps: safety.steps };
    const cleared = new Set(safety.safe ? txns.map(t => t.pid) : []);

    // Stage 4: CPU scheduling for transactions that hold memory and are cleared by Banker's
    const runnable = txns.filter(t => memHeld.has(t.pid) && cleared.has(t.pid));
    const sched = runnable.length ? Scheduler.schedule(runnable, o.schedAlgo, o.quantum) : null;
    const stage4 = { algo: o.schedAlgo, runnable: runnable.map(t => t.pid), result: sched };

    const final = txns.map(t => {
      const part = mem.partitions.find(p => p.pid === t.pid);
      const r = sched ? sched.results.find(x => x.pid === t.pid) : null;
      let status = 'COMPLETED';
      if (!part) status = 'WAITING (no memory partition)';
      else if (!cleared.has(t.pid)) status = 'BLOCKED (unsafe resource state)';
      return { pid: t.pid, name: t.name, partition: part ? part.size : null, status,
               wt: r ? r.wt : null, tat: r ? r.tat : null, ct: r ? r.ct : null };
    });

    return { options: o, stage1, stage2, stage3, stage4, final };
  }

  return { run };
});

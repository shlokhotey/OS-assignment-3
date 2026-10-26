/* Producer-Consumer (bounded buffer) with counting semaphores empty / full and a mutex.
   Producers = ATM terminals / web channels creating transaction requests.
   Consumers = transaction-processing workers. Execution is a seeded, deterministic
   interleaving, so a run can be replayed and tested. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.ProdCons = factory();
})(typeof self !== 'undefined' ? self : this, function () {

  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function create(options) {
    const o = Object.assign(
      { bufferSize: 4, producers: 2, consumers: 2, totalItems: 12, seed: 7, producerBias: 0.55, items: null },
      options || {}
    );
    const total = o.items ? o.items.length : o.totalItems;
    const s = {
      opts: o, total, N: o.bufferSize,
      buffer: [], sem: { empty: o.bufferSize, full: 0, mutex: 1 },
      actors: [], log: [], tick: 0,
      produced: 0, consumed: 0, consumedItems: [],
      blocks: { producer: 0, consumer: 0 },
      rand: mulberry32(o.seed), done: false
    };
    for (let i = 1; i <= o.producers; i++) s.actors.push({ id: 'P' + i, type: 'producer', state: 'ready' });
    for (let i = 1; i <= o.consumers; i++) s.actors.push({ id: 'C' + i, type: 'consumer', state: 'ready' });
    return s;
  }

  const snap = s => ({ empty: s.sem.empty, full: s.sem.full, mutex: s.sem.mutex, count: s.buffer.length });
  const note = (s, actor, kind, msg) => s.log.push({ tick: s.tick, actor: actor.id, kind, msg, sem: snap(s) });

  function wake(s, type) {
    s.actors.filter(a => a.type === type && a.state === 'blocked').forEach(a => {
      a.state = 'ready';
      note(s, a, 'wake', `${a.id} woken by signal`);
    });
  }

  function attemptProduce(s, a) {
    if (s.sem.empty === 0) {
      a.state = 'blocked'; s.blocks.producer++;
      note(s, a, 'block', `${a.id}: wait(empty) -> empty=0, buffer FULL, producer BLOCKED`);
      return;
    }
    s.sem.empty--;                                   // wait(empty)
    s.sem.mutex = 0;                                 // wait(mutex)  (enter critical section)
    const label = s.opts.items ? s.opts.items[s.produced] : 'Txn-' + (s.produced + 1);
    s.buffer.push(label);                            // insert item
    s.produced++;
    s.sem.mutex = 1;                                 // signal(mutex) (leave critical section)
    s.sem.full++;                                    // signal(full)
    a.state = 'ready';
    note(s, a, 'produce', `${a.id}: wait(empty), wait(mutex), INSERT ${label}, signal(mutex), signal(full)`);
    wake(s, 'consumer');
    if (s.produced >= s.total) s.actors.filter(x => x.type === 'producer').forEach(x => (x.state = 'done'));
  }

  function attemptConsume(s, a) {
    if (s.sem.full === 0) {
      a.state = 'blocked'; s.blocks.consumer++;
      note(s, a, 'block', `${a.id}: wait(full) -> full=0, buffer EMPTY, consumer BLOCKED`);
      return;
    }
    s.sem.full--;                                    // wait(full)
    s.sem.mutex = 0;                                 // wait(mutex)
    const item = s.buffer.shift();                   // remove item (FIFO)
    s.consumed++; s.consumedItems.push(item);
    s.sem.mutex = 1;                                 // signal(mutex)
    s.sem.empty++;                                   // signal(empty)
    a.state = 'ready';
    note(s, a, 'consume', `${a.id}: wait(full), wait(mutex), REMOVE ${item}, signal(mutex), signal(empty)`);
    wake(s, 'producer');
    if (s.consumed >= s.total) {
      s.done = true;
      s.actors.forEach(x => (x.state = 'done'));
      note(s, a, 'info', 'All transactions processed.');
    }
  }

  function step(s) {
    if (s.done) return false;
    s.tick++;
    const live = type => s.actors.filter(a => a.type === type && a.state !== 'done');
    let type = s.rand() < s.opts.producerBias ? 'producer' : 'consumer';
    if (!live(type).length) type = type === 'producer' ? 'consumer' : 'producer';
    const pool = live(type);
    const a = pool[Math.floor(s.rand() * pool.length)];
    if (type === 'producer') attemptProduce(s, a); else attemptConsume(s, a);
    return true;
  }

  function run(s, maxSteps) {
    let n = maxSteps || 10000;
    while (!s.done && n-- > 0) step(s);
    return s;
  }

  return { create, step, run };
});

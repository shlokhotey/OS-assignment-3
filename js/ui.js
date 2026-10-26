/* UI layer: builds the six panels and wires them to the algorithm modules. */
(function () {
  'use strict';

  // ---------- helpers ----------
  function h(tag, attrs, ...kids) {
    const e = document.createElement(tag);
    for (const k in attrs || {}) {
      if (k === 'class') e.className = attrs[k];
      else if (k === 'html') e.innerHTML = attrs[k];
      else if (k.startsWith('on')) e.addEventListener(k.slice(2), attrs[k]);
      else e.setAttribute(k, attrs[k]);
    }
    kids.flat(Infinity).forEach(c => { if (c != null && c !== false) e.append(c.nodeType ? c : document.createTextNode(String(c))); });
    return e;
  }
  // replaceChildren that ignores null/false and flattens arrays
  function setKids(el, ...kids) {
    el.replaceChildren(...kids.flat(Infinity).filter(x => x != null && x !== false));
  }
  const COLORS = ['#1f6feb', '#2da44e', '#d97706', '#8250df', '#cf222e', '#0e8a8a', '#bf3989'];
  const colorOf = pid => COLORS[((parseInt(String(pid).replace(/\D/g, ''), 10) || 1) - 1) % COLORS.length];
  const num = (v, w) => h('input', { type: 'number', value: v, min: 0, style: w ? 'width:' + w + 'px' : '' });
  const sel = (opts, cur) => { const s = h('select'); opts.forEach(([v, t]) => s.append(h('option', { value: v }, t))); s.value = cur; return s; };
  const field = (label, el) => h('label', { class: 'f' }, label, el);
  const badge = (text, kind) => h('span', { class: 'badge ' + kind }, text);
  const vec = a => '(' + a.join(', ') + ')';
  const fmt = x => (Math.round(x * 100) / 100).toString();
  function table(head, rows, opts) {
    opts = opts || {};
    return h('table', null,
      h('thead', null, h('tr', null, head.map(t => h('th', null, t)))),
      h('tbody', null, rows.map(r => h('tr', { class: r.cls || '' }, (r.cells || r).map(c => (c && c.nodeType === 1 && c.tagName === 'TD') ? c : h('td', null, c))))));
  }

  const tabsEl = document.getElementById('tabs');
  const panelsEl = document.getElementById('panels');
  function addPanel(id, title, builder) {
    const btn = h('button', { onclick: () => show(id) }, title);
    const panel = h('section', { class: 'panel', id });
    tabsEl.append(btn); panelsEl.append(panel);
    builder(panel);
    addPanel.list.push({ id, btn, panel });
  }
  addPanel.list = [];
  function show(id) { addPanel.list.forEach(p => { const on = p.id === id; p.btn.classList.toggle('on', on); p.panel.classList.toggle('on', on); }); }

  const CTX = window.CTX;

  // ---------- 0. Problem context ----------
  addPanel('ctx', '1 · Problem Context', root => {
    root.append(
      h('div', { class: 'card' },
        h('h2', null, CTX.title),
        h('p', { class: 'hint' }, 'A bank processes ATM withdrawals, deposits, fund transfers, balance inquiries and statement/record generation concurrently. Requests are queued, transactions need memory and shared resources (database connections, service threads, ledger locks) and must run without data inconsistency or deadlock.'),
        table(['PID', 'Transaction', 'Arrival', 'Burst', 'Priority', 'Memory (KB)'],
          CTX.txns.map(t => [t.pid, h('td', { class: 'l' }, t.name), t.at, t.bt, t.pr, t.size])),
        h('p', { class: 'note' }, 'Priority: lower number = higher priority (fund transfers are most urgent). These five transactions are shared by every module, so the algorithms operate on one connected scenario.')),
      h('div', { class: 'card' },
        h('h2', null, 'How the four mechanisms work together'),
        h('div', { class: 'map' },
          h('div', null, h('b', null, '① Producer–Consumer'), 'ATM / web channels produce requests into a bounded buffer; dispatcher workers consume them. Fixes the admission order and prevents lost or duplicate requests.'),
          h('div', null, h('b', null, '② Memory management'), 'Each admitted transaction needs a partition (First / Best / Worst Fit). No partition → transaction waits.'),
          h('div', null, h('b', null, '③ Banker\'s algorithm'), 'Before shared resources (DB connections, threads, ledger locks) are committed, the system must stay in a safe state.'),
          h('div', null, h('b', null, '④ CPU scheduling'), 'Transactions that have memory and are cleared by Banker\'s are scheduled; waiting and turnaround times are measured.'))),
      h('div', { class: 'card' }, h('p', { class: 'note' }, 'Use the tabs above: 2 CPU Scheduling · 3 Producer–Consumer · 4 Banker\'s · 5 Memory · 6 Integrated pipeline. All tables are editable.')));
  });

  // ---------- 1. CPU scheduling ----------
  addPanel('cpu', '2 · CPU Scheduling', root => {
    const inputs = CTX.txns.map(t => ({ at: num(t.at), bt: num(t.bt), pr: num(t.pr) }));
    const algo = sel([['fcfs', 'FCFS'], ['sjf', 'SJF (non-preemptive)'], ['srtf', 'SRTF (preemptive)'], ['priority', 'Priority (non-preemptive)'], ['rr', 'Round Robin']], 'priority');
    const quantum = num(2, 60);
    const out = h('div');
    const run = () => {
      const procs = CTX.txns.map((t, i) => ({ ...t, at: +inputs[i].at.value, bt: Math.max(1, +inputs[i].bt.value), pr: +inputs[i].pr.value }));
      const r = Scheduler.schedule(procs, algo.value, +quantum.value);
      setKids(out, renderSchedule(r));
    };
    root.append(h('div', { class: 'card' },
      h('h2', null, 'CPU Scheduling of banking transactions'),
      h('p', { class: 'hint' }, 'Edit arrival, burst and priority, choose an algorithm, and run. Waiting time = turnaround − burst; turnaround = completion − arrival.'),
      table(['PID', 'Transaction', 'Arrival', 'Burst', 'Priority'], CTX.txns.map((t, i) => [t.pid, h('td', { class: 'l' }, t.name), h('td', null, inputs[i].at), h('td', null, inputs[i].bt), h('td', null, inputs[i].pr)])),
      h('div', { class: 'controls' }, field('Algorithm', algo), field('Quantum (RR)', quantum), h('button', { class: 'btn', onclick: run }, 'Run scheduler'),
        h('button', { class: 'btn alt', onclick: () => { setKids(out, compareAll(inputs)); } }, 'Compare all algorithms'))),
      h('div', { class: 'card' }, out));
    run();
  });

  function renderSchedule(r) {
    const end = r.gantt[r.gantt.length - 1].end;
    const total = end - r.gantt[0].start;
    const bar = h('div', { class: 'gantt' }, r.gantt.map(g => h('div', { class: 'seg' + (g.pid === 'IDLE' ? ' idle' : ''), style: `flex:${g.end - g.start};${g.pid === 'IDLE' ? '' : 'background:' + colorOf(g.pid)}`, title: `${g.pid}: ${g.start}–${g.end}` }, g.pid === 'IDLE' ? 'idle' : g.pid)));
    const axis = h('div', { class: 'axis' }, r.gantt.map(g => h('span', { style: `flex:${g.end - g.start}` }, g.start)), h('span', { style: 'min-width:0;flex:0;border:0;padding-left:4px' }, end));
    const rows = r.results.map(x => [x.pid, x.at, x.bt, x.ct, x.tat, x.wt]);
    rows.push({ cls: 'sum', cells: ['Average', '', '', '', fmt(r.avgTAT), fmt(r.avgWT)] });
    return h('div', null, h('h2', null, 'Gantt chart – ' + r.algo.toUpperCase()), bar, axis, table(['PID', 'Arrival', 'Burst', 'Completion', 'Turnaround', 'Waiting'], rows),
      h('p', { class: 'note' }, `Total time ${total} units · average waiting ${fmt(r.avgWT)} · average turnaround ${fmt(r.avgTAT)}`));
  }
  function compareAll(inputs) {
    const procs = CTX.txns.map((t, i) => ({ ...t, at: +inputs[i].at.value, bt: Math.max(1, +inputs[i].bt.value), pr: +inputs[i].pr.value }));
    const names = { fcfs: 'FCFS', sjf: 'SJF', srtf: 'SRTF', priority: 'Priority', rr: 'Round Robin (q=2)' };
    const rows = Object.keys(names).map(a => { const r = Scheduler.schedule(procs, a, 2); return [h('td', { class: 'l' }, names[a]), fmt(r.avgWT), fmt(r.avgTAT)]; });
    return h('div', null, h('h2', null, 'Algorithm comparison'), table(['Algorithm', 'Avg waiting', 'Avg turnaround'], rows));
  }

  // ---------- 2. Producer-Consumer ----------
  addPanel('pc', '3 · Producer–Consumer', root => {
    const bs = num(4, 60), np = num(2, 60), nc = num(2, 60), ni = num(12, 60), seed = num(7, 60), bias = num(55, 60);
    const types = ['WITHDRAW', 'DEPOSIT', 'TRANSFER', 'BALANCE', 'STATEMENT'];
    let sim = null;
    const view = h('div');
    const reset = () => {
      const total = Math.max(1, +ni.value);
      sim = ProdCons.create({ bufferSize: Math.max(1, +bs.value), producers: Math.max(1, +np.value), consumers: Math.max(1, +nc.value), seed: +seed.value, producerBias: (+bias.value) / 100,
        items: Array.from({ length: total }, (_, i) => types[i % types.length].slice(0, 3) + '#' + (i + 1)) });
      draw();
    };
    const stepN = n => () => { for (let i = 0; i < n; i++) ProdCons.step(sim); draw(); };
    function draw() {
      const s = sim;
      const slots = h('div', { class: 'buf' }, Array.from({ length: s.N }, (_, i) => s.buffer[i] ? h('div', { class: 'slot full' }, s.buffer[i]) : h('div', { class: 'slot' }, '·')));
      const sems = h('div', { class: 'sems' },
        h('div', { class: 'sem' }, h('b', null, s.sem.empty), h('span', null, 'empty')),
        h('div', { class: 'sem' }, h('b', null, s.sem.full), h('span', null, 'full')),
        h('div', { class: 'sem' }, h('b', null, s.sem.mutex), h('span', null, 'mutex')),
        h('div', { class: 'sem' }, h('b', null, `${s.produced}/${s.total}`), h('span', null, 'produced')),
        h('div', { class: 'sem' }, h('b', null, `${s.consumed}/${s.total}`), h('span', null, 'consumed')),
        h('div', { class: 'sem' }, h('b', null, `${s.blocks.producer}/${s.blocks.consumer}`), h('span', null, 'blocks P/C')));
      const actors = h('div', { class: 'actors' }, s.actors.map(a => h('div', { class: 'actor ' + a.state }, `${a.type === 'producer' ? 'Producer' : 'Consumer'} ${a.id} · ${a.state}`)));
      const log = h('div', { class: 'log' }, s.log.slice().reverse().slice(0, 80).map(l => h('div', { class: l.kind }, `[t${l.tick}] ${l.msg}   {empty=${l.sem.empty} full=${l.sem.full} items=${l.sem.count}}`)));
      setKids(view, ...[h('h3', null, `Bounded buffer (capacity ${s.N})`), slots, sems, h('h3', null, 'Threads'), actors,
        s.done ? h('p', null, badge('Finished: all transactions processed in FIFO order', 'ok')) : null, h('h3', null, 'Event log (latest first)'), log].filter(Boolean));
    }
    root.append(h('div', { class: 'card' },
      h('h2', null, 'Bounded buffer with semaphores'),
      h('p', { class: 'hint' }, 'Producers (ATM terminals) call wait(empty) → wait(mutex) → insert → signal(mutex) → signal(full). Consumers (transaction workers) call wait(full) → wait(mutex) → remove → signal(mutex) → signal(empty). A full buffer blocks producers; an empty one blocks consumers.'),
      h('div', { class: 'controls' }, field('Buffer size', bs), field('Producers', np), field('Consumers', nc), field('Transactions', ni), field('Seed', seed), field('Producer speed %', bias),
        h('button', { class: 'btn', onclick: reset }, 'Reset'),
        h('button', { class: 'btn alt', onclick: stepN(1) }, 'Step'),
        h('button', { class: 'btn alt', onclick: stepN(5) }, 'Step ×5'),
        h('button', { class: 'btn alt', onclick: () => { ProdCons.run(sim); draw(); } }, 'Run to end')),
      view));
    reset();
  });

  // ---------- 3. Banker's ----------
  addPanel('bank', '4 · Banker\'s Algorithm', root => {
    const B = CTX.banker, n = B.alloc.length, m = B.avail.length;
    const A = B.alloc.map(r => r.map(v => num(v))), M = B.max.map(r => r.map(v => num(v))), V = B.avail.map(v => num(v));
    const out = h('div'), reqOut = h('div');
    const readState = () => ({ alloc: A.map(r => r.map(i => +i.value)), max: M.map(r => r.map(i => +i.value)), avail: V.map(i => +i.value) });
    const rname = i => CTX.txns[i].pid;
    const matrix = (title, inputs) => h('div', { class: 'mat' }, h('h3', null, title), table(['', 'A', 'B', 'C'], inputs.map((r, i) => [h('td', null, rname(i)), ...r.map(c => h('td', null, c))])));
    const check = () => {
      const st = readState();
      const r = Banker.isSafe(st.avail, st.alloc, st.max);
      const needTbl = table(['', 'A', 'B', 'C'], r.need.map((row, i) => [rname(i), ...row]));
      const steps = table(['Step', 'Process', 'Need', 'Work before', 'Work after (+Alloc)'], r.steps.map((s, i) => [i + 1, rname(s.proc), vec(s.need), vec(s.workBefore), vec(s.workAfter)]));
      setKids(out, 
        h('div', { class: 'mat' }, h('h3', null, 'Need = Max − Allocation'), needTbl),
        h('h3', null, 'Safety algorithm'),
        r.safe ? h('p', null, badge('SAFE STATE', 'ok'), ' Safe sequence: ', h('b', null, '< ' + r.sequence.map(rname).join(' → ') + ' >')) : h('p', null, badge('UNSAFE STATE', 'bad'), ` No process in ${r.stuck.map(rname).join(', ')} can ever finish – deadlock is possible.`),
        r.steps.length ? steps : null,
        h('p', { class: 'note' }, 'Total resources = Available + Σ Allocation = ' + vec(st.avail.map((v, j) => v + st.alloc.reduce((s, row) => s + row[j], 0)))));
    };
    const rp = h('select'); CTX.txns.forEach((t, i) => rp.append(h('option', { value: i }, `${t.pid} – ${t.name}`)));
    const rv = [num(1), num(0), num(2)];
    rp.value = '1';
    const doReq = () => {
      const st = readState(), pid = +rp.value, req = rv.map(i => +i.value);
      const d = Banker.request(st, pid, req);
      setKids(reqOut, 
        h('p', null, `${rname(pid)} requests ${vec(req)} with Available ${vec(st.avail)}: `, badge(d.code, d.granted ? 'ok' : (d.code === 'WAIT' ? 'warn' : 'bad'))),
        h('p', { class: 'note' }, d.reason),
        d.check && d.check.safe ? h('p', null, 'Safe sequence after granting: ', h('b', null, '< ' + d.check.sequence.map(rname).join(' → ') + ' >'),
          h('button', { class: 'btn alt', style: 'margin-left:12px', onclick: () => applyState(d.newState) }, 'Commit this grant')) : null);
    };
    const applyState = ns => { ns.alloc.forEach((r, i) => r.forEach((v, j) => (A[i][j].value = v))); ns.avail.forEach((v, j) => (V[j].value = v)); setKids(reqOut, h('p', null, badge('Committed', 'ok'), ' Allocation and Available updated.')); check(); };
    root.append(h('div', { class: 'card' },
      h('h2', null, 'Deadlock avoidance – Banker\'s Algorithm'),
      h('p', { class: 'hint' }, `Resources: A = ${CTX.resources[0]}, B = ${CTX.resources[1]}, C = ${CTX.resources[2]}. Edit any value and re-run the safety check.`),
      matrix('Allocation', A), matrix('Max', M),
      h('div', { class: 'mat' }, h('h3', null, 'Available'), table(['A', 'B', 'C'], [V.map(i => h('td', null, i))])),
      h('div', { class: 'controls' }, h('button', { class: 'btn', onclick: check }, 'Check safety'), h('button', { class: 'btn alt', onclick: () => location.reload() }, 'Reset data')),
      out),
      h('div', { class: 'card' }, h('h2', null, 'Resource-request algorithm'),
        h('p', { class: 'hint' }, 'Tests whether a request can be granted: it must be ≤ Need, ≤ Available, and the pretend-allocation must leave a safe state. Defaults reproduce the case-study test (T2 requests (1,0,2)).'),
        h('div', { class: 'controls' }, field('Transaction', rp), field('Request A', rv[0]), field('B', rv[1]), field('C', rv[2]), h('button', { class: 'btn', onclick: doReq }, 'Request resources')), reqOut));
    check();
  });

  // ---------- 4. Memory ----------
  addPanel('mem', '5 · Memory Management', root => {
    const parts = h('input', { type: 'text', class: 'wide', value: CTX.partitions.join(', ') });
    const sizes = CTX.txns.map(t => num(t.size, 80));
    const strat = sel([['first', 'First Fit'], ['best', 'Best Fit'], ['worst', 'Worst Fit']], 'first');
    const out = h('div');
    const read = () => ({ ps: parts.value.split(/[ ,]+/).map(Number).filter(x => x > 0), procs: CTX.txns.map((t, i) => ({ pid: t.pid, size: +sizes[i].value })) });
    const run = () => {
      const { ps, procs } = read();
      const r = Memory.allocate(ps, procs, strat.value);
      const map = h('div', { class: 'mem' }, r.partitions.map(p => {
        const leftover = p.size - p.used;
        return h('div', { class: 'part', style: `flex:${p.size}` },
          h('div', { class: 'head' }, `#${p.idx + 1} · ${p.size} KB`),
          p.pid ? [leftover > 0 ? h('div', { class: 'frag', style: `flex:${leftover} 1 0` }, `free ${leftover}`) : null,
                   h('div', { class: 'used', style: `flex:${p.used} 1 0;background:${colorOf(p.pid)}` }, `${p.pid} · ${p.used}`)]
                 : h('div', { class: 'free' }, 'free'));
      }));
      const stats = r.stats;
      setKids(out, 
        h('h3', null, r.strategy.toUpperCase() + ' allocation map'), map,
        h('div', { class: 'legend' }, h('span', null, h('i', { style: 'background:#1f6feb' }), 'allocated process'), h('span', null, h('i', { style: 'background:#ffd9d4' }), 'internal fragmentation'), h('span', null, h('i', { style: 'background:#e9edf4' }), 'free partition')),
        h('h3', null, 'Allocation table'),
        table(['Partition', 'Size (KB)', 'Process', 'Used', 'Internal fragment'], r.partitions.map(p => [`#${p.idx + 1}`, p.size, p.pid || 'free', p.pid ? p.used : 0, p.pid ? p.size - p.used : '–'])),
        h('h3', null, 'Fragmentation analysis'),
        table(['Total memory', 'Allocated', 'Internal fragmentation', 'Free partitions', 'Largest free block', 'Utilisation'],
          [[stats.total + ' KB', stats.used + ' KB', stats.internalFrag + ' KB', stats.freePartitionsTotal + ' KB', stats.largestFree + ' KB', fmt(stats.utilization * 100) + ' %']]),
        r.unallocated.length ? r.unallocated.map(u => h('p', null, badge(u.pid + ' WAITING', 'bad'), ` needs ${u.size} KB; largest free block is ${stats.largestFree} KB. `,
          u.externalFrag ? `External fragmentation: ${stats.freePartitionsTotal} KB is free in total, but not contiguous.` : `Not enough free memory (${stats.freePartitionsTotal} KB free in total).`)) : h('p', null, badge('All transactions allocated', 'ok')));
    };
    const compare = () => {
      const { ps, procs } = read();
      const rows = ['first', 'best', 'worst'].map(s => { const r = Memory.allocate(ps, procs, s); return [h('td', { class: 'l' }, s + ' fit'), r.stats.allocatedCount + ' / ' + procs.length, r.stats.internalFrag + ' KB', r.stats.freePartitionsTotal + ' KB', r.unallocated.map(u => u.pid).join(', ') || '–']; });
      setKids(out, h('h3', null, 'Strategy comparison'), table(['Strategy', 'Allocated', 'Internal frag.', 'Free partitions', 'Waiting'], rows));
    };
    root.append(h('div', { class: 'card' },
      h('h2', null, 'Memory allocation for the transaction server'),
      h('p', { class: 'hint' }, 'Fixed partitions. Transactions are allocated in admission order. First Fit takes the first partition that fits, Best Fit the smallest that fits, Worst Fit the largest.'),
      h('div', { class: 'controls' }, field('Partitions (KB, comma-separated)', parts), field('Strategy', strat), h('button', { class: 'btn', onclick: run }, 'Allocate'), h('button', { class: 'btn alt', onclick: compare }, 'Compare strategies')),
      table(['Transaction', ...CTX.txns.map(t => t.pid)], [[h('td', { class: 'l' }, 'Memory needed (KB)'), ...sizes.map(i => h('td', null, i))]]),
      out));
    run();
  });

  // ---------- 5. Integrated ----------
  addPanel('int', '6 · Integrated Pipeline', root => {
    const mem = sel([['first', 'First Fit'], ['best', 'Best Fit'], ['worst', 'Worst Fit']], 'best');
    const alg = sel([['fcfs', 'FCFS'], ['sjf', 'SJF'], ['srtf', 'SRTF'], ['priority', 'Priority'], ['rr', 'Round Robin']], 'priority');
    const buf = num(3, 60), seed = num(7, 60), q = num(2, 60);
    const out = h('div');
    const run = () => {
      const r = Integrated.run(CTX, { memStrategy: mem.value, schedAlgo: alg.value, bufferSize: Math.max(1, +buf.value), seed: +seed.value, quantum: +q.value });
      const s1 = r.stage1, s2 = r.stage2, s3 = r.stage3, s4 = r.stage4;
      setKids(out, 
        h('div', { class: 'card' },
          h('div', { class: 'stage' }, h('h3', null, '① Producer–Consumer admission'),
            h('p', null, 'Admission order through a buffer of ' + buf.value + ': ', h('b', null, s1.order.join(' → ')), `  (${s1.produced} produced, ${s1.consumed} consumed, producers blocked ${s1.blocks.producer}×, consumers blocked ${s1.blocks.consumer}×)`)),
          h('div', { class: 'stage' }, h('h3', null, '② Memory allocation – ' + s2.strategy + ' fit'),
            table(['Partition (KB)', ...s2.result.partitions.map(p => p.size)], [[h('td', { class: 'l' }, 'Holds'), ...s2.result.partitions.map(p => p.pid || 'free')]]),
            s2.waiting.length ? h('p', null, badge(s2.waiting.join(', ') + ' WAITING', 'bad'), ' no partition large enough – excluded from CPU scheduling.') : h('p', null, badge('All admitted transactions hold memory', 'ok')),
            h('p', { class: 'note' }, `Internal fragmentation ${s2.result.stats.internalFrag} KB · free partitions ${s2.result.stats.freePartitionsTotal} KB`)),
          h('div', { class: 'stage' }, h('h3', null, '③ Banker\'s algorithm on shared resources'),
            s3.safe ? h('p', null, badge('SAFE', 'ok'), ' sequence ', h('b', null, '< ' + s3.sequence.join(' → ') + ' >')) : h('p', null, badge('UNSAFE', 'bad'), ' no transaction is dispatched.'),
            table(['Transaction', 'Request', 'Available before', 'Decision', 'Reason'], s3.requests.map(x => [x.pid, vec(x.req), vec(x.availBefore), badge(x.code, x.granted ? 'ok' : (x.code === 'WAIT' ? 'warn' : 'bad')), h('td', { class: 'l' }, x.reason)]))),
          h('div', { class: 'stage' }, h('h3', null, '④ CPU scheduling – ' + s4.algo),
            s4.result ? renderSchedule(s4.result) : h('p', null, 'No runnable transactions.'))),
        h('div', { class: 'card' }, h('h2', null, 'Final outcome per transaction'),
          table(['PID', 'Transaction', 'Partition', 'Completion', 'Waiting', 'Turnaround', 'Status'],
            r.final.map(f => [f.pid, h('td', { class: 'l' }, f.name), f.partition ? f.partition + ' KB' : '–', f.ct ?? '–', f.wt ?? '–', f.tat ?? '–', badge(f.status, f.status === 'COMPLETED' ? 'ok' : 'bad')]))));
    };
    root.append(h('div', { class: 'card' },
      h('h2', null, 'End-to-end pipeline'),
      h('p', { class: 'hint' }, 'Request → bounded buffer → memory partition → Banker\'s safety → CPU scheduler. Try First Fit versus Best Fit: with First Fit the Statement transaction (T4, 426 KB) cannot get a partition and is left out; Best Fit lets all five transactions complete.'),
      h('div', { class: 'controls' }, field('Memory strategy', mem), field('CPU algorithm', alg), field('Quantum', q), field('Buffer size', buf), field('Seed', seed), h('button', { class: 'btn', onclick: run }, 'Run pipeline'))),
      out);
    run();
  });

  show('ctx');
  document.body.append(h('footer', null, 'Operating Systems · Assignment 3 & Practical 9 · Algorithm modules are plain JavaScript (see js/) and tested with tests/run-tests.js'));
})();

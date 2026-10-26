/* CPU scheduling: FCFS, SJF, SRTF, Priority (non-preemptive), Round Robin.
   Returns a Gantt chart, per-process results and average waiting / turnaround time. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Scheduler = factory();
})(typeof self !== 'undefined' ? self : this, function () {

  function schedule(procs, algo, quantum) {
    const P = procs.map((p, i) => ({ ...p, idx: i, rem: p.bt, ct: null, rt: null }));
    const n = P.length;
    const gantt = [];
    let t = 0, done = 0;

    const push = (pid, s, e) => {
      if (e <= s) return;
      const last = gantt[gantt.length - 1];
      if (last && last.pid === pid && last.end === s) last.end = e;
      else gantt.push({ pid, start: s, end: e });
    };
    const idle = (from, to) => { if (to > from) gantt.push({ pid: 'IDLE', start: from, end: to }); };

    if (algo === 'rr') {
      const q = quantum && quantum > 0 ? quantum : 2;
      const queue = [];
      const admitted = new Set();
      const admit = (upTo) => {
        P.filter(p => p.at <= upTo && !admitted.has(p.idx))
          .sort((a, b) => a.at - b.at || a.idx - b.idx)
          .forEach(p => { admitted.add(p.idx); queue.push(p); });
      };
      admit(0);
      while (done < n) {
        if (!queue.length) {
          const next = Math.min(...P.filter(p => !admitted.has(p.idx)).map(p => p.at));
          idle(t, next); t = next; admit(t); continue;
        }
        const p = queue.shift();
        if (p.rt === null) p.rt = t - p.at;
        const run = Math.min(q, p.rem);
        push(p.pid, t, t + run);
        t += run; p.rem -= run;
        admit(t);                       // new arrivals enter before the preempted process
        if (p.rem > 0) queue.push(p); else { p.ct = t; done++; }
      }
    } else {
      const preemptive = algo === 'srtf';
      const key = {
        fcfs:     p => [p.at, p.idx],
        sjf:      p => [p.bt, p.at, p.idx],
        srtf:     p => [p.rem, p.at, p.idx],
        priority: p => [p.pr, p.at, p.idx]
      }[algo];
      if (!key) throw new Error('Unknown algorithm: ' + algo);
      const cmp = (a, b) => {
        const ka = key(a), kb = key(b);
        for (let i = 0; i < ka.length; i++) if (ka[i] !== kb[i]) return ka[i] - kb[i];
        return 0;
      };
      while (done < n) {
        const ready = P.filter(p => p.at <= t && p.rem > 0);
        if (!ready.length) {
          const next = Math.min(...P.filter(p => p.rem > 0).map(p => p.at));
          idle(t, next); t = next; continue;
        }
        const pick = ready.sort(cmp)[0];
        if (pick.rt === null) pick.rt = t - pick.at;
        const run = preemptive ? 1 : pick.rem;
        push(pick.pid, t, t + run);
        t += run; pick.rem -= run;
        if (pick.rem === 0) { pick.ct = t; done++; }
      }
    }

    const results = P.map(p => {
      const tat = p.ct - p.at;
      return { pid: p.pid, name: p.name, at: p.at, bt: p.bt, pr: p.pr, ct: p.ct, tat, wt: tat - p.bt, rt: p.rt };
    });
    const avg = k => results.reduce((s, r) => s + r[k], 0) / n;
    return { algo, gantt, results, avgWT: avg('wt'), avgTAT: avg('tat'), avgRT: avg('rt') };
  }

  return { schedule };
});

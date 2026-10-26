/* Memory management: fixed-partition allocation with First Fit, Best Fit and Worst Fit.
   Reports internal fragmentation, free (unassigned) partitions and external fragmentation. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Memory = factory();
})(typeof self !== 'undefined' ? self : this, function () {

  function allocate(partitionSizes, procs, strategy) {
    const parts = partitionSizes.map((size, i) => ({ idx: i, size, pid: null, used: 0 }));
    const unallocated = [];

    for (const p of procs) {
      const cand = parts.filter(x => x.pid === null && x.size >= p.size);
      let pick = null;
      if (cand.length) {
        if (strategy === 'first') pick = cand[0];
        else if (strategy === 'best') pick = cand.reduce((a, b) => (b.size < a.size ? b : a));
        else if (strategy === 'worst') pick = cand.reduce((a, b) => (b.size > a.size ? b : a));
        else throw new Error('Unknown strategy: ' + strategy);
      }
      if (pick) { pick.pid = p.pid; pick.used = p.size; }
      else unallocated.push({ pid: p.pid, size: p.size });
    }

    const total = parts.reduce((s, x) => s + x.size, 0);
    const used = parts.reduce((s, x) => s + x.used, 0);
    const internalFrag = parts.filter(x => x.pid).reduce((s, x) => s + (x.size - x.used), 0);
    const freeParts = parts.filter(x => x.pid === null);
    const freePartitionsTotal = freeParts.reduce((s, x) => s + x.size, 0);
    const largestFree = freeParts.length ? Math.max(...freeParts.map(x => x.size)) : 0;
    // External fragmentation: a waiting process is smaller than the total free partition space
    // but no single free partition can hold it.
    const external = unallocated.map(u => ({ ...u, externalFrag: u.size <= freePartitionsTotal }));

    return {
      strategy, partitions: parts, unallocated: external,
      stats: {
        total, used, internalFrag, freePartitionsTotal, largestFree,
        wasted: internalFrag + freePartitionsTotal,
        utilization: total ? used / total : 0,
        allocatedCount: parts.filter(x => x.pid).length
      }
    };
  }

  return { allocate };
});

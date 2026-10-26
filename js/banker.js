/* Banker's Algorithm: Need matrix, safety algorithm, and resource-request algorithm. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Banker = factory();
})(typeof self !== 'undefined' ? self : this, function () {

  const le = (a, b) => a.every((v, i) => v <= b[i]);
  const sub = (a, b) => a.map((v, i) => v - b[i]);
  const add = (a, b) => a.map((v, i) => v + b[i]);

  function computeNeed(max, alloc) {
    return max.map((row, i) => row.map((v, j) => v - alloc[i][j]));
  }

  // Safety algorithm: repeatedly pick the lowest-index unfinished process whose Need <= Work.
  function isSafe(avail, alloc, max) {
    const n = alloc.length;
    const need = computeNeed(max, alloc);
    let work = avail.slice();
    const finished = Array(n).fill(false);
    const sequence = [], steps = [];
    let progress = true;
    while (sequence.length < n && progress) {
      progress = false;
      for (let i = 0; i < n; i++) {
        if (!finished[i] && le(need[i], work)) {
          const before = work.slice();
          work = add(work, alloc[i]);
          finished[i] = true;
          sequence.push(i);
          steps.push({ proc: i, need: need[i].slice(), workBefore: before, workAfter: work.slice() });
          progress = true;
          break;
        }
      }
    }
    return {
      safe: sequence.length === n,
      sequence, steps, need,
      stuck: finished.map((f, i) => (f ? null : i)).filter(x => x !== null)
    };
  }

  // Resource-request algorithm for process pid requesting vector req.
  function request(state, pid, req) {
    const need = computeNeed(state.max, state.alloc);
    if (!le(req, need[pid])) {
      return { granted: false, code: 'EXCEEDS_NEED', reason: 'Request exceeds the maximum claim (Request > Need).' };
    }
    if (!le(req, state.avail)) {
      return { granted: false, code: 'WAIT', reason: 'Resources not currently available (Request > Available); process must wait.' };
    }
    const avail = sub(state.avail, req);
    const alloc = state.alloc.map((r, i) => (i === pid ? add(r, req) : r.slice()));
    const check = isSafe(avail, alloc, state.max);
    if (check.safe) {
      return { granted: true, code: 'GRANTED', reason: 'Pretend-allocation leaves the system in a SAFE state.', check, newState: { alloc, max: state.max, avail } };
    }
    return { granted: false, code: 'UNSAFE', reason: 'Granting would leave the system in an UNSAFE state; request is denied (process waits).', check };
  }

  return { computeNeed, isSafe, request, le };
});

/* Shared problem context: Banking and ATM Transaction Processing System.
   Every module (scheduler, producer-consumer, Banker's, memory) uses these same five
   transactions, so the four OS concepts are connected through one scenario. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.CTX = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  return {
    title: 'Banking & ATM Transaction Processing System',
    // pr: lower number = higher priority. size: memory footprint in KB.
    txns: [
      { pid: 'T1', name: 'ATM Withdrawal',     at: 0, bt: 5, pr: 2, size: 212 },
      { pid: 'T2', name: 'Fund Transfer',      at: 1, bt: 3, pr: 1, size: 417 },
      { pid: 'T3', name: 'Cash Deposit',       at: 2, bt: 8, pr: 3, size: 112 },
      { pid: 'T4', name: 'Statement / Record', at: 3, bt: 6, pr: 5, size: 426 },
      { pid: 'T5', name: 'Balance Inquiry',    at: 4, bt: 2, pr: 4, size: 90  }
    ],
    // Banker's algorithm: 3 resource types, 5 transactions (rows align with txns above)
    resources: ['DB Connections', 'Txn Service Threads', 'Ledger Locks'],
    banker: {
      alloc: [[0, 1, 0], [2, 0, 0], [3, 0, 2], [2, 1, 1], [0, 0, 2]],
      max:   [[7, 5, 3], [3, 2, 2], [9, 0, 2], [2, 2, 2], [4, 3, 3]],
      avail: [3, 3, 2]
    },
    // Fixed memory partitions of the transaction server (KB)
    partitions: [100, 500, 200, 300, 600],
    // Runtime resource requests used to demonstrate the Banker's request algorithm
    requests: [
      { pid: 1, req: [1, 0, 2] },
      { pid: 4, req: [3, 3, 0] },
      { pid: 0, req: [0, 2, 0] }
    ]
  };
});

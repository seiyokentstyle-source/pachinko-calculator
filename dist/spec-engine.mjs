// Each state is one draw/event. Rewards are counted on the edge, including
// terminating wins. null means return to normal play (an absorbing endpoint).
export function expectedCycle(states, start = 'initial') {
  const names = Object.keys(states);
  if (!names.includes(start) || !names.length) throw new Error('開始状態がありません');
  for (const [name, edges] of Object.entries(states)) {
    if (!edges.length || Math.abs(edges.reduce((sum, edge) => sum + edge.p, 0) - 1) > 1e-8) throw new Error(`${name}: 振り分けの合計が100%ではありません`);
    for (const e of edges) {
      if (!Number.isFinite(e.p) || e.p < 0 || e.p > 1 || !Number.isFinite(e.net) || e.net < 0 || !Number.isFinite(e.gross) || e.gross < e.net || (e.next !== null && !names.includes(e.next))) throw new Error(`${name}: 不正な遷移です`);
    }
  }
  // Ignore unreachable states, then ensure every reachable state has a path
  // to an absorbing endpoint before solving (I-Q)E = r.
  const reached = new Set();
  function visit(name) { if (reached.has(name)) return; reached.add(name); for (const e of states[name]) if (e.p > 0 && e.next !== null) visit(e.next); }
  visit(start);
  const active = names.filter(n => reached.has(n));
  const exits = new Set(active.filter(n => states[n].some(e => e.p > 0 && e.next === null)));
  for (let pass = 0; pass < active.length; pass++) for (const n of active) if (states[n].some(e => e.p > 0 && exits.has(e.next))) exits.add(n);
  if (active.some(n => !exits.has(n))) throw new Error('終了しないRUSHが含まれています');
  function solve(metric) {
    const a = active.map((name,i) => {
      const row = active.map((_,j) => Number(i === j)); let reward = 0;
      for (const e of states[name]) { if (e.p === 0) continue; reward += e.p * e[metric]; if (e.next !== null) row[active.indexOf(e.next)] -= e.p; }
      return [...row,reward];
    });
    for (let col = 0; col < active.length; col++) {
      let pivot = col;
      for (let r=col+1;r<active.length;r++) if (Math.abs(a[r][col]) > Math.abs(a[pivot][col])) pivot=r;
      if (Math.abs(a[pivot][col]) < 1e-12) throw new Error('期待値が収束しません');
      [a[pivot],a[col]]=[a[col],a[pivot]];
      const scale=a[col][col]; for(let j=col;j<=active.length;j++) a[col][j]/=scale;
      for(let r=0;r<active.length;r++) if(r!==col){const factor=a[r][col];for(let j=col;j<=active.length;j++)a[r][j]-=factor*a[col][j];}
    }
    const values=Object.fromEntries(active.map((n,i)=>[n,a[i][active.length]]));
    if(Object.values(values).some(v=>!Number.isFinite(v)||v<0))throw new Error('期待値が不正です');
    return values;
  }
  const net=solve('net'), gross=solve('gross');
  return {net:net[start],gross:gross[start],states:Object.fromEntries(active.map(n=>[n,{net:net[n],gross:gross[n]}]))};
}
export function stHitProbability(denominator, spins) {
  if (!(denominator >= 1) || !Number.isInteger(spins) || spins < 0) throw new Error('ST条件が不正です');
  if (spins === 0) return 0;
  return -Math.expm1(spins * Math.log1p(-1 / denominator));
}

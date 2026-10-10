import { test } from 'node:test';
import assert from 'node:assert/strict';
import { calculate, validate, defaults } from './dist/calc.mjs';
const close = (a,b) => assert.ok(Math.abs(a-b) < 1e-8, `${a} != ${b}`);
const base = { ...defaults, probability: 100, payout: 1000, rotation: 25, spins: 100, loan: 250, exchange: 25, speed: 100, bonusMinutes: 60 };
test('等価・ボーダー上では持ち玉比率に関係なく収支ゼロ', () => {
  for (const holding of [0, 50, 100]) { const r = calculate({...base, holding}); close(r.profit,0); close(r.border,25); close(r.hours,2); close(r.hits,1); }
});
test('非等価の現金・持ち玉・混合を独立した手計算と照合', () => {
  for (const [holding, profit, border] of [[0,-1500,40],[50,-750,32.5],[100,0,25]]) {
    const r = calculate({...base, exchange:40,holding}); close(r.profit,profit); close(r.border,border); close(r.hourly,profit/2);
  }
});
test('当たり時間を増やすと収支は同じで時給が低下', () => {
  const a = calculate({...base, rotation:50, bonusMinutes:0}); const b = calculate({...base, rotation:50}); close(a.profit,2000); close(b.profit,2000); close(a.hourly,2000); close(b.hourly,1000);
});
test('回転数を倍にすると収支・時間は倍、ボーダーと時給は不変', () => {
  const a=calculate(defaults), b=calculate({...defaults,spins:2000}); close(b.profit,a.profit*2); close(b.hours,a.hours*2); close(b.hourly,a.hourly); close(b.border,a.border);
});
test('出玉0では損失、有限ボーダーなし。速い回転率は期待値を改善', () => {
  const zero=calculate({...base,payout:0}); assert.equal(zero.border,null); assert.equal(zero.gap,null); assert.ok(zero.profit<0);
  assert.ok(calculate({...defaults,rotation:19}).profit>calculate(defaults).profit);
});
test('空欄・無限・範囲外を拒否し、前回の結果を返さない', () => {
  for (const [key,value] of [['rotation',''],['probability',0],['payout',-1],['spins',1.5],['holding',101],['loan',0],['exchange',Infinity],['speed',null],['bonusMinutes',-1]]) {
    const input={...defaults,[key]:value}; assert.ok(validate(input)[key]); assert.equal(calculate(input),null);
  }
  assert.deepEqual(validate(defaults),{});
});

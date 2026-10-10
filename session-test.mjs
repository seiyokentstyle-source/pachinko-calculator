import { test } from 'node:test';
import assert from 'node:assert/strict';
import { calculateSession, defaultSession } from './dist/session-calc.mjs';
import { sessionPrizes } from './dist/session-prizes.mjs';

const close = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-8, `${actual} != ${expected}`);
const base = (overrides = {}) => ({ ...defaultSession(), startSpins: '200', endSpins: '300', cash: '5000', startBalls: '0', endBalls: '0', gainMode: 'none', ...overrides });
const result = (values, prizes) => {
  const response = calculateSession(values, prizes);
  assert.deepEqual(response.errors, {});
  assert.ok(response.result);
  return response.result;
};
const invalid = (values, field, prizes) => {
  const response = calculateSession(values, prizes);
  assert.equal(response.result, null);
  assert.ok(response.errors[field], `Expected ${field}: ${JSON.stringify(response.errors)}`);
};
const prizes = [
  { id: 'r10', label: '1500発', gross: 1500, net: 1400 },
  { id: 'r2', label: '300発', gross: 300, net: 280 },
];

test('初期値は入力を要求し、別々の呼出しで回数オブジェクトを共有しない', () => {
  const first = defaultSession(), second = defaultSession();
  first.counts.r10 = '1';
  assert.deepEqual(second.counts, {});
  assert.equal(first.gainMode, '');
  assert.equal(calculateSession(second).result, null);
});

test('物理的な持ち玉収支：1250玉を借り100回転消化すると20回/千円', () => {
  assert.deepEqual(result(base()), { spins: 100, normalBalls: 1250, rotation: 20, gain: 0, delta: -1250, estimated: false });
});

test('実測純増と持ち玉：通常2500玉消費、当たり4200玉増加、終了3200玉', () => {
  // Start 1000 + loan 500 + gain 4200 - normal cost 2500 = end 3200.
  const r = result(base({ startSpins: '1000', endSpins: '1180', cash: '2000', startBalls: '1000', endBalls: '3200', gainMode: 'measured', gain: '4200' }));
  close(r.delta, 1700); close(r.gain, 4200); close(r.normalBalls, 2500); close(r.rotation, 18);
  assert.equal(r.estimated, false);
});

test('持ち玉方式と台差玉方式は同一期間の記録から同じ回転率になる', () => {
  const wallet = result(base({ startSpins: '1000', endSpins: '1180', cash: '2000', startBalls: '1000', endBalls: '3200', gainMode: 'measured', gain: '4200' }));
  const display = result(base({ method: 'display', startSpins: '1000', endSpins: '1180', startDelta: '-5000', endDelta: '-3300', gainMode: 'measured', gain: '4200', displayApprox: false }));
  assert.deepEqual(display, wallet);
});

test('差玉と累計回転数の開始値を平行移動しても結果は変わらない', () => {
  const a = result(base({ method: 'display', startDelta: '-5000', endDelta: '-6250', displayApprox: false }));
  const b = result(base({ method: 'display', startDelta: '12000', endDelta: '10750', startSpins: '50200', endSpins: '50300', displayApprox: false }));
  assert.deepEqual(a, b);
});

test('電サポ純減を符号付きで戻す：総差玉-1270、電サポ-20なら通常消費1250', () => {
  const r = result(base({ method: 'display', startDelta: '100', endDelta: '-1170', gainMode: 'measured', gain: '-20', displayApprox: false }));
  close(r.normalBalls, 1250); close(r.rotation, 20); close(r.delta, -1270);
});

test('台の差玉グラフは概算フラグが立ち、数値表示にすると解除される', () => {
  const values = base({ method: 'display', startDelta: '0', endDelta: '-1250' });
  assert.equal(result(values).estimated, true);
  assert.equal(result({ ...values, displayApprox: false }).estimated, false);
});

test('玉の受渡し・再プレーを入出金として扱い遊技差玉へ混ぜない', () => {
  // Start 5000 + loan 500 + replay 1000 + incoming 400 + bonus 2800
  // - normal 2500 - outgoing 700 = end 6500.
  const r = result(base({ startSpins: '0', endSpins: '200', startBalls: '5000', endBalls: '6500', cash: '2000', replay: '1000', transferIn: '400', transferOut: '700', gainMode: 'measured', gain: '2800' }));
  close(r.delta, 300); close(r.normalBalls, 2500); close(r.rotation, 20);
});

test('大勝ち・持ち玉再プレーでも通常時消費を復元する', () => {
  // Start 2000 + replay 3000 + bonus 120000 - normal 5000 = end 120000.
  const r = result(base({ startSpins: '0', endSpins: '400', cash: '0', replay: '3000', startBalls: '2000', endBalls: '120000', gainMode: 'measured', gain: '120000' }));
  close(r.normalBalls, 5000); close(r.rotation, 20); close(r.delta, 115000);
});

test('貸玉230玉でも回転率はその貸玉条件の千円当たりになる', () => {
  const r = result(base({ loan: '230' }));
  close(r.normalBalls, 1150); close(r.rotation, 20);
});

test('総回転カウンターから期間内の右打ち回転のみを差し引く', () => {
  const r = result(base({ spinMode: 'all', startSpins: '1000', endSpins: '1280', rightSpins: '180' }));
  close(r.spins, 100); close(r.rotation, 20);
  invalid(base({ spinMode: 'all', rightSpins: '' }), 'rightSpins');
  invalid(base({ spinMode: 'all', rightSpins: '101' }), 'rightSpins');
  invalid(base({ spinMode: 'all', rightSpins: '100' }), 'endSpins');
});

test('賞球単位回数は理論差玉だけを合算し補正後の電サポ純減を加える', () => {
  // 2*1400 + 1*280 = 3080; 90% correction = 2772; support -22 => 2750.
  // Display +1500 then means 1250 normal-play cost and 20 rotation.
  const r = result(base({ method: 'display', startDelta: '0', endDelta: '1500', gainMode: 'counts', counts: { r10: '2', r2: '1' }, payoutRate: '90', supportDelta: '-22', displayApprox: false }), prizes);
  close(r.gain, 2750); close(r.normalBalls, 1250); close(r.rotation, 20);
  assert.equal(r.estimated, true);
});

test('回数では初当たり平均連鎖出玉やgrossを使わず指定した単位netのみ使う', () => {
  const options = [{ id: 'r10', label: '10R', gross: 999999, net: 1400, averageInitialHitEV: 5000 }];
  const r = result(base({ gainMode: 'counts', counts: { r10: '1' }, endBalls: '1400' }), options);
  close(r.gain, 1400); close(r.normalBalls, 1250); close(r.rotation, 20);
  assert.equal(r.estimated, true);
});

test('回数欄の空欄だけは0でよく、0回しかない計算や不明な単位を拒否する', () => {
  result(base({ gainMode: 'counts', counts: { r10: '1', r2: '' }, endBalls: '1400' }), prizes);
  invalid(base({ gainMode: 'counts', counts: {} }), 'counts', prizes);
  invalid(base({ gainMode: 'counts', counts: { r10: '1' } }), 'counts', []);
  invalid(base({ gainMode: 'counts', counts: { unknown: '1' } }), 'counts', prizes);
  for (const count of [-1, 1.5, Infinity, null, true, 'abc']) invalid(base({ gainMode: 'counts', counts: { r10: count } }), 'counts', prizes);
});

test('使用中の空欄・非数・範囲外・小数回転数は前の結果を返さない', () => {
  for (const [key, value] of [['startSpins', ''], ['endSpins', ''], ['startBalls', ''], ['endBalls', ''], ['cash', ''], ['replay', ''], ['transferIn', ''], ['transferOut', ''], ['loan', ''], ['loan', 0], ['loan', 100001], ['cash', -1], ['cash', Infinity], ['startSpins', 2.5], ['endSpins', 1000001], ['endBalls', true], ['startBalls', null]]) invalid(base({ [key]: value }), key);
  invalid(base({ gainMode: 'measured', gain: '' }), 'gain');
  invalid(base({ method: 'display', startDelta: '', endDelta: '0' }), 'startDelta');
  invalid(base({ method: 'display', startDelta: '0', endDelta: '' }), 'endDelta');
  invalid(base({ gainMode: 'counts', counts: { r10: '1' }, payoutRate: '' }), 'payoutRate', prizes);
  invalid(base({ gainMode: 'counts', counts: { r10: '1' }, supportDelta: '' }), 'supportDelta', prizes);
  invalid(base({ gainMode: 'counts', counts: { r10: '1' }, payoutRate: 121 }), 'payoutRate', prizes);
});

test('非選択方式や非使用の当たり欄は入力を要求せず古い値も使わない', () => {
  result(base({ startDelta: NaN, endDelta: NaN, displayApprox: 'bad', gain: NaN, payoutRate: NaN, supportDelta: NaN, counts: null, rightSpins: NaN }));
  result(base({ method: 'display', startDelta: '0', endDelta: '-1250', cash: NaN, replay: NaN, startBalls: NaN, endBalls: NaN, transferIn: NaN, transferOut: NaN }));
  result(base({ gainMode: 'measured', gain: '0', counts: null, payoutRate: NaN, supportDelta: NaN }));
});

test('不明な方式・未選択の当たり処理・真偽値でない概算設定を拒否する', () => {
  for (const key of ['method', 'spinMode', 'gainMode']) invalid(base({ [key]: '' }), key);
  invalid(base({ method: 'display', startDelta: '0', endDelta: '-1250', displayApprox: 'false' }), 'displayApprox');
});

test('カウンター逆転・通常0回転・通常消費0以下・極端な回転率を拒否する', () => {
  invalid(base({ endSpins: '199' }), 'endSpins');
  invalid(base({ endSpins: '200' }), 'endSpins');
  invalid(base({ endBalls: '1250' }), 'normalBalls');
  invalid(base({ endBalls: '1500' }), 'normalBalls');
  invalid(base({ endBalls: '1249' }), 'rotation');
  invalid(base({ startSpins: '0', endSpins: '1', cash: '100000000' }), 'rotation');
});

test('組合せで計算範囲を超えた玉数や不正な出玉単位を拒否する', () => {
  invalid(base({ loan: '100000', cash: '1000000000' }), 'delta');
  invalid(base({ method: 'display', startDelta: '-1000000000', endDelta: '1000000000' }), 'delta');
  invalid(base({ gainMode: 'counts', counts: { r10: '1000000000' } }), 'counts', prizes);
  invalid(base({ gainMode: 'counts', counts: { r10: '1' } }), 'counts', [{ id: 'r10', net: NaN }]);
  invalid(base({ gainMode: 'counts', counts: { r10: '1' } }), 'counts', [prizes[0], prizes[0]]);
});

// Expected values are specified independently in balls, including Enako's
// 90% awards and Lycoris's 310-gross/280-net exception. No model EV is imported.
const machineAwardCases = [
  ['okiumi6-enako-rbd', [[400, 360], [600, 540], [1000, 900]]],
  ['lycoris-m3', [[310, 280], [600, 560], [750, 700], [1500, 1400], [3000, 2800], [6000, 5600]]],
  ['tokyo-ghoul-w', [[300, 280], [1500, 1400], [3000, 2800], [6000, 5600]]],
  ['sao-alicization-yozora', [[300, 280], [1500, 1400], [3000, 2800], [4500, 4200], [6000, 5600], [7500, 7000]]],
  ['garo12-xx-mj', [[300, 280], [1500, 1400], [7500, 7000]]],
  ['yuyuyu-mp', [[1500, 1400], [7500, 7000]]],
];

for (const [machineId, awards] of machineAwardCases) {
  test(`実機区分統合：${machineId}の全区分・出玉補正から回転率18を復元`, () => {
    const options = sessionPrizes[machineId];
    assert.deepEqual(options.map(({ id, gross, net }) => [id, gross, net]), awards.map(([gross, net]) => [String(gross), gross, net]));
    const counts = Object.fromEntries(awards.map(([gross]) => [String(gross), '1']));
    // Independent physical scenario: each listed award happens once; normal
    // play consumes exactly 2000 balls over 144 spins. Support loses 21 balls.
    const expectedGain = awards.reduce((sum, [, net]) => sum + net, 0) * 0.97 - 21;
    const startDelta = -4000;
    const endDelta = startDelta + expectedGain - 2000;
    const r = result(base({
      method: 'display', startSpins: '1200', endSpins: '1344',
      startDelta: String(startDelta), endDelta: String(endDelta),
      gainMode: 'counts', counts, payoutRate: '97', supportDelta: '-21',
      loan: '250', displayApprox: false,
    }), options);
    close(r.gain, expectedGain);
    close(r.delta, expectedGain - 2000);
    close(r.normalBalls, 2000);
    close(r.spins, 144);
    close(r.rotation, 18);
    assert.equal(r.estimated, true);
  });
}

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { calculateSession, defaultSession, parseHistory } from './dist/session-calc.mjs';

const close = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-8, `${actual} != ${expected}`);
const base = (overrides = {}) => ({
  ...defaultSession(), method: 'display', startSpins: '200', endSpins: '300',
  startDelta: '0', endDelta: '-1250', displayApprox: false, gainMode: 'none',
  ...overrides,
});
const valid = (overrides, prizes) => {
  const response = calculateSession(base(overrides), prizes);
  assert.deepEqual(response.errors, {});
  assert.ok(response.result);
  return response.result;
};
const invalid = (overrides, key, prizes) => {
  const response = calculateSession(base(overrides), prizes);
  assert.equal(response.result, null);
  assert.ok(response.errors[key], `Missing ${key}: ${JSON.stringify(response.errors)}`);
};
const history = (overrides = {}) => ({
  spinMode: 'history', historyStart: '120', historyCurrent: '30',
  historyText: '200\n50', historyConfirmed: true, ...overrides,
});
const options = [
  { id: '1500', label: '1500発', gross: 1500, net: 1400 },
  { id: '300', label: '300発', gross: 300, net: 280 },
];
const measured = (overrides = {}) => ({
  gainMode: 'counts', netMode: 'measured', counts: { 1500: '2', 300: '1' },
  unitNets: { 1500: '1350', 300: '260' }, supportDelta: '-10', endDelta: '1700',
  ...overrides,
});

test('数値欄は0、履歴は空・未確認、純増は従来の標準方式を維持する', () => {
  const first = defaultSession(), second = defaultSession();
  for (const key of ['normalSpins', 'historyStart', 'historyCurrent']) assert.equal(first[key], '0');
  assert.equal(first.historyText, '');
  assert.equal(first.historyConfirmed, false);
  assert.equal(first.netMode, 'standard');
  first.unitNets['1500'] = '1300';
  assert.deepEqual(second.unitNets, {});
});

test('履歴の数字を厳密に読み、改行・空白・半角全角カンマ・全角数字に対応', () => {
  assert.deepEqual(parseHistory(' ２００\n50， ３０,0\t12\r\n'), { values: [200, 50, 30, 0, 12], error: null });
  assert.deepEqual(parseHistory(''), { values: [], error: null });
  assert.deepEqual(parseHistory(' \r\n\t'), { values: [], error: null });
});

test('履歴の負数・小数・指数・符号・単位・不正トークンを補完しない', () => {
  for (const text of ['200 -1', '200 1.5', '1e2', '+30', '100回', '200/50', 'NaN', 'Infinity', '０．５', null, undefined, 200, true]) {
    const parsed = parseHistory(text);
    assert.ok(parsed.error, `Accepted ${String(text)}`);
    assert.deepEqual(parsed.values, []);
  }
});

test('履歴は各100万回・1万件まで、上限超過を拒否', () => {
  assert.deepEqual(parseHistory('1000000'), { values: [1_000_000], error: null });
  assert.ok(parseHistory('1000001').error);
  assert.ok(parseHistory('999999999999999999999999999').error);
  assert.equal(parseHistory(Array(10_000).fill('1').join(',')).values.length, 10_000);
  assert.ok(parseHistory(Array(10_001).fill('1').join(',')).error);
});

test('通常初当たり履歴：着席120→当たり200→当たり50→現在30は160回転', () => {
  const r = valid(history());
  assert.deepEqual(r, { spins: 160, normalBalls: 1250, rotation: 32, gain: 0, delta: -1250, estimated: false });
});

test('初当たり0件は空の履歴を確認したときだけ開始90→現在130の40回転', () => {
  const r = valid(history({ historyStart: '90', historyCurrent: '130', historyText: '' }));
  close(r.spins, 40); close(r.rotation, 8);
  invalid(history({ historyStart: '90', historyCurrent: '130', historyText: '', historyConfirmed: false }), 'historyConfirmed');
});

test('履歴確認は真偽値trueを要求し、抜けた当たりを勝手に補完しない', () => {
  for (const confirmation of [false, undefined, null, 'true', 1]) invalid(history({ historyConfirmed: confirmation }), 'historyConfirmed');
  invalid(history({ historyText: '200 missing 50' }), 'historyText');
});

test('履歴の最初の当たりは着席時カウンター以上、当たり0件なら現在値も以上', () => {
  invalid(history({ historyText: '119\n50' }), 'historyText');
  invalid(history({ historyText: '', historyCurrent: '119' }), 'historyCurrent');
  close(valid(history({ historyText: '120', historyCurrent: '30' })).spins, 30);
});

test('履歴カウンターの空欄・非整数・負数・範囲外を拒否', () => {
  for (const key of ['historyStart', 'historyCurrent']) {
    for (const value of ['', null, true, -1, 1.5, 1_000_001, Infinity]) invalid(history({ [key]: value }), key);
  }
});

test('履歴による通常回転の総和も1〜100万に制限する', () => {
  invalid(history({ historyStart: '0', historyCurrent: '0', historyText: '0' }), 'historyCurrent');
  invalid(history({ historyStart: '0', historyCurrent: '0', historyText: '1000000 1' }), 'historyCurrent');
  close(valid(history({ historyStart: '0', historyCurrent: '0', historyText: '1000000', endDelta: '-12500000' })).spins, 1_000_000);
});

test('直接入力は期間の通常回転のみを採用し、累計や右打ちや履歴の値を無視', () => {
  assert.deepEqual(valid({
    spinMode: 'direct', normalSpins: '100', startSpins: 'bad', endSpins: null,
    rightSpins: Infinity, historyStart: -1, historyCurrent: NaN,
    historyText: 'wrong', historyConfirmed: false,
  }), { spins: 100, normalBalls: 1250, rotation: 20, gain: 0, delta: -1250, estimated: false });
});

test('直接入力は空欄・0・負数・非整数・上限超過を拒否し端点を受け付ける', () => {
  for (const value of ['', null, true, 0, -1, 1.5, 1_000_001, Infinity]) invalid({ spinMode: 'direct', normalSpins: value }, 'normalSpins');
  close(valid({ spinMode: 'direct', normalSpins: '1' }).spins, 1);
  close(valid({ spinMode: 'direct', normalSpins: '1000000', endDelta: '-12500000' }).spins, 1_000_000);
});

test('履歴方式も非選択の累計・右打ち・直接入力を無視する', () => {
  close(valid(history({ startSpins: null, endSpins: 'bad', rightSpins: -1, normalSpins: Infinity })).spins, 160);
});

test('既存の通常累計方式は新規入力の不正値を無視して従来の結果を保つ', () => {
  assert.deepEqual(valid({
    normalSpins: NaN, historyStart: NaN, historyCurrent: NaN,
    historyText: null, historyConfirmed: 'bad', netMode: 'bad', unitNets: null,
  }), { spins: 100, normalBalls: 1250, rotation: 20, gain: 0, delta: -1250, estimated: false });
});

test('回数×実測純増＋電サポ差玉：2×1350＋260−10=2950玉で通常消費1250玉', () => {
  const r = valid(measured(), options);
  close(r.gain, 2950); close(r.normalBalls, 1250); close(r.rotation, 20);
  assert.equal(r.estimated, true);
});

test('実測区分方式は標準netもgrossも補正率も使わず入力純増だけを使う', () => {
  const r = valid(measured({ payoutRate: 'not a number' }), [
    { id: '1500', net: NaN, gross: 99999999 }, { id: '300', net: -999 },
  ]);
  close(r.gain, 2950); close(r.rotation, 20);
  close(valid(measured({ payoutRate: '1' }), options).gain, 2950);
});

test('利用区分の実測純増が空欄なら標準netへ戻さず結果を消す', () => {
  for (const unitNets of [{}, null, [], { 1500: '1350' }, { 1500: '', 300: '260' }]) invalid(measured({ unitNets }), 'unitNets', options);
  for (const net of [null, true, 'bad', Infinity, 1_000_000_001, -1_000_000_001]) invalid(measured({ unitNets: { 1500: net, 300: '260' } }), 'unitNets', options);
});

test('0回の区分には実測純増不要、正負と小数の実測純増を許容', () => {
  close(valid(measured({ counts: { 1500: '2', 300: '' }, unitNets: { 1500: '1350' }, supportDelta: '0', endDelta: '1450' }), options).gain, 2700);
  const r = valid(measured({ counts: { 1500: '1', 300: '2' }, unitNets: { 1500: '1350.5', 300: '-0.25' }, supportDelta: '-10', endDelta: '90' }), options);
  close(r.gain, 1340); close(r.normalBalls, 1250); close(r.rotation, 20);
});

test('実測区分方式も電サポ増減・回数・カタログ識別子を検証する', () => {
  invalid(measured({ supportDelta: '' }), 'supportDelta', options);
  invalid(measured({ counts: {} }), 'counts', options);
  invalid(measured({ counts: { missing: '1' }, unitNets: { missing: '123' } }), 'counts', options);
  invalid(measured(), 'counts', []);
  invalid(measured(), 'counts', [options[0], options[0]]);
  invalid(measured({ counts: { 1500: '2.5' } }), 'counts', options);
  invalid(measured({ netMode: 'unknown' }), 'netMode', options);
});

test('実測純増の合計が計算範囲外なら拒否する', () => {
  invalid(measured({ counts: { 1500: '2' }, unitNets: { 1500: '1000000000' }, supportDelta: '0' }), 'counts', options);
  invalid(measured({ counts: { 1500: '2' }, unitNets: { 1500: '-1000000000' }, supportDelta: '0' }), 'counts', options);
});

test('標準区分方式は実測純増欄を無視して既存の補正率検証を維持', () => {
  const values = { gainMode: 'counts', netMode: 'standard', counts: { 1500: '2', 300: '1' }, unitNets: { 1500: '0', 300: NaN }, payoutRate: '90', supportDelta: '-22', endDelta: '1500' };
  const r = valid(values, options);
  close(r.gain, 2750); close(r.normalBalls, 1250); close(r.rotation, 20);
  invalid({ ...values, payoutRate: '' }, 'payoutRate', options);
  invalid({ ...values, payoutRate: '121' }, 'payoutRate', options);
});

test('履歴・実測区分・台差玉を組み合わせて同一区間の通常回転率を復元', () => {
  // 160 normal spins consume 2000 balls; two 1350-ball awards and 260 balls,
  // then support loses 10 balls, so the machine delta is +950 balls.
  const r = valid({ ...history(), ...measured({ endDelta: '950' }) }, options);
  assert.deepEqual(r, { spins: 160, normalBalls: 2000, rotation: 20, gain: 2950, delta: 950, estimated: true });
});

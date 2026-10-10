import { test } from 'node:test';
import assert from 'node:assert/strict';
import { calculateSession } from './dist/session-calc.mjs';
import { calculateRecord, newRecord, recordKey, restoreRecord } from './dist/session-context.mjs';

const close = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-8, `${actual} != ${expected}`);
const observed = overrides => ({
  ...newRecord('before'), startSpins: '1200', endSpins: '1800',
  startDelta: '2000', endDelta: '-1000', gainMode: 'measured', gain: '4000',
  displayApprox: false, ...overrides,
});
const valid = (values, context = 'before', loan = '250', prizes = []) => {
  const calculated = calculateRecord(values, prizes, context, loan);
  assert.deepEqual(calculated.errors, {});
  assert.ok(calculated.result);
  return calculated.result;
};

test('着席前は通常600回・期間差玉−3000玉・当たり純増4000玉から消費7000玉を復元', () => {
  const result = valid(observed());
  assert.equal(result.spins, 600);
  assert.equal(result.delta, -3000);
  assert.equal(result.gain, 4000);
  assert.equal(result.normalBalls, 7000);
  close(result.rotation, 150000 / 7000);
  assert.equal(result.estimated, true);
});

test('着席前は財布方式を強制的に除外し、古い財布値のNaNを使用しない', () => {
  const input = observed({ method: 'wallet', cash: NaN, replay: NaN, startBalls: NaN, endBalls: NaN, transferIn: NaN, transferOut: NaN });
  const result = valid(input);
  close(result.rotation, 150000 / 7000);
  assert.equal(input.method, 'wallet');
  assert.ok(Number.isNaN(input.cash));
});

test('開始値の空欄を日次0として扱わず、必須入力を欠いた結果を停止する', () => {
  for (const key of ['startSpins', 'startDelta']) {
    const response = calculateRecord(observed({ [key]: '' }), [], 'before', '250');
    assert.equal(response.result, null);
    assert.ok(response.errors[key]);
  }
  const history = calculateRecord(observed({ spinMode: 'history', historyStart: '', historyCurrent: '100', historyText: '500', historyConfirmed: true }), [], 'before', '250');
  assert.equal(history.result, null);
  assert.ok(history.errors.historyStart);
});

test('新規記録は着席前後とも回転・差玉・履歴の開始値を未入力に保つ', () => {
  for (const context of ['before', 'after']) {
    const record = newRecord(context);
    for (const key of ['startSpins', 'endSpins', 'normalSpins', 'startDelta', 'endDelta', 'historyStart', 'historyCurrent', 'historyText']) assert.equal(record[key], '');
    assert.equal(record.historyConfirmed, false);
    assert.equal(calculateRecord(record, [], context, '250').result, null);
  }
  assert.equal(newRecord('before').method, 'display');
  assert.equal(newRecord('before').gainMode, 'counts');
  assert.equal(newRecord('before').netMode, 'standard');
  assert.equal(newRecord('after').method, 'wallet');
  assert.equal(newRecord('after').netMode, 'measured');
});

test('従来の着席後キーを保持し、機種別の着席前キーを分離する', () => {
  assert.equal(recordKey('lycoris-m3', 'after'), 'lycoris-m3');
  assert.equal(recordKey('lycoris-m3', 'before'), 'lycoris-m3::before');
  assert.equal(recordKey('', 'after'), 'unselected');
  assert.equal(recordKey('', 'before'), 'unselected::before');
  assert.notEqual(recordKey('lycoris-m3', 'before'), recordKey('sao-alicization-yozora', 'before'));
});

test('旧記録に純増方式がなければ標準値方式を継承し回数計算を変えない', () => {
  const legacy = { ...observed(), gainMode: 'counts', counts: { '1500': '3' }, payoutRate: '100', supportDelta: '-200' };
  delete legacy.netMode;
  const restored = restoreRecord(legacy, 'after');
  assert.equal(restored.netMode, 'standard');
  assert.deepEqual(restored.counts, { '1500': '3' });
  const result = valid(restored, 'after', '250', [{ id: '1500', net: 1400 }]);
  assert.equal(result.gain, 4000);
  close(result.rotation, 150000 / 7000);
});

test('新規着席後記録の明示された実測方式と入力値を再読込して保持する', () => {
  const saved = { ...newRecord('after'), cash: '2000', counts: { '1500': '2' }, unitNets: { '1500': '1350' } };
  const restored = restoreRecord(saved, 'after');
  assert.equal(restored.netMode, 'measured');
  assert.equal(restored.cash, '2000');
  assert.deepEqual(restored.counts, saved.counts);
  assert.deepEqual(restored.unitNets, saved.unitNets);
});

test('再読込した回数・純増辞書は保存元や別記録と共有しない', () => {
  const saved = { ...observed(), counts: { '1500': '2' }, unitNets: { '1500': '1350' } };
  const before = restoreRecord(saved, 'before'), after = restoreRecord(saved, 'after');
  before.counts['1500'] = '9'; before.unitNets['1500'] = '1';
  assert.equal(saved.counts['1500'], '2');
  assert.equal(saved.unitNets['1500'], '1350');
  assert.equal(after.counts['1500'], '2');
  assert.equal(after.unitNets['1500'], '1350');
  const first = newRecord('before'), second = newRecord('before');
  first.counts['1500'] = '1'; first.unitNets['1500'] = '1';
  assert.deepEqual(second.counts, {}); assert.deepEqual(second.unitNets, {});
});

test('復元では配列・未知欄・入れ子オブジェクトをフォーム値として受け入れない', () => {
  const restored = restoreRecord({ method: 'wallet', startSpins: {}, endSpins: '1800', counts: ['3'], unitNets: ['1400'], unknown: 'x' }, 'before');
  assert.equal(restored.method, 'display');
  assert.equal(restored.startSpins, '');
  assert.equal(restored.endSpins, '1800');
  assert.deepEqual(restored.counts, {}); assert.deepEqual(restored.unitNets, {});
  assert.equal(Object.hasOwn(restored, 'unknown'), false);
  assert.deepEqual(restoreRecord([], 'after'), newRecord('after'));
  assert.deepEqual(restoreRecord(null, 'after'), newRecord('after'));
  const nested = restoreRecord({ counts: { bad: {}, ok: '1' }, unitNets: { bad: [], ok: '1350' } }, 'before');
  assert.deepEqual(nested.counts, { ok: '1' }); assert.deepEqual(nested.unitNets, { ok: '1350' });
});

test('着席前のリセットは同じ機種の着席後記録も別機種も変更しない', () => {
  const beforeKey = recordKey('lycoris-m3', 'before'), afterKey = recordKey('lycoris-m3', 'after');
  const otherKey = recordKey('sao-alicization-yozora', 'before');
  const records = { [beforeKey]: observed(), [afterKey]: { ...newRecord('after'), cash: '5000' }, [otherKey]: observed({ endSpins: '2000' }) };
  const afterSnapshot = structuredClone(records[afterKey]), otherSnapshot = structuredClone(records[otherKey]);
  records[beforeKey] = newRecord('before');
  assert.equal(records[beforeKey].startDelta, '');
  assert.equal(records[beforeKey].startSpins, '');
  assert.deepEqual(records[afterKey], afterSnapshot);
  assert.deepEqual(records[otherKey], otherSnapshot);
});

test('着席前は数値差玉でも推定を維持し、着席後の実測フラグや計算結果は変えない', () => {
  const values = observed();
  const expected = calculateSession({ ...values, loan: '250' }, []).result;
  assert.equal(expected.estimated, false);
  assert.deepEqual(valid(values, 'after'), expected);
  assert.deepEqual(valid(values, 'before'), { ...expected, estimated: true });
  assert.equal(valid(observed({ displayApprox: true }), 'after').estimated, true);
});

test('貸玉は呼出し時の条件を使い、保存済みの古い貸玉値を使わない', () => {
  close(valid(observed({ loan: '250' }), 'before', '230').rotation, 600 * 230 / 7000);
  const invalid = calculateRecord(observed(), [], 'before', '');
  assert.equal(invalid.result, null); assert.ok(invalid.errors.loan);
});

test('不明な記録用途では既存記録を誤って扱わず明示的に停止する', () => {
  assert.throws(() => recordKey('lycoris-m3', 'bad'), RangeError);
  assert.throws(() => newRecord('bad'), RangeError);
  assert.throws(() => restoreRecord({}, 'bad'), RangeError);
  assert.throws(() => calculateRecord(observed(), [], 'bad', '250'), RangeError);
});

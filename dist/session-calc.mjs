/**
 * Calculate observed normal-play rotation for one consistently bounded session.
 *
 * Values are form strings unless noted. `loan` is balls lent per 1,000 yen.
 * Counters must cover the same interval; spinMode='all' subtracts the entered
 * interval's right-side spins. A reset/wrap in a cumulative counter is not inferred.
 * spinMode='direct' uses a manually totaled normal-spin count. 'history' restores
 * that count only from an explicitly confirmed complete normal-play hit history:
 * sum(hit counters) + current counter - the counter when the session started.
 *
 * Wallet delta excludes cash loans, replay withdrawals and transfers. startBalls
 * and endBalls count all balls still owned inside the chosen measurement boundary.
 * `cash` means yen actually exchanged for balls, not money inserted into a card.
 * Display delta is endDelta - startDelta for the machine's net-ball display.
 *
 * `gain` means net ball change ONLY during bonuses and electrical support, not
 * displayed gross payout. It can be negative. gainMode='none' explicitly asserts
 * no such periods. In counts mode, each count is a paid award unit with an explicit
 * per-unit net value; initial hits multiplied by mean chained EV are never used.
 * supportDelta includes any support-period change not already inside those units.
 * Counts and approximate graphs produce estimates, never a claim of exact play.
 *
 * normalBalls = bonus/support gain - machine delta
 * rotation = normal spins * loan / normalBalls
 *
 * Returns {errors, result}; invalid/incomplete active inputs always clear result.
 * prizeOptions: [{id, label, gross, net}]. Standard counts use the listed net;
 * measured counts use only the user's unitNets and no payout-rate correction.
 * Gross is descriptive. Counts with ids absent from this catalogue are rejected.
 */

const LIMIT = 1_000_000_000;
const SPIN_LIMIT = 1_000_000;

export function defaultSession() {
  return {
    method: 'wallet', spinMode: 'normal', startSpins: '0', endSpins: '0',
    normalSpins: '0', historyStart: '0', historyCurrent: '0', historyText: '',
    historyConfirmed: false,
    rightSpins: '0', loan: '250', gainMode: '', gain: '0', counts: {},
    netMode: 'standard', unitNets: {},
    payoutRate: '100', supportDelta: '0', cash: '0', replay: '0',
    startBalls: '0', endBalls: '0', transferIn: '0', transferOut: '0',
    startDelta: '0', endDelta: '0', displayApprox: true,
  };
}

/** Parse only explicit whole-number hit counters, never guess missing entries. */
export function parseHistory(text) {
  if (typeof text !== 'string') return { values: [], error: '通常時の初当たり履歴を入力してください。' };
  const normalized = text.replace(/[０-９]/g, digit => String(digit.charCodeAt(0) - 0xff10)).trim();
  if (!normalized) return { values: [], error: null };
  const tokens = normalized.split(/[\s,，]+/).filter(Boolean);
  if (tokens.length > 10_000) return { values: [], error: '初当たり履歴は10,000件以内で入力してください。' };
  const values = [];
  for (const token of tokens) {
    if (!/^\d+$/.test(token)) return { values: [], error: '初当たり履歴は0以上の整数を、改行・空白・カンマで区切って入力してください。' };
    const value = Number(token);
    if (!Number.isSafeInteger(value) || value > SPIN_LIMIT) return { values: [], error: '初当たり履歴の各回転数は0〜1,000,000回で入力してください。' };
    values.push(value);
  }
  return { values, error: null };
}

export function calculateSession(values, prizeOptions = []) {
  const errors = {};
  const v = values && typeof values === 'object' ? values : {};
  const number = (key, name, { min = 0, max = LIMIT, integer = false } = {}) => {
    const raw = v[key];
    const validType = typeof raw === 'string' || typeof raw === 'number';
    const n = validType && String(raw).trim() !== '' ? Number(raw) : NaN;
    if (!Number.isFinite(n)) errors[key] = `${name}を入力してください。`;
    else if (n < min || n > max) errors[key] = `${name}は${min.toLocaleString('ja-JP')}〜${max.toLocaleString('ja-JP')}の範囲で入力してください。`;
    else if (integer && !Number.isInteger(n)) errors[key] = `${name}は整数で入力してください。`;
    return n;
  };
  const finish = (result = null) => ({ errors, result: Object.keys(errors).length ? null : result });

  if (!['wallet', 'display'].includes(v.method)) errors.method = '持ち玉の記録か台の差玉表示かを選んでください。';
  if (!['normal', 'all', 'direct', 'history'].includes(v.spinMode)) errors.spinMode = '通常回転数の入力方法を選んでください。';
  if (!['none', 'measured', 'counts'].includes(v.gainMode)) errors.gainMode = '当たり・電サポ中の増減の入力方法を選んでください。';

  const loan = number('loan', '1,000円の貸玉数', { min: 1, max: 100_000 });
  let spins = NaN;
  if (v.spinMode === 'direct') {
    spins = number('normalSpins', '記録期間の通常回転数', { min: 1, max: SPIN_LIMIT, integer: true });
  } else if (v.spinMode === 'history') {
    const start = number('historyStart', '着席時の通常回転カウンター', { max: SPIN_LIMIT, integer: true });
    const current = number('historyCurrent', '現在の通常回転カウンター', { max: SPIN_LIMIT, integer: true });
    const history = parseHistory(v.historyText);
    if (history.error) errors.historyText = history.error;
    if (v.historyConfirmed !== true) errors.historyConfirmed = '右打ちを除いた通常時の初当たり全履歴で、各値が通常開始からの回転数であることを確認してください。';
    if (!errors.historyStart && !errors.historyCurrent && !history.error) {
      if (history.values.length && history.values[0] < start) errors.historyText = '最初の初当たり回転数は着席時のカウンター以上にしてください。記録範囲を確認してください。';
      else if (!history.values.length && current < start) errors.historyCurrent = '初当たりがない期間は、現在のカウンターを着席時以上にしてください。';
      spins = history.values.reduce((sum, value) => sum + value, 0) + current - start;
      if (!errors.historyText && !errors.historyCurrent && (spins < 1 || spins > SPIN_LIMIT)) errors.historyCurrent = '履歴から求めた通常回転数が1〜1,000,000回になるように入力してください。';
    }
  } else if (v.spinMode === 'normal' || v.spinMode === 'all') {
    const start = number('startSpins', '開始時の累計回転数', { max: SPIN_LIMIT, integer: true });
    const end = number('endSpins', '終了時の累計回転数', { max: SPIN_LIMIT, integer: true });
    spins = end - start;
    if (!errors.startSpins && !errors.endSpins && end < start) errors.endSpins = '終了時の回転数は開始時以上にしてください。カウンターのリセットは自動補正できません。';
    if (v.spinMode === 'all') {
      const right = number('rightSpins', '記録期間内の右打ち回転数', { max: SPIN_LIMIT, integer: true });
      if (!errors.startSpins && !errors.endSpins && !errors.rightSpins && right > spins) errors.rightSpins = '右打ち回転数が記録期間の総回転数を超えています。';
      spins -= right;
    }
    if (!errors.startSpins && !errors.endSpins && !errors.rightSpins && !(spins > 0)) errors.endSpins = '記録期間の通常回転数が1回以上になるように入力してください。';
  }

  let gain = 0;
  if (v.gainMode === 'measured') gain = number('gain', '当たり・電サポ中の実測差玉', { min: -LIMIT });
  if (v.gainMode === 'counts') {
    if (!['standard', 'measured'].includes(v.netMode)) errors.netMode = '1回当たりの純増を標準値から求めるか、実測入力するかを選んでください。';
    const measured = v.netMode === 'measured';
    const payoutRate = measured ? 100 : number('payoutRate', '出玉補正率', { min: 1, max: 120 });
    const supportDelta = number('supportDelta', '電サポ中の差玉', { min: -LIMIT });
    const validOptions = Array.isArray(prizeOptions) && prizeOptions.length > 0;
    const options = validOptions ? prizeOptions : [];
    if (!validOptions) errors.counts = 'この機種には回数計算用の出玉単位がありません。実測差玉を入力してください。';
    const ids = new Set();
    let countSum = 0;
    let awardSum = 0;
    const counts = v.counts;
    if (!counts || typeof counts !== 'object' || Array.isArray(counts)) errors.counts = '出玉単位ごとの回数を入力してください。';
    for (const option of options) {
      if (!option || typeof option.id !== 'string' || !option.id || ids.has(option.id) || (!measured && (typeof option.net !== 'number' || !Number.isFinite(option.net) || option.net < 0 || option.net > LIMIT))) {
        errors.counts = '出玉単位の設定が不正です。実測差玉を入力してください。';
        continue;
      }
      ids.add(option.id);
      const raw = counts?.[option.id];
      // Blank counts alone are intentionally zero; other form blanks are errors.
      const count = raw === undefined || (typeof raw === 'string' && raw.trim() === '') ? 0 : (typeof raw === 'string' || typeof raw === 'number') ? Number(raw) : NaN;
      if (!Number.isFinite(count) || !Number.isInteger(count) || count < 0 || count > LIMIT) {
        errors.counts = '当たりの回数は0以上の整数で入力してください。';
        continue;
      }
      countSum += count;
      if (measured && count > 0) {
        const rawNet = v.unitNets && typeof v.unitNets === 'object' && !Array.isArray(v.unitNets) ? v.unitNets[option.id] : undefined;
        const net = (typeof rawNet === 'string' || typeof rawNet === 'number') && String(rawNet).trim() !== '' ? Number(rawNet) : NaN;
        if (!Number.isFinite(net) || net < -LIMIT || net > LIMIT) errors.unitNets = '回数を入力した出玉単位は、1回当たりの実測純増を−1,000,000,000〜1,000,000,000玉で入力してください。';
        else awardSum += count * net;
      } else if (!measured) awardSum += count * option.net;
    }
    if (counts && typeof counts === 'object' && !Array.isArray(counts)) {
      for (const [id, raw] of Object.entries(counts)) {
        if (!ids.has(id) && !(raw === '' || raw === 0 || raw === '0')) errors.counts = '選択中の機種にない出玉単位の回数が含まれています。回数を確認してください。';
      }
    }
    if (!errors.counts && countSum < 1) errors.counts = '出玉単位の回数を1回以上入力してください。当たりがなければ「当たり・電サポなし」を選んでください。';
    if (countSum > LIMIT) errors.counts = '当たり回数の合計が大きすぎます。';
    gain = awardSum * payoutRate / 100 + supportDelta;
    if (!errors.counts && !errors.unitNets && !errors.payoutRate && !errors.supportDelta && (!Number.isFinite(gain) || Math.abs(gain) > LIMIT)) errors.counts = '当たり・電サポ中の差玉の計算結果が大きすぎます。入力を確認してください。';
  }

  let delta = NaN;
  if (v.method === 'wallet') {
    const cash = number('cash', '実際に貸玉へ使った金額');
    const replay = number('replay', '再プレーで引き出した玉数');
    const startBalls = number('startBalls', '開始時の持ち玉');
    const endBalls = number('endBalls', '終了時の持ち玉');
    const transferIn = number('transferIn', '外から受け取った玉数');
    const transferOut = number('transferOut', '外へ渡した玉数');
    const added = cash * loan / 1000 + replay + transferIn;
    delta = endBalls + transferOut - startBalls - added;
  } else if (v.method === 'display') {
    const startDelta = number('startDelta', '開始時の台の差玉', { min: -LIMIT });
    const endDelta = number('endDelta', '終了時の台の差玉', { min: -LIMIT });
    delta = endDelta - startDelta;
    if (typeof v.displayApprox !== 'boolean') errors.displayApprox = '差玉が数値表示かグラフの概算かを選んでください。';
  }
  if (Object.keys(errors).length) return finish();
  if (!Number.isFinite(delta) || Math.abs(delta) > LIMIT) errors.delta = '記録期間の差玉の計算結果が大きすぎます。入力を確認してください。';
  const normalBalls = gain - delta;
  if (!(normalBalls > 0)) errors.normalBalls = '通常時の消費玉が0以下です。差玉の符号・当たり中の純増・貸玉・記録範囲を確認してください。';
  else if (!Number.isFinite(normalBalls) || normalBalls > LIMIT) errors.normalBalls = '通常時の消費玉の計算結果が大きすぎます。入力を確認してください。';
  if (Object.keys(errors).length) return finish();
  const rotation = spins * loan / normalBalls;
  if (!Number.isFinite(rotation) || rotation < 0.01 || rotation > 1000) errors.rotation = '回転率が計算範囲（0.01〜1,000回／1,000円）外です。回転数・差玉・記録範囲を確認してください。';
  return finish({ spins, normalBalls, rotation, gain, delta, estimated: v.gainMode === 'counts' || (v.method === 'display' && v.displayApprox) });
}

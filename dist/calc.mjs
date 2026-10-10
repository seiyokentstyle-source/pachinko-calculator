export const defaults = Object.freeze({ rotation: 18, probability: 319.7, payout: 5000, spins: 1000, holding: 50, loan: 250, exchange: 28, speed: 200, bonusMinutes: 10 });
export const rules = {
  rotation: [0.01, 1000, '回転率'], probability: [1, 1000000, '初当たり確率の分母'],
  payout: [0, 10000000, '平均差玉'], spins: [1, 1000000, '通常時の回転数'],
  holding: [0, 100, '持ち玉使用割合'], loan: [1, 100000, '貸玉数'],
  exchange: [1, 100000, '交換玉数'], speed: [1, 10000, '通常時の消化速度'],
  bonusMinutes: [0, 10000, '当たりの平均消化時間'],
};
export function validate(values) {
  const errors = {};
  for (const [key, [min, max, name]] of Object.entries(rules)) {
    const raw = values[key];
    if ((key === 'speed' || key === 'bonusMinutes') && raw === '') continue;
    const n = Number(raw);
    if (raw === null || raw === undefined || String(raw).trim() === '' || !Number.isFinite(n)) errors[key] = `${name}を入力してください。`;
    else if (n < min || n > max) errors[key] = `${min.toLocaleString('ja-JP')}〜${max.toLocaleString('ja-JP')}の範囲で入力してください。`;
    else if (key === 'spins' && !Number.isInteger(n)) errors[key] = '回転数は整数で入力してください。';
  }
  return errors;
}
export function calculate(values) {
  if (Object.keys(validate(values)).length) return null;
  const v = Object.fromEntries(Object.keys(rules).map(key => [key, Number(values[key])]));
  const exchangeValue = 100 / v.exchange;
  const ballCost = (1 - v.holding / 100) * 1000 / v.loan + v.holding / 100 * exchangeValue;
  const revenuePerSpin = v.payout / v.probability * exchangeValue;
  const costPerSpin = v.loan / v.rotation * ballCost;
  const profitPerSpin = revenuePerSpin - costPerSpin;
  const hits = v.spins / v.probability;
  const hours = values.speed === '' || values.bonusMinutes === '' ? null : v.spins / v.speed + hits * v.bonusMinutes / 60;
  const profit = profitPerSpin * v.spins;
  const border = revenuePerSpin > 0 ? v.loan * ballCost / revenuePerSpin : null;
  return { profit, profitPerSpin, perThousand: profitPerSpin * 1000, revenue: revenuePerSpin * v.spins, cost: costPerSpin * v.spins, hits, hours, hourly: hours === null ? null : profit / hours, border, gap: border === null ? null : v.rotation - border, exchangeValue };
}

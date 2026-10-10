import { calculateSession, defaultSession } from './session-calc.mjs';

function assertContext(context) {
  if (context !== 'before' && context !== 'after') throw new RangeError('Unknown session context');
}

const isRecord = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const isFieldValue = value => ['string', 'number', 'boolean'].includes(typeof value);
const cloneFields = value => isRecord(value)
  ? Object.fromEntries(Object.entries(value).filter(([, item]) => isFieldValue(item)))
  : {};

/** Keep existing after-seat storage keys so saved sessions survive the upgrade. */
export function recordKey(machineId, context) {
  assertContext(context);
  const id = machineId || 'unselected';
  return context === 'before' ? `${id}::before` : id;
}

export function newRecord(context) {
  assertContext(context);
  return context === 'before'
    ? { ...defaultSession(), method: 'display', gainMode: 'counts', netMode: 'standard' }
    : { ...defaultSession(), netMode: 'measured' };
}

/** Restore known form fields only, without sharing mutable award dictionaries. */
export function restoreRecord(saved, context) {
  const values = newRecord(context);
  if (isRecord(saved)) {
    for (const key of Object.keys(values)) {
      if (key === 'counts' || key === 'unitNets') continue;
      if (Object.hasOwn(saved, key) && isFieldValue(saved[key])) values[key] = saved[key];
    }
    values.counts = cloneFields(saved.counts);
    values.unitNets = cloneFields(saved.unitNets);
    // Old stored sessions predate the explicit net selector and used standards.
    if (!Object.hasOwn(saved, 'netMode')) values.netMode = 'standard';
  }
  if (context === 'before') values.method = 'display';
  return values;
}

/** Pre-seat observations remain estimates, even with an exact-looking display. */
export function calculateRecord(values, prizes, context, loan) {
  assertContext(context);
  const calculated = calculateSession({
    ...values,
    loan,
    method: context === 'before' ? 'display' : values?.method,
  }, prizes);
  if (context !== 'before' || !calculated.result) return calculated;
  return { ...calculated, result: { ...calculated.result, estimated: true } };
}

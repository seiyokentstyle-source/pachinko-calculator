import { expectedCycle } from './spec-engine.mjs';

// Public approximate percentages are compared at their displayed precision.
// Passing these checks validates the listed indicators, not unpublished internals.
export function compileMachine(model) {
  const checks=(model.checks??[]).map(check=>{
    const actual=typeof check.actual==='function'?check.actual(model.states):check.actual;
    const passed=Number.isFinite(actual)&&(check.tolerance===0
      ?Math.abs(actual-check.target)<=1e-12
      :actual>=check.target-check.tolerance-1e-12&&actual<check.target+check.tolerance-1e-12);
    return {...check,actual,passed};
  });
  const failed=checks.filter(check=>!check.passed);
  const blockedReason=model.blockedReason || (failed.length?`公表値との不一致：${failed.map(check=>check.label).join('、')}`:null);
  if(blockedReason || !model.states) return Object.freeze({...model,checks,blockedReason:blockedReason??'必要な状態遷移が未確認です。',net:null,gross:null,stateMeans:null});
  const result=expectedCycle(model.states);
  return Object.freeze({...model,checks,blockedReason:null,net:result.net,gross:result.gross,stateMeans:result.states});
}

export function machineEstimate(machine, correction=100) {
  if(!machine || machine.blockedReason || !Number.isFinite(machine.net) || !Number.isFinite(correction) || correction<1 || correction>120) return null;
  return {probability:machine.probability,payout:machine.net*correction/100};
}

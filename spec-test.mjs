import {test} from 'node:test';
import assert from 'node:assert/strict';
import {expectedCycle,stHitProbability} from './dist/spec-engine.mjs';
import {machines} from './dist/machines.mjs';
import {compileMachine,machineEstimate} from './dist/machine-model.mjs';
import {calculate,defaults} from './dist/calc.mjs';
const close=(a,b,tolerance=1e-7)=>assert.ok(Math.abs(a-b)<tolerance,`${a} != ${b}`);
const get=id=>machines.find(m=>m.id===id);
test('吸収過程：終了当たりの出玉・自己ループを落とさない',()=>{
  close(expectedCycle({initial:[{p:.8,gross:150,net:140,next:'initial'},{p:.2,gross:150,net:140,next:null}]}).net,700);
  close(expectedCycle({initial:[{p:.8,gross:150,net:140,next:'initial'},{p:.2,gross:0,net:0,next:null}]}).net,560);
});
test('確率和不正・終了しないモデルを拒否',()=>{
  assert.throws(()=>expectedCycle({initial:[{p:.9,gross:150,net:140,next:null}]}));
  assert.throws(()=>expectedCycle({initial:[{p:1,gross:150,net:140,next:'initial'}]}));
  close(stHitProbability(1,0),0);close(stHitProbability(1,1),1);
});
test('牙狼：20%チャージ・二段階突入・LT終了1400玉を独立式と照合',()=>{
  const lt=(.25*7000+.75*1400)/.24;
  const expected=.2*280+.8*(1400+.5*(.5*1400+.5*(7000+lt)));
  close(get('garo12-xx-mj').net,expected);close(expected,5189.333333333334);
});
test('喰種：チャージ突入を含む合算振分と3%反復を照合',()=>{
  const q=1-(1-1/95.3)**130;
  const right=(2800/.97)*q/(1-q);
  const expected=.245*1400+.25*(1400+right)+.005*(280+right)+.5*280;
  close(get('tokyo-ghoul-w').net,expected);
});
test('ゆゆゆ：出玉0のリセットと上位STを独立式と照合',()=>{
  const low=1-(1-1/96.3)**115,high=1-(1-1/96.3)**135;
  const expected=1400+.515*(.75*low/(1-.25*low))*2800/(1-high);
  close(get('yuyuyu-mp').net,expected);
});
test('リコリス・SAOは条件付き下限と注意書きを持ち、確定した内部期待値として扱わない',()=>{
  for(const [id,expected] of [['lycoris-m3',3854.916808262616],['sao-alicization-yozora',2378.0929935880395]]){
    const m=get(id);
    assert.equal(m.estimateKind,'lower-bound');assert.equal(m.blockedReason,null);
    assert.ok(m.caution?.length>0);assert.match(m.modelBasis,/下限/);
    close(m.net,expected);close(machineEstimate(m).payout,expected);
    close(machineEstimate(m,97).payout,expected*.97);
  }
  assert.match(get('lycoris-m3').caution,/未確認/);
  assert.match(get('lycoris-m3').caution,/実機.*意味ではありません/);
  assert.match(get('sao-alicization-yozora').caution,/実機が0個という意味ではなく/);
});
test('リコリス：初当たりの周辺平均とA/B連立式から下限を独立照合',()=>{
  const q=1-(1-1/97.1)**132;
  const difference=q*(5600-700)/(1+q*.5);
  const a=q*(700+.5*difference)/(1-q),b=a+difference;
  const initial=.001*1400+.449*560+.05*280+.30*560+.20*280;
  const expected=initial+.5*(.7*a+.3*b);
  const m=get('lycoris-m3');
  close(initial,490.84);close(m.net,expected);
  close(m.stateMeans.A.net,a);close(m.stateMeans.B.net,b);
  close(m.stateMeans.addition.net,2800+a);
  close(250*m.probability/m.net,16.84212741046347);
});
test('リコリス：未公表B残留率0は最小端点であり、0〜100%で期待収支が単調増加',()=>{
  const m=get('lycoris-m3'),q=1-(1-1/97.1)**132;
  let previous=-Infinity;
  for(const retention of [0,.05,.2,.5,1]){
    const states=structuredClone(m.states);
    // Retention is a sensitivity parameter, not a claim about the real machine.
    states.B=states.B.map(e=>({...e,next:e.next==='A'?'afterBonus':e.next}));
    states.addition=states.addition.map(e=>({...e,next:e.next==='A'?'afterBonus':e.next}));
    states.afterBonus=[{p:1-retention,gross:0,net:0,next:'A'},{p:retention,gross:0,net:0,next:'B'}];
    const payout=expectedCycle(states).net;
    const difference=q*4900/(1-q*(retention-.5));
    const a=q*(700+.5*difference)/(1-q);
    close(payout,490.84+.5*a+.15*difference);
    assert.ok(payout>=m.net-1e-7);assert.ok(payout>previous);
    const v={...defaults,probability:m.probability,payout};
    assert.ok(calculate(v).profit>=calculate({...v,payout:m.net}).profit-1e-7);
    if(retention===0)close(payout,m.net);
    previous=payout;
  }
});
test('SAO：初回・下位特別当たりは3000個、上位DRIVEは既知区分だけを独立式で照合',()=>{
  const low=1-(1-1/51.6)**53,high=1-(1-1/51.6)**70;
  const drive=.082*1400+.281*2800+.361*4200+.207*5600+.044*7000;
  const upper=high*(.6*1400+.4*drive)/(1-high);
  const lower=low*(.89*1400+.11*2800+.22*upper)/(1-.78*low);
  const expected=.5*280+.485*(280+lower)+.015*(2800+upper);
  const m=get('sao-alicization-yozora');
  close(drive,3885);close(m.net,expected);close(expected,2378.0929935880395);
  close(m.stateMeans.upper.net,upper);close(m.stateMeans.lower.net,lower);
  close(m.stateMeans.drive.net,drive+upper);
  close(250*m.probability/m.net,21.014737495440954);
});
test('SAO：未確認2.5%は確率を残して0出玉とし、既知97.5%を再配分しない',()=>{
  const {drive}=get('sao-alicization-yozora').states;
  const known=drive.filter(e=>e.gross>0),unknown=drive.filter(e=>e.gross===0);
  assert.deepEqual(known.map(e=>[e.p,e.gross]),[[.082,1500],[.281,3000],[.361,4500],[.207,6000],[.044,7500]]);
  assert.deepEqual(unknown.map(e=>[e.p,e.net,e.next]),[[.015,0,'upper'],[.01,0,'upper']]);
  close(known.reduce((sum,e)=>sum+e.p,0),.975);
  close(unknown.reduce((sum,e)=>sum+e.p,0),.025);
  close(drive.reduce((sum,e)=>sum+e.p,0),1);
});
for(const [label,state,predicate] of [
  ['初回特別当たり','initial',e=>e.gross===3000],
  ['下位特別当たり','lower',e=>e.gross===3000],
  ['上位DRIVEの未確認2.5%','drive',e=>e.gross===0],
])test(`SAO：${label}に非負出玉を戻しても下限の期待収支を下回らない`,()=>{
  const m=get('sao-alicization-yozora');
  const v={...defaults,probability:m.probability,payout:m.net};
  const floor=calculate(v).profit;
  let previous=-Infinity;
  for(const extraGross of [0,1500,7500,15000]){
    const states=structuredClone(m.states);
    assert.ok(states[state].some(predicate));
    states[state]=states[state].map(e=>predicate(e)?{...e,gross:e.gross+extraGross,net:e.net+extraGross*14/15}:e);
    const payout=expectedCycle(states).net,profit=calculate({...v,payout}).profit;
    assert.ok(payout>=m.net-1e-7);assert.ok(profit>=floor-1e-7);assert.ok(profit>previous);
    if(extraGross===0)close(payout,m.net);
    previous=profit;
  }
});
test('沖海えなこ：STと時短の閉形式、残保留の連立式で平均差玉を独立照合',()=>{
  const hit=support=>1-(1-1/9.9)**5*(1-1/99.9)**(support-5);
  const a=hit(25),b=hit(50),c=hit(120),r=1-(1-1/99.9)**4;
  const reward=.1*900+.54*540+.36*360;
  // First solve without residual draws. Adding the shared residual state adds
  // the same future value to A/B/C; solve its return loop independently.
  const c0=c*reward/(1-c);
  const b0=b*(reward+.1*c0)/(1-.9*b);
  const a0=a*(reward+.6*b0+.1*c0)/(1-.3*a);
  const residual=r*(reward+.3*a0+.6*b0+.1*c0)/(1-r);
  const expected=.01*900+.5*540+.49*360+.45*a0+.54*b0+.01*c0+residual;
  const m=get('okiumi6-enako-rbd');
  close(m.net,expected);close(expected,1496.950325641696);
  close(m.gross,1663.2781396018845);
  close(m.stateMeans.A.net,a0+residual);close(m.stateMeans.B.net,b0+residual);
  close(m.stateMeans.C.net,c0+residual);close(m.stateMeans.R.net,residual);
  close(250*m.probability/m.net,16.68392034939035);
});
test('沖海えなこ：10賞球10Cの差玉90%と、残保留当たり30%の25回復帰',()=>{
  const m=get('okiumi6-enako-rbd');
  for(const edges of Object.values(m.states))for(const edge of edges){
    close(edge.net,edge.gross*.9);
    if(edge.gross>0)assert.ok([400,600,1000].includes(edge.gross));
  }
  const residualHits=m.states.R.filter(edge=>edge.gross>0);
  const hitTotal=residualHits.reduce((sum,edge)=>sum+edge.p,0);
  close(hitTotal,1-(1-1/99.9)**4);
  const fraction=next=>residualHits.filter(edge=>edge.next===next).reduce((sum,edge)=>sum+edge.p,0)/hitTotal;
  close(fraction('A'),.30);close(fraction('B'),.60);close(fraction('C'),.10);
  const cFailure=m.states.C.find(edge=>edge.gross===0);
  assert.equal(cFailure.next,'R');
  // A residual win after C must be able to leave C. Keeping C here is a
  // plausible implementation error that overstates the cycle payout.
  const wrong=structuredClone(m.states);
  wrong.C.find(edge=>edge.gross===0).next='retainedC';
  wrong.retainedC=wrong.R.map(edge=>({...edge,next:edge.gross>0?'C':null}));
  assert.ok(expectedCycle(wrong).net>m.net);
});
test('沖海えなこ：初当たりST100%と残保留込み約82%の公表精度を再現',()=>{
  const m=get('okiumi6-enako-rbd');
  close(m.states.initial.filter(edge=>['A','B','C'].includes(edge.next)).reduce((sum,edge)=>sum+edge.p,0),1);
  const continuation=1-(1-1/9.9)**5*(1-1/99.9)**119;
  close(continuation,.8226465416988981);
  assert.equal(Math.round(continuation*100),82);
  const published=m.checks.find(check=>check.target===.82);
  assert.ok(published.passed);close(published.actual,continuation);
});
test('公表値の許容差を超えるモデルでは金額計算を停止する',()=>{
  const model={probability:99.9,states:{initial:[{p:1,gross:1000,net:900,next:null}]}},
    check={label:'継続率',target:.82,published:'約82%',tolerance:.005};
  const inRange=compileMachine({...model,checks:[{...check,actual:.824999}]});
  assert.equal(inRange.blockedReason,null);assert.equal(machineEstimate(inRange).payout,900);
  for(const actual of [.825,.825001,.8,NaN]){
    const blocked=compileMachine({...model,checks:[{...check,actual}]});
    assert.equal(blocked.checks[0].passed,false);
    assert.match(blocked.blockedReason,/公表値との不一致/);
    assert.equal(blocked.net,null);assert.equal(blocked.gross,null);assert.equal(blocked.stateMeans,null);
    assert.equal(machineEstimate(blocked),null);
  }
});

test('公表チェックは状態遷移から再計算し、分岐だけが変わった不整合も検出する',()=>{
  const base={probability:100,states:{initial:[{p:.76,gross:1500,net:1400,next:'initial'},{p:.24,gross:1500,net:1400,next:null}]},checks:[{label:'継続率',actual:s=>s.initial.filter(e=>e.next!==null).reduce((v,e)=>v+e.p,0),target:.76,tolerance:0,published:'76%'}]};
  assert.equal(compileMachine(base).blockedReason,null);
  const changed={...base,states:{initial:[{p:.77,gross:1500,net:1400,next:'initial'},{p:.23,gross:1500,net:1400,next:null}]}};
  assert.equal(machineEstimate(compileMachine(changed)),null);
});
test('6機種が計算可能で2機種は条件付き下限、各モデルの等価ボーダー上は収支0',()=>{
  assert.equal(machines.length,6);
  const active=machines.filter(m=>!m.blockedReason);
  assert.equal(active.length,6);assert.equal(machines.filter(m=>m.blockedReason).length,0);
  assert.equal(machines.filter(m=>m.estimateKind==='lower-bound').length,2);
  for(const m of active){
    assert.ok(m.checks.length>0&&m.checks.every(check=>check.passed));
    assert.ok(m.gross>m.net&&m.net>0);const rotation=250*m.probability/m.net;
    const estimate=machineEstimate(m);assert.ok(estimate);close(estimate.payout,m.net);
    const v={...defaults,...estimate,rotation,exchange:25};
    close(calculate(v).profit,0);assert.ok(calculate({...v,payout:m.net*.97}).profit<0);
    close(machineEstimate(m,97).payout,m.net*.97);
  }
});
test('時給未入力でも期待収支は計算し、架空の時給は表示しない',()=>{
  const a=calculate(defaults),b=calculate({...defaults,speed:'',bonusMinutes:''});
  close(a.profit,b.profit);assert.equal(b.hours,null);assert.equal(b.hourly,null);
});

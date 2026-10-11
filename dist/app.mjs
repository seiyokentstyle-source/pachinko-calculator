import { defaults, rules, validate, calculate } from './calc.mjs';
import { machines, machineEstimate } from './machines.mjs';
import { initSession } from './session-ui.mjs';
import { initViews } from './view-ui.mjs';
const $ = id => document.getElementById(id);
const form = $('calculator');
const key = 'tamayomi.conditions.v2';
const actualKeys = Object.keys(rules).filter(n => !['payout','probability'].includes(n));
const initial = {...defaults, rotation:'0', speed:'0', bonusMinutes:'0'};
const zeroDefault = value => value === '' || value == null ? '0' : value;
let manual = { probability: '0', payout: '0' };
let mode = '';
let rotationSource = '';
let touched = new Set();
let views;
const fmt = (n, digits = 0) => n.toLocaleString('ja-JP', { minimumFractionDigits: digits, maximumFractionDigits: digits });
const signed = (n, digits = 0) => { const rounded = Number(n.toFixed(digits)); return `${rounded > 0 ? '+' : rounded < 0 ? '−' : ''}${fmt(Math.abs(rounded), digits)}`; };
const selected = () => machines.find(m => m.id === $('machine').value);
for (const m of machines) { const option=document.createElement('option'); option.value=m.id; option.textContent=`${m.shortName}｜1/${m.probability}${m.blockedReason ? '（計算停止）' : m.estimateKind==='lower-bound'?'（保守的な下限）':''}`; $('machine').insertBefore(option,$('machine').lastElementChild); }
function writeConditions(values) { for(const n of actualKeys) $(n).value=initial[n]==='0'?zeroDefault(values[n]):values[n]??initial[n]; $('holding-slider').value=$('holding').value; }
function read() {
  const values=Object.fromEntries(Object.keys(rules).map(n=>[n,$(n).value]));
  // A zero speed means no hourly estimate; it must not block the EV calculation.
  if (values.speed.trim() !== '' && Number(values.speed) === 0) values.speed='';
  const m=selected();
  if(m){const estimate=machineEstimate(m,Number($('payoutRate').value));values.probability=estimate?.probability??'';values.payout=estimate?.payout??'';}
  return values;
}
function load() {
  writeConditions(initial);
  try {
    const legacy=JSON.parse(localStorage.getItem('tamayomi.conditions.v1'));
    if(legacy && !Object.keys(validate(legacy)).length){manual={probability:legacy.probability,payout:legacy.payout};writeConditions(legacy);}
    const saved=JSON.parse(localStorage.getItem(key));
    if(saved?.version===2 && saved.conditions){
      writeConditions(saved.conditions);
      $('machine').value=machines.some(m=>m.id===saved.machine)||saved.machine==='manual'?saved.machine:'';
      if(saved.manual)manual=Object.fromEntries(['probability','payout'].map(n=>[n,['string','number'].includes(typeof saved.manual[n])?zeroDefault(saved.manual[n]):'0']));
      $('payoutRate').value=saved.payoutRate ?? 100;
      rotationSource=typeof saved.rotationSource==='string'?saved.rotationSource.slice(0,160):'';
    }
  }catch{}
  $('probability').value=manual.probability; $('payout').value=manual.payout;
}
function save() {
  if($('machine').value==='manual')manual={probability:$('probability').value,payout:$('payout').value};
  const conditions=Object.fromEntries(actualKeys.map(n=>[n,$(n).value]));
  try {localStorage.setItem(key,JSON.stringify({version:2,machine:$('machine').value,conditions,manual,payoutRate:$('payoutRate').value,rotationSource})); $('save-status').textContent='条件はこの端末のブラウザに自動保存されています。';}
  catch {$('save-status').textContent='このブラウザでは条件を保存できません。計算は利用できます。';}
}
function updateMachine() {
  if(mode==='manual')manual={probability:$('probability').value,payout:$('payout').value};
  mode=$('machine').value;
  const m=selected(); const isManual=mode==='manual';
  document.querySelectorAll('.manual-only').forEach(el=>el.hidden=!isManual);
  document.querySelectorAll('.machine-only').forEach(el=>el.hidden=isManual);
  $('machine-spec').hidden=!m; $('assumption-panel').hidden=!m?.blockedReason&&!m?.caution;
  $('model-basis').textContent='';$('consistency-checks').hidden=true;
  if(isManual){$('probability').value=manual.probability;$('payout').value=manual.payout;}
  if(m){
    $('spec-name').textContent=m.name; $('spec-version').textContent=m.version;
    $('spec-probability').textContent=`約1 / ${m.probability}`;
    $('spec-payout-label').textContent=m.estimateKind==='lower-bound'?'初当たり平均差玉の下限':'初当たり1回の平均差玉';
    $('spec-payout').textContent=m.blockedReason?'未算出':m.estimateKind==='lower-bound'?`${fmt(Math.floor(m.net))}玉（下限計算）`:`約${fmt(m.net)}玉`;
    $('spec-subtitle').textContent=m.subtitle;
    $('spec-details').replaceChildren(...m.details.map(text=>{const p=document.createElement('p');p.textContent=text;return p;}));
    $('spec-sources').replaceChildren(...m.sources.map(source=>{const a=document.createElement('a');a.textContent=source.label+' ↗';a.href=source.url;a.target='_blank';a.rel='noopener noreferrer';return a;}));
    $('spec-checked').textContent=`資料確認：${m.checked}。表示玉数は丸め、内部計算は丸め前の値を使用。`;
    $('assumption-title').textContent=m.blockedReason?'整合未確認のため、計算を停止しています':'公表値モデル内の保守的な下限です';
    $('assumption-note').textContent=m.blockedReason ?? m.caution ?? '';
    $('assumption-scope').textContent=m.blockedReason?'必要な条件を確認できるまで金額を表示しません。':'掲載確率・出玉補正・通常回転数を固定した計算です。実機内部値や実収支の絶対下限ではありません。下限でマイナスでも、実際の理論期待値がマイナスとは断定できません。';
    $('model-basis').textContent=m.modelBasis;
    $('consistency-checks').replaceChildren(...m.checks.map(check=>{
      const row=document.createElement('div');row.className='consistency-row';
      const label=document.createElement('span');label.textContent=check.label;
      const value=document.createElement('span');value.textContent=`公表 ${check.published} ／ 計算 ${(check.actual*100).toFixed(2)}%`;
      const status=document.createElement('strong');status.textContent=check.passed?(check.tolerance===0?'一致':'一致（公表の丸め範囲）'):'不一致';
      row.append(label,value,status);return row;
    }));
    $('consistency-checks').hidden=!m.checks.length;
  }
  render();
}
function clearResult(reason,badge,alert=false) {
  for(const n of ['profit','hourly','border','gap','revenue','cost','hits','hours','mobile-profit'])$(n).textContent='—';
  $('comparison-rows').replaceChildren(); $('result-badge').textContent=badge; $('result-caption').textContent=reason;
  $('result-explanation').textContent='機種スペックと実戦条件がそろうと結果を表示します。';
  $('error-summary').hidden=!alert; $('error-summary').textContent=reason;
}
function render() {
  const values=read(), m=selected(), errors=validate(values), isManual=$('machine').value==='manual';
  const conservative=m?.estimateKind==='lower-bound';
  const money=value=>signed(conservative?Math.floor(value):value);
  $('rotation-source').textContent=rotationSource||'1,000円あたりの通常回転数を入力。';
  $('shop-summary').textContent=`貸玉 ${$('loan').value||'未入力'}玉／1,000円 · 交換 ${$('exchange').value||'未入力'}玉／100円`;
  $('adjustment-summary').textContent=`持ち玉 ${$('holding').value||'未入力'}%${isManual?'':` · 出玉補正 ${$('payoutRate').value||'未入力'}%`}`;
  save();
  if(!isManual){delete errors.probability;delete errors.payout;}
  const rate=Number($('payoutRate').value);
  if(!isManual && ($('payoutRate').value.trim()===''||!Number.isFinite(rate)||rate<1||rate>120))errors.payoutRate='1〜120%の範囲で入力してください。';
  for(const name of [...Object.keys(rules),'payoutRate']){
    const show=errors[name] && (touched.has(name) || (name!=='rotation' && $(name).value!=='' && $(name).value!=='0'));
    $(name).setAttribute('aria-invalid',show?'true':'false');$(`${name}-error`).textContent=show?errors[name]:'';
  }
  $('result-badge').classList.remove('negative','reference-result'); document.querySelector('.main-value').classList.remove('negative'); $('error-summary').hidden=true;
  $('results-title').textContent=conservative?'期待収支の下限（公表値モデル）':'期待収支';
  $('border-label').textContent=conservative?'ボーダーの上限':'ボーダー回転率';
  $('gap-label').textContent=conservative?'上限ボーダーとの差':'ボーダーとの差';
  $('hourly-label').textContent=conservative?'参考時給（入力時間固定）':'推定時給';
  $('revenue-label').textContent=conservative?'出玉の期待交換額（下限）':'出玉の期待交換額';
  $('comparison-caption').textContent=conservative?'同じ入力条件での期待収支の下限比較':'ほかの条件を固定した期待収支の比較';
  $('result-note').textContent=isManual?'入力された確率と平均差玉に基づく計算です。機種スペックとの照合は行いません。':m?.blockedReason?m.blockedReason:`${m?.modelBasis??'機種を選択してください。'} 公表値には丸めがあり、実機内部の厳密値ではありません。`;
  if(!m && !isManual){clearResult('機種を選んでください','機種未選択');return;}
  if(m?.blockedReason){clearResult('スペックの整合性が確認できるまで計算を停止しています','整合未確認');$('result-explanation').textContent=m.blockedReason;return;}
  if(Object.keys(errors).length){clearResult(errors.rotation?'実測回転率を入力してください':'入力内容を確認してください','入力待ち',Object.keys(errors).some(n=>touched.has(n)));return;}
  const result=calculate(values); if(!result){clearResult('条件を確認してください','入力を確認',true);return;}
  $('profit').textContent=money(result.profit);$('mobile-profit').textContent=`${conservative?'下限 ':''}${money(result.profit)}円`;
  $('hourly').textContent=result.hourly===null?'未設定':money(result.hourly);
  $('hourly').classList.toggle('time-unset',result.hourly===null);$('hourly-unit').hidden=result.hourly===null;$('hourly-note').hidden=result.hourly!==null;
  $('border').textContent=result.border===null?'算出不可':fmt(conservative?Math.ceil(result.border*100)/100:result.border,2);$('border-unit').hidden=result.border===null;
  $('gap').textContent=result.gap===null?'平均差玉0玉のため算出不可':`${signed(conservative?Math.floor(result.gap*100)/100:result.gap,2)} 回 / 1,000円`;
  $('revenue').textContent=`${fmt(conservative?Math.floor(result.revenue):result.revenue)} 円`;$('cost').textContent=`${fmt(result.cost)} 円`;
  $('hits').textContent=`${fmt(result.hits,2)} 回`;$('hours').textContent=result.hours===null?'消化時間を設定':`${fmt(result.hours,2)} 時間`;
  $('result-caption').textContent=`通常時 ${fmt(Number(values.spins))}回転あたり${conservative?'・未確認の増加分は未計上':''}`;
  const sign=Math.abs(result.profit)<.5?0:Math.sign(result.profit);
  $('result-badge').textContent=conservative?'保守計算':sign>0?'プラスの期待値':sign<0?'マイナスの期待値':'ほぼ損益ゼロ';
  $('result-badge').classList.toggle('negative',sign<0);
  $('result-badge').classList.toggle('reference-result',conservative);
  document.querySelector('.main-value').classList.toggle('negative',sign<0);
  $('result-explanation').textContent=m?`${m.shortName} / 出玉補正 ${fmt(rate,1)}%${conservative?'。下限の金額は切り捨て、上限ボーダーは小数第2位へ切り上げ。時給は入力時間を固定した参考値です。':''}`:'手入力の平均差玉を使用';
  const rows=[-2,-1,0,1,2].map(delta=>({delta,rotation:Number(values.rotation)+delta})).filter(row=>row.rotation>=rules.rotation[0]&&row.rotation<=rules.rotation[1]);
  rows.forEach(row=>row.result=calculate({...values,rotation:row.rotation}));const max=Math.max(1,...rows.map(row=>Math.abs(row.result.profit)));
  $('comparison-rows').replaceChildren(...rows.map(row=>{
    const el=document.createElement('div');el.className=`comparison-row${row.delta===0?' current':''}`;
    const label=document.createElement('span');label.textContent=fmt(row.rotation,2);
    if(row.delta===0){const tag=document.createElement('small');tag.textContent='現在の条件';label.append(tag);}
    const bar=document.createElement('span');bar.className='bar';bar.setAttribute('aria-hidden','true');
    const fill=document.createElement('i'), negative=row.result.profit<0;fill.className=negative?'loss':'';
    fill.style.width=`${Math.abs(row.result.profit)/max*48}%`;fill.style[negative?'right':'left']='50%';bar.append(fill);
    const amount=document.createElement('span');amount.textContent=`${money(row.result.profit)}円`;el.append(label,bar,amount);return el;
  }));
}
form.addEventListener('submit',event=>{
  event.preventDefault();
  if(views?.current!=='ev')return;
  touched=new Set([...Object.keys(rules),'payoutRate']);render();
  const invalid=[...document.querySelectorAll('#ev-view [aria-invalid="true"], #common-settings [aria-invalid="true"]')].find(input=>!input.closest('[hidden]'));
  const target=!$('machine').value?$('machine'):invalid;
  if(target){
    for(let parent=target.parentElement;parent;parent=parent.parentElement)if(parent.tagName==='DETAILS')parent.open=true;
    target.focus();target.scrollIntoView?.({block:'center'});
  }else{
    $('results').scrollIntoView?.({block:'start'});$('results-title').setAttribute('tabindex','-1');$('results-title').focus({preventScroll:true});
  }
});
form.addEventListener('input',event=>{
  if(event.target.id==='machine')return;touched.add(event.target.id);
  if(event.target.id==='rotation')rotationSource='';
  if(event.target.id==='loan'&&rotationSource){$('rotation').value='0';rotationSource='貸玉条件を変更したため、着席記録から再反映してください。';}
  if(event.target.id==='holding-slider')$('holding').value=event.target.value;
  if(event.target.id==='holding'&&event.target.value!==''&&Number.isFinite(Number(event.target.value)))$('holding-slider').value=event.target.value;
  render();
});
$('machine').addEventListener('change',updateMachine);
$('reset').addEventListener('click',()=>{writeConditions(initial);manual={probability:'0',payout:'0'};$('probability').value='0';$('payout').value='0';$('payoutRate').value=100;rotationSource='';touched.clear();render();save();});
load();updateMachine();
const session=initSession({getMachine:selected,mount:$('session-mount'),onApply:(result,applySpins)=>{
  $('rotation').value=result.rotation;
  rotationSource=`${selected()?.shortName??'手入力'}の${result.recordContext==='before'?'着席前の台データ':'着席後の実戦記録'}から反映：${result.recordContext==='before'?'過去データによる推定':result.estimated?'1回あたり出玉・概数を含む推定':'実測入力に基づく計算'}。`;
  if(applySpins)$('spins').value=result.spins;
  touched.add('rotation');render();
  views.show('ev');$('rotation').focus();$('rotation').scrollIntoView?.({block:'center'});
}});
views=initViews(session);

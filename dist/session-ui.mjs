import {parseHistory} from './session-calc.mjs';
import {sessionPrizes} from './session-prizes.mjs';
import {recordKey,newRecord,restoreRecord,calculateRecord} from './session-context.mjs';

const storageKey='tamayomi.sessions.v1';
const $=id=>document.getElementById(id);
const format=(v,d=0)=>v.toLocaleString('ja-JP',{minimumFractionDigits:d,maximumFractionDigits:d});
const field=(id,label,unit='玉',hint='',signed=false)=>`<div class="field"><label for="session-${id}">${label}</label><div class="input-wrap small"><input id="session-${id}" data-session="${id}" type="number" inputmode="${signed?'decimal':'numeric'}" ${signed?'':'min="0"'} step="any" aria-describedby="session-${id}-error"><span>${unit}</span>${signed?`<button class="session-sign" type="button" data-sign="${id}" aria-label="${label}のプラス・マイナスを切り替え">＋/−</button>`:''}</div>${hint?`<p class="hint">${hint}</p>`:''}<p class="error" id="session-${id}-error"></p></div>`;

export function initSession({getMachine,onApply}){
  const root=document.createElement('details');root.className='session-panel';root.id='session-panel';
  root.innerHTML=`<summary><span>着席前・着席後の回転率を調べる</span><span aria-hidden="true">＋</span></summary>
    <div class="session-body"><p class="hint" id="session-machine-note"></p>
    <label for="session-context">調べるタイミング</label><select id="session-context"><option value="before">着席前：台の過去データから推定</option><option value="after">着席後：自分の実戦記録から計算</option></select>
    <p class="hint" id="session-intro"></p><div class="session-before-guide" id="session-before-guide" hidden><strong>着席前に用意するデータ</strong><p>同じ台・同じ集計期間の①通常回転数（または履歴）②台差玉③当たり出玉の内訳。前の人の投資額や持ち玉は不要です。</p><p>本日全体を調べるなら、開始時の累計・差玉が0にリセットされていることを確認して0を入力します。開始値は自動で0にしません。右打ち終了後のデータを使用してください。</p><p>総当たり回数だけでは、300個・1500個・3000個などの出玉を判別できません。内訳不明・履歴欠け・右打ちの範囲不明の場合は、必要な値を確認するまで算出できません。</p></div>
    <div id="session-method-control"><label for="session-method">入力するデータ</label><select id="session-method" data-session="method"><option value="wallet">自分の投資・持ち玉から計算</option><option value="display">台の差玉表示から計算</option></select></div>
    <h3>1. 対象区間の回転数</h3>
    <label for="session-spinMode">回転数の数え方</label><select id="session-spinMode" data-session="spinMode"><option value="normal">通常回転の累計を使う</option><option value="all">総回転から右打ち回転を引く</option><option value="direct">対象区間の通常回転数を直接入力</option><option value="history">初当たり履歴とスタートから集計</option></select>
    <div id="session-counters"><p class="hint">累計方式には、大当たりで0に戻る「現在スタート」は使えません。現在スタートを使う場合は「初当たり履歴とスタートから集計」を選んでください。</p><div class="fields">${field('startSpins','集計開始時の累計回転','回転')}${field('endSpins','集計終了時の累計回転','回転')}</div></div>
    <div id="session-direct" hidden>${field('normalSpins','対象区間の通常回転数','回転','ST・時短・残保留などの右打ち回転を除いた合計。')}</div>
    <div id="session-history" hidden><p class="hint">通常時の初当たり履歴がすべて分かる場合に使えます。機種の当たり確率や平均ST回数では補完しません。</p><div class="fields">${field('historyStart','集計開始時の通常スタート','回転')}${field('historyCurrent','集計終了時の通常スタート','回転')}</div><label for="session-historyText">対象区間の通常初当たりまでの回転数</label><textarea id="session-historyText" data-session="historyText" rows="4" placeholder="例：260, 180" aria-describedby="session-historyText-help session-historyText-error"></textarea><p class="hint" id="session-historyText-help">古い順に1件ずつ入力。改行・空白・カンマで区切れます。1000回は1000と入力し、桁区切りのカンマは使わないでください。最初の1件は集計開始前の回転も含む当選時スタート値。ST・時短の当たりは除外し、通常からのチャージ・単発も含めて記録します。当たり0件なら空欄。</p><p class="error" id="session-historyText-error"></p><p class="hint" id="session-history-count"></p><label class="checkbox-label"><input id="session-historyConfirmed" data-session="historyConfirmed" type="checkbox">通常初当たりを全件入力し、履歴・現在スタートには右打ちが含まれず、通常に戻るたび0から数える形式であることを確認した</label><p class="error" id="session-historyConfirmed-error"></p><p class="hint">通常回転数＝初当たり履歴の合計＋現在スタート−集計開始時スタート。例：開始120、初当たり260・180、現在80なら400回。履歴が欠けている、途中で別のリセットがある、表示仕様が違う場合は使えません。</p></div>
    <div id="session-right" hidden>${field('rightSpins','対象区間の右打ち回転合計','回転','上の総回転に含まれている、ST・時短・残保留・上乗せ待ちの回転だけを引きます。')}</div>
    <h3>2. 同じ期間の玉の出入り</h3>
    <div id="session-wallet"><div class="fields">${field('cash','着席後に貸玉に使った現金','円','カード入金額ではなく、実際に玉を借りた金額。')}${field('replay','着席後の再プレイ玉','玉','貯玉から実際に出した玉。現金分との重複なし。')}${field('startBalls','着席時の持ち玉')}${field('endBalls','現在の持ち玉')}</div><p class="hint">持ち玉は上皿・下皿・箱・台の計数残高を同じ範囲で合計。カード貯玉から出した分は再プレイ欄へ。右打ち終了後、通常時の同じタイミングで測ってください。</p>
    <details class="session-extra"><summary>玉の受け渡し・別カードへの移動がある</summary><div class="fields">${field('transferIn','外から受け取った玉','玉','現金貸玉・再プレイ以外。')}${field('transferOut','記録の範囲外へ移した玉','玉','交換・他の台への移動など。現在の持ち玉にも数えた分は入れません。')}</div></details></div>
    <div id="session-display" hidden><div class="fields">${field('startDelta','集計開始時の台差玉','玉','出玉プラス・吸い込みマイナスで入力。',true)}${field('endDelta','集計終了時の台差玉','玉','最大持ち玉や累計払出ではなく、台の差玉。',true)}</div><label class="checkbox-label"><input id="session-displayApprox" data-session="displayApprox" type="checkbox">グラフの読み取り・概数を使う（推定扱い）</label><p class="hint">同じ台・同じ日の「払出−打込」の差玉を使用。表示器の集計範囲が不明な場合、正確さは確認できません。</p></div>
    <h3>3. 当たり・右打ちで増えた玉</h3>
    <label for="session-gainMode">出玉の入力方法</label><select id="session-gainMode" data-session="gainMode"><option value="">選んでください</option><option value="none">当たり・右打ちなし（増加0玉）</option><option value="measured">実際の純増玉を入力</option><option value="counts">機種別の当たり内訳で推定</option></select><p class="error" id="session-gainMode-error"></p>
    <div id="session-measured" hidden>${field('gain','当たり・右打ち中の純増合計','玉','初当たり直前から通常復帰までの持ち玉増減を、連チャン単位で重複なく合計。途中の貸玉・移動は除く。払出表示や遊技全体の差玉は不可。',true)}</div>
    <div id="session-counts" hidden><p class="hint">対象区間に実際に消化された払い出し区分の回数を入力します。データ表示器の総当たり件数をそのまま入れないでください。3000個を1回と数えたら、内訳の1500個×2回は重ねて入力しません。空欄は0回。</p><label for="session-netMode">1回あたりの出玉</label><select id="session-netMode" data-session="netMode"><option value="standard">機種の標準差玉を参考にする</option><option value="measured">1回あたりの純増玉も入力する</option></select><p class="error" id="session-netMode-error"></p><div class="session-prizes" id="session-prizes"></div><p class="error" id="session-counts-error"></p><p class="error" id="session-unitNets-error"></p><p class="hint" id="session-manual-net-note" hidden>回数を入れた区分は純増玉/回も必須です。空欄を標準値で補いません。平均純増×回数なので結果は推定扱いです。標準出玉補正はかけません。正確な区間合計が分かるなら「実際の純増玉を入力」を選んでください。</p><div id="session-standard-rate">${field('payoutRate','当たり差玉の補正','%','標準100%。こぼしなどで3%減なら97%。期待値側の補正とは別。')}</div>${field('supportDelta','別計上する電サポ増減合計','玉','減ったらマイナス。上の純増玉に含めた分は重ねず0。未測定の0は仮定です。',true)}<p class="hint">標準差玉は払い出しから入賞分だけを控除した数値です。出玉の削りや電サポ増減を測っていなければ、回転率は推定になります。初当たり1回の平均連チャン出玉は使いません。表にない上乗せは1500個・3000個などの消化済み単位に分けて数えます。</p><p class="hint">振り分けの出典は下の機種詳細に記載。リコリコの310個→280玉は、<a href="https://1geki.jp/pachinko/lycoris_recoil/" target="_blank" rel="noopener noreferrer">一撃の3R・10カウント調査</a>に基づき、310−30玉で計算します。</p></div>
    <div class="session-result" aria-live="polite" aria-atomic="true"><p id="session-state">入力待ち</p><div class="session-rate"><strong id="session-rate">—</strong><span>回 / 1,000円</span></div><dl><div><dt>対象区間の通常回転数</dt><dd id="session-spins">—</dd></div><div><dt>通常時の消費玉</dt><dd id="session-consumed">—</dd></div><div><dt>当たり・右打ちの純増</dt><dd id="session-gain-result">—</dd></div></dl><p id="session-message" class="hint"></p></div>
    <p class="error" id="session-errors"></p><label class="checkbox-label"><input id="session-apply-spins" type="checkbox"><span id="session-apply-spins-label">通常回転数も期待値計算に反映する</span></label><button type="button" class="session-apply" id="session-apply" disabled>この回転率で期待値を計算</button><p class="hint" id="session-applied" role="status"></p>
    <details class="session-extra"><summary>計算式・正確に測るための条件</summary><p class="hint">累計方式の通常回転数＝現在の累計−集計開始時の累計−含まれている右打ち回転。履歴方式は履歴合計＋現在スタート−集計開始時スタート。通常消費玉＝当たり・右打ちの純増−期間の台差玉。持ち玉方式の台差玉＝現在持ち玉＋範囲外へ移した玉−着席時持ち玉−現金貸玉−再プレイ−受取玉。回転率＝通常回転数×1000円の貸玉数÷通常消費玉。</p><p class="hint">下の貸玉条件を使用。異なる貸玉レートを混ぜないでください。未使用の玉は現在持ち玉に含めます。出玉・回転の計測期間を揃え、当たり・右打ちが終わってから比較してください。短い区間の回転率は、台本来の長期平均を保証しません。差玉と総当たり回数だけでは通常回転数を一意に出せません。</p></details>
    <div class="session-bottom"><span id="session-saved" class="hint"></span><button type="button" class="text-button" id="session-clear">この機種の記録をリセット</button></div></div>`;
  $('machine-spec').before(root);
  let records={},context='before';try{const saved=JSON.parse(localStorage.getItem(storageKey));if(saved?.version===1&&saved.records&&typeof saved.records==='object')records=saved.records;if(['before','after'].includes(saved?.context))context=saved.context;}catch{}
  let machineKey='', values=newRecord(context), result=null, options=[], touched=false;
  $('session-context').value=context;
  function persist(){records[machineKey]=values;try{localStorage.setItem(storageKey,JSON.stringify({version:1,records,context}));$('session-saved').textContent=`この機種の${context==='before'?'着席前':'着席後'}データを自動保存`;}catch{$('session-saved').textContent='保存できません。画面を閉じる前に控えてください。';}}
  function render(){
    const machine=getMachine();options=sessionPrizes[machine?.id]??[];
    const before=context==='before';
    $('session-machine-note').textContent=machine?`${machine.shortName} / ${before?'着席前の台データ':'着席後の実戦記録'}`:'機種を上で選ぶと、当たり内訳の入力も使えます。';
    $('session-intro').textContent=before?'台の過去データから回転率を推定します。機種ごとに着席後の記録と別保存。台・日付・集計期間を変えるときは、このモードの記録をリセットしてください。':'着席時の数字を一度入力し、遊技中は現在値を更新。機種ごとに着席前のデータと別保存。別の台へ移るときは、このモードの記録をリセットしてください。';
    $('session-before-guide').hidden=!before;$('session-method-control').hidden=before;
    $('session-wallet').hidden=values.method!=='wallet';$('session-display').hidden=values.method!=='display';$('session-right').hidden=values.spinMode!=='all';$('session-measured').hidden=values.gainMode!=='measured';$('session-counts').hidden=values.gainMode!=='counts';
    $('session-counters').hidden=!['normal','all'].includes(values.spinMode);$('session-direct').hidden=values.spinMode!=='direct';$('session-history').hidden=values.spinMode!=='history';
    const history=parseHistory(values.historyText);$('session-history-count').textContent=history.error?'履歴の書式を確認してください。':`読み取った通常初当たり：${format(history.values.length)}件${history.values.length?`（${history.values.slice(0,10).map(n=>`${format(n)}回`).join(' → ')}${history.values.length>10?' …':''}）。履歴合計${format(history.values.reduce((sum,n)=>sum+n,0))}回`:''}`;
    $('session-standard-rate').hidden=values.netMode!=='standard';$('session-manual-net-note').hidden=values.netMode!=='measured';root.querySelectorAll('.session-net-unit').forEach(el=>el.hidden=values.netMode!=='measured');
    const calculated=calculateRecord(values,options,context,$('loan').value);result=calculated.result;
    root.querySelectorAll('[data-session]').forEach(input=>{const error=calculated.errors[input.dataset.session];input.setAttribute('aria-invalid',touched&&error?'true':'false');const msg=$(`session-${input.dataset.session}-error`);if(msg)msg.textContent=touched&&error?error:'';});
    $('session-counts-error').textContent=touched?(calculated.errors.counts??''):'';
    $('session-unitNets-error').textContent=touched?(calculated.errors.unitNets??''):'';
    $('session-errors').textContent=touched?(Object.values(calculated.errors)[0]??''):'';
    $('session-apply').disabled=!result;
    $('session-rate').textContent=result?format(result.rotation,2):'—';$('session-spins').textContent=result?`${format(result.spins)} 回`:'—';$('session-consumed').textContent=result?`${format(result.normalBalls,2)} 玉`:'—';$('session-gain-result').textContent=result?`${format(result.gain,2)} 玉`:'—';
    $('session-state').textContent=result?(before?'着席前：過去データによる推定回転率':result.estimated?'推定回転率':'入力した実測値からの回転率'):'入力待ち';
    const spinBasis={normal:'通常累計',all:'総回転−入力した右打ち回転',direct:'通常回転の直接入力',history:'通常初当たりの全履歴'}[values.spinMode];
    const gainBasis=values.gainMode==='none'?'当たりなし0玉':values.gainMode==='measured'?'純増合計の入力値':values.netMode==='standard'?'標準差玉×回数':'入力した純増/回×回数';
    $('session-message').textContent=result?`${before?'過去の台データに基づく推定で、これからの回転率を保証しません。':result.estimated?'1回あたりの出玉・概数を含む推定です。':'数値・集計範囲・計測期間が正しい場合の結果です。'} 計算の根拠：回転＝${spinBasis}、出玉＝${gainBasis}${values.method==='display'?`、差玉＝${values.displayApprox?'グラフ・概数':'数値表示'}`:''}。貸玉${$('loan').value}玉/1,000円。表示は小数第2位、反映には丸め前の値を使います。`:'同じ期間の回転数と出玉を入力してください。';
    $('session-apply-spins-label').textContent=before?'この過去区間と同じ回転数で期待値を計算する（任意）':'この実戦区間と同じ通常回転数で期待値を計算する（任意）';
    $('session-clear').textContent=`この機種の${before?'着席前':'着席後'}データをリセット`;
  }
  function loadMachine(){
    machineKey=recordKey($('machine').value,context);values=restoreRecord(records[machineKey],context);
    root.querySelectorAll('[data-session]').forEach(input=>{if(input.type==='checkbox')input.checked=values[input.dataset.session]===true;else input.value=values[input.dataset.session]??'';});
    options=sessionPrizes[getMachine()?.id]??[];const holder=$('session-prizes');holder.replaceChildren();
    for(const prize of options){
      const row=document.createElement('div');row.className='session-award';const title=document.createElement('p');title.textContent=`${prize.label}（参考標準：差玉${format(prize.net,0)}玉/回）`;row.append(title);
      const label=document.createElement('label');label.className='session-prize';const text=document.createElement('span');text.textContent='消化した回数';const input=document.createElement('input');input.type='number';input.min='0';input.step='1';input.inputMode='numeric';input.placeholder='0';input.setAttribute('aria-label',`${prize.label}の回数`);input.dataset.prize=prize.id;input.value=values.counts[prize.id]??'';const unit=document.createElement('span');unit.textContent='回';label.append(text,input,unit);row.append(label);
      const netBox=document.createElement('div');netBox.className='session-net-unit';const netLabel=document.createElement('label');netLabel.htmlFor=`session-net-${prize.id}`;netLabel.textContent='1回あたりの純増';const wrap=document.createElement('div');wrap.className='input-wrap small';const net=document.createElement('input');net.id=`session-net-${prize.id}`;net.type='number';net.inputMode='decimal';net.step='any';net.placeholder='実測値';net.dataset.unitNet=prize.id;net.setAttribute('aria-label',`${prize.label}の純増玉/回`);net.value=values.unitNets[prize.id]??'';const netUnit=document.createElement('span');netUnit.textContent='玉/回';const sign=document.createElement('button');sign.type='button';sign.className='session-sign';sign.dataset.sign=`net-${prize.id}`;sign.textContent='＋/−';sign.setAttribute('aria-label',`${prize.label}の純増の符号を切り替え`);wrap.append(net,netUnit,sign);netBox.append(netLabel,wrap);row.append(netBox);holder.append(row);
    }
    if(!options.length){const p=document.createElement('p');p.className='hint';p.textContent='登録機種を選ぶか、実測の純増玉を入力してください。';holder.append(p);}
    touched=false;$('session-applied').textContent='';$('session-saved').textContent=records[machineKey]?'このモードの保存済みデータを復元しました。':'このモードの新しい記録です。';$('session-apply-spins').checked=false;render();
  }
  function change(event){event.stopPropagation();if(event.target.id==='session-apply-spins')return;if(event.target.id==='session-context'){if(context===event.target.value)return;context=event.target.value;loadMachine();persist();return;}const key=event.target.dataset.session,prize=event.target.dataset.prize,unitNet=event.target.dataset.unitNet;if(!key&&!prize&&!unitNet)return;if(prize)values.counts[prize]=event.target.value;else if(unitNet)values.unitNets[unitNet]=event.target.value;else values[key]=event.target.type==='checkbox'?event.target.checked:event.target.value;touched=true;persist();render();$('session-applied').textContent='期待値への反映は、下のボタンで更新します。';}
  root.addEventListener('input',change);root.addEventListener('change',change);
  root.addEventListener('click',event=>{const button=event.target.closest('[data-sign]');if(!button)return;const input=$(`session-${button.dataset.sign}`);if(input.value.trim()!==''&&Number.isFinite(Number(input.value))){input.value=String(-Number(input.value));input.dispatchEvent(new Event('input',{bubbles:true}));}input.focus();});
  $('session-clear').addEventListener('click',()=>{records[machineKey]=newRecord(context);loadMachine();persist();});
  $('session-apply').addEventListener('click',()=>{render();if(!result)return;onApply({...result,recordContext:context},$('session-apply-spins').checked);$('session-applied').textContent=`${context==='before'?'着席前の台データからの推定':result.estimated?'推定':'実測値による'}回転率 ${format(result.rotation,2)}回を反映しました。持ち玉使用割合は実際の条件を別途設定してください。`;});
  $('machine').addEventListener('change',loadMachine);$('loan').addEventListener('input',()=>{render();$('session-applied').textContent='貸玉条件が変わりました。反映ボタンで更新してください。';});
  $('reset').addEventListener('click',()=>{render();$('session-applied').textContent='期待値の条件をリセットしました。実戦記録は保持しています。必要なら反映ボタンで更新してください。';});
  loadMachine();
}

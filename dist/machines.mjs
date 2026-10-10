import { stHitProbability } from './spec-engine.mjs';
import { compileMachine } from './machine-model.mjs';
import { lycorisLowerStates, saoLowerStates } from './conservative-models.mjs';
export { machineEstimate } from './machine-model.mjs';
const edge=(p,gross,net,next=null)=>({p,gross,net,next});
const standard=(p,gross,next=null)=>edge(p,gross,gross*14/15,next);
const miss=p=>edge(p,0,0);
const link=(label,url)=>({label,url});
const checked='2026-10-10';
const qGhoul=stHitProbability(95.3,130);
const qYuyuLow=stHitProbability(96.3,115),qYuyuHigh=stHitProbability(96.3,135);
const sea=(p,gross,next=null)=>edge(p,gross,gross*.9,next);
const seaHit=support=>1-(1-1/9.9)**5*(1-1/99.9)**(support-5);
const qSeaA=seaHit(25),qSeaB=seaHit(50),qSeaC=seaHit(120),qSeaR=stHitProbability(99.9,4);
const check=(label,actual,target,published,tolerance=.005)=>({label,actual,target,published,tolerance});
const total=(edges,predicate)=>edges.filter(predicate).reduce((sum,edge)=>sum+edge.p,0);
const catalogue=[
  {
    id:'okiumi6-enako-rbd',shortName:'沖海6 Withえなこ',name:'PAスーパー海物語IN沖縄6 Withえなこ',version:'RBD / 甘デジ',probability:99.9,
    subtitle:'ST5回＋時短20／45／115回。残保留4個を含め、電サポ中と終了後の振り分けを分けて計算します。',
    modelBasis:'メーカー公式リリースの公表確率1/99.9・1/9.9と公式振り分けを使用。残保留当たりの遷移は公開解析とも照合しています。',
    checks:[check('初当たり後のST突入率',s=>total(s.initial,e=>e.next!==null),1,'100%',0),check('ジンベェタイム継続率（残保留4個含む）',s=>total(s.C,e=>e.next==='C')+total(s.C,e=>e.next==='R')*total(s.R,e=>e.next!==null),.82,'約82%')],
    details:[
      '計算入力：低確率1/99.9、高確率1/9.9。メーカー公式リリースの公表値をそのまま使用し、厳密な内部確率とは区別します。',
      'ヘソ：1%が10R・1000個＋120回、50%が6R・600個＋50回、4%が4R・400個＋50回、45%が4R・400個＋25回。全初当たりでST5回。',
      '電チュー：10%が1000個、54%が600個、6%が400個（50回以上）、30%が400個（25回以上）。10賞球・10カウントなので標準差玉は900／540／360玉です。',
      '電サポ25回中は10%→120回、60%→50回、30%→25回。50回中は10%→120回、90%→50回。120回中の当たりはすべて120回へ戻ります。',
      '電サポ終了後は低確率の残保留4個を別状態で計算。そこで当たると10%→120回、60%→50回、30%→25回となり、元の電サポ回数は引き継ぎません。',
      '電サポN回の当選率＝1−(1−1/9.9)^5×(1−1/99.9)^(N−5)。120回と残保留4個を合わせると82.2647%で、公表の約82%と整合します。',
      '公開解析には高確率1/9.99を使うものもあります。同じ遷移で1/9.99なら平均差玉1487.36玉・等価250玉ボーダー16.79回。採用した公表1/9.9では1496.95玉・16.68回となる差を開示します。',
    ],
    sources:[link('メーカー公式スペック発表','https://www.sanyobussan.co.jp/information/pdf/sanyo_press_release_20260313_01.pdf'),link('メーカー公式ガイド','https://www.sanyobussan.co.jp/products/pk_supersea_okinawa6_enako/pk_supersea_okinawa6_enako_guidebook_PC.pdf'),link('残保留の公開解析モデル','https://pachinko-spec.info/spec-detail/169063/'),link('別作者の公開シミュレーション','https://pachinkosimulation.com/superumimonogatariokinawa6enako/')],
    states:{
      initial:[sea(.01,1000,'C'),sea(.5,600,'B'),sea(.04,400,'B'),sea(.45,400,'A')],
      A:[sea(qSeaA*.1,1000,'C'),sea(qSeaA*.54,600,'B'),sea(qSeaA*.06,400,'B'),sea(qSeaA*.3,400,'A'),edge(1-qSeaA,0,0,'R')],
      B:[sea(qSeaB*.1,1000,'C'),sea(qSeaB*.54,600,'B'),sea(qSeaB*.06,400,'B'),sea(qSeaB*.3,400,'B'),edge(1-qSeaB,0,0,'R')],
      C:[sea(qSeaC*.1,1000,'C'),sea(qSeaC*.54,600,'C'),sea(qSeaC*.06,400,'C'),sea(qSeaC*.3,400,'C'),edge(1-qSeaC,0,0,'R')],
      R:[sea(qSeaR*.1,1000,'C'),sea(qSeaR*.54,600,'B'),sea(qSeaR*.06,400,'B'),sea(qSeaR*.3,400,'A'),miss(1-qSeaR)],
    },
  },
  {
    id:'lycoris-m3',shortName:'eリコリス・リコイル',name:'eリコリス・リコイル',version:'M3 / 259.7',probability:259.7,
    estimateKind:'lower-bound',
    subtitle:'掲載された確率・振り分けを固定し、未公表のB残留による増加分を計上しない保守計算です。',
    modelBasis:'公表値・取材資料の入力を固定したモデル内の下限。内部移行率を確定した期待値ではありません。',
    caution:'B残留率は未確認のままです。0〜100%の範囲で最小になる端点を計算しています。「B残留0%が実機」という意味ではありません。LT開始B約30%を30%に固定した条件で、電サポ増減や閉店打ち切りは含みません。',
    checks:[check('全初当たりからのLT突入率',s=>total(s.initial,e=>e.next==='entry'),.5,'50%',0),check('LT開始時のB割合（取材掲載値）',s=>total(s.entry,e=>e.next==='B'),.3,'約30%を採用',0),check('A当たり後のB移行率',s=>total(s.A,e=>e.next==='B')/total(s.A,e=>e.gross>0),.5,'50%',0)],
    details:[
      'STは132回・約1/97.1。A当選は750個、B当選は50%が3000個、50%が6000個＋3000個を50%で上乗せ継続。',
      '入力根拠：全初当たりの50%でLT、LT全体の約30%がB開始、A当たり後50%でB移行（HAZUSE・必勝本の取材掲載値）。通常0.1%1500個＋LT、44.9%600個＋LT、5%310個＋LT、30%600個終了、20%310個終了。',
      '初当出玉の平均標準差玉490.84玉と、LT開始A35%／B15%（全初当たり基準）を集計します。1500個プレミアのB確約と両立し、各初当出玉への移行率を一律に割り当てる必要はありません。',
      '即時の上乗せと約1/15・10000回の潜伏は、保証された上乗せとして合算します。50%上乗せを二重計上しません。B当選の平均標準差玉は5600玉。',
      '上乗せを終えた後の通常STでのB残留率rは未公表。EA=q×(700+0.5EA+0.5EB)、EB=q×(5600+(1−r)EA+rEB)。0≦r≦1でrが大きいほど期待出玉が増えるため、r=0がモデル内の下限です。',
      'q=1−(1−1/97.1)^132=74.499492%。公表は約75%ですが、入力確率自体も丸め値です。計算は75%へ置き換えず74.499492%を使います。',
      '下限計算の平均差玉は3854.9168玉。旧仮定モデルと数値が同じでも、実機のB残留0%を採用した確定期待値ではありません。公表値の誤差・実測出玉減・時間の変化まで保証する下限ではありません。',
    ],
    sources:[link('メーカー公式スペック','https://www.newgin.co.jp/pub/machine/elycorisrecoil/spec.html'),link('メーカー公式RUSH','https://www.newgin.co.jp/pub/machine/elycorisrecoil/rush.html'),link('HAZUSE 独自調査','https://data.hazuse.com/?genre=104&machine_code=PX0349'),link('必勝本：振り分け','https://hisshobon.com/machineinfo/101627/'),link('潜伏を含む上乗せの状態表','https://www.redesign777.tokyo/Spec/PachinkoView?flag=True&id=P2026011922125301')],
    states:lycorisLowerStates,
  },
  {
    id:'tokyo-ghoul-w',shortName:'e東京喰種',name:'e東京喰種',version:'W / オリジナル版',probability:199.9,
    subtitle:'図柄揃いと喰種チャージの合算確率。通常49%終了などの公表振分を合算当たり基準に換算しています。',
    modelBasis:'メーカー公表の丸め値＋公開解析の3000個上乗せモデル。ST継続率・突入率・出玉振り分けを照合しています。',
    checks:[check('ST130回の継続率',s=>total(s.rush,e=>e.next==='bundle'),.75,'約75%'),check('図柄揃い基準のST突入率',s=>total(s.initial,e=>e.next==='rush')/total(s.initial,e=>e.gross===1500||e.next==='rush'),.51,'51%',0),check('右当たり6000個以上の割合',s=>total(s.bundle,e=>e.next==='bundle'),.03,'3%',0)],
    details:[
      '公表図柄揃い約1/399.9（チャージからのRUSH突入を含む）＋別チャージ約1/399.9、合算約1/199.9。',
      '合算当たりの24.5%：1500個終了、25%：1500個＋ST、0.5%：300個＋ST、50%：300個終了。',
      'ST130回・約1/95.3。3000個獲得後の3%で追加3000個の抽選状態に戻る反復を、独立解析の状態定義に基づき計算。97%でSTへ戻ります。',
      '右当たり1回の平均標準差玉＝2800÷0.97。メーカー公表値と独立解析モデルの組合せで、内部確率の厳密値ではありません。',
    ],
    sources:[link('メーカー公式','https://www.pachi-e-tokyoghoul.jp/'),link('SANKYO公式紹介','https://www.sankyo-fever.jp/collection/980/'),link('上乗せの独立解析モデル','https://pachinko-spec.info/spec-detail/154749/')],
    states:{
      initial:[standard(.245,1500),standard(.25,1500,'rush'),standard(.005,300,'rush'),standard(.5,300)],
      rush:[miss(1-qGhoul),edge(qGhoul,0,0,'bundle')],
      bundle:[standard(.97,3000,'rush'),standard(.03,3000,'bundle')],
    },
  },
  {
    id:'sao-alicization-yozora',shortName:'eアリシゼーション 夜空',name:'e ソードアート・オンライン アリシゼーション 夜空',version:'夜空 / 公表約1/199.9',probability:199.9,
    estimateKind:'lower-bound',
    subtitle:'公表振り分けを使い、初回・下位突破の追加出玉と、上位DRIVEの未確認2.5%の出玉を切り捨てた保守計算です。',
    modelBasis:'メーカー公表値を固定したモデル内の下限。未確認のDRIVE内部率や出玉分布を推測して埋めていません。',
    caution:'初回1.5%・下位当たり11%の特別当たりは最低3000個だけを計上。上位DRIVEのto BONUS1.5%・in DRIVE1.0%は、分岐確率を残して獲得出玉を0個として切り捨てます。実機が0個という意味ではなく、未確認出玉を除いた計算です。',
    checks:[check('下位ST53回の当選率',s=>total(s.lower,e=>e.next!==null),.65,'約65%'),check('上位ST70回の当選率',s=>total(s.upper,e=>e.next!==null),.75,'約75%'),check('上位当たりのDRIVE割合',s=>total(s.upper,e=>e.next==='drive')/total(s.upper,e=>e.next!==null),.4,'40%',0),check('DRIVEの出玉既知5区分の合計',s=>total(s.drive,e=>e.gross>0),.975,'97.5%（5区分合計）',0)],
    details:[
      '公式のDRIVE内訳：1500個8.2%、3000個28.1%、4500個36.1%、6000個20.7%、7500個4.4%、DRIVE to BONUS1.5%、DRIVE in DRIVE1.0%。合計100%。',
      '計算入力は公式公表値の通常1/199.9、右1/51.6。下位53回、上位70回。最終追加当選後11%や、逆算した5.5%といった未確認の内部再抽選率は使用しません。',
      '初回50%は300個終了、48.5%は300個＋下位、1.5%は最低3000個＋上位。下位当たり78%は1500個＋下位、11%は1500個＋上位、11%は最低3000個＋上位。3000個を超える分は計上しません。',
      '上位当たりは60%で1500個、40%で神器解放SWORD DRIVE。初回・下位のSWORD DRIVEと同じ出玉分布であるという仮定は置きません。いずれも終了後は上位STへ戻ります。',
      '上位DRIVEの97.5%分だけを足した平均標準差玉は3885玉。未確認2.5%の出玉は0で計算し、残り97.5%を100%に再配分しません。追加・再発動は正の出玉なので、捨てることでモデル内の下側を計算します。',
      '全初当たりの平均差玉の保守値は2378.0930玉。公表の丸め値・電サポ増減0・通常復帰まで全当たり消化を固定したモデル内の下限です。実機内部値や実収支の保証ではありません。',
      '機種名は夜空、通常約1/199.9の版です。閃光の軌跡などの別スペックは対象外です。',
    ],
    sources:[link('京楽公式スペック','https://www.kyoraku.co.jp/product_site/2026/sao_alicization/view/spec/'),link('京楽公式ゲームフロー','https://www.kyoraku.co.jp/product_site/2026/sao_alicization/view/product_info/'),link('一撃：DRIVE後の移行先','https://1geki.jp/pachinko/e_sao_alicization/'),link('パチ7編集部の取材','https://pachiseven.jp/articles/detail/26227')],
    states:saoLowerStates,
  },
  {
    id:'garo12-xx-mj',shortName:'e牙狼12 黄金騎士極限',name:'e牙狼12 黄金騎士極限',version:'XX-MJ / 7500個搭載',probability:349.99,
    subtitle:'ガロチャージを含む合算確率。7500個＝10R×5回。LT終了時の1500個も加算しています。',
    modelBasis:'メーカー公式ガイドの確率・振り分け・出玉を使用。LT終了時の出玉を含めて照合しています。',
    checks:[check('図柄揃いからのバトル突入',s=>total(s.initial,e=>e.next==='battle')/total(s.initial,e=>e.gross===1500),.5,'50%',0),check('バトル突破率',s=>total(s.battle,e=>e.next==='lt'),.5,'50%',0),check('LT継続率',s=>total(s.lt,e=>e.next==='lt'),.76,'76%',0)],
    details:[
      '合算約1/349.99。20%が300個チャージ、80%が1500個の図柄揃い。図柄揃いの50%で極限7500バトルへ。',
      'バトル：50%が1500個終了、50%が7500個＋LT。初回の1500個はこの出玉と別に加算。',
      'LT：25%が7500個＋継続、51%が1500個＋継続、24%が1500個＋終了。',
      '15賞球・10カウントより1500個は標準差玉1400玉、7500個は7000玉。LT終了時も1400玉を獲得するモデル。',
    ],
    sources:[link('メーカー公式ガイド','https://www.sansei-rd.com/products23/e_garo12_ok/assets/pdf/e_garo12_ok.pdf'),link('メーカー公式紹介','https://www.sansei-rd.com/p_garo_archive/archive/p_garo12_ok.html')],
    states:{
      initial:[standard(.2,300),standard(.4,1500),standard(.4,1500,'battle')],
      battle:[standard(.5,1500),standard(.5,7500,'lt')],
      lt:[standard(.25,7500,'lt'),standard(.51,1500,'lt'),standard(.24,1500)],
    },
  },
  {
    id:'yuyuyu-mp',shortName:'e結城友奈 極限7500',name:'e結城友奈は勇者である～極限7500～',version:'MP / 公表約1/349',probability:349,
    subtitle:'チャージなし。下位STの出玉なしリセットを含めて上位への移行を計算しています。',
    modelBasis:'メーカー公式ガイドの確率・振り分け・出玉を使用。ST再当選と出玉なしリセットを区別しています。',
    checks:[check('下位STの再当選率（リセットを含む）',s=>total(s.lower,e=>e.next!==null),.70,'約70%'),check('上位ST継続率',s=>total(s.upper,e=>e.next!==null),.76,'約76%'),check('初当たりから下位STへ',s=>total(s.initial,e=>e.next==='lower'),.515,'51.5%',0)],
    details:[
      '通常約1/349、初当たりはすべて1500個。51.5%で真・勇者RUSH、48.5%で通常へ。',
      '下位ST：115回・約1/96.3。当選の25%は出玉0で下位STリセット、75%はBONUSジャッジ＋上位STへ。',
      'BONUSジャッジは25%が7500個、75%が1500個。上位STは135回・約1/96.3で、当選後は同じジャッジと上位STに戻ります。',
      '下位突破率＝下位ST当選率×0.75÷（1−下位ST当選率×0.25）。継続約70%をそのまま上位突入率としては使いません。',
    ],
    sources:[link('メーカー公式ガイド','https://www.sansei-rd.com/products23/e_yyy/assets/pdf/e_yyy.pdf')],
    states:{
      initial:[standard(.485,1500),standard(.515,1500,'lower')],
      lower:[miss(1-qYuyuLow),edge(qYuyuLow*.25,0,0,'lower'),standard(qYuyuLow*.75*.25,7500,'upper'),standard(qYuyuLow*.75*.75,1500,'upper')],
      upper:[miss(1-qYuyuHigh),standard(qYuyuHigh*.25,7500,'upper'),standard(qYuyuHigh*.75,1500,'upper')],
    },
  },
];
export const machines=catalogue.map(m=>compileMachine({...m,checked}));

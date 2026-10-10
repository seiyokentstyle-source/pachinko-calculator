// Individual completed payouts, never the expected payout of an entire RUSH.
const standard=gross=>({id:String(gross),label:`${gross.toLocaleString('ja-JP')}個`,gross,net:gross*14/15});
export const sessionPrizes={
  'okiumi6-enako-rbd':[400,600,1000].map(gross=>({id:String(gross),label:`${gross}個`,gross,net:gross*.9})),
  'lycoris-m3':[{id:'310',label:'310個（3R）',gross:310,net:280},...[600,750,1500,3000,6000].map(standard)],
  'tokyo-ghoul-w':[300,1500,3000,6000].map(standard),
  'sao-alicization-yozora':[300,1500,3000,4500,6000,7500].map(standard),
  'garo12-xx-mj':[300,1500,7500].map(standard),
  'yuyuyu-mp':[1500,7500].map(standard),
};

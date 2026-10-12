// Clearly fake sample data for the public demo (?demo=1). Never saved to localStorage or the cloud.
window.DS_DEMO = (() => {
  const d = new Date(), iso = x => x.toISOString().slice(0,10);
  const ago = n => { const t = new Date(d); t.setDate(t.getDate()-n); return iso(t); };
  const acc = (id, name, type, start, balance, min, dueDay, apr) => ({ id, name, type, start, balance, min, dueDay, apr, tier:null, created:ago(120) });
  return {
    v:1,
    accounts:[
      acc('demo1','Demo Store Card','Store card',600,240,35,8,0),
      acc('demo2','Sample Phone Plan','Buy now pay later',480,300,40,15,0),
      acc('demo3','Example Visa','Credit card',2500,1820,55,21,22.9),
      acc('demo4','Test Bank Loan','Personal loan',6000,4750,180,3,11.5),
      acc('demo5','Demo Auto Loan','Auto loan',14000,9900,310,27,6.9),
    ],
    payments:[
      { id:'dp1', accountId:'demo1', date:ago(40), amount:180 },
      { id:'dp2', accountId:'demo1', date:ago(9),  amount:180 },
      { id:'dp3', accountId:'demo2', date:ago(20), amount:180 },
      { id:'dp4', accountId:'demo3', date:ago(30), amount:380 },
      { id:'dp5', accountId:'demo3', date:ago(2),  amount:300 },
      { id:'dp6', accountId:'demo4', date:ago(25), amount:1250 },
      { id:'dp7', accountId:'demo5', date:ago(15), amount:4100 },
    ],
    settings:{ budget:null, defaultMonths:6, theme:'dark', followSystem:false },
    flags:{ backupTip:true }, lastFree:null, banner:null,
  };
});

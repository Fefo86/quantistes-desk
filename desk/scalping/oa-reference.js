
(function (w) {
'use strict';
// Transcription of the four visible dashboard captures, 12 November 2025.
// The two scroll positions overlap. Each displayed price is stored once.
const asof='2025-11-12T16:05:48-05:00';
const gTags={W:'WALL', A:'ACCEL', N:'NEUTRAL'};
const velocities={R:'REVERSE', A:'ACCEL', S:'STALL', x:null};
const flips={U:'FLIP↑', D:'FLIP↓', x:null};
const cgTags={GC:'G-CONFLICT', B:'BALANCE', NS:'NEG SYN', NN:'NEG STRONG', CH:'C-HEDGE', CF:'C-FADE', WS:'WEAK SYN', MS:'MOD SYN', SS:'STRONG SYN'};
const trades={BD:'BUY DIP SCALP', RW:'RESISTANCE WATCH', RP:'RESISTANCE PRESSURE', SD:'STRONG DIR', FO:'FADE SETUP', FG:'FADE SETUP', SW:'SUPPORT WATCH', SF:'STRONG FADE', SP:'SUPPORT PRESSURE', DP:'SCALP DIP'};
const actions=[
 'Maximum resistance cushion above → breakout potential',
 'Moderate cushion → trend continuation',
 'Moderate directional pressure → trending moves',
 'Maximum directional momentum → explosive moves likely',
 'Dealers short delta → sell into any bounce',
 'Hedging pressure eases → reduced selling',
 'Dealers short gamma → sell rallies',
 'Moderate support pressure → monitor closely',
 'Strong support pressure → watch for breakdown',
 'Maximum support below → aggressive buying zone',
 'Strong support → dealers long, buy weakness',
 'Dealers long gamma → buy dips',
 'Gamma flip zone → directional uncertainty'
];
// Price and CPT retain the digits printed. ES flow fields are independent
// observations: unrounded inputs and scaling assumptions are not in the captures.
const observations=[
 [6938.5,1268,253.6,-4879,101378,975950,'W','x','x','GC','BD',0],
 [6936.0,819,163.8,-5519,65498,1103919,'W','R','x','GC','BD',0],
 [6933.5,311,62.2,-5721,24857,1144226,'A','R','x','B','BD',1],
 [6931.0,-234,-46.8,-5412,18784,1623830,'N','R','x','NS','RW',2],
 [6928.5,-734,-146.8,-4588,58727,1376467,'N','A','x','NN','RP',3],
 [6926.0,-1078,-215.6,-3403,86313,1021008,'N','A','x','NN','SD',3],
 [6923.5,-1222,-244.4,-2151,97839,645592,'N','A','x','NN','SD',3],
 [6921.0,-1225,-245.0,-1101,98032,330477,'N','S','x','NN','SD',3],
 [6918.5,-1200,-240.0,-337,96016,101141,'N','R','x','NN','SD',3],
 [6916.0,-1219,-243.8,250,97531,-49866,'N','A','D','CH','FO',4],
 [6913.5,-1234,-246.8,813,98785,-162448,'N','A','x','CH','FO',4],
 [6911.0,-1111,-222.2,1314,88927,-262735,'N','R','x','CH','FO',4],
 [6908.5,-821,-164.2,1457,65724,-291277,'N','R','x','CH','FO',4],
 [6906.0,-615,-123.0,1046,49278,-209013,'N','R','x','CH','FO',4],
 [6903.5,-765,-153.0,476,61242,-95102,'N','A','x','CH','FO',4],
 [6901.0,-1019,-203.8,365,81557,-72977,'N','A','x','CH','FO',4],
 [6898.5,-1105,-221.0,436,88471,-87107,'N','A','x','CH','FO',4],
 [6896.0,-990,-198.0,580,79204,-115829,'N','R','x','CH','FO',4],
 [6893.5,-620,-124.0,343,49607,-68518,'N','R','x','CH','FO',4],
 [6891.0,-654,-130.8,-873,52351,262041,'N','A','U','NN','RP',3],
 [6888.5,-1997,-399.4,-1849,159818,554796,'N','A','x','NN','SD',3],
 [6886.0,-3101,-620.2,-177,248149,53133,'N','A','x','NN','SD',3],
 [6883.5,-2147,-429.4,1606,171775,-321127,'N','R','D','CH','FO',4],
 [6881.0,-811,-162.2,1062,64885,-212260,'N','R','x','CH','FO',4],
 [6878.5,-393,-78.6,346,31445,-69140,'N','R','x','CH','SW',4],
 [6876.0,-261,-52.2,51,20951,-10113,'N','R','x','CH','SW',4],
 [6873.5,-133,-26.6,-115,10643,23125,'A','R','U','CF','FG',4],
 [6871.0,-95,-19.0,-420,7621,84094,'A','R','x','CF','FG',5],
 [6868.5,-254,-50.8,-663,20395,199026,'N','A','x','NS','FG',2],
 [6866.0,-502,-100.4,-600,40240,180162,'N','A','x','NN','SF',3],
 [6863.5,-692,-138.4,-235,55366,70589,'N','A','x','NN','SF',3],
 [6861.0,-749,-149.8,324,59978,-64744,'N','A','D','CH','SW',4],
 [6858.5,-645,-129.0,917,51667,-183206,'N','R','x','CH','SW',4],
 [6856.0,-408,-81.6,1360,32663,-271947,'N','R','x','CH','SW',4],
 [6853.5,-106,-21.2,1552,8558,-310219,'A','R','x','CH','SW',4],
 [6851.0,196,39.2,1464,15663,-292640,'A','A','x','WS','SW',6],
 [6848.5,452,90.4,1120,36140,-279797,'A','A','x','MS','SP',7],
 [6846.0,625,125.0,588,49974,-146914,'W','A','x','SS','SP',8],
 [6843.5,690,138.0,-29,55131,5936,'W','A','U','GC','BD',9],
 [6841.0,632,126.4,-599,50521,119806,'W','R','x','GC','BD',9],
 [6838.5,469,93.8,-973,37493,194740,'A','R','x','GC','BD',10],
 [6836.0,259,51.8,-1056,20672,211327,'A','R','x','B','DP',11],
 [6833.5,75,15.0,-855,5955,171156,'A','R','x','CF','FG',12],
 [6831.0,-33,-6.6,-475,2720,95022,'A','R','x','CF','FG',5],
 [6828.5,-59,-11.8,-51,4792,10358,'A','A','x','CF','FG',5],
 [6826.0,-25,-5.0,305,2026,-60934,'A','R','D','CH','SW',5],
 [6823.5,43,8.6,535,3368,-106872,'A','A','x','CH','SW',12],
 [6821.0,122,24.4,618,9749,-123466,'A','A','x','CH','SW',6]
];
const rows=observations.map(([price,gamma,cpt,charm,esgFlow,escFlow,tag,vf,ff,cg,trade,action])=>({
 price,gamma,cpt,charm,esgFlow,escFlow,gTag:gTags[tag],velocity:velocities[vf],flip:flips[ff],cg:cgTags[cg],
 alert:ff==='x'?null:'INFLECT',trade:trades[trade],dealerAction:actions[action],
 tradeColor:trade==='FO'?'orange':trade==='FG'||trade==='SF'?'green':null,
 highlight:price===6878.5?'spot':price===6896?'tactical':null,
 gammaMark:price===6938.5||price===6838.5?'cyan':price===6886?'red':null
}));
const columns=[
 ['price','Price'],['gamma','Gamma/CPT'],['charm','Charm'],['esgFlow','ESGFlow'],['escFlow','ESCFlow'],
 ['gTag','G-Tag'],['velocity','Velocity'],['flip','Flip'],['cg','C/G'],['alert','Alert'],['trade','Trade'],['dealerAction','Dealer Action']
].map(([key,label])=>({key,label}));
const panels={
 header:{title:'SPX Options Dashboard',spot:6879.25,spotLabel:'ES Spot',es:6880.50,range:[6729,7029],coordinate:'ES',basis:27.25,asof,refreshMinutes:10,scope:'0DTE',regime:'Transition',regimePct:2,regimeConfidence:'Uncertain',regimeMinutes:10},
 convergence:{price:6870,daily:-1183,intraday:580,label:'HIGH CONVICTION'},
 charmDaily:{minutes:60,levels:[
  {rank:1,price:6873.5,value:1836,label:'STRUCTURAL'},{rank:2,price:6876,value:1416,label:'STRUCTURAL'},{rank:3,price:6898.5,value:-1183,label:'STRUCTURAL'}
 ]},
 charmTactical:{phase:'Critical',levels:[{rank:1,name:'IDPIN1',price:6896,value:580,label:'CRITICAL TARGET',aligned:true}]},
 tactical:{pivot:6853,regime:'Transition',gamma:'Short',charm:-482,bias:'NEUTRAL',qualifier:'Watch for breakout',
  levels:[{price:6912.5,side:'Resistance',strength:'Strong'},{price:6910,side:'Resistance',strength:'Medium'},{price:6820,side:'Support',strength:'Medium'}]},
 delta:{net:-2141,bias:'BEARISH',ratio:1.74,min:-988,max:980,avg:-89.2,
  supports:[{price:6876,distance:-3.2,delta:980},{price:6871,distance:-8.2,delta:138},{price:6861,distance:-18.2,delta:454}],
  resistances:[{price:6896,distance:16.8,delta:387},{price:6916,distance:36.8,delta:174},{price:6926,distance:46.8,delta:179}]},
 momentum:{focus:6870,windows:[{minutes:15,velocity:-98.0,label:'STRONG BEARISH'},{minutes:30,velocity:-56.9,label:'STRONG BEARISH'}],strikes:[{price:6870,velocity:-321,state:'decelerating'}]},
 projections:{quality:'EXCELLENT',horizon:60,
  rows:[{minutes:15,gamma:-2412,charm:80857,confidence:75,convergence:55,trend:'STRONG'},
   {minutes:30,gamma:-4806,charm:82623,confidence:50,convergence:55,trend:'VERY_STRONG'},
   {minutes:45,gamma:-7816,charm:79224,confidence:30,convergence:55,trend:'VERY_STRONG'},
   {minutes:60,gamma:-11443,charm:71615,confidence:30,convergence:55,trend:'VERY_STRONG'}],
  next:{minutes:15,type:'momentum_shift',description:'Projected momentum shift in 15 minutes'}},
 speed:{counts:{confirmed:4,likely:1,watch:0},
  confirmed:[{price:6831,score:70,distance:-48.2,zone:6805},{price:6828.5,score:67,distance:-50.8,zone:6802.5},{price:6931,score:66,distance:51.8,zone:6905}],
  likely:[{price:6853.5,score:60,distance:-25.8,zone:null}],watch:[],insights:[{price:6805,regime:'Momentum below'},{price:6802.5,regime:'Momentum below'}]}
};
const notes=[
 'La testata distingue «ES Spot» 6.879,25 dal prezzo ES 6.880,50. Il riferimento SPX 6.852,00 è implicito nell’offset pubblicato di +27,25.',
 'Il banner di convergenza indica 6.870 con daily −1.183 e intraday +580. I pannelli di dettaglio riportano gli stessi valori a 6.898,5 e 6.896. Le coordinate sono quelle pubblicate.',
 'Il riepilogo Speed conta quattro conferme. Nella cattura sono leggibili tre livelli confermati e una zona probabile.',
 'La tabella comprende 48 prezzi leggibili fra 6.821 e 6.938,5. Il range più ampio in testata si riferisce alla copertura dichiarata.',
 'La schermata è datata 12 novembre 2025 alle 16:05:48 ET. Confidenze, segnali e istruzioni dealer sono valori riportati in quella edizione.'
];
w.OAReference={id:'oa-20251112',mode:'reference',label:'Snapshot originale · 12 novembre 2025',asof,availableAt:asof,coordinate:'ES',basis:27.25,spot:6852,spotDerived:true,priceSpot:6879.25,esSpot:6880.50,columns,rows,panels,notes};
})(window);


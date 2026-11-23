// SPXW PM fixing calendar. An indicated date is a maturity target; the contract
// identity comes from the option chain, independently of this calendar.
(function(root){
'use strict';

const NY='America/New_York', ROME='Europe/Rome', DAY=86400000;
const zoneClock=z=>new Intl.DateTimeFormat('en-GB',{
  timeZone:z,calendar:'gregory',numberingSystem:'latn',hourCycle:'h23',
  year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit'
});
const clocks={[NY]:zoneClock(NY),[ROME]:zoneClock(ROME)};
const schedules={
  2025:{closed:'01-01 01-09 01-20 02-17 04-18 05-26 06-19 07-04 09-01 11-27 12-25',short:'07-03 11-28 12-24'},
  2026:{closed:'01-01 01-19 02-16 04-03 05-25 06-19 07-03 09-07 11-26 12-25',short:'11-27 12-24'},
  2027:{closed:'01-01 01-18 02-15 03-26 05-31 06-18 07-05 09-06 11-25 12-24',short:'11-26'}
};
const scheduleCache=new Map();
const links=Object.freeze({
  hours:'https://www.cboe.com/about/hours/us-options',
  contracts:'https://www.cboe.com/tradable-products/sp-500/spx-options/spx-specifications/',
  weeklies:'https://www.cboe.com/available_weeklys/',
  archive:'https://www.cboe.com/us/options/notices/schedule_update/2025/'
});

function clockParts(ms,zone){
  const p={};
  for(const item of clocks[zone].formatToParts(ms))p[item.type]=item.value;
  return {iso:p.year+'-'+p.month+'-'+p.day,hms:p.hour+':'+p.minute+':'+p.second};
}
function dateIT(date){return date.slice(8,10)+'/'+date.slice(5,7)+'/'+date.slice(0,4);}
function clockText(ms,zone){
  const c=clockParts(ms,zone);
  return dateIT(c.iso)+' '+c.hms.slice(0,5);
}
function dateISO(ms){return new Date(ms).toISOString().slice(0,10);}
function fromUTC(y,m,d){return dateISO(Date.UTC(y,m-1,d));}
function parseDay(date){
  if(typeof date!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(date))return NaN;
  const ms=Date.parse(date+'T00:00:00Z');
  return Number.isFinite(ms)&&dateISO(ms)===date?ms:NaN;
}
function offsetDay(date,days){return dateISO(parseDay(date)+days*DAY);}
function weekDay(date){return new Date(parseDay(date)).getUTCDay();}
function nthWeekday(y,month,n,weekday){
  const first=fromUTC(y,month,1);
  return offsetDay(first,(weekday-weekDay(first)+7)%7+7*(n-1));
}
function observed(date,saturdayFriday=true){
  const w=weekDay(date);
  if(w===6&&saturdayFriday)return offsetDay(date,-1);
  return w===0?offsetDay(date,1):date;
}
function westernEaster(y){
  const a=y%19,b=Math.floor(y/100),c=y%100,d=Math.floor(b/4),e=b%4;
  const f=Math.floor((b+8)/25),g=Math.floor((b-f+1)/3);
  const h=(19*a+b-d-g+15)%30,i=Math.floor(c/4),k=c%4;
  const l=(32+2*e+2*i-h-k)%7,m=Math.floor((a+11*h+22*l)/451);
  const n=h+l-7*m+114;
  return fromUTC(y,Math.floor(n/31),n%31+1);
}
function yearSchedule(y){
  if(scheduleCache.has(y))return scheduleCache.get(y);
  const published=schedules[y],closed=new Set(),short=new Set();
  if(published){
    for(const s of published.closed.split(' '))closed.add(y+'-'+s);
    for(const s of published.short.split(' '))short.add(y+'-'+s);
  }else{
    const endMay=fromUTC(y,5,31),thanks=nthWeekday(y,11,4,4);
    // US options markets observe New Year on Monday when it falls on Sunday.
    // A January 1 Saturday does not close the preceding Friday.
    const days=[observed(fromUTC(y,1,1),false),nthWeekday(y,2,3,1),offsetDay(westernEaster(y),-2),
      offsetDay(endMay,-((weekDay(endMay)+6)%7)),observed(fromUTC(y,7,4)),nthWeekday(y,9,1,1),thanks,observed(fromUTC(y,12,25))];
    if(y>=1998)days.push(nthWeekday(y,1,3,1));
    if(y>=2022)days.push(observed(fromUTC(y,6,19)));
    for(const date of days)closed.add(date);
    for(const date of [fromUTC(y,7,3),offsetDay(thanks,1),fromUTC(y,12,24)])short.add(date);
  }
  const schedule={closed,short,verified:!!published};
  scheduleCache.set(y,schedule);
  return schedule;
}
function nyEpochAtClose(date,hour){
  // At 16:00 UTC and at a PM close New York always uses the same UTC offset.
  const probe=parseDay(date)+16*3600000;
  const local=clockParts(probe,NY);
  const wall=Date.parse(local.iso+'T'+local.hms+'Z');
  return parseDay(date)+hour*3600000-(wall-probe);
}
function fixing(date){
  const ms=parseDay(date);
  if(!Number.isFinite(ms))return {date,isSession:false,verified:false,etClose:null,epochMs:null,romeFix:null,note:'Data contrattuale non valida.'};
  const y=new Date(ms).getUTCFullYear(),s=yearSchedule(y),w=weekDay(date);
  const isSession=w!==0&&w!==6&&!s.closed.has(date);
  const reduced=isSession&&s.short.has(date);
  const epochMs=isSession?nyEpochAtClose(date,reduced?13:16):null;
  return {date,verified:s.verified,isSession,early:reduced,etClose:isSession?(reduced?'13:00':'16:00'):null,
    epochMs,romeFix:isSession?clockParts(epochMs,ROME).hms.slice(0,5):null,
    note:!s.verified?'Calendario indicativo. Confermare seduta e fixing con Cboe.':
      isSession?(reduced?'Seduta ridotta Cboe.':'Seduta ordinaria Cboe.'):'Nessun fixing SPXW PM previsto.'};
}
function businessDay(date,direction){
  let d=date;
  for(let i=0;i<14;i++,d=offsetDay(d,direction))if(fixing(d).isSession)return d;
  throw Error('Calendario SPXW indisponibile per '+date+'.');
}
function fridayTarget(base,tenor){
  const target=offsetDay(base,tenor),weekday=weekDay(target);
  // Seek the nominal Friday nearest the intended tenor, then apply the
  // exchange holiday roll to the previous business day.
  const delta=(5-weekday+10)%7-3;
  return businessDay(offsetDay(target,delta),-1);
}
function monthlyTarget(base,months){
  const day=new Date(parseDay(base));
  // Add calendar months with end-of-month clamping, then find the closest
  // listed-series convention (third-Friday PM or EOM). Only the chain proves listing.
  const y=day.getUTCFullYear(),m=day.getUTCMonth()+months;
  const end=new Date(Date.UTC(y,m+1,0)).getUTCDate();
  const target=Date.UTC(y,m,Math.min(day.getUTCDate(),end));
  const candidates=new Map();
  for(const shift of [-1,0,1]){
    const month=new Date(Date.UTC(y,m+shift,1));
    const friday=nthWeekday(month.getUTCFullYear(),month.getUTCMonth()+1,3,5);
    candidates.set(businessDay(friday,-1),'Terzo venerdì PM');
    candidates.set(businessDay(dateISO(Date.UTC(y,m+shift+1,0)),-1),'Fine mese PM');
  }
  const [date,kind]=[...candidates].sort(([a],[b])=>{
    const da=Math.abs(parseDay(a)-target),db=Math.abs(parseDay(b)-target);
    return da-db||a.localeCompare(b);
  })[0];
  return {date,rule:kind+' più vicino all’orizzonte di '+months+(months===1?' mese.':' mesi.')};
}
const tenors=Object.freeze([
  {id:'0d',label:'0DTE'}, {id:'1w',label:'1W',days:7}, {id:'2w',label:'2W',days:14},
  {id:'1m',label:'1M',months:1}, {id:'3m',label:'3M',months:3}, {id:'6m',label:'6M',months:6},
  {id:'1y',label:'1Y',months:12}
]);
function snapshot(epochMs=Date.now()){
  if(!Number.isFinite(epochMs))throw Error('Ora di riferimento non valida.');
  const nyDay=clockParts(epochMs,NY).iso,today=fixing(nyDay);
  const sessionDate=today.isSession&&epochMs<today.epochMs?nyDay:businessDay(offsetDay(nyDay,1),1);
  const rows=tenors.map(tenor=>{
    let date=sessionDate,rule='Primo fixing PM disponibile.';
    if(tenor.days){date=fridayTarget(sessionDate,tenor.days);rule='Venerdì più vicino a '+tenor.days+' giorni, anticipato se festivo.';}
    if(tenor.months){const monthly=monthlyTarget(sessionDate,tenor.months);date=monthly.date;rule=monthly.rule;}
    const f=fixing(date);
    return {...f,id:tenor.id,label:tenor.label,rule,dte:(parseDay(date)-parseDay(sessionDate))/DAY};
  });
  const upcoming=sessionDate!==nyDay;
  return {rome:clockText(epochMs,ROME),ny:clockText(epochMs,NY),sessionDate,nyDate:nyDay,upcoming,rows,
    note:upcoming?'Prossima seduta di fixing '+dateIT(sessionDate)+'.':'Seduta di fixing '+dateIT(sessionDate)+'.'};
}

root.DeskCalendar10=Object.freeze({snapshot,fixing,links,publishedYears:Object.freeze([2025,2026,2027])});
})(globalThis);

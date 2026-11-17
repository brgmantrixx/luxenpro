import React, { useEffect, useMemo, useRef, useState } from 'react';
import { api_base } from '@/external/bot-skeleton';
import './luxen-market-scanner.scss';

type Market = { symbol: string; display_name: string; precision?: number };
type Tick = { quote: string; epoch: number; digit: number };
type SignalKey = 'ODD'|'EVEN'|'OVER_2'|'OVER_3'|'UNDER_7'|'UNDER_6';
type Signal = {key:SignalKey;title:string;side:string;entry:number;percent:number;detail:string};
type Direction = 'up'|'down'|'flat'|'new';
const WINDOWS=[1000,500,200,100] as const;
const marketGroup=(m:any)=>{const n=String(m.display_name||m.underlying_symbol_name||'').toLowerCase(),s=String(m.symbol||m.underlying_symbol||'').toUpperCase(),sub=String(m.submarket||m.submarket_display_name||'').toLowerCase();if(/1s/.test(n)||/^1HZ\d+V?$/.test(s))return 'Volatility (1s)';if(/jump/.test(n)||/jump/.test(sub)||/^JD\d+/.test(s))return 'Jump';if(/volatility/.test(n)||/random/.test(sub)||/^R_\d+V?$/.test(s))return 'Volatility';return '';};
const precisionFrom=(p?:number)=>{if(!p||!Number.isFinite(p)||p<=0)return undefined;const s=String(p);return s.includes('e-')?Number(s.split('e-')[1]):(s.split('.')[1]||'').length;};
const getDigit=(q:string|number,p?:number)=>{const s=p===undefined?String(q):Number(q).toFixed(p);const d=(s.split('.')[1]||'').slice(-1);return /^\d$/.test(d)?Number(d):null;};
const pct=(n:number,t:number)=>t?n/t*100:0;
const analyze=(sample:Tick[])=>{
 const counts=Array(10).fill(0) as number[];sample.forEach(t=>counts[t.digit]++);
 const total=sample.length, digitPct=counts.map(c=>pct(c,total));
 const odd=counts.reduce((n,c,d)=>n+(d%2?c:0),0),even=total-odd;
 const over2=counts.slice(3).reduce((a,b)=>a+b,0),over3=counts.slice(4).reduce((a,b)=>a+b,0);
 const under7=counts.slice(0,7).reduce((a,b)=>a+b,0),under6=counts.slice(0,6).reduce((a,b)=>a+b,0);
 const sorted=counts.map((count,digit)=>({count,digit})).sort((a,b)=>b.count-a.count);
 const top=sorted[0],second=sorted.find(x=>x.count<top.count);
 const green=top&&counts.filter(x=>x===top.count).length===1?top.digit:null;
 const blue=second&&counts.filter(x=>x===second.count).length===1&&green!==null?second.digit:null;
 const least=(digits:number[])=>digits.reduce((a,b)=>counts[b]<counts[a]?b:a,digits[0]);
 const oddStrong=[1,3,5,7,9].filter(d=>digitPct[d]>10).length,oddWeak=[0,2,4,6,8].filter(d=>digitPct[d]<10).length;
 const evenStrong=[0,2,4,6,8].filter(d=>digitPct[d]>10).length,evenWeak=[1,3,5,7,9].filter(d=>digitPct[d]<10).length;
 const topOver=[4,5,6,7,8,9].includes(green??-1)&&[4,5,6,7,8,9].includes(blue??-1);
 const topUnder=[0,1,2,3,4,5].includes(green??-1)&&[0,1,2,3,4,5].includes(blue??-1);
 const percentages={ODD:pct(odd,total),EVEN:pct(even,total),OVER_2:pct(over2,total),OVER_3:pct(over3,total),UNDER_7:pct(under7,total),UNDER_6:pct(under6,total)};
 const signals:Signal[]=[];
 if(green!==null&&blue!==null&&green%2===1&&blue%2===1&&percentages.ODD>51.5&&oddStrong>=4&&oddWeak>=4)signals.push({key:'ODD',title:'ODD',side:'EVEN / ODD',entry:least([0,2,4,6,8]),percent:percentages.ODD,detail:'Green + blue are odd; odd strength and even weakness confirmed.'});
 if(green!==null&&blue!==null&&green%2===0&&blue%2===0&&percentages.EVEN>51.5&&evenStrong>=4&&evenWeak>=4)signals.push({key:'EVEN',title:'EVEN',side:'EVEN / ODD',entry:least([1,3,5,7,9]),percent:percentages.EVEN,detail:'Green + blue are even; even strength and odd weakness confirmed.'});
 if([0,1,2].every(d=>digitPct[d]<9.9)&&percentages.OVER_2>71.5&&topOver)signals.push({key:'OVER_2',title:'OVER 2',side:'OVER / UNDER',entry:least([1,2]),percent:percentages.OVER_2,detail:'Digits 0–2 below 9.9%; green + blue in 4–9.'});
 if([0,1,2,3].every(d=>digitPct[d]<9.9)&&percentages.OVER_3>61.5&&topOver)signals.push({key:'OVER_3',title:'OVER 3',side:'OVER / UNDER',entry:least([1,2,3]),percent:percentages.OVER_3,detail:'Digits 0–3 below 9.9%; green + blue in 4–9.'});
 if([7,8,9].every(d=>digitPct[d]<9.9)&&percentages.UNDER_7>71.5&&topUnder)signals.push({key:'UNDER_7',title:'UNDER 7',side:'OVER / UNDER',entry:least([7,8]),percent:percentages.UNDER_7,detail:'Digits 7–9 below 9.9%; green + blue in 0–5.'});
 if([6,7,8,9].every(d=>digitPct[d]<9.9)&&percentages.UNDER_6>61.5&&topUnder)signals.push({key:'UNDER_6',title:'UNDER 6',side:'OVER / UNDER',entry:least([6,7,8]),percent:percentages.UNDER_6,detail:'Digits 6–9 below 9.9%; green + blue in 0–5.'});
 return {counts,digitPct,green,blue,percentages,signals};
};
type MarketScan = { ticks: Tick[]; loading: boolean; error?: string };
const SIGNAL_ORDER: SignalKey[] = ['EVEN','ODD','OVER_2','OVER_3','UNDER_7'];
const LuxenMarketScanner=()=>{
 const [markets,setMarkets]=useState<Market[]>([]);
 const [scans,setScans]=useState<Record<string,MarketScan>>({});
 const [loading,setLoading]=useState(true),[error,setError]=useState('');
 const [paused,setPaused]=useState(false);
 const pausedRef=useRef(false),buffers=useRef<Record<string,Tick[]>>({});
 const [signalCountdown,setSignalCountdown]=useState(25);
 const signalSignatureRef=useRef('');
 const refreshMarkets=async()=>{
  setLoading(true);setError('');
  try{
   if(!api_base.api)throw new Error('Deriv connection is not ready. Sign in or reconnect first.');
   let r:any=await api_base.api.send({active_symbols:'brief'});
   if(r?.error)throw new Error(r.error.message||'Could not load Deriv markets');
   let raw=r?.active_symbols||r?.data?.active_symbols||[];
   if(!Array.isArray(raw)||!raw.length){r=await api_base.api.send({active_symbols:'full'});if(r?.error)throw new Error(r.error.message);raw=r?.active_symbols||r?.data?.active_symbols||[];}
   const list:Market[]=(Array.isArray(raw)?raw:[]).map((m:any)=>{
    const symbol=String(m.symbol||m.underlying_symbol||'');
    return {...m,symbol,display_name:m.display_name||m.underlying_symbol_name||symbol,precision:api_base.pip_sizes?.[symbol]??precisionFrom(m.pip_size??m.pip)};
   }).filter((m:any)=>m.symbol&&marketGroup(m));
   const unique=Array.from(new Map(list.map(m=>[m.symbol,m])).values()).sort((a,b)=>a.display_name.localeCompare(b.display_name,undefined,{numeric:true}));
   setMarkets(unique);
   if(!unique.length)throw new Error('Deriv returned instruments, but none matched the supported Volatility, Volatility (1s), or Jump markets.');
  }catch(e){setError(e instanceof Error?e.message:'Unable to discover Deriv markets');}
  finally{setLoading(false);}
 };
 useEffect(()=>{void refreshMarkets();},[]);
 useEffect(()=>{
  if(!markets.length||!api_base.api)return;
  let active=true;const subscriptions:(string|number)[]=[];
  buffers.current={};
  setScans(Object.fromEntries(markets.map(m=>[m.symbol,{ticks:[],loading:true}])));
  const precisionFor=(symbol:string)=>markets.find(m=>m.symbol===symbol)?.precision;
  const accept=(symbol:string,q:string|number,epoch:number)=>{
   if(!active||pausedRef.current||!Number.isFinite(epoch))return;
   const digit=getDigit(q,precisionFor(symbol));if(digit===null)return;
   const tick:Tick={quote:String(q),epoch,digit};
   const old=buffers.current[symbol]||[];
   if(old.some(t=>t.epoch===epoch&&t.quote===tick.quote))return;
   const next=[...old,tick].sort((a,b)=>a.epoch-b.epoch).slice(-1000);
   buffers.current[symbol]=next;
   setScans(current=>({...current,[symbol]:{ticks:next,loading:next.length<1000}}));
  };
  const stream=api_base.api.onMessage().subscribe(({data}:any)=>{
   if(data?.msg_type!=='tick'||!data?.tick?.symbol)return;
   accept(String(data.tick.symbol),data.tick.quote,Number(data.tick.epoch));
  });
  const startMarket=async(m:Market)=>{
   try{
    const r:any=await api_base.api!.send({ticks_history:m.symbol,count:1000,end:'latest',style:'ticks',subscribe:1});
    if(!active){if(r?.subscription?.id)api_base.api?.send({forget:r.subscription.id});return;}
    if(r?.error)throw new Error(r.error.message||'Tick history request failed');
    if(r?.subscription?.id)subscriptions.push(r.subscription.id);
    const prices=r?.history?.prices||[],times=r?.history?.times||[];
    const history:Tick[]=prices.map((q:string|number,i:number)=>{const digit=getDigit(q,m.precision);return digit===null?null:{quote:String(q),epoch:Number(times[i]),digit};}).filter((t:Tick|null):t is Tick=>!!t&&Number.isFinite(t.epoch));
    const live=buffers.current[m.symbol]||[];
    const merged=[...history,...live].sort((a,b)=>a.epoch-b.epoch).filter((t,i,a)=>i===0||t.epoch!==a[i-1].epoch||t.quote!==a[i-1].quote).slice(-1000);
    buffers.current[m.symbol]=merged;
    if(active)setScans(current=>({...current,[m.symbol]:{ticks:merged,loading:merged.length<1000}}));
   }catch(e){
    if(active)setScans(current=>({...current,[m.symbol]:{ticks:buffers.current[m.symbol]||[],loading:false,error:e instanceof Error?e.message:'Tick feed failed'}}));
   }
  };
  void Promise.all(markets.map(startMarket));
  return()=>{active=false;stream.unsubscribe();subscriptions.forEach(id=>api_base.api?.send({forget:id}));};
 },[markets]);
 const rows=useMemo(()=>markets.map(m=>{
  const scan=scans[m.symbol];const ready=!!scan&&scan.ticks.length>=1000;
  const result=ready?analyze(scan.ticks.slice(-1000)):null;
  const signals=(result?.signals||[]).filter(s=>SIGNAL_ORDER.includes(s.key));
  return {market:m,scan,ready,result,signals};
 }),[markets,scans]);
 const signalRows=rows.flatMap(row=>row.signals.map(signal=>({market:row.market,signal})));
 const signalSignature=signalRows.map(x=>x.market.symbol+':'+x.signal.key+':'+x.signal.entry).sort().join('|');
 useEffect(()=>{
  if(!signalSignature){signalSignatureRef.current='';return;}
  if(signalSignature===signalSignatureRef.current)return;
  signalSignatureRef.current=signalSignature;
  setSignalCountdown(25);
  let remaining=25;
  const timer=window.setInterval(()=>{remaining-=1;setSignalCountdown(Math.max(0,remaining));if(remaining<=0)window.clearInterval(timer);},1000);
  return()=>window.clearInterval(timer);
 },[signalSignature]);

 const activeSignalRows=signalCountdown>0?signalRows:[];
 const category=(m:Market)=>marketGroup(m);
 const counts={ready:rows.filter(r=>r.ready).length,errors:rows.filter(r=>r.scan?.error).length,total:markets.length};
 const pause=()=>{pausedRef.current=true;setPaused(true);};
 const resume=()=>{pausedRef.current=false;setPaused(false);};
 return <section className='luxen-market-scanner lms-multi'>
  <header className='lms-header'><div><span className='lms-eyebrow'>LUXENPRO · LIVE DERIV INTELLIGENCE</span><h1>Luxen Market Scanner</h1><p>Scanning every supported Volatility and Jump market against your five signal rule sets.</p></div><b className={'lms-status '+(error?'lms-status--error':paused?'lms-status--paused':counts.ready===counts.total&&counts.total?'lms-status--live':'')}>{error?'ERROR':paused?'PAUSED':loading?'LOADING':counts.ready===counts.total&&counts.total?'ALL MARKETS LIVE':'SCANNING'}</b></header>
  <div className='lms-toolbar lms-multi-toolbar'><div className='lms-multi-counts'><strong>{counts.ready} / {counts.total} READY</strong><span>{activeSignalRows.length} active signals</span><span>{counts.errors} feed errors</span></div><div className='lms-countdown' role='status'><div><b>{signalCountdown>0?`SIGNAL WINDOW · ${signalCountdown}s`:'SIGNAL WINDOW EXPIRED'}</b><span>{signalCountdown>0?'Signal validity countdown':'Waiting for a new qualifying setup'}</span></div><i><em style={{width:(signalCountdown/25*100)+'%'}}/></i></div><div className='lms-controls'><button onClick={()=>void refreshMarkets()} disabled={loading}>{loading?'Loading…':'↻ Refresh markets'}</button><button onClick={paused?resume:pause}>{paused?'Resume all feeds':'Pause all feeds'}</button></div></div>
  {error&&<div className='lms-error' role='alert'>{error}</div>}
  <div className='lms-overview'>{(['EVEN','ODD','OVER_2','OVER_3','UNDER_7'] as SignalKey[]).map(k=><div key={k}><small>{k.replace('_',' ')}</small><b>{activeSignalRows.filter(x=>x.signal.key===k).length} SIGNALS</b></div>)}</div>
  <section className='lms-results'><header><div><span>LIVE SCAN RESULTS</span><h2>Markets meeting your conditions</h2><p>Only markets with a complete 1,000-tick sample and every rule for that signal are listed.</p></div><b>{signalRows.length} MATCHES</b></header>
   {activeSignalRows.length?<div className='lms-results-table'><div className='lms-result-head'><span>MARKET</span><span>CONDITION</span><span>ENTRY DIGIT</span><span>CONFIRMATION</span></div>{activeSignalRows.map(({market,signal})=><article className='lms-result-row' key={market.symbol+'-'+signal.key}><div><strong>{market.display_name}</strong><small>{market.symbol} · {category(market)}</small></div><b className={'lms-condition lms-condition--'+signal.key.toLowerCase()}>{signal.title}</b><strong className='lms-result-digit'>{signal.entry}</strong><span>{signal.percent.toFixed(2)}% overall<br/><small>{signal.detail}</small></span></article>)}</div>:<div className='lms-empty lms-all-empty'><b>{signalRows.length&&signalCountdown===0?'SIGNAL WINDOW EXPIRED':counts.ready===0?'BUILDING 1,000-TICK SAMPLES':'NO MARKETS CURRENTLY MEET THE RULES'}</b><p>{signalRows.length&&signalCountdown===0?'This signal set has timed out after 25 seconds. Wait for a fresh qualifying setup before entering.':counts.ready===0?'The scanner is loading historical ticks and starting live subscriptions for every supported market.':'All supported markets are being monitored. A result appears only when every condition for a strategy is satisfied.'}</p></div>}
  </section>
  <section className='lms-market-status'><header><h2>Market feed monitor</h2><span>{counts.ready} live-ready / {counts.total} markets</span></header><div className='lms-market-groups'>{(['Volatility (1s)','Volatility','Jump']).map(group=><div className='lms-market-group' key={group}><h3>{group}</h3>{rows.filter(r=>category(r.market)===group).map(row=><div className='lms-market-item' key={row.market.symbol}><span>{row.market.display_name}</span><b className={row.scan?.error?'has-error':row.ready?'is-ready':'is-loading'}>{row.scan?.error?'ERROR':row.ready?'LIVE · 1,000 TICKS':(row.scan?.ticks.length||0)+'/1,000'}</b></div>)}</div>)}</div></section>
  <p className='lms-disclaimer'>Signals are based on the latest 1,000 ticks per market and are historical-frequency filters, not guarantees of the next digit. All supported market feeds use your connected Deriv session.</p>
 </section>;
};
export default LuxenMarketScanner;

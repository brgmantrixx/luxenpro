import React, { useMemo, useState } from 'react';
import { observer } from 'mobx-react-lite';
import { useStore } from '../../hooks/useStore';
import { DBOT_TABS } from '../../constants/bot-contents';
import './luxen-dashboard.scss';
import DCircles from './d-circles';

type Section = 'Dashboard' | 'Premium Bots' | 'Free Bots' | 'D-Circles' | 'Speed Lab' | 'Pro Hedge' | 'Risk Calculator' | 'Charts' | 'Manual Trading';
const nav: { label: Section; icon: string }[] = [
    { label: 'Premium Bots', icon: '♛' }, { label: 'Dashboard', icon: '▦' }, { label: 'Free Bots', icon: '⬢' },
    { label: 'D-Circles', icon: '●' }, { label: 'Speed Lab', icon: 'ϟ' }, { label: 'Pro Hedge', icon: '⇄' },
    { label: 'Risk Calculator', icon: '▣' }, { label: 'Charts', icon: '◔' }, { label: 'Manual Trading', icon: '◈' },
];
const bots = [
    ['01','Concept AI','OVER / UNDER','Concept Block strategy with martingale staking. Waits for your Entry Digit, then trades until you stop.','blue'],
    ['02','UN HnR','EVEN / ODD','Undaglobal even/odd hit-and-run strategy with quick recovery logic.','red'],
    ['03','UN Digit Switcher','OVER / UNDER','Undaglobal over/under bot that switches digit targets automatically. Waits for your Entry Digit, then trades until you stop.','blue'],
    ['04','UN Sequence Rotator','D0 · 00 · 01','Differs 0 → Over 0 → Over 1 loop with even/odd recovery, martingale staking and volatility market rotation.','red'],
    ['05','UN Sequence Under','D9 · U9 · U8','Mirror of UN Sequence Rotator: Differs 9 → Under 9 → Under 8 loop with recovery and market rotation logic.','blue'],
    ['06','UN Radar','OVER / UNDER','Over/Under digit bot. Change Initial Stake, Martingale, Take Profit, Stop Loss and Prediction in setup blocks.','cyan'],
    ['07','UN Even odd Auto','EVEN / ODD · AUTO','2 consecutive evens → buy Even; 2 consecutive odds → buy Odd. Editable stake, take profit and stop loss.','red'],
    ['08','UN Even odd Manual','EVEN / ODD · MANUAL','Manual Even/Odd: choose contract side. Editable stake, martingale, take profit and stop loss.','red'],
];
const RobotArt = ({ tone, id }: { tone: string; id: string }) => <div className={`luxen-bot-art luxen-bot-art--${tone}`} aria-hidden='true'>
    <div className='luxen-art-grid'/><div className='luxen-art-orbit'/><div className='luxen-art-orbit luxen-art-orbit--two'/>
    <div className='luxen-robot'><div className='luxen-robot__antenna'/><div className='luxen-robot__head'><i/><i/></div><div className='luxen-robot__neck'/><div className='luxen-robot__body'><span>{id}</span></div><div className='luxen-robot__arm luxen-robot__arm--left'/><div className='luxen-robot__arm luxen-robot__arm--right'/></div>
    <span className='luxen-art-data luxen-art-data--left'>0 2 4 6 8</span><span className='luxen-art-data luxen-art-data--right'>1 3 7 9</span><span className='luxen-art-caption'>AI STRATEGY ENGINE</span>
</div>;

const Dashboard = observer(() => {
    const { dashboard } = useStore();
    const { setActiveTab } = dashboard;
    const [section, setSection] = useState<Section>('Free Bots');
    const [balance, setBalance] = useState('100');
    const [risk, setRisk] = useState('2');
    const [stopLoss, setStopLoss] = useState('30');
    const [pipValue, setPipValue] = useState('1');
    const riskAmount = useMemo(() => Math.max(0, Number(balance) * Number(risk) / 100 || 0), [balance, risk]);
    const lot = useMemo(() => Number(stopLoss) > 0 && Number(pipValue) > 0 ? riskAmount / (Number(stopLoss) * Number(pipValue)) : 0, [riskAmount, stopLoss, pipValue]);
    const builder = () => setActiveTab(DBOT_TABS.BOT_BUILDER);
    const select = (s: Section) => {
        if (s === 'Charts' || s === 'Manual Trading') { setActiveTab(DBOT_TABS.CHART); return; }
        setSection(s);
    };
    return <div className='luxen-dashboard'>
        <nav className='luxen-subnav' aria-label='Trading modules'><button className='luxen-filter' aria-label='Filters'>☷</button>
            {nav.map(item => <button key={item.label} onClick={() => select(item.label)} className={`luxen-nav-pill ${section === item.label ? 'is-active' : ''}`}><span>{item.icon}</span>{item.label}</button>)}
        </nav>
        {section === 'Free Bots' && <section className='luxen-marketplace'>
            <div className='luxen-section-heading'><div><span className='luxen-eyebrow'>BOT MARKETPLACE</span><h1>Free Bots</h1><p>Choose a strategy, load it into Bot Builder, and configure your own risk settings.</p></div><span className='luxen-open-count'>8 OPEN ACCESS</span></div>
            <div className='luxen-bot-grid'>{bots.map(([id,name,market,description,tone]) => <article className='luxen-bot-card' key={id}>
                <div className='luxen-card-visual'><span className={`luxen-market-tag luxen-market-tag--${tone}`}>{market}</span><span className='luxen-card-number'>{id}</span><RobotArt tone={tone} id={id}/><span className='luxen-access'>OPEN ACCESS</span></div>
                <div className='luxen-card-content'><h2><span>{id}</span>{name}</h2><p>{description}</p><button className='luxen-load-button' onClick={builder}>Load bot <b>→</b></button></div>
            </article>)}</div>
        </section>}
        {section === 'Dashboard' && <section className='luxen-module-page'><span className='luxen-eyebrow'>ACCOUNT OVERVIEW</span><h1>Dashboard</h1><p className='luxen-module-lead'>Your Deriv trading workspace at a glance.</p><div className='luxen-stat-grid'><div className='luxen-stat-card'><small>CONNECTION</small><strong>Deriv API</strong><span>Existing connection retained</span></div><div className='luxen-stat-card'><small>BOT WORKSPACE</small><strong>Ready</strong><span>Open Bot Builder to create a strategy</span></div><div className='luxen-stat-card'><small>BOT LIBRARY</small><strong>8</strong><span>Free strategy templates</span></div></div><button className='luxen-primary-action' onClick={builder}>Open Bot Builder →</button></section>}
        {section === 'Premium Bots' && <section className='luxen-module-page'><span className='luxen-eyebrow'>MEMBERS AREA</span><h1>Premium Bots</h1><p className='luxen-module-lead'>Premium strategies will appear here when your membership and licensing service is connected.</p><div className='luxen-empty-state'><span>♛</span><h2>Premium strategy library</h2><p>No premium bots have been connected yet.</p></div></section>}
        {section === 'D-Circles' && <DCircles />}
        {section === 'Speed Lab' && <section className='luxen-module-page'><span className='luxen-eyebrow'>MARKET RESEARCH</span><h1>Speed Lab</h1><p className='luxen-module-lead'>A workspace for rapid digit movement and short-window volatility studies.</p><div className='luxen-empty-state'><span>ϟ</span><h2>Tick-speed monitor</h2><p>Connect a symbol and tick subscription to display live speed metrics.</p></div></section>}
        {section === 'Pro Hedge' && <section className='luxen-module-page'><span className='luxen-eyebrow'>ADVANCED STRATEGIES</span><h1>Pro Hedge</h1><p className='luxen-module-lead'>A dedicated workspace for configuring hedge and recovery strategies.</p><div className='luxen-empty-state'><span>⇄</span><h2>Hedge workspace</h2><p>Strategy execution is not enabled in this module yet.</p></div></section>}
        {section === 'Risk Calculator' && <section className='luxen-module-page'><span className='luxen-eyebrow'>POSITION SIZING</span><h1>Risk Management Calculator</h1><p className='luxen-module-lead'>Estimate account risk and position size before placing a trade.</p><div className='luxen-calculator'><div className='luxen-calc-fields'>
            <label>Account balance (USD)<input type='number' min='0' value={balance} onChange={e=>setBalance(e.target.value)}/></label><label>Risk per trade (%)<input type='number' min='0' max='100' step='0.1' value={risk} onChange={e=>setRisk(e.target.value)}/></label><label>Stop loss (pips)<input type='number' min='0' step='0.1' value={stopLoss} onChange={e=>setStopLoss(e.target.value)}/></label><label>Value per pip per 1.00 lot (USD)<input type='number' min='0' step='0.01' value={pipValue} onChange={e=>setPipValue(e.target.value)}/></label>
        </div><div className='luxen-calc-result'><small>ESTIMATED RISK AMOUNT</small><strong>${riskAmount.toFixed(2)}</strong><span>Suggested lot size</span><b>{lot.toFixed(3)} lots</b><p>Estimate only. Confirm the contract's actual pip value, minimum lot and volume step before trading.</p></div></div></section>}
    </div>;
});
export default Dashboard;

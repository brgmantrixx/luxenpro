import React, { useMemo, useState } from 'react';
import { observer } from 'mobx-react-lite';
import { useStore } from '../../hooks/useStore';
import { DBOT_TABS } from '../../constants/bot-contents';
import DerivDashboardFeatures from './dashboard';
import './luxen-dashboard.scss';

type Section = 'Dashboard' | 'Premium Bots' | 'Free Bots' | 'D-Circles' | 'Speed Lab' | 'Pro Hedge' | 'Risk Calculator' | 'Charts' | 'Manual Trading';
const RobotArt = ({ tone, id }: { tone: string; id: string }) => <div className={`luxen-bot-art luxen-bot-art--${tone}`} aria-hidden='true'>
    <div className='luxen-art-grid'/><div className='luxen-art-orbit'/><div className='luxen-art-orbit luxen-art-orbit--two'/>
    <div className='luxen-robot'><div className='luxen-robot__antenna'/><div className='luxen-robot__head'><i/><i/></div><div className='luxen-robot__neck'/><div className='luxen-robot__body'><span>{id}</span></div><div className='luxen-robot__arm luxen-robot__arm--left'/><div className='luxen-robot__arm luxen-robot__arm--right'/></div>
    <span className='luxen-art-data luxen-art-data--left'>0 2 4 6 8</span><span className='luxen-art-data luxen-art-data--right'>1 3 7 9</span><span className='luxen-art-caption'>AI STRATEGY ENGINE</span>
</div>;

const Dashboard = observer(({ section = 'Dashboard', handleTabChange }: { section?: Section; handleTabChange: (tab: number) => void }) => {
    const { dashboard } = useStore();
    const { setActiveTab } = dashboard;
    const [balance, setBalance] = useState('100');
    const [risk, setRisk] = useState('2');
    const [stopLoss, setStopLoss] = useState('30');
    const [pipValue, setPipValue] = useState('1');
    const riskAmount = useMemo(() => Math.max(0, Number(balance) * Number(risk) / 100 || 0), [balance, risk]);
    const lot = useMemo(() => Number(stopLoss) > 0 && Number(pipValue) > 0 ? riskAmount / (Number(stopLoss) * Number(pipValue)) : 0, [riskAmount, stopLoss, pipValue]);
    const builder = () => setActiveTab(DBOT_TABS.BOT_BUILDER);
    return <div className='luxen-dashboard'>
        {section === 'Free Bots' && <section className='luxen-marketplace'>
            <div className='luxen-section-heading'><div><span className='luxen-eyebrow'>BOT MARKETPLACE</span><h1>Free Bots</h1><p>The free bot catalogue has been cleared.</p></div><span className='luxen-open-count'>0 BOTS</span></div>
            <div className='luxen-empty-state luxen-free-bots-empty'><span>⬢</span><h2>No free bots available</h2><p>There are currently no bots listed in the Free Bots section.</p></div>
        </section>}
        {section === 'Dashboard' && <section className='luxen-module-page'><span className='luxen-eyebrow'>ACCOUNT OVERVIEW</span><h1>Dashboard</h1><p className='luxen-module-lead'>Your Deriv trading workspace at a glance.</p><div className='luxen-stat-grid'><div className='luxen-stat-card'><small>CONNECTION</small><strong>Deriv API</strong><span>Existing Deriv connection and account tools</span></div><div className='luxen-stat-card'><small>BOT WORKSPACE</small><strong>Ready</strong><span>Build, import or open a saved strategy below</span></div><div className='luxen-stat-card'><small>FREE BOT LIBRARY</small><strong>0</strong><span>No free strategy templates listed</span></div></div><button className='luxen-primary-action' onClick={builder}>Open Bot Builder →</button><div className='luxen-deriv-dashboard'><DerivDashboardFeatures handleTabChange={handleTabChange} /></div></section>}
        {section === 'Premium Bots' && <section className='luxen-module-page'><span className='luxen-eyebrow'>MEMBERS AREA</span><h1>Premium Bots</h1><p className='luxen-module-lead'>Premium strategies will appear here when your membership and licensing service is connected.</p><div className='luxen-empty-state'><span>♛</span><h2>Premium strategy library</h2><p>No premium bots have been connected yet.</p></div></section>}
        {section === 'D-Circles' && <section className='luxen-module-page'><span className='luxen-eyebrow'>LIVE DIGIT INTELLIGENCE</span><h1>D-Circles Analysis</h1><p className='luxen-module-lead'>Digit distribution, occurrence percentages, Even/Odd and Over/Under analysis.</p><div className='luxen-digit-panel'><div className='luxen-panel-title'><h2>Digit distribution · 0–9</h2><span className='luxen-live-indicator'>● Awaiting tick stream</span></div><div className='luxen-digit-row'>{Array.from({length:10},(_,n)=><div className='luxen-digit-cell' key={n}><b>{n}</b><span>—</span></div>)}</div><p className='luxen-muted'>Live percentages will populate from the connected Deriv tick stream. No sample percentages are presented as live data.</p></div><div className='luxen-analysis-grid'><div className='luxen-stat-card'><small>EVEN / ODD</small><strong>Waiting for ticks</strong><span>Occurrence split and trend</span></div><div className='luxen-stat-card'><small>OVER / UNDER</small><strong>Waiting for ticks</strong><span>Digit barrier distribution</span></div><div className='luxen-stat-card'><small>LAST DIGITS</small><strong>—</strong><span>Recent tick history</span></div></div></section>}
        {section === 'Speed Lab' && <section className='luxen-module-page'><span className='luxen-eyebrow'>MARKET RESEARCH</span><h1>Speed Lab</h1><p className='luxen-module-lead'>A workspace for rapid digit movement and short-window volatility studies.</p><div className='luxen-empty-state'><span>ϟ</span><h2>Tick-speed monitor</h2><p>Connect a symbol and tick subscription to display live speed metrics.</p></div></section>}
        {section === 'Pro Hedge' && <section className='luxen-module-page'><span className='luxen-eyebrow'>ADVANCED STRATEGIES</span><h1>Pro Hedge</h1><p className='luxen-module-lead'>A dedicated workspace for configuring hedge and recovery strategies.</p><div className='luxen-empty-state'><span>⇄</span><h2>Hedge workspace</h2><p>Strategy execution is not enabled in this module yet.</p></div></section>}
        {section === 'Risk Calculator' && <section className='luxen-module-page'><span className='luxen-eyebrow'>POSITION SIZING</span><h1>Risk Management Calculator</h1><p className='luxen-module-lead'>Estimate account risk and position size before placing a trade.</p><div className='luxen-calculator'><div className='luxen-calc-fields'>
            <label>Account balance (USD)<input type='number' min='0' value={balance} onChange={e=>setBalance(e.target.value)}/></label><label>Risk per trade (%)<input type='number' min='0' max='100' step='0.1' value={risk} onChange={e=>setRisk(e.target.value)}/></label><label>Stop loss (pips)<input type='number' min='0' step='0.1' value={stopLoss} onChange={e=>setStopLoss(e.target.value)}/></label><label>Value per pip per 1.00 lot (USD)<input type='number' min='0' step='0.01' value={pipValue} onChange={e=>setPipValue(e.target.value)}/></label>
        </div><div className='luxen-calc-result'><small>ESTIMATED RISK AMOUNT</small><strong>${riskAmount.toFixed(2)}</strong><span>Suggested lot size</span><b>{lot.toFixed(3)} lots</b><p>Estimate only. Confirm the contract's actual pip value, minimum lot and volume step before trading.</p></div></div></section>}
    </div>;
});
export default Dashboard;

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { api_base } from '@/external/bot-skeleton';

type Market = { symbol: string; display_name: string; market: string; submarket?: string; pip_size?: number };
type Tick = { quote: string; epoch: number; digit: number };
type Status = 'CONNECTING' | 'LIVE' | 'PAUSED' | 'DISCONNECTED' | 'ERROR';
const WINDOW_SIZE = 1000;

const marketGroup = (market: Market) => {
    const name = market.display_name.toLowerCase();
    if (/\(1s\)|1s/.test(name) || /^1hz/.test(market.symbol.toLowerCase())) return 'Volatility (1s)';
    if (/jump/.test(name) || /^jd/.test(market.symbol.toLowerCase())) return 'Jump';
    if (/volatility/.test(name) || /^r_(10|25|50|75|100)$/.test(market.symbol.toLowerCase())) return 'Volatility';
    return '';
};

const decimalPlaces = (pipSize?: number) => {
    if (!pipSize || !Number.isFinite(pipSize) || pipSize <= 0) return undefined;
    const text = pipSize.toString();
    return text.includes('e-') ? Number(text.split('e-')[1]) : (text.split('.')[1] || '').length;
};

const digitFromQuote = (quote: string | number, pipSize?: number) => {
    const raw = String(quote);
    const places = decimalPlaces(pipSize);
    const normalized = places === undefined ? raw : Number(raw).toFixed(places);
    const fraction = normalized.split('.')[1] || '';
    const last = fraction.slice(-1);
    return /^\d$/.test(last) ? Number(last) : null;
};

const rankDigits = (counts: number[]) => {
    const sorted = counts.map((count, digit) => ({ digit, count })).sort((a, b) => b.count - a.count || a.digit - b.digit);
    const topCount = sorted[0]?.count ?? 0;
    const secondCount = sorted.find(item => item.count < topCount)?.count;
    const bottomCount = sorted[sorted.length - 1]?.count ?? 0;
    const secondBottomCount = sorted.find(item => item.count > bottomCount)?.count;
    const uniqueTop = topCount > 0 && sorted.filter(item => item.count === topCount).length === 1;
    const uniqueSecond = secondCount !== undefined && sorted.filter(item => item.count === secondCount).length === 1;
    const uniqueBottom = bottomCount >= 0 && sorted.filter(item => item.count === bottomCount).length === 1;
    const uniqueSecondBottom = secondBottomCount !== undefined && sorted.filter(item => item.count === secondBottomCount).length === 1;
    return {
        top: uniqueTop ? sorted[0].digit : null,
        second: uniqueTop && uniqueSecond ? sorted.find(item => item.count === secondCount)?.digit ?? null : null,
        bottom: uniqueBottom ? sorted[sorted.length - 1].digit : null,
        secondBottom: uniqueBottom && uniqueSecondBottom ? sorted.find(item => item.count === secondBottomCount)?.digit ?? null : null,
    };
};

const formatTime = (epoch: number) => new Date(epoch * 1000).toLocaleTimeString();
const patternText = (ticks: Tick[], predicate: (digit: number) => boolean, yes: string, no: string) =>
    ticks.slice(-20).map(tick => predicate(tick.digit) ? yes : no);

const DCircles = () => {
    const [markets, setMarkets] = useState<Market[]>([]);
    const [symbol, setSymbol] = useState('');
    const [ticks, setTicks] = useState<Tick[]>([]);
    const [status, setStatus] = useState<Status>('CONNECTING');
    const [error, setError] = useState('');
    const [paused, setPaused] = useState(false);
    const [latestTick, setLatestTick] = useState<Tick | null>(null);
    const [received, setReceived] = useState(0);
    const [marketLoading, setMarketLoading] = useState(true);

    const selectedMarket = markets.find(market => market.symbol === symbol);
    const counts = useMemo(() => {
        const result = Array(10).fill(0) as number[];
        ticks.forEach(tick => { result[tick.digit] += 1; });
        return result;
    }, [ticks]);
    const ranking = useMemo(() => rankDigits(counts), [counts]);
    const evenCount = counts.reduce((sum, count, digit) => sum + (digit % 2 === 0 ? count : 0), 0);
    const oddCount = ticks.length - evenCount;
    const overCount = counts.slice(5).reduce((sum, count) => sum + count, 0);
    const underCount = ticks.length - overCount;
    const evenOddSignal = ranking.top !== null && ranking.second !== null &&
        ranking.top % 2 === 1 && ranking.second % 2 === 1 ? 'ODD' :
        ranking.top !== null && ranking.second !== null &&
        ranking.top % 2 === 0 && ranking.second % 2 === 0 ? 'EVEN' : null;

    const loadMarkets = useCallback(async () => {
        setMarketLoading(true);
        setError('');
        try {
            if (!api_base.api) throw new Error('Deriv connection is not ready. Sign in or reconnect first.');
            const response = await api_base.api.send({ active_symbols: 'brief' }) as any;
            if (response?.error) throw new Error(response.error.message || 'Unable to load active markets');
            const available = (response?.active_symbols || [])
                .map((item: any) => ({
                    symbol: item.symbol,
                    display_name: item.display_name || item.symbol,
                    market: item.market || '',
                    submarket: item.submarket,
                    pip_size: api_base.pip_sizes?.[item.symbol] ?? item.pip_size,
                }))
                .filter((item: Market) => item.symbol && marketGroup(item));
            setMarkets(available);
            if (available.length) setSymbol(current => available.some((item: Market) => item.symbol === current) ? current : available[0].symbol);
            else setError('Deriv did not return any available Volatility or Jump instruments for this account.');
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Market list request failed');
            setStatus('DISCONNECTED');
        } finally {
            setMarketLoading(false);
        }
    }, []);

    useEffect(() => { void loadMarkets(); }, [loadMarkets]);

    useEffect(() => {
        if (!symbol || !api_base.api) return;
        let active = true;
        let subscriptionId: string | number | undefined;
        let messageSubscription: { unsubscribe: () => void } | undefined;
        setStatus('CONNECTING');
        setPaused(false);
        setTicks([]);
        setLatestTick(null);
        setReceived(0);
        setError('');

        const market = markets.find(item => item.symbol === symbol);
        const precision = market?.pip_size ?? api_base.pip_sizes?.[symbol];

        const acceptTick = (quote: string | number, epoch: number) => {
            if (!active || paused) return;
            const digit = digitFromQuote(quote, precision);
            if (digit === null || !Number.isFinite(epoch)) return;
            const next: Tick = { quote: String(quote), epoch, digit };
            setLatestTick(next);
            setReceived(value => value + 1);
            setTicks(current => {
                if (current.length && current[current.length - 1].epoch === epoch && current[current.length - 1].quote === next.quote) return current;
                return [...current.slice(-(WINDOW_SIZE - 1)), next];
            });
            setStatus('LIVE');
        };

        const start = async () => {
            try {
                messageSubscription = api_base.api!.onMessage().subscribe(({ data }: any) => {
                    if (!active || data?.msg_type !== 'tick' || data?.tick?.symbol !== symbol) return;
                    acceptTick(data.tick.quote, Number(data.tick.epoch));
                });
                const response = await api_base.api!.send({
                    ticks_history: symbol,
                    count: WINDOW_SIZE,
                    end: 'latest',
                    style: 'ticks',
                    subscribe: 1,
                }) as any;
                if (!active) {
                    const id = response?.subscription?.id;
                    if (id) api_base.api?.send({ forget: id });
                    return;
                }
                if (response?.error) throw new Error(response.error.message || 'Tick history request failed');
                subscriptionId = response?.subscription?.id;
                const prices = response?.history?.prices || [];
                const times = response?.history?.times || [];
                const initial: Tick[] = prices.map((quote: string | number, index: number) => {
                    const digit = digitFromQuote(quote, precision);
                    return digit === null ? null : { quote: String(quote), epoch: Number(times[index]), digit };
                }).filter((tick: Tick | null): tick is Tick => !!tick && Number.isFinite(tick.epoch)).slice(-WINDOW_SIZE);
                setTicks(initial);
                setReceived(initial.length);
                setLatestTick(initial[initial.length - 1] || null);
                setStatus('LIVE');
            } catch (e) {
                if (!active) return;
                setStatus('ERROR');
                setError(e instanceof Error ? e.message : 'Unable to subscribe to Deriv ticks');
            }
        };
        void start();
        return () => {
            active = false;
            messageSubscription?.unsubscribe();
            if (subscriptionId && api_base.api) api_base.api.send({ forget: subscriptionId });
        };
    }, [symbol, markets, paused]);

    const latestPattern = ticks.slice(-20);
    const evenOddPattern = patternText(latestPattern, digit => digit % 2 === 0, 'E', 'O');
    const overUnderPattern = patternText(latestPattern, digit => digit >= 5, 'O', 'U');

    const pause = () => {
        setPaused(true);
        setStatus('PAUSED');
    };
    const resume = () => {
        setPaused(false);
        setStatus('CONNECTING');
    };

    return <section className='luxen-dc'>
        <header className='luxen-dc__header'>
            <div><span className='luxen-dc__eyebrow'>LUXENPRO · DERIV DIGIT INTELLIGENCE</span><h1>D-Circles Analysis</h1><p>Live last-digit distribution · rolling 1,000-tick window</p></div>
            <div className={'luxen-dc__status luxen-dc__status--' + status.toLowerCase()}><i />{status}</div>
        </header>
        <div className='luxen-dc__toolbar'>
            <label>MARKET<select value={symbol} onChange={event => setSymbol(event.target.value)} disabled={marketLoading || !markets.length}>
                {(['Volatility (1s)', 'Volatility', 'Jump'] as const).map(group => <optgroup label={group} key={group}>
                    {markets.filter(market => marketGroup(market) === group).map(market => <option key={market.symbol} value={market.symbol}>{market.display_name}</option>)}
                </optgroup>)}
            </select></label>
            <div className='luxen-dc__controls'><button onClick={() => void loadMarkets()}>↻ Reconnect / refresh markets</button>{paused ? <button onClick={resume}>Resume</button> : <button onClick={pause}>Pause</button>}</div>
            <span className='luxen-dc__window'>LAST {ticks.length.toLocaleString()} / {WINDOW_SIZE.toLocaleString()} TICKS</span>
        </div>
        {error && <div className='luxen-dc__error' role='alert'>{error}</div>}
        <div className='luxen-dc__stats'>
            <article><small>SELECTED MARKET</small><strong>{selectedMarket?.display_name || '—'}</strong><span>{latestTick ? latestTick.quote : 'Waiting for first quote'}</span></article>
            <article><small>EVEN / ODD</small><strong>{ticks.length ? ((evenCount / ticks.length) * 100).toFixed(1) + '% / ' + ((oddCount / ticks.length) * 100).toFixed(1) + '%' : '—'}</strong><span>{evenCount} Even · {oddCount} Odd</span></article>
            <article><small>OVER / UNDER</small><strong>{ticks.length ? ((overCount / ticks.length) * 100).toFixed(1) + '% / ' + ((underCount / ticks.length) * 100).toFixed(1) + '%' : '—'}</strong><span>Over 4 (5–9) · Under 5 (0–4)</span></article>
            <article><small>LATEST TICK</small><strong>{latestTick ? latestTick.digit : '—'}</strong><span>{latestTick ? formatTime(latestTick.epoch) : 'No tick received'} · {received.toLocaleString()} received</span></article>
        </div>
        <div className='luxen-dc__signal-row'>
            <div className={'luxen-dc__signal ' + (evenOddSignal ? 'is-' + evenOddSignal.toLowerCase() : 'is-neutral')}>
                <span>LEADING DIGIT SIGNAL</span><strong>{evenOddSignal ? evenOddSignal + ' SIGNAL' : 'NO CONFIRMED SIGNAL'}</strong>
                <small>{ranking.top !== null && ranking.second !== null ? 'Top digits: ' + ranking.top + ' and ' + ranking.second : 'Waiting for unique first and second rankings'}</small>
            </div>
            <div className='luxen-dc__signal-note'>Signals are based on the two uniquely ranked highest-frequency digits in the current 1,000-tick sample. They describe past frequency, not a prediction guarantee.</div>
        </div>
        <div className='luxen-dc__panel'>
            <div className='luxen-dc__panel-heading'><div><h2>D-Circles · Digit distribution</h2><p>Live frequency from this market's most recent 1,000 valid ticks</p></div><span>{ticks.length} / 1,000</span></div>
            <div className='luxen-dc__circles'>
                {counts.map((count, digit) => {
                    const percent = ticks.length ? count / ticks.length * 100 : 0;
                    const role = ranking.top === digit ? 'most' : ranking.second === digit ? 'second' : ranking.bottom === digit ? 'least' : ranking.secondBottom === digit ? 'second-least' : 'normal';
                    const latest = latestTick?.digit === digit;
                    return <div className={'luxen-dc__circle-wrap ' + (latest ? 'is-latest' : '')} key={digit}>
                        <div className={'luxen-dc__circle luxen-dc__circle--' + role} style={{ '--progress': percent + '%' } as React.CSSProperties}>
                            <b>{digit}</b><span>{percent.toFixed(1)}%</span><small>{count} hits</small>
                        </div>
                    </div>;
                })}
            </div>
            <div className='luxen-dc__legend'><span><i className='green'/>Most appearing</span><span><i className='blue'/>2nd most</span><span><i className='red'/>Least appearing</span><span><i className='orange'/>2nd least</span><span><i className='gold'/>Latest digit</span></div>
        </div>
        <div className='luxen-dc__patterns'>
            <article className='luxen-dc__panel'><h2>Recent Even / Odd pattern</h2><p>Last {evenOddPattern.length} ticks · E = Even · O = Odd</p><div className='luxen-dc__pattern'>{evenOddPattern.map((value, index) => <b key={index} className={value === 'E' ? 'even' : 'odd'}>{value}</b>)}</div></article>
            <article className='luxen-dc__panel'><h2>Recent Over / Under pattern</h2><p>Last {overUnderPattern.length} ticks · Over = 5–9 · Under = 0–4</p><div className='luxen-dc__pattern'>{overUnderPattern.map((value, index) => <b key={index} className={value === 'O' ? 'over' : 'under'}>{value}</b>)}</div></article>
        </div>
        <div className='luxen-dc__history'><strong>RECENT DIGITS</strong>{latestPattern.slice().reverse().map((tick, index) => <span key={tick.epoch + '-' + index} className={tick.digit % 2 === 0 ? 'even' : 'odd'}>{tick.digit}</span>)}</div>
        <p className='luxen-dc__footnote'>Digit extraction uses the selected instrument's Deriv pip-size precision. Only valid ticks from the selected market are counted. Changing markets clears the previous market's live sample.</p>
    </section>;
};

export default DCircles;

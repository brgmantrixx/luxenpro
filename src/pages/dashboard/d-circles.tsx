import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api_base } from '@/external/bot-skeleton';
import './d-circles.scss';

type Market = { symbol: string; display_name: string; market: string; submarket?: string; pip_size?: number; precision?: number };
type Tick = { quote: string; epoch: number; digit: number };
type Status = 'CONNECTING' | 'LIVE' | 'PAUSED' | 'DISCONNECTED' | 'ERROR';
const WINDOW_SIZE = 1000;

type MarketGroup = 'Volatility (1s)' | 'Volatility' | 'Jump';

const marketGroup = (market: Market): MarketGroup | '' => {
    const name = String(market.display_name || '').toLowerCase();
    const symbol = String(market.symbol || '').toUpperCase();
    const marketName = String(market.market || '').toLowerCase();
    const submarket = String(market.submarket || '').toLowerCase();
    const metadata = [name, marketName, submarket].join(' ');
    if (/1s/.test(name) || /^1HZ\d+V?$/.test(symbol)) return 'Volatility (1s)';
    if (/jump/.test(metadata) || /^JD\d+/.test(symbol)) return 'Jump';
    if (/volatility/.test(metadata) || /^R_\d+V?$/.test(symbol)) return 'Volatility';
    return '';
};

const sortMarkets = (items: Market[]) => [...items].sort((a, b) => {
    const getNumber = (market: Market) => Number((market.display_name.match(/\d+/) || market.symbol.match(/\d+/) || ['0'])[0]);
    return getNumber(a) - getNumber(b) || a.display_name.localeCompare(b.display_name);
});

const decimalPlaces = (pipSize?: number) => {
    if (!pipSize || !Number.isFinite(pipSize) || pipSize <= 0) return undefined;
    const text = pipSize.toString();
    return text.includes('e-') ? Number(text.split('e-')[1]) : (text.split('.')[1] || '').length;
};

const digitFromQuote = (quote: string | number, precision?: number) => {
    const raw = String(quote);
    const normalized = precision === undefined ? raw : Number(raw).toFixed(precision);
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
    const pausedRef = useRef(false);
    const lastSeenRef = useRef('');
    const [latestTick, setLatestTick] = useState<Tick | null>(null);
    const [received, setReceived] = useState(0);
    const [marketLoading, setMarketLoading] = useState(true);

    const selectedMarket = markets.find(market => market.symbol === symbol);
    const marketCategories: { title: MarketGroup; markets: Market[] }[] = [
        { title: 'Volatility (1s)', markets: sortMarkets(markets.filter(market => marketGroup(market) === 'Volatility (1s)')) },
        { title: 'Volatility', markets: sortMarkets(markets.filter(market => marketGroup(market) === 'Volatility')) },
        { title: 'Jump', markets: sortMarkets(markets.filter(market => marketGroup(market) === 'Jump')) },
    ];
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
            let response = await api_base.api.send({ active_symbols: 'brief' }) as any;
            if (response?.error) throw new Error(response.error.message || 'Unable to load active markets');
            let rawSymbols = response?.active_symbols || response?.data?.active_symbols || [];
            const mapMarkets = (items: any[]): Market[] => items
                .map((item: any) => ({
                    symbol: String(item.symbol || ''),
                    display_name: item.display_name || item.symbol,
                    market: item.market || item.market_display_name || '',
                    submarket: item.submarket || item.submarket_display_name || '',
                    pip_size: item.pip_size ?? item.pip,
                    precision: api_base.pip_sizes?.[item.symbol] ?? decimalPlaces(item.pip_size ?? item.pip),
                }))
                .filter((item: Market) => item.symbol && marketGroup(item));
            let available = mapMarkets(Array.isArray(rawSymbols) ? rawSymbols : []);
            // Retry with full metadata if the brief response omitted the supported synthetic indices.
            if (!available.length) {
                response = await api_base.api.send({ active_symbols: 'full' }) as any;
                if (response?.error) throw new Error(response.error.message || 'Unable to load full market list');
                rawSymbols = response?.active_symbols || response?.data?.active_symbols || [];
                available = mapMarkets(Array.isArray(rawSymbols) ? rawSymbols : []);
            }
            setMarkets(available);
            if (available.length) {
                setSymbol(current => available.some((item: Market) => item.symbol === current) ? current : available[0].symbol);
            } else {
                setStatus('ERROR');
                const count = Array.isArray(rawSymbols) ? rawSymbols.length : 0;
                const sample = Array.isArray(rawSymbols) ? rawSymbols.slice(0, 5).map((item: any) => item.display_name || item.symbol).filter(Boolean).join(', ') : 'unexpected API response';
                setError(count
                    ? `Deriv returned ${count} instruments, but none matched Volatility / Volatility (1s) / Jump. Returned examples: ${sample || 'none'}.`
                    : 'Deriv returned an empty active-symbol list. Reconnect your Deriv account and refresh markets; no live digit feed can start until Deriv returns instruments.');
            }
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
        pausedRef.current = false;
        lastSeenRef.current = '';
        setTicks([]);
        setLatestTick(null);
        setReceived(0);
        setError('');

        const market = markets.find(item => item.symbol === symbol);
        const precision = market?.precision ?? api_base.pip_sizes?.[symbol];

        const acceptTick = (quote: string | number, epoch: number) => {
            if (!active || pausedRef.current) return;
            const digit = digitFromQuote(quote, precision);
            if (digit === null || !Number.isFinite(epoch)) return;
            const next: Tick = { quote: String(quote), epoch, digit };
            const tickKey = String(epoch) + ':' + String(quote);
            if (lastSeenRef.current === tickKey) return;
            lastSeenRef.current = tickKey;
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
                const lastInitialTick = initial[initial.length - 1];
                lastSeenRef.current = lastInitialTick ? String(lastInitialTick.epoch) + ':' + lastInitialTick.quote : '';
                setStatus(pausedRef.current ? 'PAUSED' : 'LIVE');
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
    }, [symbol, markets]);

    const latestPattern = ticks.slice(-20);
    const evenOddPattern = patternText(latestPattern, digit => digit % 2 === 0, 'E', 'O');
    const overUnderPattern = patternText(latestPattern, digit => digit >= 5, 'O', 'U');

    const pause = () => {
        pausedRef.current = true;
        setPaused(true);
        setStatus('PAUSED');
    };
    const resume = () => {
        pausedRef.current = false;
        setPaused(false);
        setStatus('LIVE');
    };

    return <section className='luxen-dc'>
        <header className='luxen-dc__header'>
            <div><span className='luxen-dc__eyebrow'>LUXENPRO · DERIV DIGIT INTELLIGENCE</span><h1>D-Circles Analysis</h1><p>Live last-digit distribution · rolling 1,000-tick window</p></div>
            <div className={'luxen-dc__status luxen-dc__status--' + status.toLowerCase()}><i />{status}</div>
        </header>
        <div className='luxen-dc__market-panel'>
            <div className='luxen-dc__market-panel-head'>
                <div><span className='luxen-dc__market-kicker'>LIVE DERIV INSTRUMENTS</span><h2>Select a market</h2><p>Choose any available index. Each selection starts its own live 1,000-tick D-Circles feed.</p></div>
                <div className='luxen-dc__controls'><button onClick={() => void loadMarkets()} disabled={marketLoading}>{marketLoading ? 'Loading markets…' : '↻ Refresh markets'}</button>{paused ? <button onClick={resume}>Resume</button> : <button onClick={pause} disabled={!symbol}>Pause feed</button>}</div>
            </div>
            <div className='luxen-dc__market-categories'>
                {marketCategories.map(category => <section className='luxen-dc__market-category' key={category.title}>
                    <div className='luxen-dc__market-category-title'><h3>{category.title}</h3><span>{category.markets.length} available</span></div>
                    {category.markets.length ? <div className='luxen-dc__market-buttons'>
                        {category.markets.map(market => <button type='button' key={market.symbol} className={'luxen-dc__market-button ' + (symbol === market.symbol ? 'is-selected' : '')} onClick={() => setSymbol(market.symbol)} aria-pressed={symbol === market.symbol} title={market.symbol}>
                            <span>{market.display_name}</span>{symbol === market.symbol && <i>LIVE FEED SELECTED</i>}
                        </button>)}
                    </div> : <p className='luxen-dc__market-empty'>{marketLoading ? 'Loading from Deriv…' : 'No instruments in this category were returned by Deriv.'}</p>}
                </section>)}
            </div>
            <div className='luxen-dc__market-footer'><span className='luxen-dc__window'>LAST {ticks.length.toLocaleString()} / {WINDOW_SIZE.toLocaleString()} TICKS</span><span>Selected: <strong>{selectedMarket?.display_name || 'None'}</strong> · API symbol: {symbol || '—'}</span></div>
        </div>
        {error && <div className='luxen-dc__error' role='alert'>{error}</div>}
        <div className='luxen-dc__stats'>
            <article><small>SELECTED MARKET</small><strong>{selectedMarket?.display_name || '—'}</strong><span>{latestTick ? latestTick.quote : 'Waiting for first quote'}</span></article>
            <article><small>EVEN / ODD</small><strong>{ticks.length ? ((evenCount / ticks.length) * 100).toFixed(1) + '% / ' + ((oddCount / ticks.length) * 100).toFixed(1) + '%' : '—'}</strong><span>{evenCount} Even · {oddCount} Odd</span></article>
            <article><small>OVER / UNDER</small><strong>{ticks.length ? ((overCount / ticks.length) * 100).toFixed(1) + '% / ' + ((underCount / ticks.length) * 100).toFixed(1) + '%' : '—'}</strong><span>Over 4 (5–9) · Under 5 (0–4)</span></article>
            <article><small>LATEST TICK</small><strong>{latestTick ? latestTick.digit : '—'}</strong><span>{latestTick ? formatTime(latestTick.epoch) : 'No tick received'} · {received.toLocaleString()} received</span></article>
        </div>
        {evenOddSignal && <div className={'luxen-dc__floating-signal is-' + evenOddSignal.toLowerCase()} role='status' aria-live='polite'><span>{evenOddSignal} SIGNAL</span><small>Leading digits {ranking.top} + {ranking.second}</small></div>}
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

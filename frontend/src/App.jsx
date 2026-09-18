import { useState } from 'react';
import { api } from './api';
import { useLoad } from './useLoad';
import OrderBook from './components/OrderBook';
import PlaceOrderForm from './components/PlaceOrderForm';
import Portfolio from './components/Portfolio';
import TradeHistory from './components/TradeHistory';
import OpenOrders from './components/OpenOrders';
import Watchlist from './components/Watchlist';
import Markets from './components/Markets';
import Funds from './components/Funds';
import Reports from './components/Reports';
import RecentTrades from './components/RecentTrades';

const TABS = [
    ['markets', 'Markets'],
    ['trade', 'Trade'],
    ['portfolio', 'Portfolio'],
    ['history', 'History'],
    ['funds', 'Funds'],
    ['watchlists', 'Watchlists'],
    ['reports', 'Reports'],
];

// No login: you act as whichever account id is entered.
export default function App() {
    const [accountInput, setAccountInput] = useState('1');
    const [pickedInstrument, setPickedInstrument] = useState('');
    const [tab, setTab] = useState('trade');
    const [refreshKey, setRefreshKey] = useState(0);

    // reloaded after every order
    const { data: instruments, error: instrumentsError } = useLoad(() => api.listInstruments(), [refreshKey]);
    const instrumentList = instruments || [];

    // anything that isn't a positive whole number means no account yet
    const trimmed = accountInput.trim();
    const accountId = /^[1-9]\d{0,9}$/.test(trimmed) ? trimmed : '';

    // default to the first instrument
    const instrumentId = pickedInstrument || (instrumentList.length > 0 ? String(instrumentList[0].instrument_id) : '');

    const bump = () => setRefreshKey((k) => k + 1);

    // key remounts these when the account or instrument changes, so old
    // data isn't shown under the new id while loading
    return (
        <div className="app">
            <header>
                <h1>Trading Simulator</h1>
                <div className="controls">
                    <label>
                        Account ID
                        <input value={accountInput} onChange={(e) => setAccountInput(e.target.value)}
                               inputMode="numeric" aria-invalid={accountInput !== '' && !accountId} />
                    </label>
                    <label>
                        Instrument
                        <select value={instrumentId} onChange={(e) => setPickedInstrument(e.target.value)}>
                            {instrumentList.map((i) => (
                                <option key={i.instrument_id} value={i.instrument_id}>
                                    {i.ticker} — {i.company_name}
                                </option>
                            ))}
                        </select>
                    </label>
                </div>
            </header>

            {instrumentsError && <p className="error">Could not load instruments: {instrumentsError}</p>}

            <nav className="tabs">
                {TABS.map(([id, label]) => (
                    <button key={id} className={tab === id ? 'active' : ''} onClick={() => setTab(id)}>{label}</button>
                ))}
            </nav>

            <main>
                {tab === 'markets' && (
                    <Markets onTrade={(id) => { setPickedInstrument(id); setTab('trade'); }} />
                )}
                {tab === 'trade' && (
                    <div className="trade-view">
                        <div>
                            <OrderBook key={instrumentId} instrumentId={instrumentId} refreshKey={refreshKey} />
                            <RecentTrades key={`t${instrumentId}`} instrumentId={instrumentId} refreshKey={refreshKey} />
                        </div>
                        <PlaceOrderForm
                            key={`${accountId}-${instrumentId}`}
                            accountId={accountId}
                            instrumentId={instrumentId}
                            onOrderPlaced={bump}
                        />
                        <OpenOrders
                            key={accountId}
                            accountId={accountId}
                            refreshKey={refreshKey}
                            onOrderCancelled={bump}
                        />
                    </div>
                )}
                {tab === 'portfolio' && <Portfolio key={accountId} accountId={accountId} refreshKey={refreshKey} />}
                {tab === 'history' && <TradeHistory key={accountId} accountId={accountId} refreshKey={refreshKey} />}
                {tab === 'funds' && <Funds key={accountId} accountId={accountId} refreshKey={refreshKey} onChanged={bump} />}
                {tab === 'watchlists' && (
                    <Watchlist key={accountId} accountId={accountId} instruments={instrumentList} refreshKey={refreshKey} />
                )}
                {tab === 'reports' && <Reports refreshKey={refreshKey} />}
            </main>
        </div>
    );
}

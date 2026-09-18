import { useState } from 'react';
import { api } from '../api';
import { useLoad } from '../useLoad';

// Markets tab: search and filter instruments (done in SQL by the backend).
// "Trade" opens the Trade tab with that instrument.
export default function Markets({ onTrade }) {
    const [search, setSearch] = useState('');
    const [sector, setSector] = useState('');

    const { data: sectors } = useLoad(() => api.listSectors(), []);
    const { data, error, loading } = useLoad(() => api.listInstruments({ search, sector }), [search, sector]);
    const rows = data || [];
    const fmt = (v) => (v === null || v === undefined ? '—' : Number(v).toFixed(2));

    return (
        <div className="markets">
            <form className="filters" onSubmit={(e) => e.preventDefault()}>
                <label>
                    Search ticker or company
                    <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="e.g. bank, NEXG" />
                </label>
                <label>
                    Sector
                    <select value={sector} onChange={(e) => setSector(e.target.value)}>
                        <option value="">All sectors</option>
                        {(sectors || []).map((s) => <option key={s} value={s}>{s}</option>)}
                    </select>
                </label>
            </form>

            {error && <p className="error">Could not load instruments: {error}</p>}

            <div className="scroll">
                <table>
                    <thead>
                        <tr>
                            <th>Ticker</th><th>Company</th><th>Sector</th><th>Last</th>
                            <th>Best bid</th><th>Best ask</th><th>Volume (30d)</th><th></th>
                        </tr>
                    </thead>
                    <tbody>
                        {rows.map((i) => (
                            <tr key={i.instrument_id}>
                                <td><b>{i.ticker}</b></td>
                                <td>{i.company_name}</td>
                                <td>{i.sector || '—'}</td>
                                <td>{fmt(i.last_price)}</td>
                                <td className="positive">{fmt(i.best_bid)}</td>
                                <td className="negative">{fmt(i.best_ask)}</td>
                                <td>{i.volume_30d}</td>
                                <td><button className="small" onClick={() => onTrade(String(i.instrument_id))}>Trade</button></td>
                            </tr>
                        ))}
                        {!loading && rows.length === 0 && <tr><td colSpan={8}>No instrument matches.</td></tr>}
                    </tbody>
                </table>
            </div>
        </div>
    );
}

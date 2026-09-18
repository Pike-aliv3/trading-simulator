import { useState } from 'react';
import { api } from '../api';
import { useLoad } from '../useLoad';

// Watchlists tab: create/delete lists, add/remove instruments.
// Duplicate names and duplicate items are refused by the database.
export default function Watchlist({ accountId, instruments, refreshKey }) {
    const [reloadKey, setReloadKey] = useState(0);
    const [picked, setPicked] = useState(null);
    const [newName, setNewName] = useState('');
    const [actionError, setActionError] = useState(null);

    const { data: lists, error: listsError } = useLoad(
        () => (accountId ? api.getWatchlists(accountId) : Promise.resolve(null)),
        [accountId, reloadKey]
    );
    const allLists = lists || [];

    // default to the first list
    const current = allLists.find((l) => l.watchlist_id === picked) || allLists[0] || null;

    async function act(fn) {
        setActionError(null);
        try {
            return await fn();
        } catch (err) {
            setActionError(err.message);
            return null;
        } finally {
            setReloadKey((k) => k + 1);
        }
    }

    async function handleCreate(e) {
        e.preventDefault();
        const created = await act(() => api.createWatchlist(accountId, newName));
        if (created) {
            setPicked(created.watchlist_id);
            setNewName('');
        }
    }

    if (!accountId) return <p>Enter an account ID.</p>;

    const error = actionError || listsError;

    return (
        <div className="watchlist">
            <div className="report-picker">
                {allLists.map((l) => (
                    <button key={l.watchlist_id} className={current && l.watchlist_id === current.watchlist_id ? 'active' : ''}
                            onClick={() => setPicked(l.watchlist_id)}>
                        {l.name} ({l.item_count})
                    </button>
                ))}
            </div>

            <form className="inline-form" onSubmit={handleCreate}>
                <label>
                    New watchlist
                    <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="e.g. Banks" required />
                </label>
                <button type="submit">Create</button>
                {current && (
                    <button type="button" className="secondary"
                            onClick={() => act(() => api.deleteWatchlist(accountId, current.watchlist_id))}>
                        Delete "{current.name}"
                    </button>
                )}
            </form>

            {error && <p className="error">{error}</p>}

            {current
                ? <WatchlistItems key={current.watchlist_id} accountId={accountId} list={current}
                                  instruments={instruments} act={act} reloadKey={`${reloadKey}-${refreshKey}`} />
                : <p>This user has no watchlists yet. Create one above.</p>}
        </div>
    );
}

function WatchlistItems({ accountId, list, instruments, act, reloadKey }) {
    const [chosen, setChosen] = useState('');
    const { data, error } = useLoad(() => api.getWatchlistItems(accountId, list.watchlist_id), [list.watchlist_id, reloadKey]);
    const items = data || [];
    const instrumentId = chosen || (instruments.length > 0 ? String(instruments[0].instrument_id) : '');

    return (
        <>
            <form className="inline-form" onSubmit={(e) => {
                e.preventDefault();
                act(() => api.addToWatchlist(accountId, list.watchlist_id, instrumentId));
            }}>
                <label>
                    Add to "{list.name}"
                    <select value={instrumentId} onChange={(e) => setChosen(e.target.value)}>
                        {instruments.map((i) => (
                            <option key={i.instrument_id} value={i.instrument_id}>{i.ticker} — {i.company_name}</option>
                        ))}
                    </select>
                </label>
                <button type="submit" disabled={!instrumentId}>Add</button>
            </form>

            {error && <p className="error">{error}</p>}

            <table>
                <thead>
                    <tr><th>Ticker</th><th>Company</th><th>Sector</th><th>Last price</th><th></th></tr>
                </thead>
                <tbody>
                    {items.map((i) => (
                        <tr key={i.instrument_id}>
                            <td>{i.ticker}</td>
                            <td>{i.company_name}</td>
                            <td>{i.sector}</td>
                            <td>{Number(i.last_price).toFixed(2)}</td>
                            <td>
                                <button className="small"
                                        onClick={() => act(() => api.removeFromWatchlist(accountId, list.watchlist_id, i.instrument_id))}>
                                    Remove
                                </button>
                            </td>
                        </tr>
                    ))}
                    {items.length === 0 && <tr><td colSpan={5}>Nothing on this watchlist yet.</td></tr>}
                </tbody>
            </table>
        </>
    );
}

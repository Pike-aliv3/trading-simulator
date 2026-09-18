import { api } from '../api';
import { useLoad } from '../useLoad';

// Latest trades of the selected instrument (v_price_history).
export default function RecentTrades({ instrumentId, refreshKey }) {
    const { data, error } = useLoad(
        () => (instrumentId ? api.getPriceHistory(instrumentId) : Promise.resolve(null)),
        [instrumentId, refreshKey]
    );
    if (!instrumentId) return null;
    const rows = (data || []).slice(0, 8);

    return (
        <div className="recent-trades">
            <h4>Recent trades</h4>
            {error && <p className="error">{error}</p>}
            <table>
                <thead><tr><th>Time</th><th>Price</th><th>Qty</th></tr></thead>
                <tbody>
                    {rows.map((t) => (
                        <tr key={t.trade_id}>
                            <td>{new Date(t.recorded_at).toLocaleString()}</td>
                            <td>{Number(t.price).toFixed(2)}</td>
                            <td>{t.volume}</td>
                        </tr>
                    ))}
                    {data && rows.length === 0 && <tr><td colSpan={3}>No trades yet.</td></tr>}
                </tbody>
            </table>
        </div>
    );
}

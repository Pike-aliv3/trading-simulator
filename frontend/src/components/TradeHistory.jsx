import { api } from '../api';
import { useLoad } from '../useLoad';

export default function TradeHistory({ accountId, refreshKey }) {
    const { data, error, loading } = useLoad(
        () => (accountId ? api.getTrades(accountId) : Promise.resolve(null)),
        [accountId, refreshKey]
    );

    if (!accountId) return <p>Enter an account ID.</p>;
    if (error) return <p className="error">Could not load trade history: {error}</p>;
    if (!data) return <p>{loading ? 'Loading...' : 'No data.'}</p>;

    return (
        <div className="scroll">
        <table>
            <thead>
                <tr><th>Date</th><th>Ticker</th><th>Side</th><th>Qty</th><th>Price</th><th>Value</th></tr>
            </thead>
            <tbody>
                {data.map((t) => (
                    <tr key={t.trade_id}>
                        <td>{new Date(t.executed_at).toLocaleString()}</td>
                        <td>{t.ticker}</td>
                        <td>{t.side}</td>
                        <td>{t.quantity}</td>
                        <td>{Number(t.price).toFixed(2)}</td>
                        <td>{Number(t.trade_value).toFixed(2)}</td>
                    </tr>
                ))}
                {data.length === 0 && <tr><td colSpan={6}>No trades yet.</td></tr>}
            </tbody>
        </table>
        </div>
    );
}

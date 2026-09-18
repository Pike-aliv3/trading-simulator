import { api } from '../api';
import { useLoad } from '../useLoad';

// Account summary (v_account_summary) and holdings (v_portfolio).
export default function Portfolio({ accountId, refreshKey }) {
    const { data, error, loading } = useLoad(
        () => (accountId
            ? Promise.all([api.getAccountSummary(accountId), api.getPortfolio(accountId)])
            : Promise.resolve(null)),
        [accountId, refreshKey]
    );

    if (!accountId) return <p>Enter an account ID.</p>;
    if (error) return <p className="error">Could not load the portfolio: {error}</p>;
    if (!data) return <p>{loading ? 'Loading...' : 'No data.'}</p>;

    const [summary, holdings] = data;

    return (
        <div className="portfolio">
            <div className="summary-cards">
                <div className="card"><span>Cash</span><b>{Number(summary.cash_balance).toFixed(2)}</b></div>
                <div className="card"><span>Reserved</span><b>{Number(summary.reserved_cash).toFixed(2)}</b></div>
                <div className="card"><span>Holdings value</span><b>{Number(summary.holdings_value).toFixed(2)}</b></div>
                <div className="card"><span>Net worth</span><b>{Number(summary.net_worth).toFixed(2)}</b></div>
            </div>

            <table>
                <thead>
                    <tr><th>Ticker</th><th>Qty</th><th>Avg cost</th><th>Last price</th><th>Value</th><th>Unrealized P&L</th></tr>
                </thead>
                <tbody>
                    {holdings.map((h) => (
                        <tr key={h.instrument_id}>
                            <td>{h.ticker}</td>
                            <td>{h.quantity}</td>
                            <td>{Number(h.avg_cost).toFixed(2)}</td>
                            <td>{Number(h.last_price).toFixed(2)}</td>
                            <td>{Number(h.market_value).toFixed(2)}</td>
                            <td className={Number(h.unrealized_pnl) >= 0 ? 'positive' : 'negative'}>
                                {Number(h.unrealized_pnl).toFixed(2)}
                            </td>
                        </tr>
                    ))}
                    {holdings.length === 0 && <tr><td colSpan={6}>No holdings yet.</td></tr>}
                </tbody>
            </table>
        </div>
    );
}

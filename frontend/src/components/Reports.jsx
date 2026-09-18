import { useState } from 'react';
import { api } from '../api';
import { useLoad } from '../useLoad';

// Reports tab: results of the queries in db/queries.sql.
const REPORTS = [
    {
        name: 'portfolio-valuation',
        title: 'Portfolio valuation per account',
        technique: 'Query 2: four-table join + GROUP BY',
        columns: ['account_id', 'name', 'market_value', 'cost_basis', 'unrealized_pnl'],
    },
    {
        name: 'above-average',
        title: 'Trading above their 30-day average price',
        technique: 'Query 3: correlated subquery',
        columns: ['ticker', 'company_name', 'last_price', 'avg_30d_price'],
    },
    {
        name: 'most-active',
        title: 'Top 5 most active accounts (30 days)',
        technique: 'Query 5: CTE + UNION ALL + RANK() window function',
        columns: ['activity_rank', 'account_id', 'name', 'total_value'],
    },
    {
        name: 'never-traded',
        title: 'Users who have never placed an order',
        technique: 'Query 6: NOT EXISTS anti-join',
        columns: ['user_id', 'name', 'email', 'account_count'],
    },
];

const MONEY = new Set(['market_value', 'cost_basis', 'unrealized_pnl', 'last_price', 'avg_30d_price', 'total_value']);

export default function Reports({ refreshKey }) {
    const [picked, setPicked] = useState(REPORTS[0].name);
    const report = REPORTS.find((r) => r.name === picked);

    return (
        <div className="reports">
            <div className="report-picker">
                {REPORTS.map((r) => (
                    <button key={r.name} className={r.name === picked ? 'active' : ''} onClick={() => setPicked(r.name)}>
                        {r.title}
                    </button>
                ))}
            </div>
            <p className="muted">{report.technique} (db/queries.sql)</p>
            {/* new table per report so old rows don't show under new columns */}
            <ReportTable key={report.name} report={report} refreshKey={refreshKey} />
        </div>
    );
}

function ReportTable({ report, refreshKey }) {
    const { data, error, loading } = useLoad(() => api.getReport(report.name), [report.name, refreshKey]);
    const rows = data || [];

    const cell = (col, v) => {
        if (v === null || v === undefined) return '—';
        if (MONEY.has(col)) return Number(v).toFixed(2);
        return String(v);
    };

    if (error) return <p className="error">Could not run the report: {error}</p>;

    return (
        <div className="scroll">
            <table>
                <thead><tr>{report.columns.map((c) => <th key={c}>{c}</th>)}</tr></thead>
                <tbody>
                    {rows.map((row, i) => (
                        <tr key={i}>
                            {report.columns.map((c) => (
                                <td key={c} className={c === 'unrealized_pnl' ? (Number(row[c]) >= 0 ? 'positive' : 'negative') : ''}>
                                    {cell(c, row[c])}
                                </td>
                            ))}
                        </tr>
                    ))}
                    {loading && rows.length === 0 && <tr><td colSpan={report.columns.length}>Running...</td></tr>}
                    {!loading && rows.length === 0 && <tr><td colSpan={report.columns.length}>No rows.</td></tr>}
                </tbody>
            </table>
        </div>
    );
}

import { useState } from 'react';
import { api } from '../api';
import { useLoad } from '../useLoad';

// Funds tab: deposit, withdraw (db/funds.sql) and the cash statement.
export default function Funds({ accountId, refreshKey, onChanged }) {
    const [amount, setAmount] = useState('');
    const [busy, setBusy] = useState(false);
    const [actionError, setActionError] = useState(null);
    const [message, setMessage] = useState(null);

    const { data, error: loadError } = useLoad(
        () => (accountId
            ? Promise.all([api.getAccountSummary(accountId), api.getLedger(accountId)])
            : Promise.resolve(null)),
        [accountId, refreshKey]
    );

    async function run(kind) {
        setActionError(null);
        setMessage(null);
        setBusy(true);
        try {
            const value = Number(amount);
            const summary = kind === 'deposit'
                ? await api.deposit(accountId, value)
                : await api.withdraw(accountId, value);
            setMessage(`${kind === 'deposit' ? 'Deposited' : 'Withdrew'} ${value.toFixed(2)}. ` +
                       `Cash is now ${Number(summary.cash_balance).toFixed(2)}.`);
            setAmount('');
        } catch (err) {
            setActionError(err.message);
        } finally {
            setBusy(false);
            onChanged();
        }
    }

    if (!accountId) return <p>Enter an account ID.</p>;

    const [summary, ledger] = data || [null, []];
    const free = summary ? Number(summary.cash_balance) - Number(summary.reserved_cash) : null;
    const error = actionError || loadError;

    return (
        <div className="funds">
            {summary && (
                <div className="summary-cards three">
                    <div className="card"><span>Cash balance</span><b>{Number(summary.cash_balance).toFixed(2)}</b></div>
                    <div className="card"><span>Reserved for open buys</span><b>{Number(summary.reserved_cash).toFixed(2)}</b></div>
                    <div className="card"><span>Free to withdraw</span><b>{free.toFixed(2)}</b></div>
                </div>
            )}

            <form className="inline-form" onSubmit={(e) => { e.preventDefault(); run('deposit'); }}>
                <label>
                    Amount
                    <input type="number" step="0.01" min="0.01" value={amount}
                           onChange={(e) => setAmount(e.target.value)} required />
                </label>
                <button type="submit" disabled={busy}>Deposit</button>
                <button type="button" className="secondary" disabled={busy || amount === ''}
                        onClick={() => run('withdraw')}>Withdraw</button>
            </form>

            {message && <p className="positive">{message}</p>}
            {error && <p className="error">Rejected: {error}</p>}

            <h2>Cash statement</h2>
            <div className="scroll">
                <table>
                    <thead>
                        <tr><th>Date</th><th>Type</th><th>Amount</th><th>Balance after</th><th>Trade</th></tr>
                    </thead>
                    <tbody>
                        {ledger.map((l) => (
                            <tr key={l.ledger_id}>
                                <td>{new Date(l.created_at).toLocaleString()}</td>
                                <td>{l.txn_type}</td>
                                <td className={Number(l.amount) >= 0 ? 'positive' : 'negative'}>{Number(l.amount).toFixed(2)}</td>
                                <td>{Number(l.balance_after).toFixed(2)}</td>
                                <td>{l.related_trade_id ?? '—'}</td>
                            </tr>
                        ))}
                        {ledger.length === 0 && <tr><td colSpan={5}>No cash movements yet.</td></tr>}
                    </tbody>
                </table>
            </div>
        </div>
    );
}

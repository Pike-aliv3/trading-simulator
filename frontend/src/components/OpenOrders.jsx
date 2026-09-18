import { useState } from 'react';
import { api } from '../api';
import { useLoad } from '../useLoad';

// This account's orders; open ones can be cancelled (cancel_order).
export default function OpenOrders({ accountId, refreshKey, onOrderCancelled }) {
    const { data, error: loadError } = useLoad(
        () => (accountId ? api.getOrders(accountId) : Promise.resolve(null)),
        [accountId, refreshKey]
    );
    const [cancelError, setCancelError] = useState(null);
    const [cancelling, setCancelling] = useState(null);
    const orders = data || [];

    // only orders still on the book can be cancelled
    const cancellable = (status) => status === 'OPEN' || status === 'PARTIALLY_FILLED';

    async function handleCancel(orderId) {
        setCancelError(null);
        setCancelling(orderId);
        try {
            await api.cancelOrder(orderId, accountId);
        } catch (e) {
            setCancelError(e.message);
        } finally {
            setCancelling(null);
            // refresh even if it failed (the order may have just filled)
            onOrderCancelled();
        }
    }

    if (!accountId) return <p>Enter an account ID.</p>;

    const error = cancelError || loadError;

    return (
        <div className="open-orders">
            <h2>Your orders</h2>
            {error && <p className="error">{error}</p>}
            <table>
                <thead>
                    <tr>
                        <th>ID</th><th>Ticker</th><th>Side</th><th>Limit</th><th>Qty</th>
                        <th>Remaining</th><th>Status</th><th></th>
                    </tr>
                </thead>
                <tbody>
                    {orders.map((o) => (
                        <tr key={o.order_id}>
                            <td>{o.order_id}</td>
                            <td>{o.ticker}</td>
                            <td className={o.side === 'BUY' ? 'positive' : 'negative'}>{o.side}</td>
                            <td>{o.limit_price === null ? '—' : Number(o.limit_price).toFixed(2)}</td>
                            <td>{o.quantity}</td>
                            <td>{o.remaining_quantity}</td>
                            <td>{o.status}</td>
                            <td>
                                {cancellable(o.status) && (
                                    <button onClick={() => handleCancel(o.order_id)} disabled={cancelling === o.order_id}>
                                        {cancelling === o.order_id ? 'Cancelling...' : 'Cancel'}
                                    </button>
                                )}
                            </td>
                        </tr>
                    ))}
                    {orders.length === 0 && <tr><td colSpan={8}>No orders yet.</td></tr>}
                </tbody>
            </table>
        </div>
    );
}

import { useState } from 'react';
import { api } from '../api';

// Order form. Sends the order to place_order and shows the result or the
// database's error message.
export default function PlaceOrderForm({ accountId, instrumentId, onOrderPlaced }) {
    const [side, setSide] = useState('BUY');
    const [limitPrice, setLimitPrice] = useState('');
    const [quantity, setQuantity] = useState('');
    const [result, setResult] = useState(null);
    const [error, setError] = useState(null);
    const [submitting, setSubmitting] = useState(false);

    async function handleSubmit(e) {
        e.preventDefault();
        setError(null);
        setResult(null);
        setSubmitting(true);
        try {
            const response = await api.placeOrder({
                account_id: Number(accountId),
                instrument_id: Number(instrumentId),
                side,
                order_type: 'LIMIT',
                limit_price: Number(limitPrice),
                quantity: Number(quantity),
            });
            setResult(response);
            onOrderPlaced?.();
        } catch (err) {
            setError(err.message);
        } finally {
            setSubmitting(false);
        }
    }

    if (!accountId) return <p className="error">Enter a valid account ID (a whole number) in the header.</p>;
    if (!instrumentId) return <p>Pick an instrument first.</p>;

    return (
        <div className="place-order">
            <form onSubmit={handleSubmit}>
                <label>
                    Side
                    <select value={side} onChange={(e) => setSide(e.target.value)}>
                        <option value="BUY">BUY</option>
                        <option value="SELL">SELL</option>
                    </select>
                </label>
                <label>
                    Limit price
                    <input type="number" step="0.01" min="0.01" value={limitPrice}
                           onChange={(e) => setLimitPrice(e.target.value)} required />
                </label>
                <label>
                    Quantity
                    <input type="number" step="1" min="1" value={quantity}
                           onChange={(e) => setQuantity(e.target.value)} required />
                </label>
                <button type="submit" disabled={submitting}>
                    {submitting ? 'Placing...' : 'Place order'}
                </button>
            </form>

            {error && <p className="error">Rejected: {error}</p>}

            {result && (
                <div className="order-result">
                    <p>Order #{result.order.order_id} — status: <b>{result.order.status}</b></p>
                    {result.trades.length > 0 && (
                        <ul>
                            {result.trades.map((t) => (
                                <li key={t.trade_id}>
                                    Matched {t.quantity} @ {Number(t.price).toFixed(2)}
                                </li>
                            ))}
                        </ul>
                    )}
                </div>
            )}
        </div>
    );
}

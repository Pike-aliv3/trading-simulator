import { api } from '../api';
import { useLoad } from '../useLoad';

// Bids and asks for the selected instrument (v_order_book).
export default function OrderBook({ instrumentId, refreshKey }) {
    const { data: book, error, loading } = useLoad(
        () => (instrumentId ? api.getOrderBook(instrumentId) : Promise.resolve(null)),
        [instrumentId, refreshKey]
    );

    if (!instrumentId) return <p>Select an instrument.</p>;
    if (error) return <p className="error">Could not load the order book: {error}</p>;
    if (!book) return <p>{loading ? 'Loading order book...' : 'No data.'}</p>;

    return (
        <div className="order-book">
            <BookSide title="Bids (buyers)" rows={book.bids} emptyText="No open bids" />
            <BookSide title="Asks (sellers)" rows={book.asks} emptyText="No open asks" />
        </div>
    );
}

function BookSide({ title, rows, emptyText }) {
    return (
        <div className="book-side">
            <h4>{title}</h4>
            <table>
                <thead><tr><th>Price</th><th>Qty</th><th>Orders</th></tr></thead>
                <tbody>
                    {rows.map((row) => (
                        <tr key={row.limit_price}>
                            <td>{Number(row.limit_price).toFixed(2)}</td>
                            <td>{row.total_quantity}</td>
                            <td>{row.order_count}</td>
                        </tr>
                    ))}
                    {rows.length === 0 && <tr><td colSpan={3}>{emptyText}</td></tr>}
                </tbody>
            </table>
        </div>
    );
}

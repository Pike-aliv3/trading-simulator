// One function per backend route.
const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:4000/api';

async function request(path, options) {
    let res;
    try {
        res = await fetch(`${API_BASE}${path}`, {
            headers: { 'Content-Type': 'application/json' },
            ...options,
        });
    } catch {
        // fetch only rejects if there was no response at all
        throw new Error('Cannot reach the backend. Is it running on ' + API_BASE + ' ?');
    }

    // body might not be JSON (error page, empty)
    let data = null;
    try {
        data = await res.json();
    } catch {
        /* leave data as null */
    }
    if (!res.ok) throw new Error((data && data.error) || `request failed (${res.status})`);
    return data;
}

export const api = {
    // empty filters are left out of the query string
    listInstruments: (filters = {}) => {
        const params = new URLSearchParams();
        if (filters.search) params.set('search', filters.search);
        if (filters.sector) params.set('sector', filters.sector);
        const qs = params.toString();
        return request(`/instruments${qs ? '?' + qs : ''}`);
    },
    listSectors: () => request('/instruments/sectors'),
    getOrderBook: (instrumentId) => request(`/instruments/${instrumentId}/book`),
    getPriceHistory: (instrumentId) => request(`/instruments/${instrumentId}/history`),

    getAccountSummary: (accountId) => request(`/accounts/${accountId}/summary`),
    getPortfolio: (accountId) => request(`/accounts/${accountId}/portfolio`),
    getTrades: (accountId) => request(`/accounts/${accountId}/trades`),
    getLedger: (accountId) => request(`/accounts/${accountId}/ledger`),
    getOrders: (accountId) => request(`/accounts/${accountId}/orders`),

    deposit: (accountId, amount) =>
        request(`/accounts/${accountId}/deposit`, { method: 'POST', body: JSON.stringify({ amount }) }),
    withdraw: (accountId, amount) =>
        request(`/accounts/${accountId}/withdraw`, { method: 'POST', body: JSON.stringify({ amount }) }),

    placeOrder: (order) => request('/orders', { method: 'POST', body: JSON.stringify(order) }),
    cancelOrder: (orderId, accountId) =>
        request(`/orders/${orderId}/cancel`, {
            method: 'POST',
            body: JSON.stringify({ account_id: Number(accountId) }),
        }),

    getWatchlists: (accountId) => request(`/accounts/${accountId}/watchlists`),
    createWatchlist: (accountId, name) =>
        request(`/accounts/${accountId}/watchlists`, { method: 'POST', body: JSON.stringify({ name }) }),
    deleteWatchlist: (accountId, watchlistId) =>
        request(`/accounts/${accountId}/watchlists/${watchlistId}`, { method: 'DELETE' }),
    getWatchlistItems: (accountId, watchlistId) =>
        request(`/accounts/${accountId}/watchlists/${watchlistId}/items`),
    addToWatchlist: (accountId, watchlistId, instrumentId) =>
        request(`/accounts/${accountId}/watchlists/${watchlistId}/items`, {
            method: 'POST',
            body: JSON.stringify({ instrument_id: Number(instrumentId) }),
        }),
    removeFromWatchlist: (accountId, watchlistId, instrumentId) =>
        request(`/accounts/${accountId}/watchlists/${watchlistId}/items/${instrumentId}`, { method: 'DELETE' }),

    getReport: (name) => request(`/reports/${name}`),
};

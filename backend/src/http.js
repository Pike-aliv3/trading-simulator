// Helpers shared by the routes.

// Express 4 doesn't catch errors from async handlers, so pass them on to
// the error handler in server.js. (rest is for router.param callbacks.)
const wrap = (handler) => (req, res, next, ...rest) =>
    Promise.resolve(handler(req, res, next, ...rest)).catch(next);

// Errors from our procedures (P0001) and constraint violations (23xxx)
// are the user's fault: 400 with the database message. Anything else is 500.
function sendError(res, err) {
    const code = err && err.code;
    if (code === 'P0001' || (typeof code === 'string' && code.startsWith('23'))) {
        return res.status(400).json({ error: err.message });
    }
    console.error(err);
    return res.status(500).json({ error: 'internal server error' });
}

// "12" -> 12; anything that isn't a positive whole number up to max -> null
function toId(value, max = 2147483647) {
    if (typeof value === 'number') value = String(value);
    if (typeof value !== 'string' || !/^[1-9]\d{0,15}$/.test(value)) return null;
    const n = Number(value);
    return n <= max ? n : null;
}

module.exports = { wrap, sendError, toId };

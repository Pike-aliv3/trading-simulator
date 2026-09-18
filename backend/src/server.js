const express = require('express');
const cors = require('cors');
const { pool } = require('./db');
const { wrap, sendError } = require('./http');

const instrumentsRouter = require('./routes/instruments');
const accountsRouter = require('./routes/accounts');
const ordersRouter = require('./routes/orders');
const reportsRouter = require('./routes/reports');

const app = express();
app.use(cors());
app.use(express.json());

app.use('/api/instruments', instrumentsRouter);
app.use('/api/accounts', accountsRouter);
app.use('/api/orders', ordersRouter);
app.use('/api/reports', reportsRouter);

app.get('/api/health', wrap(async (req, res) => {
    await pool.query('SELECT 1');
    res.json({ status: 'ok' });
}));

app.use('/api', (req, res) => res.status(404).json({ error: 'no such endpoint' }));

// error handler (Express knows it by the four arguments)
app.use((err, req, res, next) => {
    if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'request body is not valid JSON' });
    if (err.type === 'entity.too.large') return res.status(413).json({ error: 'request body too large' });
    sendError(res, err);
});

const PORT = process.env.PORT || 4000;
const server = app.listen(PORT, () => console.log(`Backend listening on http://localhost:${PORT}`));
server.on('error', (err) => {
    console.error(err.code === 'EADDRINUSE' ? `Port ${PORT} is already in use.` : err);
    process.exit(1);
});

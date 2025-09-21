// Modified server.js for PostgreSQL on Render

const express = require('express');
const { Pool } = require('pg');
const bodyParser = require('body-parser');
const cors = require('cors');
const WebSocket = require('ws');
const http = require('http');
const path = require('path');

const app = express();
const server = http.createServer(app);
const port = process.env.PORT || 3000; // Render uses process.env.PORT

// WebSocket server attached to HTTP server
const wss = new WebSocket.Server({ server });

// Middleware
app.use(cors());
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, '.'))); // Serve static files (index.html, style.css, main.js, sprites, sounds)

// Handle favicon.ico to avoid 404
app.get('/favicon.ico', (req, res) => res.status(204).end());

// Database setup
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false } // For Render PostgreSQL
});

async function initDb() {
    try {
        await pool.query(`
            CREATE TABLE IF NOT EXISTS highscores (
                id SERIAL PRIMARY KEY,
                name TEXT NOT NULL,
                score INTEGER NOT NULL,
                timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);
        await pool.query(`
            CREATE TABLE IF NOT EXISTS chat_messages (
                id SERIAL PRIMARY KEY,
                name TEXT NOT NULL,
                message TEXT NOT NULL,
                timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);
        console.log('Connected to PostgreSQL database and tables created if not exist');
    } catch (err) {
        console.error('Error initializing database:', err.message);
    }
}

initDb();

// Log all requests for diagnostics
app.use((req, res, next) => {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
    next();
});

// Save high score - Update if exists and new score is higher, else insert
app.post('/api/highscore', async (req, res) => {
    const { name, score } = req.body;
    if (!name || !score) {
        return res.status(400).json({ error: 'Name and score are required' });
    }

    try {
        const existing = await pool.query('SELECT score FROM highscores WHERE name = $1', [name]);
        if (existing.rows.length > 0 && existing.rows[0].score >= score) {
            return res.json({ message: 'Score not updated, existing score is higher' });
        }

        if (existing.rows.length > 0) {
            await pool.query('UPDATE highscores SET score = $1, timestamp = CURRENT_TIMESTAMP WHERE name = $2', [score, name]);
            console.log(`Updated score for ${name}: ${score}`);
            res.json({ message: 'Score updated' });
        } else {
            await pool.query('INSERT INTO highscores (name, score) VALUES ($1, $2)', [name, score]);
            console.log(`Saved score for ${name}: ${score}`);
            res.json({ message: 'Score saved' });
        }
    } catch (err) {
        console.error('Database error:', err.message);
        res.status(500).json({ error: 'Database error' });
    }
});

// Get high scores and player rank
app.get('/api/highscores', async (req, res) => {
    const playerName = req.query.name;
    try {
        const scoresRes = await pool.query('SELECT name, score FROM highscores ORDER BY score DESC LIMIT 25');
        const scores = scoresRes.rows;

        if (!playerName) {
            return res.json({ scores, rank: null });
        }

        const rankRes = await pool.query(`
            SELECT (SELECT COUNT(*) + 1 FROM highscores WHERE score > (SELECT score FROM highscores WHERE name = $1)) as rank
        `, [playerName]);
        const rank = rankRes.rows[0] ? rankRes.rows[0].rank : null;

        console.log(`Fetched high scores: ${scores.length} entries, rank for ${playerName}: ${rank}`);
        res.json({ scores, rank });
    } catch (err) {
        console.error('Database error:', err.message);
        res.status(500).json({ error: 'Database error' });
    }
});

// Update nickname while keeping score
app.post('/api/update_nickname', async (req, res) => {
    const { old_name, new_name } = req.body;
    if (!old_name || !new_name) {
        return res.status(400).json({ error: 'Old and new names are required' });
    }
    try {
        const result = await pool.query('UPDATE highscores SET name = $1, timestamp = CURRENT_TIMESTAMP WHERE name = $2 RETURNING *', [new_name, old_name]);
        if (result.rowCount === 0) {
            return res.status(404).json({ error: 'Old nickname not found' });
        }
        console.log(`Updated nickname from ${old_name} to ${new_name}`);
        res.json({ message: 'Nickname updated' });
    } catch (err) {
        console.error('Database error:', err.message);
        res.status(500).json({ error: 'Database error' });
    }
});

// WebSocket for real-time chat
const clients = new Map(); // Store client info
wss.on('connection', (ws, req) => {
    const clientId = Math.random().toString(36).substring(2);
    console.log(`Client connected: ${clientId}`);
    clients.set(clientId, { ws, lastMessageTime: 0 });

    // Send the current online count to all clients
    wss.clients.forEach(clientWs => {
        if (clientWs.readyState === WebSocket.OPEN) {
            clientWs.send(JSON.stringify({ type: 'online_count', count: wss.clients.size }));
        }
    });

    // Send chat history (last 50 messages)
    pool.query('SELECT name, message, timestamp FROM chat_messages ORDER BY timestamp DESC LIMIT 50')
        .then(res => {
            ws.send(JSON.stringify({ type: 'chat_history', messages: res.rows.reverse() }));
        })
        .catch(err => console.error('Error fetching chat messages:', err.message));

    ws.on('message', (data) => {
        let message;
        try {
            message = JSON.parse(data);
        } catch (e) {
            console.error('Invalid message format:', e);
            return;
        }
        if (message.type === 'chat') {
            const { name, text } = message;
            const now = Date.now();
            const client = clients.get(clientId);
            if (!client) return;

            // Rate limit: 1 message every 5 seconds
            if (now - client.lastMessageTime < 5000) {
                ws.send(JSON.stringify({ type: 'error', message: 'Please wait 5 seconds before sending another message' }));
                return;
            }

            if (!name || !text || text.length > 200) {
                ws.send(JSON.stringify({ type: 'error', message: 'Invalid message or too long' }));
                return;
            }

            const chatMessage = { name, message: text, timestamp: new Date().toISOString() };
            pool.query('INSERT INTO chat_messages (name, message) VALUES ($1, $2)', [name, text])
                .then(() => {
                    client.lastMessageTime = now;
                    // Broadcast to all clients
                    wss.clients.forEach(clientWs => {
                        if (clientWs.readyState === WebSocket.OPEN) {
                            clientWs.send(JSON.stringify({ type: 'chat', message: chatMessage }));
                        }
                    });
                })
                .catch(err => console.error('Error saving chat message:', err.message));
        }
    });

    ws.on('close', () => {
        console.log(`Client disconnected: ${clientId}`);
        clients.delete(clientId);
        // Send the updated online count to all clients when a client disconnects
        wss.clients.forEach(clientWs => {
            if (clientWs.readyState === WebSocket.OPEN) {
                clientWs.send(JSON.stringify({ type: 'online_count', count: wss.clients.size }));
            }
        });
    });
});

server.listen(port, () => {
    console.log(`Server running on http://localhost:${port}`);
    console.log(`WebSocket server running on ws://localhost:${port}`);
});
// Optimized server.js for PostgreSQL Starter Plan on Render (0.5 CPU, 512MB)

const express = require('express');
const { Pool } = require('pg');
const bodyParser = require('body-parser');
const cors = require('cors');
const WebSocket = require('ws');
const http = require('http');
const path = require('path');

const app = express();
const server = http.createServer(app);
const port = process.env.PORT || 3000;

// WebSocket server
const wss = new WebSocket.Server({ server });

// Middleware
app.use(cors());
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, '.')));

// Handle favicon
app.get('/favicon.ico', (req, res) => res.status(204).end());

// Optimized PostgreSQL pool for Starter Plan (max 5 connections, 20 total limit)
let pool;
if (process.env.DATABASE_URL) {
    pool = new Pool({
        connectionString: process.env.DATABASE_URL,
        ssl: { rejectUnauthorized: false },
        max: 5, // Reduced from default 10 for Starter Plan
        idleTimeoutMillis: 10000, // Close idle connections after 10s
        connectionTimeoutMillis: 2000, // Fail fast on connection timeout
        acquireTimeoutMillis: 60000, // 1 min to acquire connection
        reapIntervalMillis: 1000, // Check every 1s
        createTimeoutMillis: 3000, // 3s to create new connection
        allowExitOnIdle: false
    });

    // Log pool events
    pool.on('connect', () => console.log('New DB connection created'));
    pool.on('acquire', () => console.log('Connection acquired from pool'));
    pool.on('remove', () => console.log('Connection removed from pool'));
    pool.on('error', (err, client) => {
        console.error('Unexpected DB pool error:', err.message);
        console.error('Client info:', client);
    });
} else {
    console.log('No DATABASE_URL, using fallback mode');
    pool = null;
}

let dbReady = false;

// Enhanced connection test with retries
async function testConnection(retries = 3) {
    for (let i = 0; i < retries; i++) {
        try {
            if (!pool) throw new Error('No database pool');
            const res = await pool.query('SELECT 1 as test', [], { 
                timeout: 5000 
            });
            console.log(`DB connection test ${i + 1}/${retries} successful:`, res.rows[0]);
            return true;
        } catch (err) {
            console.error(`DB connection test ${i + 1}/${retries} failed:`, err.message);
            if (i === retries - 1) {
                console.error('All connection attempts failed');
                return false;
            }
            await new Promise(resolve => setTimeout(resolve, 2000)); // Wait 2s before retry
        }
    }
}

// Initialize database with health check
async function initDb() {
    console.log('=== Database Initialization ===');
    console.log('DATABASE_URL present:', !!process.env.DATABASE_URL);
    
    if (!pool) {
        console.log('Using fallback (no DB) mode');
        dbReady = true;
        return;
    }

    const connected = await testConnection();
    if (!connected) {
        console.error('CRITICAL: Cannot connect to database. API will be limited.');
        dbReady = false;
        return;
    }

    try {
        // Test tables with timeout
        await pool.query(`
            CREATE TABLE IF NOT EXISTS highscores (
                id SERIAL PRIMARY KEY,
                name TEXT NOT NULL,
                score INTEGER NOT NULL,
                timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `, [], { timeout: 5000 });

        await pool.query(`
            CREATE TABLE IF NOT EXISTS chat_messages (
                id SERIAL PRIMARY KEY,
                name TEXT NOT NULL,
                message TEXT NOT NULL,
                timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `, [], { timeout: 5000 });

        console.log('✓ Tables verified/created successfully');
        dbReady = true;
    } catch (err) {
        console.error('Table creation failed:', err.message);
        dbReady = false;
    }
}

// Graceful shutdown
process.on('SIGTERM', async () => {
    console.log('SIGTERM received, shutting down gracefully');
    if (pool) {
        await pool.end();
        console.log('Pool connections closed');
    }
    server.close(() => {
        console.log('HTTP server closed');
        process.exit(0);
    });
});

// Test endpoint
app.get('/api/test-db', async (req, res) => {
    if (!pool) {
        return res.json({ connected: false, message: 'No database configured' });
    }
    
    const start = Date.now();
    const connected = await testConnection();
    const duration = Date.now() - start;
    
    res.json({ 
        connected, 
        dbReady,
        poolStats: pool.totalCount,
        duration: `${duration}ms`,
        message: connected ? 'Database is healthy' : 'Database connection failed'
    });
});

// Request logging
app.use((req, res, next) => {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
    next();
});

// API with fallback for missing DB
async function withDbQuery(fn) {
    if (!dbReady || !pool) {
        return { error: 'Database unavailable', fallback: true };
    }
    try {
        return await fn();
    } catch (err) {
        console.error('Query failed:', err.message);
        // Check if pool is still healthy
        const healthy = await testConnection();
        if (!healthy) {
            dbReady = false;
        }
        return { error: 'Database query failed', details: err.message };
    }
}

// Save high score
app.post('/api/highscore', async (req, res) => {
    const { name, score } = req.body;
    if (!name || !score) {
        return res.status(400).json({ error: 'Name and score are required' });
    }

    const result = await withDbQuery(async () => {
        const existing = await pool.query('SELECT score FROM highscores WHERE name = $1', [name], { timeout: 5000 });
        
        if (existing.rows.length > 0 && existing.rows[0].score >= score) {
            return { success: true, message: 'Score not updated, existing score is higher' };
        }

        if (existing.rows.length > 0) {
            await pool.query('UPDATE highscores SET score = $1, timestamp = CURRENT_TIMESTAMP WHERE name = $2', [score, name], { timeout: 5000 });
            return { success: true, message: 'Score updated' };
        } else {
            await pool.query('INSERT INTO highscores (name, score) VALUES ($1, $2)', [name, score], { timeout: 5000 });
            return { success: true, message: 'Score saved' };
        }
    });

    if (result.error) {
        res.status(503).json({ error: result.error });
    } else {
        console.log(`${result.message} for ${name}: ${score}`);
        res.json({ message: result.message });
    }
});

// Get high scores and rank
app.get('/api/highscores', async (req, res) => {
    const playerName = req.query.name;
    
    const result = await withDbQuery(async () => {
        const scoresRes = await pool.query('SELECT name, score FROM highscores ORDER BY score DESC LIMIT 25', [], { timeout: 5000 });
        const scores = scoresRes.rows;

        if (!playerName) {
            return { scores, rank: null };
        }

        const playerRes = await pool.query('SELECT score FROM highscores WHERE name = $1', [playerName], { timeout: 5000 });
        if (playerRes.rows.length === 0) {
            return { scores, rank: null };
        }
        
        const playerScore = playerRes.rows[0].score;
        const rankRes = await pool.query('SELECT COUNT(*) + 1 as rank FROM highscores WHERE score > $1', [playerScore], { timeout: 5000 });
        const rank = rankRes.rows[0].rank;

        return { scores, rank };
    });

    if (result.error) {
        res.status(503).json({ error: result.error });
    } else {
        console.log(`Highscores: ${result.scores.length} entries, rank for ${playerName}: ${result.rank}`);
        res.json(result);
    }
});

// Update nickname
app.post('/api/update_nickname', async (req, res) => {
    const { old_name, new_name } = req.body;
    if (!old_name || !new_name) {
        return res.status(400).json({ error: 'Old and new names are required' });
    }

    const result = await withDbQuery(async () => {
        const updateRes = await pool.query(
            'UPDATE highscores SET name = $1, timestamp = CURRENT_TIMESTAMP WHERE name = $2 RETURNING *', 
            [new_name, old_name], 
            { timeout: 5000 }
        );
        
        if (updateRes.rowCount === 0) {
            throw new Error('Old nickname not found');
        }
        return { success: true };
    });

    if (result.error) {
        if (result.details === 'Old nickname not found') {
            res.status(404).json({ error: result.details });
        } else {
            res.status(503).json({ error: result.error });
        }
    } else {
        console.log(`Nickname updated: ${old_name} -> ${new_name}`);
        res.json({ message: 'Nickname updated' });
    }
});

// Optimized WebSocket for low-resource environment
const clients = new Map();
wss.on('connection', (ws, req) => {
    const clientId = Math.random().toString(36).substring(2);
    console.log(`Client ${clientId} connected. Total: ${wss.clients.size}`);
    
    clients.set(clientId, { ws, lastMessageTime: 0 });

    // Send online count (no DB needed)
    broadcastOnlineCount();

    // Send chat history (with fallback)
    if (dbReady && pool) {
        pool.query('SELECT name, message, timestamp FROM chat_messages ORDER BY timestamp DESC LIMIT 50', [], { timeout: 3000 })
            .then(res => {
                ws.send(JSON.stringify({ type: 'chat_history', messages: res.rows.reverse() }));
            })
            .catch(err => {
                console.error(`Chat history failed for ${clientId}:`, err.message);
                ws.send(JSON.stringify({ type: 'chat_history', messages: [] }));
            });
    } else {
        ws.send(JSON.stringify({ type: 'chat_history', messages: [] }));
    }

    ws.on('message', async (data) => {
        let message;
        try {
            message = JSON.parse(data.toString());
        } catch (e) {
            console.error(`Invalid message from ${clientId}:`, e);
            return;
        }

        if (message.type === 'chat') {
            const { name, text } = message;
            const now = Date.now();
            const client = clients.get(clientId);
            
            if (!client) return;

            // Rate limiting
            if (now - client.lastMessageTime < 5000) {
                ws.send(JSON.stringify({ type: 'error', message: 'Please wait 5 seconds' }));
                return;
            }

            if (!name || !text || text.length > 200) {
                ws.send(JSON.stringify({ type: 'error', message: 'Invalid message' }));
                return;
            }

            const chatMessage = { name, message: text, timestamp: new Date().toISOString() };
            
            // Save to DB (fire and forget - don't block response)
            if (dbReady && pool) {
                pool.query('INSERT INTO chat_messages (name, message) VALUES ($1, $2)', [name, text], { timeout: 3000 })
                    .catch(err => console.error(`Chat save failed:`, err.message));
            }

            client.lastMessageTime = now;
            broadcastChat(chatMessage);
        }
    });

    ws.on('close', () => {
        console.log(`Client ${clientId} disconnected. Total: ${wss.clients.size - 1}`);
        clients.delete(clientId);
        broadcastOnlineCount();
    });

    // Cleanup on error
    ws.on('error', (err) => {
        console.error(`WebSocket error for ${clientId}:`, err.message);
        clients.delete(clientId);
    });
});

// Helper functions
function broadcastOnlineCount() {
    const count = wss.clients.size;
    wss.clients.forEach(clientWs => {
        if (clientWs.readyState === WebSocket.OPEN) {
            clientWs.send(JSON.stringify({ type: 'online_count', count }));
        }
    });
}

function broadcastChat(message) {
    wss.clients.forEach(clientWs => {
        if (clientWs.readyState === WebSocket.OPEN) {
            clientWs.send(JSON.stringify({ type: 'chat', message }));
        }
    });
}

// Health check endpoint
app.get('/health', (req, res) => {
    res.json({
        status: 'ok',
        timestamp: new Date().toISOString(),
        dbReady,
        poolConnections: pool ? pool.totalCount : 0,
        websocketClients: wss.clients.size
    });
});

server.listen(port, async () => {
    console.log(`Server running on port ${port}`);
    console.log(`WebSocket on ws://localhost:${port}`);
    
    // Initialize DB after server start
    await initDb();
    
    console.log('=== Server Ready ===');
    console.log(`DB Status: ${dbReady ? 'Ready' : 'Unavailable'}`);
    console.log(`Health check: /health`);
    console.log(`DB test: /api/test-db`);
});
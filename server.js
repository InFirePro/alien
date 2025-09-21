// Enhanced server.js with detailed query logging for debugging

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

// Optimized PostgreSQL pool
let pool;
if (process.env.DATABASE_URL) {
    pool = new Pool({
        connectionString: process.env.DATABASE_URL,
        ssl: { rejectUnauthorized: false },
        max: 5,
        idleTimeoutMillis: 10000,
        connectionTimeoutMillis: 2000
    });

    pool.on('error', (err, client) => {
        console.error('DB Pool Error:', err.message);
    });
} else {
    console.log('WARNING: No DATABASE_URL - running without DB');
    pool = null;
}

let dbReady = false;

// Enhanced logging wrapper for queries
async function executeQuery(query, params = [], options = {}) {
    if (!pool || !dbReady) {
        console.log('DB not ready, skipping query:', query);
        return { rows: [], rowCount: 0 };
    }

    const start = Date.now();
    console.log('🔍 EXECUTING:', query);
    console.log('📊 PARAMS:', params);
    
    try {
        const result = await pool.query(query, params, { timeout: 5000, ...options });
        const duration = Date.now() - start;
        
        console.log('✅ RESULT:', {
            rowsCount: result.rows?.length || 0,
            rowCount: result.rowCount || 0,
            firstRow: result.rows?.[0] || 'EMPTY',
            duration: `${duration}ms`
        });
        
        return result;
    } catch (err) {
        const duration = Date.now() - start;
        console.error('❌ QUERY FAILED:', query);
        console.error('📊 PARAMS:', params);
        console.error('💥 ERROR:', err.message);
        console.error('💥 CODE:', err.code);
        console.error('⏱️ DURATION:', `${duration}ms`);
        throw err;
    }
}

// Test connection
async function testConnection() {
    try {
        const res = await executeQuery('SELECT 1 as test');
        return res.rows?.length > 0;
    } catch (err) {
        console.error('Connection test failed:', err.message);
        return false;
    }
}

// Initialize DB
async function initDb() {
    console.log('=== 🗄️ DATABASE INITIALIZATION ===');
    
    if (!pool) {
        console.log('❌ No database pool configured');
        dbReady = false;
        return;
    }

    const connected = await testConnection();
    if (!connected) {
        console.error('❌ Database connection failed');
        dbReady = false;
        return;
    }

    try {
        // Create tables with detailed logging
        await executeQuery(`
            CREATE TABLE IF NOT EXISTS highscores (
                id SERIAL PRIMARY KEY,
                name TEXT NOT NULL,
                score INTEGER NOT NULL CHECK (score >= 0),
                timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        await executeQuery(`
            CREATE TABLE IF NOT EXISTS chat_messages (
                id SERIAL PRIMARY KEY,
                name TEXT NOT NULL,
                message TEXT NOT NULL,
                timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // Verify tables exist and count records
        const highscoresCount = await executeQuery('SELECT COUNT(*) as count FROM highscores');
        const chatCount = await executeQuery('SELECT COUNT(*) as count FROM chat_messages');
        
        console.log('📊 Initial table stats:');
        console.log(`   Highscores: ${highscoresCount.rows[0].count} records`);
        console.log(`   Chat messages: ${chatCount.rows[0].count} records`);

        dbReady = true;
        console.log('✅ Database ready!');
    } catch (err) {
        console.error('❌ Table creation failed:', err.message);
        dbReady = false;
    }
}

// Data validation helper
function validateHighscoreData(name, score) {
    const errors = [];
    
    if (!name || typeof name !== 'string' || name.trim().length === 0) {
        errors.push('Name is required and must be a non-empty string');
    } else if (name.trim().length > 50) {
        errors.push('Name must be 50 characters or less');
    }
    
    if (score === undefined || score === null) {
        errors.push('Score is required');
    } else if (isNaN(parseInt(score))) {
        errors.push('Score must be a valid number');
    } else if (parseInt(score) < 0) {
        errors.push('Score cannot be negative');
    }
    
    const cleanName = name.trim().substring(0, 50);
    const cleanScore = parseInt(score);
    
    return {
        valid: errors.length === 0,
        errors,
        cleanData: { name: cleanName, score: cleanScore }
    };
}

// Test endpoint with full diagnostics
app.get('/api/test-db', async (req, res) => {
    const connected = pool ? await testConnection() : false;
    
    // Get table stats
    let stats = { highscores: 0, chat: 0 };
    if (dbReady && pool) {
        try {
            const highscoresRes = await executeQuery('SELECT COUNT(*) as count FROM highscores');
            const chatRes = await executeQuery('SELECT COUNT(*) as count FROM chat_messages');
            stats.highscores = highscoresRes.rows[0].count;
            stats.chat = chatRes.rows[0].count;
        } catch (err) {
            console.error('Stats query failed:', err.message);
        }
    }
    
    // Sample data
    let sampleData = { highscores: [], chat: [] };
    if (dbReady && pool) {
        try {
            sampleData.highscores = await executeQuery('SELECT name, score, timestamp FROM highscores ORDER BY score DESC LIMIT 3').then(r => r.rows);
            sampleData.chat = await executeQuery('SELECT name, message, timestamp FROM chat_messages ORDER BY timestamp DESC LIMIT 3').then(r => r.rows);
        } catch (err) {
            console.error('Sample data query failed:', err.message);
        }
    }
    
    res.json({
        connected,
        dbReady,
        pool: pool ? {
            totalCount: pool.totalCount,
            idleCount: pool.idleCount,
            waitingCount: pool.waitingCount
        } : null,
        stats,
        sampleData,
        timestamp: new Date().toISOString()
    });
});

// Debug endpoint - show all data
app.get('/api/debug', async (req, res) => {
    if (!dbReady || !pool) {
        return res.status(503).json({ error: 'Database not ready' });
    }
    
    try {
        const allScores = await executeQuery('SELECT id, name, score, timestamp FROM highscores ORDER BY score DESC');
        const allChat = await executeQuery('SELECT id, name, message, timestamp FROM chat_messages ORDER BY timestamp DESC LIMIT 20');
        
        res.json({
            highscores: allScores.rows,
            chatMessages: allChat.rows,
            totalHighscores: allScores.rowCount,
            totalChat: allChat.rowCount
        });
    } catch (err) {
        res.status(500).json({ error: 'Debug query failed', details: err.message });
    }
});

// Log all requests
app.use((req, res, next) => {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.url} ${JSON.stringify(req.body || req.query)}`);
    next();
});

// Save high score with validation and detailed logging
app.post('/api/highscore', async (req, res) => {
    console.log('=== 🏆 HIGHSCORE SAVE ===');
    console.log('Raw input:', req.body);
    
    const { name, score } = req.body;
    const validation = validateHighscoreData(name, score);
    
    if (!validation.valid) {
        console.log('❌ Validation failed:', validation.errors);
        return res.status(400).json({ error: 'Invalid data', details: validation.errors });
    }
    
    const { cleanData } = validation;
    console.log('✅ Clean data:', cleanData);

    if (!dbReady || !pool) {
        console.log('❌ DB not ready, cannot save');
        return res.status(503).json({ error: 'Database unavailable' });
    }

    try {
        // Check existing score
        console.log('🔍 Checking existing score...');
        const existing = await executeQuery('SELECT score FROM highscores WHERE name = $1', [cleanData.name]);
        
        if (existing.rows.length > 0) {
            const currentScore = existing.rows[0].score;
            console.log(`📊 Current score for ${cleanData.name}: ${currentScore}, new: ${cleanData.score}`);
            
            if (currentScore >= cleanData.score) {
                console.log('⏭️ Score not higher, skipping update');
                return res.json({ message: 'Score not updated, existing score is higher or equal', current: currentScore, new: cleanData.score });
            }
            
            // Update existing
            console.log('🔄 Updating existing score...');
            const updateRes = await executeQuery(
                'UPDATE highscores SET score = $1, timestamp = CURRENT_TIMESTAMP WHERE name = $2 RETURNING id, name, score',
                [cleanData.score, cleanData.name]
            );
            
            console.log('✅ Update successful:', updateRes.rows[0]);
            return res.json({ 
                message: 'Score updated', 
                score: cleanData.score, 
                previous: currentScore 
            });
        } else {
            // Insert new
            console.log('➕ Inserting new score...');
            const insertRes = await executeQuery(
                'INSERT INTO highscores (name, score) VALUES ($1, $2) RETURNING id, name, score',
                [cleanData.name, cleanData.score]
            );
            
            console.log('✅ Insert successful:', insertRes.rows[0]);
            return res.json({ 
                message: 'Score saved', 
                score: cleanData.score, 
                id: insertRes.rows[0].id 
            });
        }
    } catch (err) {
        console.error('💥 Highscore save failed:', err.message);
        res.status(500).json({ error: 'Failed to save score', details: err.message });
    }
});

// Get high scores with rank
app.get('/api/highscores', async (req, res) => {
    console.log('=== 📊 HIGHSCORES FETCH ===');
    console.log('Query params:', req.query);
    
    const playerName = req.query.name ? req.query.name.trim() : null;
    
    if (!dbReady || !pool) {
        console.log('❌ DB not ready, returning empty');
        return res.json({ scores: [], rank: null });
    }

    try {
        // Get top 25 scores
        console.log('🔍 Fetching top 25 scores...');
        const scoresRes = await executeQuery('SELECT name, score FROM highscores ORDER BY score DESC LIMIT 25');
        const scores = scoresRes.rows;
        console.log(`📊 Found ${scores.length} high scores`);

        if (!playerName) {
            console.log('👤 No player name, returning scores only');
            return res.json({ scores, rank: null });
        }

        // Calculate rank
        console.log(`🎯 Calculating rank for: ${playerName}`);
        const playerRes = await executeQuery('SELECT score FROM highscores WHERE name = $1', [playerName]);
        
        if (playerRes.rows.length === 0) {
            console.log('❓ Player not found in highscores');
            return res.json({ scores, rank: null });
        }
        
        const playerScore = playerRes.rows[0].score;
        console.log(`📈 Player score: ${playerScore}`);
        
        const rankRes = await executeQuery(
            'SELECT (COALESCE((SELECT COUNT(*) FROM highscores WHERE score > $1), 0) + 1) as rank',
            [playerScore]
        );
        
        const rank = rankRes.rows[0].rank;
        console.log(`🏅 Player rank: ${rank}`);

        res.json({ scores, rank });
    } catch (err) {
        console.error('💥 Highscores fetch failed:', err.message);
        res.status(500).json({ error: 'Failed to fetch highscores', details: err.message });
    }
});

// Update nickname
app.post('/api/update_nickname', async (req, res) => {
    console.log('=== 👤 NICKNAME UPDATE ===');
    console.log('Input:', req.body);
    
    const { old_name, new_name } = req.body;
    const validation = validateHighscoreData(new_name, 0); // Only validate new name
    
    if (!validation.valid) {
        return res.status(400).json({ error: 'Invalid new name', details: validation.errors });
    }

    if (!old_name || typeof old_name !== 'string') {
        return res.status(400).json({ error: 'Old name is required' });
    }

    if (!dbReady || !pool) {
        return res.status(503).json({ error: 'Database unavailable' });
    }

    try {
        console.log(`🔄 Updating ${old_name} -> ${validation.cleanData.name}`);
        const result = await executeQuery(
            'UPDATE highscores SET name = $1, timestamp = CURRENT_TIMESTAMP WHERE name = $2 RETURNING id, name, score',
            [validation.cleanData.name, old_name.trim()]
        );
        
        if (result.rowCount === 0) {
            console.log('❓ Old name not found');
            return res.status(404).json({ error: 'Old nickname not found' });
        }
        
        console.log('✅ Nickname updated:', result.rows[0]);
        res.json({ message: 'Nickname updated', newName: validation.cleanData.name });
    } catch (err) {
        console.error('💥 Nickname update failed:', err.message);
        res.status(500).json({ error: 'Failed to update nickname', details: err.message });
    }
});

// WebSocket chat (simplified with better logging)
const clients = new Map();
wss.on('connection', (ws, req) => {
    const clientId = Math.random().toString(36).substring(2);
    console.log(`🔌 WS Connected: ${clientId} (${wss.clients.size} total)`);
    
    clients.set(clientId, { ws, lastMessageTime: 0 });
    broadcastOnlineCount();

    // Send chat history
    if (dbReady && pool) {
        executeQuery('SELECT name, message, timestamp FROM chat_messages ORDER BY timestamp DESC LIMIT 50')
            .then(result => {
                const messages = result.rows.reverse().map(row => ({
                    name: row.name,
                    message: row.message,
                    timestamp: row.timestamp
                }));
                ws.send(JSON.stringify({ type: 'chat_history', messages }));
                console.log(`📜 Sent ${messages.length} chat messages to ${clientId}`);
            })
            .catch(err => {
                console.error(`❌ Chat history failed for ${clientId}:`, err.message);
                ws.send(JSON.stringify({ type: 'chat_history', messages: [] }));
            });
    } else {
        ws.send(JSON.stringify({ type: 'chat_history', messages: [] }));
    }

    ws.on('message', (data) => {
        let message;
        try {
            message = JSON.parse(data.toString());
        } catch (e) {
            console.error(`❌ Invalid WS message from ${clientId}:`, e);
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
                ws.send(JSON.stringify({ type: 'error', message: 'Invalid message (max 200 chars)' }));
                return;
            }

            const chatMessage = { 
                name: name.trim().substring(0, 50), 
                message: text.trim(), 
                timestamp: new Date().toISOString() 
            };

            // Save to DB (fire and forget)
            if (dbReady && pool) {
                executeQuery('INSERT INTO chat_messages (name, message) VALUES ($1, $2)', [chatMessage.name, chatMessage.message])
                    .catch(err => console.error(`❌ Chat save failed:`, err.message));
            }

            client.lastMessageTime = now;
            broadcastChat(chatMessage);
            console.log(`💬 Chat from ${clientId}: ${chatMessage.name}: ${chatMessage.message}`);
        }
    });

    ws.on('close', () => {
        console.log(`🔌 WS Disconnected: ${clientId} (${wss.clients.size - 1} total)`);
        clients.delete(clientId);
        broadcastOnlineCount();
    });
});

// Broadcast helpers
function broadcastOnlineCount() {
    const count = wss.clients.size;
    wss.clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify({ type: 'online_count', count }));
        }
    });
}

function broadcastChat(message) {
    wss.clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify({ type: 'chat', message }));
        }
    });
}

// Health check
app.get('/health', (req, res) => {
    res.json({
        status: 'ok',
        timestamp: new Date().toISOString(),
        dbReady,
        poolConnections: pool ? pool.totalCount : 0,
        websocketClients: wss.clients.size,
        uptime: process.uptime()
    });
});

server.listen(port, async () => {
    console.log(`🚀 Server running on port ${port}`);
    await initDb();
    console.log(`✅ Ready! Health: /health | Test: /api/test-db | Debug: /api/debug`);
});

// Graceful shutdown
process.on('SIGTERM', async () => {
    console.log('🛑 Shutting down gracefully...');
    if (pool) await pool.end();
    server.close(() => process.exit(0));
});
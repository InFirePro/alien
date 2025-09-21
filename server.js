// Node.js server for high score database and real-time chat using Express, SQLite, and WebSocket

const express = require('express');
const sqlite3 = require('sqlite3').verbose();
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
const dbPath = process.env.NODE_ENV === 'production' ? '/opt/render/project/src/highscores.db' : './highscores.db';
const db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
        console.error('Error opening database:', err.message);
    } else {
        console.log('Connected to the SQLite database:', dbPath);
        db.run(`CREATE TABLE IF NOT EXISTS highscores (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            score INTEGER NOT NULL,
            timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
        )`, (err) => {
            if (err) {
                console.error('Error creating highscores table:', err.message);
            }
        });
        db.run(`CREATE TABLE IF NOT EXISTS chat_messages (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            message TEXT NOT NULL,
            timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
        )`, (err) => {
            if (err) {
                console.error('Error creating chat_messages table:', err.message);
            }
        });
    }
});

// Log all requests for diagnostics
app.use((req, res, next) => {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
    next();
});

// Save high score - Update if exists and new score is higher, else insert
app.post('/api/highscore', (req, res) => {
    const { name, score } = req.body;
    if (!name || !score) {
        return res.status(400).json({ error: 'Name and score are required' });
    }

    db.get(`SELECT score FROM highscores WHERE name = ?`, [name], (err, row) => {
        if (err) {
            console.error('Error checking existing score:', err.message);
            return res.status(500).json({ error: 'Database error' });
        }

        if (row && row.score >= score) {
            return res.json({ message: 'Score not updated, existing score is higher' });
        }

        if (row) {
            db.run(`UPDATE highscores SET score = ?, timestamp = CURRENT_TIMESTAMP WHERE name = ?`, [score, name], (err) => {
                if (err) {
                    console.error('Error updating score:', err.message);
                    return res.status(500).json({ error: 'Database error' });
                }
                console.log(`Updated score for ${name}: ${score}`);
                res.json({ message: 'Score updated' });
            });
        } else {
            db.run(`INSERT INTO highscores (name, score) VALUES (?, ?)`, [name, score], (err) => {
                if (err) {
                    console.error('Error saving score:', err.message);
                    return res.status(500).json({ error: 'Database error' });
                }
                console.log(`Saved score for ${name}: ${score}`);
                res.json({ message: 'Score saved' });
            });
        }
    });
});

// Get high scores and player rank
app.get('/api/highscores', (req, res) => {
    const playerName = req.query.name;
    db.all(`SELECT name, score FROM highscores ORDER BY score DESC LIMIT 25`, [], (err, scores) => {
        if (err) {
            console.error('Error fetching high scores:', err.message);
            return res.status(500).json({ error: 'Database error' });
        }
        if (!playerName) {
            return res.json({ scores, rank: null });
        }
        db.get(
            `SELECT (SELECT COUNT(*) + 1 FROM highscores WHERE score > (SELECT score FROM highscores WHERE name = ?)) as rank`,
            [playerName],
            (err, row) => {
                if (err) {
                    console.error('Error fetching rank:', err.message);
                    return res.status(500).json({ error: 'Database error' });
                }
                console.log(`Fetched high scores: ${scores.length} entries, rank for ${playerName}: ${row.rank}`);
                res.json({ scores, rank: row.rank });
            }
        );
    });
});

// Update nickname while keeping score
app.post('/api/update_nickname', (req, res) => {
    const { old_name, new_name } = req.body;
    if (!old_name || !new_name) {
        return res.status(400).json({ error: 'Old and new names are required' });
    }
    db.run(`UPDATE highscores SET name = ?, timestamp = CURRENT_TIMESTAMP WHERE name = ?`, [new_name, old_name], function(err) {
        if (err) {
            console.error('Error updating nickname:', err.message);
            return res.status(500).json({ error: 'Database error' });
        }
        if (this.changes === 0) {
            return res.status(404).json({ error: 'Old nickname not found' });
        }
        console.log(`Updated nickname from ${old_name} to ${new_name}`);
        res.json({ message: 'Nickname updated' });
    });
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
    db.all(`SELECT name, message, timestamp FROM chat_messages ORDER BY timestamp DESC LIMIT 50`, [], (err, rows) => {
        if (err) {
            console.error('Error fetching chat messages:', err.message);
            return;
        }
        ws.send(JSON.stringify({ type: 'chat_history', messages: rows.reverse() }));
    });

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
            db.run(`INSERT INTO chat_messages (name, message) VALUES (?, ?)`, [name, text], (err) => {
                if (err) {
                    console.error('Error saving chat message:', err.message);
                    return;
                }
                client.lastMessageTime = now;
                // Broadcast to all clients
                wss.clients.forEach(clientWs => {
                    if (clientWs.readyState === WebSocket.OPEN) {
                        clientWs.send(JSON.stringify({ type: 'chat', message: chatMessage }));
                    }
                });
            });
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
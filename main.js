// Space Alien Invaders - main.js (Improved Version with Cookie Auth, High Score DB, and Real-Time Chat)

const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

// Set canvas size
canvas.width = 1600;
canvas.height = 2000;

// Enable canvas focus for keyboard events
canvas.setAttribute('tabindex', '0');

// Game constants
const PLAYER_WIDTH = 80;
const PLAYER_HEIGHT = 30;
const PLAYER_SPEED = 6;
const BULLET_WIDTH = 6;
const BULLET_HEIGHT = 12;
const BULLET_SPEED = 12;
const ALIEN_BULLET_SPEED = 0.8;
const ALIEN_ROWS = 4;
const ALIEN_COLS = 9;
const ALIEN_WIDTH = 65;
const ALIEN_HEIGHT = 45;
const ALIEN_HORZ_PADDING = 32;
const ALIEN_VERT_PADDING = 30;
const ALIEN_X_OFFSET = 130;
const ALIEN_Y_OFFSET = 140;
const ALIEN_SPEED = 0.125;
const ALIEN_POINTS = 20;
const UFO_HIT_POINTS = ALIEN_POINTS * 5; // 60 points per hit on UFO

// UFO constants
const UFO_WIDTH = 120;
const UFO_HEIGHT = 80;
const UFO_SPEED = 1;
const UFO_HEALTH = 3; // Hits required to destroy UFO
const UFO_RESPAWN_MIN = 900; // ~15 sec at 60 FPS
const UFO_RESPAWN_MAX = 3800; // ~30 sec at 60 FPS

// Barriers
const BARRIER_WIDTH = 120;
const BARRIER_HEIGHT = 48;
const BARRIER_SEGMENT = 12;
let barriers = [];

// Game state
let player = {
    x: canvas.width / 2 - PLAYER_WIDTH / 2,
    y: canvas.height - PLAYER_HEIGHT - 20,
    width: PLAYER_WIDTH,
    height: PLAYER_HEIGHT,
    dx: 0
};

// Global timers and flags
let ufoTimer = 0;
let ufoRespawnTime = Math.floor(Math.random() * (UFO_RESPAWN_MAX - UFO_RESPAWN_MIN + 1)) + UFO_RESPAWN_MIN;
let canPlayAudio = false;
let isSoundEnabled = true; // Sound control flag
let isLevelTransitioning = false; // Prevent multiple level transitions
let paused = true; // Start game in paused state
let lastMessageTime = 0; // Track last chat message time

// НОВА: Змінна для callback модалу
let currentNicknameCallback = null;

// Cookie functions for authorization (nickname storage)
function setCookie(name, value, days) {
    document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;`;
    let expires = "";
    if (days) {
        let date = new Date();
        date.setTime(date.getTime() + (days * 24 * 60 * 60 * 1000));
        expires = "; expires=" + date.toUTCString();
    }
    document.cookie = `${name}=${encodeURIComponent(value)}${expires}; path=/`;
}

function getCookie(name) {
    let nameEQ = name + "=";
    let ca = document.cookie.split(';');
    for (let i = 0; i < ca.length; i++) {
        let c = ca[i];
        while (c.charAt(0) == ' ') c = c.substring(1, c.length);
        if (c.indexOf(nameEQ) == 0) {
            return decodeURIComponent(c.substring(nameEQ.length, c.length));
        }
    }
    return null;
}

// НОВІ: Функції для модалу
function showNicknameModal(callback) {
    currentNicknameCallback = callback;
    const modal = document.getElementById('nicknameModal');
    const input = document.getElementById('nicknameModalInput');
    if (modal && input) {
        modal.style.display = 'block';
        input.value = '';
        input.focus();
        document.body.style.overflow = 'hidden';
    }
}

function closeNicknameModal() {
    const modal = document.getElementById('nicknameModal');
    if (modal) {
        modal.style.display = 'none';
        document.body.style.overflow = 'auto';
    }
    currentNicknameCallback = null;
}

// ЗМІНА: Замість prompt — перевірка cookie і виклик модалу
let username = getCookie('username');
if (!username) {
    showNicknameModal((newUsername) => {
        username = newUsername || 'Anonymous';
        setCookie('username', username, 30);
    });
}

// WebSocket for real-time chat and leaderboard updates
const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
const ws = new WebSocket(`${protocol}//${window.location.host}`);
ws.onopen = () => console.log('WebSocket connected');
ws.onerror = (error) => console.error('WebSocket error:', error);
ws.onmessage = (event) => {
    try {
        const data = JSON.parse(event.data);
        if (data.type === 'chat') {
            addChatMessage(data.message);
        } else if (data.type === 'chat_history') {
            data.messages.forEach(msg => addChatMessage(msg));
        } else if (data.type === 'online_count') {
            const onlinePlayers = document.getElementById('onlinePlayers');
            if (onlinePlayers) {
                onlinePlayers.textContent = `Online: ${data.count}`;
            }
        } else if (data.type === 'error') {
            const chatError = document.getElementById('chatError');
            if (chatError) {
                chatError.textContent = data.message;
                setTimeout(() => {
                    chatError.textContent = '';
                }, 3000);
            }
        } else if (data.type === 'highscore_update') {
            updateLeaderboard(); // Update leaderboard dynamically
        }
    } catch (e) {
        console.error('Invalid WebSocket message:', e);
    }
};

function addChatMessage({ name, message, timestamp }) {
    const chatMessages = document.getElementById('chatMessages');
    if (!chatMessages) return;
    
    const li = document.createElement('li');
    li.textContent = `[${new Date(timestamp).toLocaleTimeString()}] ${name}: ${message}`;
    chatMessages.appendChild(li);
    chatMessages.scrollTop = chatMessages.scrollHeight;
    // Limit to 50 messages to prevent DOM overload
    while (chatMessages.children.length > 50) {
        chatMessages.removeChild(chatMessages.firstChild);
    }
}

function sendChatMessage() {
    const chatInput = document.getElementById('chatInput');
    if (!chatInput) return;
    
    const message = chatInput.value.trim();
    const now = Date.now();
    if (!message || message.length > 200) {
        const chatError = document.getElementById('chatError');
        if (chatError) {
            chatError.textContent = 'Message is empty or too long';
            setTimeout(() => {
                chatError.textContent = '';
            }, 3000);
        }
        return;
    }
    if (now - lastMessageTime < 5000) {
        const chatError = document.getElementById('chatError');
        if (chatError) {
            chatError.textContent = 'Please wait 5 seconds before sending another message';
            setTimeout(() => {
                chatError.textContent = '';
            }, 3000);
        }
        return;
    }
    if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ 
            type: 'chat', 
            name: username || 'Anonymous', 
            text: message 
        }));
        chatInput.value = '';
        lastMessageTime = now;
    }
}

// Функція для оновлення лідерборду
async function updateLeaderboard() {
    try {
        const response = await fetch(`/api/highscores?name=${encodeURIComponent(username || '')}`);
        const data = await response.json();
        const leaderboard = document.getElementById('leaderboard');
        if (leaderboard && data.scores) {
            leaderboard.innerHTML = data.scores.map((score, index) => `
                <li>${index + 1}. ${score.name}: ${score.score}</li>
            `).join('');
            
            if (data.rank) {
                const rankElement = document.getElementById('playerRank');
                if (rankElement) {
                    rankElement.textContent = `Your Rank: #${data.rank}`;
                }
            }
        }
    } catch (error) {
        console.error('Error updating leaderboard:', error);
    }
}

// Збереження високого рахунку
async function saveHighScore() {
    if (!username || score < 100) return;
    
    try {
        const response = await fetch('/api/highscore', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: username, score })
        });
        const result = await response.json();
        if (result.message) {
            updateLeaderboard();
        }
    } catch (error) {
        console.error('Error saving high score:', error);
    }
}

// Function to set nickname from input
async function setNickname() {
    const oldUsername = username;
    const nicknameInput = document.getElementById('nicknameInput');
    if (!nicknameInput) return;
    
    const newUsername = nicknameInput.value.trim() || 'Anonymous';
    if (newUsername === oldUsername) {
        nicknameInput.value = '';
        return;
    }
    
    username = newUsername;
    setCookie('username', username, 30);
    nicknameInput.value = '';
    
    if (oldUsername !== 'Anonymous') {
        await updateNicknameInDB(oldUsername, username);
    }
    updateLeaderboard();
}

// Function to update nickname in DB while keeping score
async function updateNicknameInDB(oldName, newName) {
    try {
        const response = await fetch('/api/update_nickname', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ old_name: oldName, new_name: newName })
        });
        if (response.ok) {
            console.log(`Nickname updated in database: ${oldName} -> ${newName}`);
        }
    } catch (error) {
        console.error('Error updating nickname:', error);
    }
}

// Function to toggle sound
function toggleSound() {
    isSoundEnabled = !isSoundEnabled;
    const soundButton = document.getElementById('soundButton');
    if (soundButton) {
        soundButton.textContent = isSoundEnabled ? 'Mute Sound' : 'Unmute Sound';
    }
    if (!isSoundEnabled) {
        stopAllSounds();
    }
}

// Load sprites
const playerImg = new Image();
playerImg.src = './sprites/sprite_ship_3.png';

const alienSprites = [];
for (let i = 0; i <= 4; i++) {
    let img = new Image();
    img.src = `./sprites/invader_animation_2/sprite_${i}.png`;
    alienSprites.push(img);
}

const explosionSprites = [];
for (let i = 0; i <= 7; i++) {
    let img = new Image();
    img.src = `./sprites/explotion/sprite_${i}.png`;
    explosionSprites.push(img);
}

const bulletImg = new Image();
bulletImg.src = './sprites/blaster_player/sprite_0.png';

const ufoSprites = [];
for (let i = 0; i <= 5; i++) {
    let img = new Image();
    img.src = `./sprites/final_boss_animation/sprite_${i}.png`;
    ufoSprites.push(img);
}

const backgroundImg = new Image();
backgroundImg.src = './sprites/sprites_background_2.png';

// Load sounds with error handling
const shootSound = new Audio('./sounds/shoot.wav');
shootSound.volume = 0.3;
shootSound.playbackRate = 2.0;

const explosionSoundPool = [];
for (let i = 0; i < 5; i++) {
    const sound = new Audio('./sounds/explosion.wav');
    sound.volume = 0.4;
    sound.playbackRate = 1.5;
    explosionSoundPool.push(sound);
}

const ufoSound = new Audio('./sounds/ufo.wav');
ufoSound.volume = 0.2;
ufoSound.loop = true;

const alienMoveSound = new Audio('./sounds/alien_move.wav');
alienMoveSound.volume = 0.1;
alienMoveSound.playbackRate = 1.5;
alienMoveSound.loop = true;

function stopAllSounds() {
    shootSound.pause();
    shootSound.currentTime = 0;
    explosionSoundPool.forEach(sound => {
        sound.pause();
        sound.currentTime = 0;
    });
    ufoSound.pause();
    ufoSound.currentTime = 0;
    alienMoveSound.pause();
    alienMoveSound.currentTime = 0;
}

function playExplosionSound() {
    if (!isSoundEnabled || !canPlayAudio) return;
    const sound = explosionSoundPool.find(s => s.paused || s.ended) || explosionSoundPool[0];
    sound.currentTime = 0;
    sound.play().catch(e => {});
    setTimeout(() => {
        sound.pause();
        sound.currentTime = 0;
    }, 300);
}

let lives = 3;
let maxLives = 5;
let score = 0;
let highScore = Number(localStorage.getItem('highScore')) || 0;
let level = 1;
let alienSpeed = ALIEN_SPEED;
let ufoSpeed = UFO_SPEED;
let alienBulletSpeed = ALIEN_BULLET_SPEED;
let bullets = [];
let aliens = [];
let alienDirection = 1;
let gameOver = false;
let win = false;
let alienBullets = [];
let powerUpActive = false;
let powerUpTimer = 0;
let explosions = [];

let ufo = {
    x: -UFO_WIDTH,
    y: 60,
    w: UFO_WIDTH,
    h: UFO_HEIGHT,
    alive: false,
    health: UFO_HEALTH,
    dir: 1,
    speed: ufoSpeed
};

let alienAnimFrame = 0;
let alienAnimTimer = 0;
let ufoAnimFrame = 0;
let ufoAnimTimer = 0;

async function saveHighScoreToDB(name, score) {
    try {
        const response = await fetch('/api/highscore', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ name, score })
        });
        if (response.ok) {
            updateLeaderboard();
        }
    } catch (error) {
        console.error('Error saving high score:', error);
    }
}

async function updateNicknameInDB(oldName, newName) {
    try {
        const response = await fetch('/api/update_nickname', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ old_name: oldName, new_name: newName })
        });
        if (response.ok) {
            updateLeaderboard();
        }
    } catch (error) {
        console.error('Error updating nickname:', error);
    }
}

function createAliens() {
    aliens = [];
    for (let row = 0; row < ALIEN_ROWS; row++) {
        for (let col = 0; col < ALIEN_COLS; col++) {
            aliens.push({
                x: ALIEN_X_OFFSET + col * (ALIEN_WIDTH + ALIEN_HORZ_PADDING),
                y: ALIEN_Y_OFFSET + row * (ALIEN_HEIGHT + ALIEN_VERT_PADDING),
                width: ALIEN_WIDTH,
                height: ALIEN_HEIGHT,
                alive: true,
                animFrame: 0
            });
        }
    }
}

function createBarriers() {
    barriers = [];
    const count = 4;
    const gap = (canvas.width - count * BARRIER_WIDTH) / (count + 1);
    for (let i = 0; i < count; i++) {
        let x = gap + i * (BARRIER_WIDTH + gap);
        let y = canvas.height - 160;
        let segments = [];
        for (let r = 0; r < BARRIER_HEIGHT / BARRIER_SEGMENT; r++) {
            for (let c = 0; c < BARRIER_WIDTH / BARRIER_SEGMENT; c++) {
                segments.push({
                    x: x + c * BARRIER_SEGMENT,
                    y: y + r * BARRIER_SEGMENT,
                    w: BARRIER_SEGMENT,
                    h: BARRIER_SEGMENT,
                    color: `hsl(${200 + r * 20}, 80%, 60%)`,
                    alive: true
                });
            }
        }
        barriers.push(segments);
    }
}

function drawBackground() {
    if (backgroundImg.complete && backgroundImg.naturalWidth > 0) {
        ctx.drawImage(backgroundImg, 0, 0, canvas.width, canvas.height);
    } else {
        ctx.fillStyle = '#111';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
}

function drawPlayer() {
    if (playerImg.complete && playerImg.naturalWidth > 0) {
        ctx.drawImage(playerImg, player.x, player.y, player.width, player.height);
    } else {
        ctx.fillStyle = '#0ff';
        ctx.fillRect(player.x, player.y, player.width, player.height);
    }
    ctx.fillStyle = '#fff';
    ctx.font = '24px Arial';
    ctx.textAlign = 'left';
    ctx.fillText(`Lives: ${lives}`, 20, 40);
    ctx.fillText(`Score: ${score}`, 20, 70);
    ctx.fillText(`High Score: ${highScore}`, 20, 100);
    ctx.fillText(`Level: ${level}`, 20, 130);
    if (powerUpActive) {
        ctx.fillText('Power-Up Active!', 20, 160);
    }
    ctx.fillText(`Player: ${username}`, 20, 190);
}

function drawBullets() {
    bullets.forEach(bullet => {
        if (bulletImg.complete && bulletImg.naturalWidth > 0) {
            ctx.drawImage(bulletImg, bullet.x, bullet.y, BULLET_WIDTH, BULLET_HEIGHT);
        } else {
            ctx.fillStyle = '#ff0';
            ctx.fillRect(bullet.x, bullet.y, BULLET_WIDTH, BULLET_HEIGHT);
        }
    });
    alienBullets.forEach(bullet => {
        ctx.fillStyle = '#f00';
        ctx.fillRect(bullet.x, bullet.y, BULLET_WIDTH, BULLET_HEIGHT);
    });
}

function drawBarriers() {
    barriers.forEach(barrier => {
        barrier.forEach(seg => {
            if (seg.alive) {
                ctx.fillStyle = seg.color;
                ctx.fillRect(seg.x, seg.y, seg.w, seg.h);
            }
        });
    });
}

function drawAliens() {
    aliens.forEach(alien => {
        if (alien.alive) {
            let img = alienSprites[Math.floor(alien.animFrame) % alienSprites.length];
            if (img.complete && img.naturalWidth > 0) {
                ctx.drawImage(img, alien.x, alien.y, alien.width, alien.height);
            } else {
                ctx.fillStyle = '#fff';
                ctx.fillRect(alien.x, alien.y, alien.width, alien.height);
            }
        }
    });
}

function drawUFO() {
    if (ufo.alive) {
        let img = ufoSprites[ufoAnimFrame % ufoSprites.length];
        if (img.complete && img.naturalWidth > 0) {
            ctx.drawImage(img, ufo.x, ufo.y, ufo.w, ufo.h);
        } else {
            ctx.fillStyle = '#ff0';
            ctx.fillRect(ufo.x, ufo.y, ufo.w, ufo.h);
        }
    }
}

function updateUFO() {
    if (!ufo.alive) {
        ufoTimer++;
        if (ufoTimer > ufoRespawnTime) {
            ufo.x = -ufo.w;
            ufo.dir = 1;
            ufo.alive = true;
            ufo.health = UFO_HEALTH;
            ufoTimer = 0;
            ufoRespawnTime = Math.floor(Math.random() * (UFO_RESPAWN_MAX - UFO_RESPAWN_MIN + 1)) + UFO_RESPAWN_MIN;
            if (isSoundEnabled && canPlayAudio) ufoSound.play().catch(e => {});
        }
    }
    if (ufo.alive) {
        ufo.x += ufo.speed * ufo.dir;
        if (ufo.x > canvas.width) {
            ufo.alive = false;
            ufoTimer = 0;
            if (isSoundEnabled && canPlayAudio) ufoSound.pause();
        }
    }
    ufoAnimTimer++;
    if (ufoAnimTimer > 10) {
        ufoAnimFrame = (ufoAnimFrame + 1) % ufoSprites.length;
        ufoAnimTimer = 0;
    }
}

function drawExplosions() {
    explosions.forEach(exp => {
        let img = explosionSprites[exp.frame % explosionSprites.length];
        if (img.complete && img.naturalWidth > 0) {
            ctx.drawImage(img, exp.x, exp.y, ALIEN_WIDTH, ALIEN_HEIGHT);
        } else {
            ctx.fillStyle = '#ff0';
            ctx.fillRect(exp.x, exp.y, ALIEN_WIDTH, ALIEN_HEIGHT);
        }
        exp.frame++;
        if (exp.frame >= explosionSprites.length) {
            exp.done = true;
        }
    });
    explosions = explosions.filter(exp => !exp.done);
}

function drawGameOver() {
    ctx.fillStyle = win ? '#0f0' : '#f00';
    ctx.font = '64px Arial';
    ctx.textAlign = 'center';
    ctx.fillText(win ? 'YOU WIN!' : 'GAME OVER', canvas.width / 2, canvas.height / 2);
    ctx.font = '32px Arial';
    ctx.fillStyle = '#fff';
    ctx.fillText('Press R to restart', canvas.width / 2, canvas.height / 2 + 60);
    ctx.fillText(`Score: ${score}`, canvas.width / 2, canvas.height / 2 + 100);
    ctx.fillText(`High Score: ${highScore}`, canvas.width / 2, canvas.height / 2 + 140);
    ctx.fillText(`Level: ${level}`, canvas.width / 2, canvas.height / 2 + 180);
}

function drawPaused() {
    ctx.fillStyle = '#fff';
    ctx.font = '48px Arial';
    ctx.textAlign = 'center';
    ctx.fillText('PAUSED', canvas.width / 2, canvas.height / 2);
    ctx.font = '28px Arial';
    ctx.fillText('Press P to enable controls and resume', canvas.width / 2, canvas.height / 2 + 50);
}

function updatePlayer() {
    player.x += player.dx;
    if (player.x < 0) player.x = 0;
    if (player.x + player.width > canvas.width) player.x = canvas.width - player.width;
}

function updateBullets() {
    let currentBulletSpeed = powerUpActive ? BULLET_SPEED * 1.5 : BULLET_SPEED;
    bullets.forEach(bullet => {
        bullet.y -= currentBulletSpeed;
    });
    bullets = bullets.filter(bullet => bullet.y + BULLET_HEIGHT > 0);
    alienBullets.forEach(bullet => {
        bullet.y += alienBulletSpeed;
    });
    alienBullets = alienBullets.filter(bullet => bullet.y < canvas.height);
    if (powerUpActive) {
        powerUpTimer--;
        if (powerUpTimer <= 0) powerUpActive = false;
    }
}

function alienShoot() {
    if (Math.random() < 0.015) {
        let columns = {};
        aliens.forEach(alien => {
            if (alien.alive) {
                let col = Math.floor((alien.x - ALIEN_X_OFFSET) / (ALIEN_WIDTH + ALIEN_HORZ_PADDING));
                if (!columns[col] || columns[col].y < alien.y) {
                    columns[col] = alien;
                }
            }
        });
        let bottomAliens = Object.values(columns);
        if (bottomAliens.length > 0) {
            let shooter = bottomAliens[Math.floor(Math.random() * bottomAliens.length)];
            alienBullets.push({
                x: shooter.x + shooter.width / 2 - BULLET_WIDTH / 2,
                y: shooter.y + shooter.height
            });
        }
    }
}

function updateAliens() {
    let moveDown = false;
    let aliveAliens = aliens.filter(a => a.alive);
    let leftMost = Math.min(...aliveAliens.map(a => a.x));
    let rightMost = Math.max(...aliveAliens.map(a => a.x + a.width));
    
    let step = aliveAliens.length <= 5 ? 2 : 1;
    
    if (alienDirection === 1 && rightMost + step > canvas.width) moveDown = true;
    if (alienDirection === -1 && leftMost - step < 0) moveDown = true;

    aliens.forEach(alien => {
        if (!alien.alive) return;
        if (moveDown) {
            alien.y += ALIEN_HEIGHT / 3;
        } else {
            alien.x += step * alienDirection;
        }
        alien.animFrame = (alien.animFrame + 0.1) % alienSprites.length;
    });
    if (moveDown) alienDirection *= -1;
    if (aliveAliens.length > 0 && isSoundEnabled && canPlayAudio) alienMoveSound.play().catch(e => {});
    else alienMoveSound.pause();
}

function nextLevel() {
    level++;
    alienSpeed += 0.05;
    ufoSpeed += 0.2;
    alienBulletSpeed += 0.1;
    ufo.speed = ufoSpeed;
    alienBullets = [];
    if (lives < maxLives) lives++;
    createAliens();
    resetPlayer();
    createBarriers();
    isLevelTransitioning = false;
}

function resetPlayer() {
    player.x = canvas.width / 2 - PLAYER_WIDTH / 2;
    player.y = canvas.height - PLAYER_HEIGHT - 20;
    player.dx = 0;
    bullets = [];
    alienBullets = [];
}

function checkCollisions() {
    bullets.forEach((bullet, bIdx) => {
        aliens.forEach((alien, aIdx) => {
            if (alien.alive &&
                bullet.x < alien.x + alien.width &&
                bullet.x + BULLET_WIDTH > alien.x &&
                bullet.y < alien.y + alien.height &&
                bullet.y + BULLET_HEIGHT > alien.y) {
                alien.alive = false;
                bullets.splice(bIdx, 1);
                score += ALIEN_POINTS;
                if (score > highScore) {
                    highScore = score;
                    localStorage.setItem('highScore', highScore);
                    saveHighScore();
                }
                playExplosionSound();
                explosions.push({ x: alien.x, y: alien.y, frame: 0, done: false });
            }
        });

        if (ufo.alive &&
            bullet.x < ufo.x + ufo.w &&
            bullet.x + BULLET_WIDTH > ufo.x &&
            bullet.y < ufo.y + ufo.h &&
            bullet.y + BULLET_HEIGHT > ufo.y) {
            bullets.splice(bIdx, 1);
            score += UFO_HIT_POINTS;
            ufo.health--;
            if (ufo.health <= 0) {
                ufo.alive = false;
                ufoTimer = 0;
                ufoRespawnTime = Math.floor(Math.random() * (UFO_RESPAWN_MAX - UFO_RESPAWN_MIN + 1)) + UFO_RESPAWN_MIN;
                playExplosionSound();
                explosions.push({ x: ufo.x, y: ufo.y, frame: 0, done: false });
                if (isSoundEnabled && canPlayAudio) ufoSound.pause();
            }
            if (score > highScore) {
                highScore = score;
                localStorage.setItem('highScore', highScore);
                saveHighScore();
            }
        }
    });
    aliens.forEach(alien => {
        if (alien.alive && alien.y + alien.height >= player.y) {
            lives--;
            alienBullets = [];
            playExplosionSound();
            if (lives > 0) {
                resetPlayer();
                aliens.forEach(a => { a.y -= ALIEN_HEIGHT * 2; });
            } else {
                gameOver = true;
                saveHighScore();
            }
        }
    });
    alienBullets.forEach((bullet, idx) => {
        if (bullet.x < player.x + player.width &&
            bullet.x + BULLET_WIDTH > player.x &&
            bullet.y < player.y + player.height &&
            bullet.y + BULLET_HEIGHT > player.y) {
            lives--;
            alienBullets = [];
            playExplosionSound();
            if (lives > 0) {
                resetPlayer();
            } else {
                gameOver = true;
                saveHighScore();
            }
        }
    });
}

function checkBarrierCollisions() {
    bullets = bullets.filter(bullet => {
        let hit = false;
        barriers.forEach(barrier => {
            barrier.forEach(seg => {
                if (seg.alive &&
                    bullet.x < seg.x + seg.w &&
                    bullet.x + BULLET_WIDTH > seg.x &&
                    bullet.y < seg.y + seg.h &&
                    bullet.y + BULLET_HEIGHT > seg.y) {
                    seg.alive = false;
                    hit = true;
                }
            });
        });
        return !hit;
    });

    alienBullets = alienBullets.filter(bullet => {
        let hit = false;
        barriers.forEach(barrier => {
            barrier.forEach(seg => {
                if (seg.alive &&
                    bullet.x < seg.x + seg.w &&
                    bullet.x + BULLET_WIDTH > seg.x &&
                    bullet.y < seg.y + seg.h &&
                    bullet.y + BULLET_HEIGHT > seg.y) {
                    seg.alive = false;
                    hit = true;
                }
            });
        });
        return !hit;
    });
}

gameLoop.isRunning = false;

function gameLoop() {
    if (!gameLoop.isRunning) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    drawBackground();

    if (paused) {
        drawPlayer();
        drawBullets();
        drawAliens();
        drawUFO();
        drawBarriers();
        drawExplosions();
        drawPaused();
        requestAnimationFrame(gameLoop);
        return;
    }

    if (!gameOver && !isLevelTransitioning) {
        updatePlayer();
        updateBullets();
        updateAliens();
        updateUFO();
        alienShoot();
        checkCollisions();
        checkBarrierCollisions();
        alienAnimTimer++;
        if (alienAnimTimer > 10) {
            alienAnimFrame = (alienAnimFrame + 1) % alienSprites.length;
            alienAnimTimer = 0;
        }
        drawPlayer();
        drawBullets();
        drawAliens();
        drawUFO();
        drawBarriers();
        drawExplosions();

        if (aliens.every(alien => !alien.alive)) {
            isLevelTransitioning = true;
            ctx.fillStyle = '#0ff';
            ctx.font = '48px "Courier New"';
            ctx.textAlign = 'center';
            ctx.fillText(`LEVEL ${level + 1}`, canvas.width / 2, canvas.height / 2);
            setTimeout(() => {
                nextLevel();
                requestAnimationFrame(gameLoop);
            }, 2000);
            return;
        }
        requestAnimationFrame(gameLoop);
    } else if (gameOver) {
        drawPlayer();
        drawBullets();
        drawAliens();
        drawUFO();
        drawBarriers();
        drawExplosions();
        drawGameOver();
        gameLoop.isRunning = false;
    } else {
        requestAnimationFrame(gameLoop);
    }
}

// НОВІ: Події для модалу
document.addEventListener('DOMContentLoaded', () => {
    const modal = document.getElementById('nicknameModal');
    if (!modal) return;

    const closeBtn = modal.querySelector('.close');
    const cancelBtn = document.getElementById('cancelModalBtn');
    const confirmBtn = document.getElementById('confirmModalBtn');
    const input = document.getElementById('nicknameModalInput');

    if (closeBtn) closeBtn.addEventListener('click', closeNicknameModal);
    if (cancelBtn) cancelBtn.addEventListener('click', closeNicknameModal);
    if (confirmBtn) {
        confirmBtn.addEventListener('click', () => {
            const newUsername = input ? input.value.trim() : '';
            if (currentNicknameCallback) {
                currentNicknameCallback(newUsername || 'Anonymous');
            }
            closeNicknameModal();
        });
    }
    if (input) {
        input.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                confirmBtn ? confirmBtn.click() : null;
            }
        });
    }

    // Закриття по кліку поза модалом
    window.addEventListener('click', (e) => {
        if (e.target === modal) {
            closeNicknameModal();
        }
    });

    // Закриття по Escape
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && modal.style.display === 'block') {
            closeNicknameModal();
        }
    });

    // Fix for mute button
    const muteButton = document.getElementById('muteButton');
    if (muteButton) {
        function toggleSound() {
            isSoundEnabled = !isSoundEnabled;
            muteButton.textContent = isSoundEnabled ? '🔊 Sound On' : '🔇 Mute Sound';
            muteButton.style.background = isSoundEnabled ? '#4CAF50' : '#f44336';
            if (!isSoundEnabled) {
                stopAllSounds();
            }
        }

        muteButton.addEventListener('click', function(e) {
            e.preventDefault();
            toggleSound();
            this.blur();
        });

        muteButton.addEventListener('keydown', function(e) {
            if (e.key === ' ' || e.key === 'Enter') {
                e.preventDefault();
                e.stopPropagation();
                this.blur();
                return false;
            }
        });

        muteButton.style.cssText = `
            background: ${isSoundEnabled ? '#4CAF50' : '#f44336'};
            color: white;
            border: none;
            border-radius: 4px;
            padding: 8px 12px;
            cursor: pointer;
            font-size: 14px;
            margin: 5px;
            outline: none;
        `;
        muteButton.textContent = isSoundEnabled ? '🔊 Sound On' : '🔇 Mute Sound';
    }
});

window.addEventListener('click', () => {
    canPlayAudio = true;
});

window.addEventListener('keydown', e => {
    if (e.code === 'ArrowLeft') player.dx = -PLAYER_SPEED;
    if (e.code === 'ArrowRight') player.dx = PLAYER_SPEED;
    if (e.code === 'Space' && !gameOver && !paused && !e.repeat) {
        bullets.push({
            x: player.x + player.width / 2 - BULLET_WIDTH / 2,
            y: player.y,
        });
        if (isSoundEnabled && canPlayAudio) {
            shootSound.play().catch(e => {});
        }
    }
    if (e.code === 'KeyR' && gameOver) {
        stopAllSounds();
        lives = 3;
        score = 0;
        level = 1;
        alienSpeed = ALIEN_SPEED;
        ufoSpeed = UFO_SPEED;
        alienBulletSpeed = ALIEN_BULLET_SPEED;
        ufo.speed = ufoSpeed;
        gameOver = false;
        win = false;
        paused = true;
        powerUpActive = false;
        powerUpTimer = 0;
        bullets = [];
        alienBullets = [];
        explosions = [];
        ufo = {
            x: -UFO_WIDTH,
            y: 60,
            w: UFO_WIDTH,
            h: UFO_HEIGHT,
            alive: false,
            health: UFO_HEALTH,
            dir: 1,
            speed: ufoSpeed
        };
        alienAnimFrame = 0;
        alienAnimTimer = 0;
        ufoAnimFrame = 0;
        ufoAnimTimer = 0;
        ufoTimer = 0;
        ufoRespawnTime = Math.floor(Math.random() * (UFO_RESPAWN_MAX - UFO_RESPAWN_MIN + 1)) + UFO_RESPAWN_MIN;
        createAliens();
        createBarriers();
        resetPlayer();
        gameLoop.isRunning = true;
        requestAnimationFrame(gameLoop);
    }
    if (e.code === 'KeyP') {
        paused = !paused;
        if (!paused) {
            canPlayAudio = true;
            canvas.focus();
        }
        if (paused && !isSoundEnabled) stopAllSounds();
    }
});

window.addEventListener('keyup', e => {
    if (e.code === 'ArrowLeft' || e.code === 'ArrowRight') player.dx = 0;
});

function resizeCanvas() {
    canvas.width = window.innerWidth * 0.8;
    canvas.height = window.innerHeight * 0.8;
    createBarriers();
    resetPlayer();
}

window.addEventListener('resize', resizeCanvas);
resizeCanvas();

createAliens();
createBarriers();
updateLeaderboard();
gameLoop.isRunning = true;
requestAnimationFrame(gameLoop);

function checkImageLoading(img, name) {
    img.onload = () => {};
    img.onerror = () => {};
}

checkImageLoading(playerImg, 'Player ship');
checkImageLoading(bulletImg, 'Bullet');
checkImageLoading(backgroundImg, 'Background');
alienSprites.forEach((img, i) => checkImageLoading(img, `Alien sprite ${i+1}`));
explosionSprites.forEach((img, i) => checkImageLoading(img, `Explosion sprite ${i+1}`));
ufoSprites.forEach((img, i) => checkImageLoading(img, `UFO sprite ${i+1}`));
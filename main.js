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
const UFO_HIT_POINTS = ALIEN_POINTS * 3; // 60 points per hit on UFO

// UFO constants
const UFO_WIDTH = 120;
const UFO_HEIGHT = 80;
const UFO_SPEED = 1;
const UFO_HEALTH = 3; // Hits required to destroy UFO
const UFO_RESPAWN_MIN = 900; // ~15 sec at 60 FPS
const UFO_RESPAWN_MAX = 3800; // ~30 sec at 60 FPS // ~15 sec at 60 FPS

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
    console.log(`Set cookie: ${name}=${value}, expires=${expires}`);
}

function getCookie(name) {
    let nameEQ = name + "=";
    let ca = document.cookie.split(';');
    for (let i = 0; i < ca.length; i++) {
        let c = ca[i];
        while (c.charAt(0) == ' ') c = c.substring(1, c.length);
        if (c.indexOf(nameEQ) == 0) {
            let value = decodeURIComponent(c.substring(nameEQ.length, c.length));
            console.log(`Got cookie: ${name}=${value}`);
            return value;
        }
    }
    console.log(`Cookie not found: ${name}`);
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
        document.body.style.overflow = 'hidden'; // Блок скролу сторінки
        console.log('Nickname modal shown');
    }
}

function closeNicknameModal() {
    const modal = document.getElementById('nicknameModal');
    if (modal) {
        modal.style.display = 'none';
        document.body.style.overflow = 'auto';
    }
    currentNicknameCallback = null;
    console.log('Nickname modal closed');
}

// ЗМІНА: Замість prompt — перевірка cookie і виклик модалу
let username = getCookie('username');
if (!username) {
    showNicknameModal((newUsername) => {
        username = newUsername || 'Anonymous';
        setCookie('username', username, 30); // Store for 30 days
        console.log(`New username set via modal: ${username}`);
    });
} else {
    console.log(`Existing username from cookie: ${username}`);
}

// WebSocket for real-time chat
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
            document.getElementById('chatError').textContent = data.message;
            setTimeout(() => {
                document.getElementById('chatError').textContent = '';
            }, 3000);
        }
    } catch (e) {
        console.error('Invalid WebSocket message:', e);
    }
};

function addChatMessage({ name, message, timestamp }) {
    const chatMessages = document.getElementById('chatMessages');
    const li = document.createElement('li');
    li.textContent = `[${new Date(timestamp).toLocaleTimeString()}] ${name}: ${message}`;
    chatMessages.appendChild(li);
    chatMessages.scrollTop = chatMessages.scrollHeight; // Auto-scroll to latest message
    // Limit to 50 messages to prevent DOM overload
    while (chatMessages.children.length > 50) {
        chatMessages.removeChild(chatMessages.firstChild);
    }
}

function sendChatMessage() {
    const chatInput = document.getElementById('chatInput');
    const message = chatInput.value.trim();
    const now = Date.now();
    if (!message || message.length > 200) {
        document.getElementById('chatError').textContent = 'Message is empty or too long';
        setTimeout(() => {
            document.getElementById('chatError').textContent = '';
        }, 3000);
        return;
    }
    if (now - lastMessageTime < 5000) {
        document.getElementById('chatError').textContent = 'Please wait 5 seconds before sending another message';
        setTimeout(() => {
            document.getElementById('chatError').textContent = '';
        }, 3000);
        return;
    }
    ws.send(JSON.stringify({ type: 'chat', name: username, text: message }));
    lastMessageTime = now;
    chatInput.value = '';
}

// Function to set nickname from input
async function setNickname() {
    const oldUsername = username;
    const nicknameInput = document.getElementById('nicknameInput');
    if (!nicknameInput) {
        console.error('Nickname input element not found');
        return;
    }
    const newUsername = nicknameInput.value.trim() || 'Anonymous';
    console.log(`setNickname called: oldUsername=${oldUsername}, newUsername=${newUsername}`);
    if (newUsername === oldUsername) {
        console.log('Nickname unchanged, no update needed');
        nicknameInput.value = '';
        return;
    }
    username = newUsername;
    setCookie('username', username, 30);
    nicknameInput.value = '';
    console.log(`Nickname updated locally: ${username}`);
    console.log(`Current cookies: ${document.cookie}`);
    if (oldUsername !== 'Anonymous') {
        console.log(`Updating nickname in DB: ${oldUsername} -> ${username}`);
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
        } else {
            const error = await response.json();
            console.error('Failed to update nickname:', response.status, error);
        }
    } catch (error) {
        console.error('Error updating nickname:', error);
    }
}

// Function to toggle sound
function toggleSound() {
    isSoundEnabled = !isSoundEnabled;
    const soundButton = document.getElementById('soundButton');
    soundButton.textContent = isSoundEnabled ? 'Mute Sound' : 'Unmute Sound';
    if (!isSoundEnabled) {
        stopAllSounds();
    }
    console.log('Sound toggled:', isSoundEnabled ? 'Enabled' : 'Disabled');
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
shootSound.onerror = () => console.error('Failed to load shootSound');
shootSound.volume = 0.3;
shootSound.playbackRate = 2.0;

const explosionSoundPool = [];
for (let i = 0; i < 5; i++) {
    const sound = new Audio('./sounds/explosion.wav');
    sound.onerror = () => console.error('Failed to load explosionSound');
    sound.volume = 0.4;
    sound.playbackRate = 1.5;
    explosionSoundPool.push(sound);
}

const ufoSound = new Audio('./sounds/ufo.wav');
ufoSound.onerror = () => console.error('Failed to load ufoSound');
ufoSound.volume = 0.2;
ufoSound.loop = true;

const alienMoveSound = new Audio('./sounds/alien_move.wav');
alienMoveSound.onerror = () => console.error('Failed to load alienMoveSound');
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
    sound.play().catch(e => console.error('Explosion sound play error:', e));
    setTimeout(() => {
        sound.pause();
        sound.currentTime = 0;
    }, 300); // Stop sound after 0.3 seconds
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
            console.log('High score saved/updated to database');
            updateLeaderboard();
        } else {
            console.error('Failed to save high score:', response.statusText);
        }
    } catch (error) {
        console.error('Error saving high score:', error);
    }
}

async function updateLeaderboard() {
    try {
        const response = await fetch(`/api/highscores?name=${encodeURIComponent(username)}`);
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        const { scores, rank } = await response.json();
        const leaderboard = document.getElementById('leaderboard');
        leaderboard.innerHTML = scores.map((s, i) => `<li>${i + 1}. ${s.name}: ${s.score}</li>`).join('');
        const playerRank = document.getElementById('playerRank');
        playerRank.textContent = rank `Your Rank: ${rank}`;
    } catch (error) {
        console.error('Error fetching leaderboard:', error);
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
    console.log('Aliens created:', aliens.length);
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
    console.log('Barriers created:', barriers.length);
}

function drawBackground() {
    if (backgroundImg.complete && backgroundImg.naturalWidth > 0) {
        ctx.drawImage(backgroundImg, 0, 0, canvas.width, canvas.height);
    } else {
        ctx.fillStyle = '#111'; // Dark gray background
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        console.log('Background image not loaded, using solid color');
    }
}

function drawPlayer() {
    if (playerImg.complete && playerImg.naturalWidth > 0) {
        ctx.drawImage(playerImg, player.x, player.y, player.width, player.height);
    } else {
        ctx.fillStyle = '#0ff';
        ctx.fillRect(player.x, player.y, player.width, player.height);
        console.log('Player fallback used');
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
            console.log('Bullet fallback used');
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
                console.log('Alien fallback used');
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
            console.log('UFO fallback used');
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
            if (isSoundEnabled && canPlayAudio) ufoSound.play().catch(e => console.error('UFO sound play error:', e));
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
            console.log('Explosion fallback used');
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
    let speed = aliveAliens.length <= 5 ? alienSpeed * 2 : alienSpeed;
    
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
    if (aliveAliens.length > 0 && isSoundEnabled && canPlayAudio) alienMoveSound.play().catch(e => console.error('Alien move sound error:', e));
    else alienMoveSound.pause();
}

function nextLevel() {
    level++;
    console.log('Level increased to:', level);
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
                    saveHighScoreToDB(username, highScore);
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
                saveHighScoreToDB(username, highScore);
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
                saveHighScoreToDB(username, highScore);
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
                saveHighScoreToDB(username, highScore);
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
            console.log('All aliens defeated, transitioning to level:', level + 1);
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
    console.log('Game loop running, level:', level);
}

// НОВІ: Події для модалу (додай після всіх window.addEventListener)
document.addEventListener('DOMContentLoaded', () => {
    const modal = document.getElementById('nicknameModal');
    if (!modal) return; // Якщо модал не існує, виходимо

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
});

window.addEventListener('click', () => {
    canPlayAudio = true;
    console.log('Audio enabled after user interaction');
});

window.addEventListener('keydown', e => {
    if (e.code === 'ArrowLeft') player.dx = -PLAYER_SPEED;
    if (e.code === 'ArrowRight') player.dx = PLAYER_SPEED;
    if (e.code === 'Space' && !gameOver && !paused) {  // Видаляємо && isSoundEnabled && canPlayAudio
    bullets.push({
        x: player.x + player.width / 2 - BULLET_WIDTH / 2,
        y: player.y,
    });
    if (isSoundEnabled && canPlayAudio) {  // Звук граємо окремо, якщо увімкнено
        shootSound.play().catch(e => console.error('Shoot sound error:', e));
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
            console.log('Game resumed, audio enabled, canvas focused');
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
    console.log('Canvas resized:', canvas.width, canvas.height);
}

window.addEventListener('resize', resizeCanvas);
resizeCanvas();

createAliens();
createBarriers();
updateLeaderboard();
gameLoop.isRunning = true;
requestAnimationFrame(gameLoop);

function checkImageLoading(img, name) {
    img.onload = () => console.log(`${name} загружен успешно`);
    img.onerror = () => console.error(`Ошибка загрузки ${name}. Путь: ${img.src}`);
}

checkImageLoading(playerImg, 'Корабль игрока');
checkImageLoading(bulletImg, 'Пуля');
checkImageLoading(backgroundImg, 'Фон');
alienSprites.forEach((img, i) => checkImageLoading(img, `Спрайт пришельца ${i+1}`));
explosionSprites.forEach((img, i) => checkImageLoading(img, `Спрайт взрыва ${i+1}`));
ufoSprites.forEach((img, i) => checkImageLoading(img, `Спрайт НЛО ${i+1}`));
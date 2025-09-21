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
        return;
    }
    if (now - lastMessageTime < 5000) {
        document.getElementById('chatError').textContent = 'Please wait 5 seconds before sending another message';
        setTimeout(() => {
            document.getElementById('chatError').textContent = '';
        }, 3000);
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
    if (!username || score < 100) return; // Мінімальний рахунок для збереження
    
    try {
        const response = await fetch('/api/highscore', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: username, score })
        });
        const result = await response.json();
        console.log('High score result:', result);
        if (result.message) {
            updateLeaderboard();
        }
    } catch (error) {
        console.error('Error saving high score:', error);
    }
}

// Ініціалізація чату
document.addEventListener('DOMContentLoaded', () => {
    const chatForm = document.getElementById('chatForm');
    if (chatForm) {
        chatForm.addEventListener('submit', (e) => {
            e.preventDefault();
            sendChatMessage();
        });
    }
    
    const chatInput = document.getElementById('chatInput');
    if (chatInput) {
        chatInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                sendChatMessage();
            }
        });
    }
});

// Звукові ефекти
let shootSound = new Audio('sounds/shoot.mp3');
let explosionSound = new Audio('sounds/explosion.mp3');
let ufoSound = new Audio('sounds/ufo.mp3');

function stopAllSounds() {
    shootSound.pause();
    shootSound.currentTime = 0;
    explosionSound.pause();
    explosionSound.currentTime = 0;
    ufoSound.pause();
    ufoSound.currentTime = 0;
}

// Створення пришельців
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
                row: row,
                col: col
            });
        }
    }
}

// Створення барикад
function createBarriers() {
    barriers = [];
    const barrierPositions = [
        { x: canvas.width * 0.2 - BARRIER_WIDTH / 2, y: canvas.height * 0.7 },
        { x: canvas.width * 0.5 - BARRIER_WIDTH / 2, y: canvas.height * 0.7 },
        { x: canvas.width * 0.8 - BARRIER_WIDTH / 2, y: canvas.height * 0.7 }
    ];

    barrierPositions.forEach(pos => {
        for (let row = 0; row < 4; row++) {
            for (let col = 0; col < 10; col++) {
                if (Math.random() > 0.3) { // 70% шанс на блок
                    barriers.push({
                        x: pos.x + col * (BARRIER_SEGMENT + 2),
                        y: pos.y + row * (BARRIER_SEGMENT + 2),
                        width: BARRIER_SEGMENT,
                        height: BARRIER_SEGMENT,
                        alive: true
                    });
                }
            }
        }
    });
}

// Скидання позиції гравця
function resetPlayer() {
    player.x = canvas.width / 2 - PLAYER_WIDTH / 2;
    player.y = canvas.height - PLAYER_HEIGHT - 20;
    player.dx = 0;
}

// Зображення
let playerImg = new Image();
playerImg.src = 'sprites/player.png';

let bulletImg = new Image();
bulletImg.src = 'sprites/bullet.png';

let backgroundImg = new Image();
backgroundImg.src = 'sprites/background.jpg';

let alienSprites = [
    new Image(), new Image(), new Image()
];
alienSprites[0].src = 'sprites/alien1.png';
alienSprites[1].src = 'sprites/alien2.png';
alienSprites[2].src = 'sprites/alien3.png';

let explosionSprites = [
    new Image(), new Image(), new Image(), new Image()
];
for (let i = 0; i < explosionSprites.length; i++) {
    explosionSprites[i].src = `sprites/explosion${i + 1}.png`;
}

let ufoSprites = [
    new Image(), new Image()
];
ufoSprites[0].src = 'sprites/ufo1.png';
ufoSprites[1].src = 'sprites/ufo2.png';

// Змінні для анімації
let alienAnimFrame = 0;
let alienAnimTimer = 0;
let ufoAnimFrame = 0;
let ufoAnimTimer = 0;

// Ігрові змінні
let bullets = [];
let alienBullets = [];
let aliens = [];
let explosions = [];
let ufo = {
    x: -UFO_WIDTH,
    y: 60,
    w: UFO_WIDTH,
    h: UFO_HEIGHT,
    alive: false,
    health: UFO_HEALTH,
    dir: 1,
    speed: UFO_SPEED
};

let score = 0;
let lives = 3;
let level = 1;
let gameOver = false;
let win = false;
let alienSpeed = ALIEN_SPEED;
let ufoSpeed = UFO_SPEED;
let alienBulletSpeed = ALIEN_BULLET_SPEED;
let alienDirection = 1;
let alienDrop = 0;
let powerUpActive = false;
let powerUpTimer = 0;

// Оновлення гравця
function updatePlayer() {
    player.x += player.dx;
    if (player.x < 0) player.x = 0;
    if (player.x > canvas.width - player.width) player.x = canvas.width - player.width;
}

// Оновлення куль
function updateBullets() {
    bullets = bullets.filter(bullet => {
        bullet.y -= BULLET_SPEED;
        return bullet.y > -BULLET_HEIGHT;
    });
}

// Оновлення куль пришельців
function updateAlienBullets() {
    alienBullets = alienBullets.filter(bullet => {
        bullet.y += alienBulletSpeed;
        return bullet.y < canvas.height;
    });
}

// Оновлення пришельців
function updateAliens() {
    let edgeReached = false;
    
    aliens.forEach(alien => {
        if (!alien.alive) return;
        
        alien.x += alienDirection * alienSpeed;
        if (alien.x <= 0 || alien.x + alien.width >= canvas.width) {
            edgeReached = true;
        }
    });
    
    if (edgeReached) {
        alienDirection *= -1;
        aliens.forEach(alien => {
            if (alien.alive) {
                alien.y += 20;
            }
        });
    }
}

// Оновлення НЛО
function updateUFO() {
    if (!ufo.alive) {
        ufoTimer++;
        if (ufoTimer > ufoRespawnTime) {
            ufo.alive = true;
            ufo.x = -UFO_WIDTH;
            ufo.health = UFO_HEALTH;
            ufoTimer = 0;
            ufoRespawnTime = Math.floor(Math.random() * (UFO_RESPAWN_MAX - UFO_RESPAWN_MIN + 1)) + UFO_RESPAWN_MIN;
        }
        return;
    }
    
    ufo.x += ufo.dir * ufo.speed;
    ufoAnimTimer++;
    if (ufoAnimTimer > 15) {
        ufoAnimFrame = (ufoAnimFrame + 1) % ufoSprites.length;
        ufoAnimTimer = 0;
    }
    
    if (ufo.x > canvas.width + UFO_WIDTH) {
        ufo.alive = false;
        ufo.health = UFO_HEALTH;
    }
}

// Стрілянина пришельців
function alienShoot() {
    if (Math.random() < 0.002 && alienBullets.length < 3) {
        const aliveAliens = aliens.filter(a => a.alive);
        if (aliveAliens.length > 0) {
            const shooter = aliveAliens[Math.floor(Math.random() * aliveAliens.length)];
            alienBullets.push({
                x: shooter.x + shooter.width / 2 - BULLET_WIDTH / 2,
                y: shooter.y + shooter.height
            });
        }
    }
}

// Перевірка колізій
function checkCollisions() {
    // Кулі гравця vs Пришельці
    bullets.forEach((bullet, bulletIndex) => {
        aliens.forEach((alien, alienIndex) => {
            if (alien.alive && 
                bullet.x < alien.x + alien.width &&
                bullet.x + BULLET_WIDTH > alien.x &&
                bullet.y < alien.y + alien.height &&
                bullet.y + BULLET_HEIGHT > alien.y) {
                
                alien.alive = false;
                bullets.splice(bulletIndex, 1);
                score += ALIEN_POINTS * (4 - alien.row);
                
                explosions.push({
                    x: alien.x + alien.width / 2,
                    y: alien.y + alien.height / 2,
                    frame: 0,
                    timer: 0
                });
                
                if (isSoundEnabled && canPlayAudio) {
                    explosionSound.play().catch(e => console.error('Explosion sound error:', e));
                }
            }
        });
    });
    
    // Кулі гравця vs НЛО
    bullets.forEach((bullet, bulletIndex) => {
        if (ufo.alive && 
            bullet.x < ufo.x + ufo.w &&
            bullet.x + BULLET_WIDTH > ufo.x &&
            bullet.y < ufo.y + ufo.h &&
            bullet.y + BULLET_HEIGHT > ufo.y) {
            
            ufo.health--;
            bullets.splice(bulletIndex, 1);
            score += UFO_HIT_POINTS;
            
            if (ufo.health <= 0) {
                ufo.alive = false;
                explosions.push({
                    x: ufo.x + ufo.w / 2,
                    y: ufo.y + ufo.h / 2,
                    frame: 0,
                    timer: 0
                });
                
                if (isSoundEnabled && canPlayAudio) {
                    explosionSound.play().catch(e => console.error('UFO explosion sound error:', e));
                }
            }
        }
    });
    
    // Кулі пришельців vs Гравець
    alienBullets.forEach((bullet, bulletIndex) => {
        if (bullet.x < player.x + player.width &&
            bullet.x + BULLET_WIDTH > player.x &&
            bullet.y < player.y + player.height &&
            bullet.y + BULLET_HEIGHT > player.y) {
            
            lives--;
            alienBullets.splice(bulletIndex, 1);
            
            explosions.push({
                x: player.x + player.width / 2,
                y: player.y + player.height / 2,
                frame: 0,
                timer: 0
            });
            
            if (lives <= 0) {
                gameOver = true;
                saveHighScore();
            }
        }
    });
    
    // Пришельці vs Гравець
    aliens.forEach(alien => {
        if (alien.alive && 
            alien.x < player.x + player.width &&
            alien.x + alien.width > player.x &&
            alien.y < player.y + player.height &&
            alien.y + alien.height > player.y) {
            lives = 0;
            gameOver = true;
            saveHighScore();
        }
    });
}

// Перевірка колізій з барикадами
function checkBarrierCollisions() {
    bullets.forEach((bullet, bulletIndex) => {
        barriers.forEach((barrier, barrierIndex) => {
            if (barrier.alive &&
                bullet.x < barrier.x + barrier.width &&
                bullet.x + BULLET_WIDTH > barrier.x &&
                bullet.y < barrier.y + barrier.height &&
                bullet.y + BULLET_HEIGHT > barrier.y) {
                
                barrier.alive = false;
                bullets.splice(bulletIndex, 1);
            }
        });
    });
    
    alienBullets.forEach((bullet, bulletIndex) => {
        barriers.forEach((barrier, barrierIndex) => {
            if (barrier.alive &&
                bullet.x < barrier.x + barrier.width &&
                bullet.x + BULLET_WIDTH > barrier.x &&
                bullet.y < barrier.y + barrier.height &&
                bullet.y + BULLET_HEIGHT > barrier.y) {
                
                barrier.alive = false;
                alienBullets.splice(bulletIndex, 1);
            }
        });
    });
}

// Малювання гравця
function drawPlayer() {
    if (playerImg.complete) {
        ctx.drawImage(playerImg, player.x, player.y, player.width, player.height);
    } else {
        ctx.fillStyle = '#00f';
        ctx.fillRect(player.x, player.y, player.width, player.height);
    }
}

// Малювання куль
function drawBullets() {
    bullets.forEach(bullet => {
        if (bulletImg.complete) {
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

// Малювання пришельців
function drawAliens() {
    const currentSprite = alienSprites[alienAnimFrame];
    aliens.forEach(alien => {
        if (alien.alive) {
            if (currentSprite.complete) {
                ctx.drawImage(currentSprite, alien.x, alien.y, alien.width, alien.height);
            } else {
                ctx.fillStyle = `hsl(${120 - alien.row * 30}, 70%, 50%)`;
                ctx.fillRect(alien.x, alien.y, alien.width, alien.height);
            }
        }
    });
}

// Малювання НЛО
function drawUFO() {
    if (ufo.alive) {
        const currentUFOSprite = ufoSprites[ufoAnimFrame];
        if (currentUFOSprite.complete) {
            ctx.drawImage(currentUFOSprite, ufo.x, ufo.y, ufo.w, ufo.h);
        } else {
            ctx.fillStyle = '#0f0';
            ctx.fillRect(ufo.x, ufo.y, ufo.w, ufo.h);
        }
        
        // Показуємо здоров'я НЛО
        if (ufo.health < UFO_HEALTH) {
            ctx.fillStyle = '#f00';
            ctx.fillRect(ufo.x, ufo.y - 10, (ufo.w / UFO_HEALTH) * ufo.health, 5);
        }
    }
}

// Малювання барикад
function drawBarriers() {
    barriers.forEach(barrier => {
        if (barrier.alive) {
            ctx.fillStyle = '#0a0';
            ctx.fillRect(barrier.x, barrier.y, barrier.width, barrier.height);
        }
    });
}

// Малювання вибухів
function drawExplosions() {
    explosions.forEach((explosion, index) => {
        explosion.timer++;
        if (explosion.timer > 5) {
            explosion.frame++;
            explosion.timer = 0;
        }
        
        const frame = Math.min(explosion.frame, explosionSprites.length - 1);
        const sprite = explosionSprites[frame];
        
        if (sprite.complete) {
            ctx.drawImage(sprite, 
                explosion.x - 20, 
                explosion.y - 20, 
                40, 40
            );
        } else {
            ctx.fillStyle = '#ff0';
            ctx.beginPath();
            ctx.arc(explosion.x, explosion.y, 20, 0, Math.PI * 2);
            ctx.fill();
        }
        
        if (explosion.frame >= explosionSprites.length - 1) {
            explosions.splice(index, 1);
        }
    });
}

// Екран "Game Over"
function drawGameOver() {
    ctx.fillStyle = 'rgba(0, 0, 0, 0.8)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    ctx.fillStyle = '#fff';
    ctx.font = '48px "Courier New"';
    ctx.textAlign = 'center';
    ctx.fillText('GAME OVER', canvas.width / 2, canvas.height / 2 - 50);
    
    ctx.font = '24px "Courier New"';
    ctx.fillText(`Final Score: ${score}`, canvas.width / 2, canvas.height / 2);
    ctx.fillText('Press R to Restart', canvas.width / 2, canvas.height / 2 + 50);
}

// Наступний рівень
function nextLevel() {
    level++;
    alienSpeed *= 1.1;
    ufoSpeed *= 1.05;
    alienBulletSpeed *= 1.02;
    ufo.speed = ufoSpeed;
    alienDirection = 1;
    isLevelTransitioning = false;
    createAliens();
    createBarriers();
    resetPlayer();
}

// Основний ігровий цикл
const gameLoop = {
    isRunning: false
};

function gameLoop() {
    if (paused && !gameOver) {
        ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        
        ctx.fillStyle = '#fff';
        ctx.font = '48px "Courier New"';
        ctx.textAlign = 'center';
        ctx.fillText('PAUSED', canvas.width / 2, canvas.height / 2);
        ctx.font = '24px "Courier New"';
        ctx.fillText('Press P to Resume', canvas.width / 2, canvas.height / 2 + 50);
        
        requestAnimationFrame(gameLoop);
        return;
    }
    
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    if (backgroundImg.complete) {
        ctx.drawImage(backgroundImg, 0, 0, canvas.width, canvas.height);
    }
    
    if (!gameOver && !win) {
        updatePlayer();
        updateBullets();
        updateAlienBullets();
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

// === ФІКС ДЛЯ КНОПКИ MUTE ===
// Проблема: після кліку мишкою кнопка отримує фокус і Space/Enter перемикає стан назад
document.addEventListener('DOMContentLoaded', () => {
    const muteButton = document.getElementById('muteButton');
    if (!muteButton) {
        console.log('⚠️ Mute button not found');
        return;
    }

    console.log('🔧 Initializing mute button fix');

    let clickInProgress = false;
    let lastClickTime = 0;

    // Функція для безпечного перемикання звуку
    function safeToggleSound() {
        const now = Date.now();
        
        // Дебонс: не дозволяти частіші 200ms кліки
        if (now - lastClickTime < 200) {
            console.log('⏳ Click debounced');
            return;
        }
        
        lastClickTime = now;
        clickInProgress = true;
        
        // Перемикаємо звук
        isSoundEnabled = !isSoundEnabled;
        muteButton.textContent = isSoundEnabled ? '🔊 Sound On' : '🔇 Mute Sound';
        muteButton.style.background = isSoundEnabled ? '#4CAF50' : '#f44336';
        
        console.log(`🔊 Sound toggled: ${isSoundEnabled ? 'ON' : 'OFF'}`);
        
        // Скидання флагу через 300ms
        setTimeout(() => {
            clickInProgress = false;
        }, 300);
    }

    // Обробники подій для кнопки
    muteButton.addEventListener('click', (e) => {
        e.preventDefault(); // Блокуємо стандартну поведінку
        safeToggleSound();
        
        // Видаляємо фокус одразу
        muteButton.blur();
    });

    // Блокуємо повторну активацію клавіатурою
    muteButton.addEventListener('keydown', (e) => {
        if (e.key === ' ' || e.key === 'Enter') {
            e.preventDefault();
            e.stopPropagation();
            
            if (!clickInProgress) {
                safeToggleSound();
                muteButton.blur(); // Видаляємо фокус
            } else {
                console.log('🚫 Keyboard activation blocked during click');
            }
        }
    });

    // Додатковий захист: blur при втраті фокусу
    muteButton.addEventListener('blur', () => {
        // Фокус пішов - можна скидати флаги
        setTimeout(() => {
            clickInProgress = false;
        }, 50);
    });

    // Ініціалізація стану кнопки
    muteButton.textContent = isSoundEnabled ? '🔊 Sound On' : '🔇 Mute Sound';
    muteButton.style.background = isSoundEnabled ? '#4CAF50' : '#f44336';
    muteButton.style.border = 'none';
    muteButton.style.borderRadius = '4px';
    muteButton.style.padding = '8px 12px';
    muteButton.style.cursor = 'pointer';
    muteButton.style.color = 'white';
    muteButton.style.fontSize = '14px';
    muteButton.style.margin = '5px';

    console.log('✅ Mute button fixed and initialized');
});

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
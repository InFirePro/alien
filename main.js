// Space Alien Invaders - main.js (Improved Version with Error Handling)

const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

// Set canvas size
canvas.width = 2000;
canvas.height = 2000;

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

// UFO constants
const UFO_WIDTH = 120;
const UFO_HEIGHT = 0;
const UFO_SPEED = 1;

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
let canPlayAudio = false;

// Загрузка спрайтов игрока
const playerImg = new Image();
playerImg.src = './sprites/sprite_ship_3.png';

// Загрузка спрайтов пришельцев
const alienSprites = [];
for (let i = 0; i <= 4; i++) {
    let img = new Image();
    img.src = `./sprites/invader_animation_2/sprite_${i}.png`;
    alienSprites.push(img);
}

// Загрузка спрайтов взрыва
const explosionSprites = [];
for (let i = 0; i <= 7; i++) {
    let img = new Image();
    img.src = `./sprites/explotion/sprite_${i}.png`;
    explosionSprites.push(img);
}

// Загрузка спрайтов выстрела
const bulletImg = new Image();
bulletImg.src = './sprites/blaster_player/sprite_0.png';

// Загрузка спрайтов босса
const ufoSprites = [];
for (let i = 0; i <= 5; i++) {
    let img = new Image();
    img.src = `./sprites/final_boss_animation/sprite_${i}.png`;
    ufoSprites.push(img);
}

// Загрузка фона
const backgroundImg = new Image();
backgroundImg.src = './sprites/sprites_background_2.png';

// Load sounds with error handling
const shootSound = new Audio('./sounds/shoot.wav');
shootSound.onerror = () => console.error('Failed to load shootSound');
shootSound.volume = 0.3; // Уменьшаем громкость
shootSound.playbackRate = 2.0; // Ускоряем воспроизведение

const explosionSound = new Audio('./sounds/explosion.wav');
explosionSound.onerror = () => console.error('Failed to load explosionSound');
explosionSound.volume = 0.4;
explosionSound.playbackRate = 1.5;

const ufoSound = new Audio('./sounds/ufo.wav');
ufoSound.onerror = () => console.error('Failed to load ufoSound');
ufoSound.volume = 0.2;
ufoSound.loop = true;

const alienMoveSound = new Audio('./sounds/alien_move.wav');
alienMoveSound.onerror = () => console.error('Failed to load alienMoveSound');
alienMoveSound.volume = 0.1;
alienMoveSound.playbackRate = 1.5;
alienMoveSound.loop = true;

// Добавьте функцию для остановки всех звуков
function stopAllSounds() {
    shootSound.pause();
    shootSound.currentTime = 0;
    explosionSound.pause();
    explosionSound.currentTime = 0;
    ufoSound.pause();
    ufoSound.currentTime = 0;
    alienMoveSound.pause();
    alienMoveSound.currentTime = 0;
}

let lives = 3;
let score = 0;
let highScore = Number(localStorage.getItem('highScore')) || 0;
let level = 1;
let alienSpeed = ALIEN_SPEED;
let bullets = [];
let aliens = [];
let alienDirection = 1;
let gameOver = false;
let win = false;
let alienBullets = [];
let paused = false;
let powerUpActive = false;
let powerUpTimer = 0;
// Добавляем массив для взрывов
let explosions = [];

// UFO state
let ufo = {
    x: -UFO_WIDTH,
    y: 60,
    w: UFO_WIDTH,
    h: UFO_HEIGHT,
    alive: false,
    dir: 1,
    speed: UFO_SPEED
};

// Animation variables
let alienAnimFrame = 0;
let alienAnimTimer = 0;
let ufoAnimFrame = 0;
let ufoAnimTimer = 0;

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
    if (backgroundImg.complete) {
        ctx.drawImage(backgroundImg, 0, 0, canvas.width, canvas.height);
    } else {
        ctx.fillStyle = '#000';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        for (let i = 0; i < 100; i++) {
            ctx.fillStyle = '#fff';
            ctx.fillRect(Math.random() * canvas.width, Math.random() * canvas.height, 2, 2);
        }
        console.log('Background fallback used');
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
    if (!ufo.alive && Math.random() < 0.002 && ufoTimer > 600) {
        ufo.x = -ufo.w;
        ufo.dir = 1;
        ufo.alive = true;
        ufoTimer = 0;
        if (canPlayAudio) ufoSound.play().catch(e => console.error('UFO sound play error:', e));
    }
    if (ufo.alive) {
        ufo.x += ufo.speed * ufo.dir;
        if (ufo.x > canvas.width) {
            ufo.alive = false;
            ufoTimer = 0;
        }
    } else {
        ufoTimer++;
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
    ctx.fillText('Press P to resume', canvas.width / 2, canvas.height / 2 + 50);
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
        bullet.y += ALIEN_BULLET_SPEED;
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
    
    // Уменьшим шаг движения
    let step = aliveAliens.length <= 5 ? 2 : 1; // Уменьшили с 3 и 1.5 до 2 и 1
    let speed = aliveAliens.length <= 5 ? alienSpeed * 2 : alienSpeed; // Уменьшили множитель с 3 до 2
    
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
    if (aliveAliens.length > 0 && canPlayAudio) alienMoveSound.play().catch(e => console.error('Alien move sound error:', e));
    else alienMoveSound.pause();
}

function nextLevel() {
    level++;
    alienSpeed += 0.1; // Уменьшили с 0.2 до 0.1
    createAliens();
    resetPlayer();
    createBarriers();
}

function resetPlayer() {
    player.x = canvas.width / 2 - PLAYER_WIDTH / 2;
    player.y = canvas.height - PLAYER_HEIGHT - 20;
    player.dx = 0;
    bullets = [];
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
                score += 20;
                if (score > highScore) {
                    highScore = score;
                    localStorage.setItem('highScore', highScore);
                }
                if (canPlayAudio) explosionSound.play().catch(e => console.error('Explosion sound error:', e));
                explosions.push({ x: alien.x, y: alien.y, frame: 0, done: false });
            }
        });
    });
    aliens.forEach(alien => {
        if (alien.alive && alien.y + alien.height >= player.y) {
            lives--;
            if (canPlayAudio) explosionSound.play().catch(e => console.error('Explosion sound error:', e));
            if (lives > 0) {
                resetPlayer();
                aliens.forEach(a => { a.y -= ALIEN_HEIGHT * 2; });
            } else {
                gameOver = true;
            }
        }
    });
    if (aliens.every(alien => !alien.alive)) {
        win = true;
        setTimeout(() => {
            win = false;
            nextLevel();
        }, 1500);
    }
    alienBullets.forEach((bullet, idx) => {
        if (bullet.x < player.x + player.width &&
            bullet.x + BULLET_WIDTH > player.x &&
            bullet.y < player.y + player.height &&
            bullet.y + BULLET_HEIGHT > player.y) {
            lives--;
            alienBullets.splice(idx, 1);
            if (canPlayAudio) explosionSound.play().catch(e => console.error('Explosion sound error:', e));
            if (lives > 0) {
                resetPlayer();
            } else {
                gameOver = true;
            }
        }
    });
}

function checkBarrierCollisions() {
    bullets.forEach((bullet, bIdx) => {
        barriers.forEach(barrier => {
            barrier.forEach((seg, sIdx) => {
                if (seg.alive &&
                    bullet.x < seg.x + seg.w &&
                    bullet.x + BULLET_WIDTH > seg.x &&
                    bullet.y < seg.y + seg.h &&
                    bullet.y + BULLET_HEIGHT > seg.y) {
                    seg.alive = false;
                    bullets.splice(bIdx, 1);
                }
            });
        });
    });
    alienBullets.forEach((bullet, abIdx) => {
        barriers.forEach(barrier => {
            barrier.forEach((seg, sIdx) => {
                if (seg.alive &&
                    bullet.x < seg.x + seg.w &&
                    bullet.x + BULLET_WIDTH > seg.x &&
                    bullet.y < seg.y + seg.h &&
                    bullet.y + BULLET_HEIGHT > seg.y) {
                    seg.alive = false;
                    alienBullets.splice(abIdx, 1);
                }
            });
        });
    });
}

// Game loop state
gameLoop.isRunning = true;

function gameLoop() {
    if (!gameLoop.isRunning) return;
    
    if (paused) {
        drawPaused();
        requestAnimationFrame(gameLoop);
        return;
    }
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    drawBackground();
    if (!gameOver) {
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
        
        // Проверка победы (все пришельцы уничтожены)
        if (aliens.every(alien => !alien.alive)) {
            // Вместо остановки игры, переходим на следующий уровень
            level++;
            alienSpeed += 0.05; // Небольшое увеличение скорости
            createAliens(); // Создаем новых пришельцев
            
            // Восстанавливаем барьеры (опционально)
            createBarriers();
            
            // Добавляем бонусные очки за прохождение уровня
            score += 1000;
            
            // Обновляем высший счет
            if (score > highScore) {
                highScore = score;
                localStorage.setItem('highScore', highScore);
            }
            
            // Отображаем сообщение о новом уровне
            ctx.fillStyle = '#0ff';
            ctx.font = '48px "Courier New"';
            ctx.fillText(`LEVEL ${level}`, canvas.width / 2 - 100, canvas.height / 2);
            
            // Небольшая пауза перед началом нового уровня
            setTimeout(() => {
                // Продолжаем игровой цикл
                requestAnimationFrame(gameLoop);
            }, 2000);
            
            return;
        }

        requestAnimationFrame(gameLoop);
    } else {
        drawPlayer();
        drawBullets();
        drawAliens();
        drawUFO();
        drawBarriers();
        drawExplosions();
        drawGameOver();
        gameLoop.isRunning = false;
    }
    console.log('Game loop running');
}

// Enable audio on first interaction
window.addEventListener('click', () => {
    canPlayAudio = true;
    console.log('Audio enabled after user interaction');
});

// Controls
window.addEventListener('keydown', e => {
    if (e.code === 'ArrowLeft') player.dx = -PLAYER_SPEED;
    if (e.code === 'ArrowRight') player.dx = PLAYER_SPEED;
    if (e.code === 'Space' && !gameOver && !paused && canPlayAudio) {
        bullets.push({
            x: player.x + player.width / 2 - BULLET_WIDTH / 2,
            y: player.y,
        });
        shootSound.play().catch(e => console.error('Shoot sound error:', e));
    }
    if (e.code === 'KeyR' && gameOver) {
        // Остановка всех звуков
        stopAllSounds();
        
        // Сброс основных игровых переменных
        lives = 3;
        score = 0;
        level = 1;
        alienSpeed = ALIEN_SPEED;
        gameOver = false;
        win = false;
        paused = false;
        powerUpActive = false;
        powerUpTimer = 0;

        // Сброс массивов
        bullets = [];
        alienBullets = [];
        explosions = [];
        
        // Сброс НЛО
        ufo = {
            x: -UFO_WIDTH,
            y: 60,
            w: UFO_WIDTH,
            h: UFO_HEIGHT,
            alive: false,
            dir: 1,
            speed: UFO_SPEED
        };
        
        // Сброс таймеров анимации
        alienAnimFrame = 0;
        alienAnimTimer = 0;
        ufoAnimFrame = 0;
        ufoAnimTimer = 0;
        ufoTimer = 0;

        // Пересоздание игровых объектов
        createAliens();
        createBarriers();
        resetPlayer();

        // Перезапуск игрового цикла
        if (!gameLoop.isRunning) {
            gameLoop.isRunning = true;
            requestAnimationFrame(gameLoop);
        }
    }
    if (e.code === 'KeyP') {
        paused = !paused;
    }
});
window.addEventListener('keyup', e => {
    if (e.code === 'ArrowLeft' || e.code === 'ArrowRight') player.dx = 0;
});

// Responsive canvas
function resizeCanvas() {
    canvas.width = window.innerWidth * 0.8;
    canvas.height = window.innerHeight * 0.8;
    createBarriers();
    resetPlayer();
    console.log('Canvas resized:', canvas.width, canvas.height);
}
window.addEventListener('resize', resizeCanvas);
resizeCanvas();

// Start game
createAliens();
createBarriers();
gameLoop();

// Проверка загрузки изображений
function checkImageLoading(img, name) {
    img.onload = () => console.log(`${name} загружен успешно`);
    img.onerror = () => console.error(`Ошибка загрузки ${name}. Путь: ${img.src}`);
}

// Применение проверки к изображениям
checkImageLoading(playerImg, 'Корабль игрока');
checkImageLoading(bulletImg, 'Пуля');
checkImageLoading(backgroundImg, 'Фон');

alienSprites.forEach((img, i) => checkImageLoading(img, `Спрайт пришельца ${i+1}`));
explosionSprites.forEach((img, i) => checkImageLoading(img, `Спрайт взрыва ${i+1}`));
ufoSprites.forEach((img, i) => checkImageLoading(img, `Спрайт НЛО ${i+1}`));
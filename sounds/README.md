# Space Alien Invaders (Improved Version)

An enhanced Space Invaders-style game with better graphics, sounds, and gameplay.

## Improvements

- High-quality pixel art sprites from OpenGameArt[](https://opengameart.org/content/pixel-space-invaders). Unpack the ZIPs into `sprites/` with names like invader_animation_1.png, explosion_1.png.
- Added sound effects (download from https://pixabay.com/sound-effects/search/space%20invaders/ or https://classicgaming.cc/classics/space-invaders/sounds, place in `sounds/` as .wav).
- Starry background, explosions, power-ups (faster bullets from UFO), pause feature.
- Responsive canvas, smoother animations, more aliens and levels.

## How to Play

- Left/Right arrows: Move
- Space: Shoot
- P: Pause
- R: Restart after game over
- Destroy aliens, avoid bullets, score points!

## Setup

1. Create `sprites/` and unpack downloaded ZIPs (e.g., invader_animation_2.zip -> invader_animation_1.png etc.).
2. Create `sounds/` and add audio files (shoot.wav, explosion.wav, ufo.wav, alien_move.wav).
3. Open `index.html` in browser.

## Files

- `index.html` — Main file
- `style.css` — Styles
- `main.js` — Game logic
- `sprites/` — Images
- `sounds/` — Audio

## Troubleshooting

- Open browser console (F12) to see errors if canvas doesn't display.
- If sprites or sounds fail to load, check file names and paths in `main.js`.
- Ensure all files are in the same directory as `index.html`.

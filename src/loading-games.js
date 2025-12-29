/**
 * Loading Screen Mini-Games Module
 * Provides retro-style mini-games (Breakout, Tetris, Snake) during loading screens.
 */

import { getExtensionAssetPath } from '../index.js';
import { pauseLoadingMusic, resumeLoadingMusic } from './loading-screen.js';

// State
let gamePanel = null;
let activeGame = null;
let gameCanvas = null;
let gameCtx = null;
let animationFrame = null;
let keydownHandler = null;
let keyupHandler = null;
let gameAudio = null;

// Audio configuration
const GAME_MUSIC = 'assets/music/airWaves.mp3';
const AUDIO_FADE_DURATION = 500;

// Retro color palette
const COLORS = {
    black: '#000000',
    white: '#ffffff',
    green: '#00ff00',
    red: '#ff0000',
    blue: '#0000ff',
    yellow: '#ffff00',
    cyan: '#00ffff',
    magenta: '#ff00ff',
    orange: '#ff8800',
    purple: '#8800ff',
    darkGreen: '#008800',
    darkGray: '#333333',
    lightGray: '#888888',
};

// Game configurations
const GAMES = {
    snake: {
        name: 'Snake',
        icon: '🐍',
        width: 240,
        height: 240,
        controls: '← → ↑ ↓ or WASD',
    },
    breakout: {
        name: 'Breakout',
        icon: '🧱',
        width: 240,
        height: 320,
        controls: '← → or A/D',
    },
    tetris: {
        name: 'Tetris',
        icon: '🟦',
        width: 200,
        height: 400,
        controls: '← → ↓ / ↑ to rotate',
    },
};

// ============================================
// Snake Game
// ============================================
class SnakeGame {
    constructor(canvas, ctx) {
        this.canvas = canvas;
        this.ctx = ctx;
        this.gridSize = 12;
        this.tileCount = 20;
        this.reset();
    }

    reset() {
        this.snake = [{ x: 10, y: 10 }];
        this.direction = { x: 1, y: 0 };
        this.nextDirection = { x: 1, y: 0 };
        this.food = this.spawnFood();
        this.score = 0;
        this.gameOver = false;
        this.lastMoveTime = 0;
        this.moveInterval = 120; // ms between moves
    }

    spawnFood() {
        let pos;
        do {
            pos = {
                x: Math.floor(Math.random() * this.tileCount),
                y: Math.floor(Math.random() * this.tileCount),
            };
        } while (this.snake.some(s => s.x === pos.x && s.y === pos.y));
        return pos;
    }

    handleInput(key) {
        if (this.gameOver) {
            if (key === 'Enter' || key === ' ') {
                this.reset();
            }
            return;
        }

        const directions = {
            ArrowUp: { x: 0, y: -1 },
            ArrowDown: { x: 0, y: 1 },
            ArrowLeft: { x: -1, y: 0 },
            ArrowRight: { x: 1, y: 0 },
            w: { x: 0, y: -1 },
            s: { x: 0, y: 1 },
            a: { x: -1, y: 0 },
            d: { x: 1, y: 0 },
            W: { x: 0, y: -1 },
            S: { x: 0, y: 1 },
            A: { x: -1, y: 0 },
            D: { x: 1, y: 0 },
        };

        const newDir = directions[key];
        if (newDir) {
            // Prevent reversing
            if (newDir.x !== -this.direction.x || newDir.y !== -this.direction.y) {
                this.nextDirection = newDir;
            }
        }
    }

    update(timestamp) {
        if (this.gameOver) return;

        if (timestamp - this.lastMoveTime < this.moveInterval) return;
        this.lastMoveTime = timestamp;

        this.direction = this.nextDirection;

        // Move snake
        const head = {
            x: this.snake[0].x + this.direction.x,
            y: this.snake[0].y + this.direction.y,
        };

        // Wall collision
        if (head.x < 0 || head.x >= this.tileCount || head.y < 0 || head.y >= this.tileCount) {
            this.gameOver = true;
            return;
        }

        // Self collision
        if (this.snake.some(s => s.x === head.x && s.y === head.y)) {
            this.gameOver = true;
            return;
        }

        this.snake.unshift(head);

        // Food collision
        if (head.x === this.food.x && head.y === this.food.y) {
            this.score += 10;
            this.food = this.spawnFood();
            // Speed up slightly
            this.moveInterval = Math.max(50, this.moveInterval - 2);
        } else {
            this.snake.pop();
        }
    }

    render() {
        const ctx = this.ctx;
        const size = this.gridSize;

        // Background
        ctx.fillStyle = COLORS.black;
        ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

        // Grid lines (subtle)
        ctx.strokeStyle = COLORS.darkGray;
        ctx.lineWidth = 1;
        for (let i = 0; i <= this.tileCount; i++) {
            ctx.beginPath();
            ctx.moveTo(i * size, 0);
            ctx.lineTo(i * size, this.canvas.height);
            ctx.stroke();
            ctx.beginPath();
            ctx.moveTo(0, i * size);
            ctx.lineTo(this.canvas.width, i * size);
            ctx.stroke();
        }

        // Food
        ctx.fillStyle = COLORS.red;
        ctx.fillRect(this.food.x * size + 1, this.food.y * size + 1, size - 2, size - 2);

        // Snake
        this.snake.forEach((segment, i) => {
            ctx.fillStyle = i === 0 ? COLORS.green : COLORS.darkGreen;
            ctx.fillRect(segment.x * size + 1, segment.y * size + 1, size - 2, size - 2);
        });

        // Game over
        if (this.gameOver) {
            ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
            ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

            ctx.fillStyle = COLORS.red;
            ctx.font = '16px monospace';
            ctx.textAlign = 'center';
            ctx.fillText('GAME OVER', this.canvas.width / 2, this.canvas.height / 2 - 10);

            ctx.fillStyle = COLORS.white;
            ctx.font = '12px monospace';
            ctx.fillText(`Score: ${this.score}`, this.canvas.width / 2, this.canvas.height / 2 + 10);
            ctx.fillText('Press ENTER to restart', this.canvas.width / 2, this.canvas.height / 2 + 30);
        }
    }

    getScore() {
        return this.score;
    }
}

// ============================================
// Breakout Game
// ============================================
class BreakoutGame {
    constructor(canvas, ctx) {
        this.canvas = canvas;
        this.ctx = ctx;
        this.reset();
    }

    reset() {
        // Paddle
        this.paddleWidth = 50;
        this.paddleHeight = 8;
        this.paddleX = (this.canvas.width - this.paddleWidth) / 2;
        this.paddleSpeed = 6;
        this.paddleMoving = 0; // -1 left, 0 none, 1 right

        // Ball
        this.ballSize = 6;
        this.ballX = this.canvas.width / 2;
        this.ballY = this.canvas.height - 40;
        this.ballSpeedX = 3;
        this.ballSpeedY = -3;

        // Bricks
        this.brickRowCount = 5;
        this.brickColumnCount = 8;
        this.brickWidth = 26;
        this.brickHeight = 10;
        this.brickPadding = 2;
        this.brickOffsetTop = 30;
        this.brickOffsetLeft = 8;
        this.bricks = [];

        const brickColors = [COLORS.red, COLORS.orange, COLORS.yellow, COLORS.green, COLORS.cyan];
        for (let c = 0; c < this.brickColumnCount; c++) {
            this.bricks[c] = [];
            for (let r = 0; r < this.brickRowCount; r++) {
                this.bricks[c][r] = { x: 0, y: 0, active: true, color: brickColors[r] };
            }
        }

        this.score = 0;
        this.lives = 3;
        this.gameOver = false;
        this.won = false;
    }

    handleInput(key) {
        if (this.gameOver || this.won) {
            if (key === 'Enter' || key === ' ') {
                this.reset();
            }
            return;
        }
    }

    handleKeyDown(key) {
        if (key === 'ArrowLeft' || key === 'a' || key === 'A') {
            this.paddleMoving = -1;
        } else if (key === 'ArrowRight' || key === 'd' || key === 'D') {
            this.paddleMoving = 1;
        }
        this.handleInput(key);
    }

    handleKeyUp(key) {
        if ((key === 'ArrowLeft' || key === 'a' || key === 'A') && this.paddleMoving === -1) {
            this.paddleMoving = 0;
        } else if ((key === 'ArrowRight' || key === 'd' || key === 'D') && this.paddleMoving === 1) {
            this.paddleMoving = 0;
        }
    }

    update() {
        if (this.gameOver || this.won) return;

        // Move paddle
        this.paddleX += this.paddleMoving * this.paddleSpeed;
        this.paddleX = Math.max(0, Math.min(this.canvas.width - this.paddleWidth, this.paddleX));

        // Move ball
        this.ballX += this.ballSpeedX;
        this.ballY += this.ballSpeedY;

        // Wall collisions
        if (this.ballX <= 0 || this.ballX >= this.canvas.width - this.ballSize) {
            this.ballSpeedX = -this.ballSpeedX;
        }
        if (this.ballY <= 0) {
            this.ballSpeedY = -this.ballSpeedY;
        }

        // Paddle collision
        if (
            this.ballY + this.ballSize >= this.canvas.height - this.paddleHeight - 10 &&
            this.ballY + this.ballSize <= this.canvas.height - 10 &&
            this.ballX + this.ballSize >= this.paddleX &&
            this.ballX <= this.paddleX + this.paddleWidth
        ) {
            this.ballSpeedY = -Math.abs(this.ballSpeedY);
            // Angle based on hit position
            const hitPos = (this.ballX + this.ballSize / 2 - this.paddleX) / this.paddleWidth;
            this.ballSpeedX = 6 * (hitPos - 0.5);
        }

        // Bottom (lose life)
        if (this.ballY >= this.canvas.height) {
            this.lives--;
            if (this.lives <= 0) {
                this.gameOver = true;
            } else {
                this.ballX = this.canvas.width / 2;
                this.ballY = this.canvas.height - 40;
                this.ballSpeedX = 3 * (Math.random() > 0.5 ? 1 : -1);
                this.ballSpeedY = -3;
            }
        }

        // Brick collisions
        let bricksRemaining = 0;
        for (let c = 0; c < this.brickColumnCount; c++) {
            for (let r = 0; r < this.brickRowCount; r++) {
                const brick = this.bricks[c][r];
                if (!brick.active) continue;
                bricksRemaining++;

                const brickX = c * (this.brickWidth + this.brickPadding) + this.brickOffsetLeft;
                const brickY = r * (this.brickHeight + this.brickPadding) + this.brickOffsetTop;
                brick.x = brickX;
                brick.y = brickY;

                if (
                    this.ballX + this.ballSize > brickX &&
                    this.ballX < brickX + this.brickWidth &&
                    this.ballY + this.ballSize > brickY &&
                    this.ballY < brickY + this.brickHeight
                ) {
                    brick.active = false;
                    this.ballSpeedY = -this.ballSpeedY;
                    this.score += 10;
                    bricksRemaining--;
                }
            }
        }

        if (bricksRemaining === 0) {
            this.won = true;
        }
    }

    render() {
        const ctx = this.ctx;

        // Background
        ctx.fillStyle = COLORS.black;
        ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

        // Bricks
        for (let c = 0; c < this.brickColumnCount; c++) {
            for (let r = 0; r < this.brickRowCount; r++) {
                const brick = this.bricks[c][r];
                if (!brick.active) continue;
                ctx.fillStyle = brick.color;
                ctx.fillRect(brick.x, brick.y, this.brickWidth, this.brickHeight);
            }
        }

        // Paddle
        ctx.fillStyle = COLORS.white;
        ctx.fillRect(this.paddleX, this.canvas.height - this.paddleHeight - 10, this.paddleWidth, this.paddleHeight);

        // Ball
        ctx.fillStyle = COLORS.white;
        ctx.fillRect(this.ballX, this.ballY, this.ballSize, this.ballSize);

        // Lives
        ctx.fillStyle = COLORS.white;
        ctx.font = '10px monospace';
        ctx.textAlign = 'left';
        ctx.fillText(`Lives: ${this.lives}`, 5, 15);

        // Game over / Won
        if (this.gameOver || this.won) {
            ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
            ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

            ctx.fillStyle = this.won ? COLORS.green : COLORS.red;
            ctx.font = '16px monospace';
            ctx.textAlign = 'center';
            ctx.fillText(this.won ? 'YOU WIN!' : 'GAME OVER', this.canvas.width / 2, this.canvas.height / 2 - 10);

            ctx.fillStyle = COLORS.white;
            ctx.font = '12px monospace';
            ctx.fillText(`Score: ${this.score}`, this.canvas.width / 2, this.canvas.height / 2 + 10);
            ctx.fillText('Press ENTER to restart', this.canvas.width / 2, this.canvas.height / 2 + 30);
        }
    }

    getScore() {
        return this.score;
    }
}

// ============================================
// Tetris Game
// ============================================
class TetrisGame {
    constructor(canvas, ctx) {
        this.canvas = canvas;
        this.ctx = ctx;
        this.blockSize = 20;
        this.cols = 10;
        this.rows = 20;
        this.reset();
    }

    reset() {
        this.board = Array(this.rows).fill(null).map(() => Array(this.cols).fill(0));
        this.score = 0;
        this.gameOver = false;
        this.lastDropTime = 0;
        this.dropInterval = 500;
        this.currentPiece = null;
        this.currentX = 0;
        this.currentY = 0;
        this.spawnPiece();
    }

    // Tetromino shapes
    static PIECES = [
        { shape: [[1, 1, 1, 1]], color: COLORS.cyan },       // I
        { shape: [[1, 1], [1, 1]], color: COLORS.yellow },   // O
        { shape: [[0, 1, 0], [1, 1, 1]], color: COLORS.purple }, // T
        { shape: [[1, 0, 0], [1, 1, 1]], color: COLORS.blue },   // J
        { shape: [[0, 0, 1], [1, 1, 1]], color: COLORS.orange }, // L
        { shape: [[0, 1, 1], [1, 1, 0]], color: COLORS.green },  // S
        { shape: [[1, 1, 0], [0, 1, 1]], color: COLORS.red },    // Z
    ];

    spawnPiece() {
        const piece = TetrisGame.PIECES[Math.floor(Math.random() * TetrisGame.PIECES.length)];
        this.currentPiece = {
            shape: piece.shape.map(row => [...row]),
            color: piece.color,
        };
        this.currentX = Math.floor((this.cols - this.currentPiece.shape[0].length) / 2);
        this.currentY = 0;

        if (this.checkCollision(this.currentX, this.currentY, this.currentPiece.shape)) {
            this.gameOver = true;
        }
    }

    checkCollision(x, y, shape) {
        for (let row = 0; row < shape.length; row++) {
            for (let col = 0; col < shape[row].length; col++) {
                if (!shape[row][col]) continue;
                const newX = x + col;
                const newY = y + row;
                if (newX < 0 || newX >= this.cols || newY >= this.rows) return true;
                if (newY >= 0 && this.board[newY][newX]) return true;
            }
        }
        return false;
    }

    rotatePiece() {
        const shape = this.currentPiece.shape;
        const rotated = shape[0].map((_, i) => shape.map(row => row[i]).reverse());
        if (!this.checkCollision(this.currentX, this.currentY, rotated)) {
            this.currentPiece.shape = rotated;
        }
    }

    movePiece(dx) {
        if (!this.checkCollision(this.currentX + dx, this.currentY, this.currentPiece.shape)) {
            this.currentX += dx;
        }
    }

    dropPiece() {
        if (!this.checkCollision(this.currentX, this.currentY + 1, this.currentPiece.shape)) {
            this.currentY++;
        } else {
            this.lockPiece();
        }
    }

    hardDrop() {
        while (!this.checkCollision(this.currentX, this.currentY + 1, this.currentPiece.shape)) {
            this.currentY++;
        }
        this.lockPiece();
    }

    lockPiece() {
        const shape = this.currentPiece.shape;
        for (let row = 0; row < shape.length; row++) {
            for (let col = 0; col < shape[row].length; col++) {
                if (!shape[row][col]) continue;
                const boardY = this.currentY + row;
                const boardX = this.currentX + col;
                if (boardY >= 0) {
                    this.board[boardY][boardX] = this.currentPiece.color;
                }
            }
        }
        this.clearLines();
        this.spawnPiece();
    }

    clearLines() {
        let linesCleared = 0;
        for (let row = this.rows - 1; row >= 0; row--) {
            if (this.board[row].every(cell => cell !== 0)) {
                this.board.splice(row, 1);
                this.board.unshift(Array(this.cols).fill(0));
                linesCleared++;
                row++; // Check same row again
            }
        }
        const points = [0, 100, 300, 500, 800];
        this.score += points[linesCleared] || 0;

        // Speed up
        if (linesCleared > 0) {
            this.dropInterval = Math.max(100, this.dropInterval - 10);
        }
    }

    handleInput(key) {
        if (this.gameOver) {
            if (key === 'Enter' || key === ' ') {
                this.reset();
            }
            return;
        }

        switch (key) {
            case 'ArrowLeft':
            case 'a':
            case 'A':
                this.movePiece(-1);
                break;
            case 'ArrowRight':
            case 'd':
            case 'D':
                this.movePiece(1);
                break;
            case 'ArrowDown':
            case 's':
            case 'S':
                this.dropPiece();
                break;
            case 'ArrowUp':
            case 'w':
            case 'W':
                this.rotatePiece();
                break;
            case ' ':
                this.hardDrop();
                break;
        }
    }

    update(timestamp) {
        if (this.gameOver) return;

        if (timestamp - this.lastDropTime >= this.dropInterval) {
            this.dropPiece();
            this.lastDropTime = timestamp;
        }
    }

    render() {
        const ctx = this.ctx;
        const size = this.blockSize;

        // Background
        ctx.fillStyle = COLORS.black;
        ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

        // Grid
        ctx.strokeStyle = COLORS.darkGray;
        ctx.lineWidth = 1;
        for (let x = 0; x <= this.cols; x++) {
            ctx.beginPath();
            ctx.moveTo(x * size, 0);
            ctx.lineTo(x * size, this.rows * size);
            ctx.stroke();
        }
        for (let y = 0; y <= this.rows; y++) {
            ctx.beginPath();
            ctx.moveTo(0, y * size);
            ctx.lineTo(this.cols * size, y * size);
            ctx.stroke();
        }

        // Board
        for (let row = 0; row < this.rows; row++) {
            for (let col = 0; col < this.cols; col++) {
                if (this.board[row][col]) {
                    ctx.fillStyle = this.board[row][col];
                    ctx.fillRect(col * size + 1, row * size + 1, size - 2, size - 2);
                }
            }
        }

        // Current piece
        if (this.currentPiece && !this.gameOver) {
            ctx.fillStyle = this.currentPiece.color;
            for (let row = 0; row < this.currentPiece.shape.length; row++) {
                for (let col = 0; col < this.currentPiece.shape[row].length; col++) {
                    if (this.currentPiece.shape[row][col]) {
                        const x = (this.currentX + col) * size;
                        const y = (this.currentY + row) * size;
                        ctx.fillRect(x + 1, y + 1, size - 2, size - 2);
                    }
                }
            }
        }

        // Game over
        if (this.gameOver) {
            ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
            ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

            ctx.fillStyle = COLORS.red;
            ctx.font = '16px monospace';
            ctx.textAlign = 'center';
            ctx.fillText('GAME OVER', this.canvas.width / 2, this.canvas.height / 2 - 10);

            ctx.fillStyle = COLORS.white;
            ctx.font = '12px monospace';
            ctx.fillText(`Score: ${this.score}`, this.canvas.width / 2, this.canvas.height / 2 + 10);
            ctx.fillText('Press ENTER to restart', this.canvas.width / 2, this.canvas.height / 2 + 30);
        }
    }

    getScore() {
        return this.score;
    }
}

// ============================================
// Audio Management
// ============================================

/**
 * Start playing game music with fade in
 */
async function startGameMusic() {
    if (gameAudio) return; // Already playing

    try {
        const musicUrl = getExtensionAssetPath(GAME_MUSIC);
        gameAudio = new Audio(musicUrl);
        gameAudio.loop = true;
        gameAudio.volume = 0;

        await gameAudio.play();

        // Fade in
        const fadeStep = 50;
        const volumeIncrement = 0.4 / (AUDIO_FADE_DURATION / fadeStep);
        const fadeIn = setInterval(() => {
            if (!gameAudio) {
                clearInterval(fadeIn);
                return;
            }
            if (gameAudio.volume < 0.4) {
                gameAudio.volume = Math.min(0.4, gameAudio.volume + volumeIncrement);
            } else {
                clearInterval(fadeIn);
            }
        }, fadeStep);
    } catch (err) {
        console.warn('[Timeline Memory] Could not play game music:', err.message);
        gameAudio = null;
    }
}

/**
 * Stop game music with fade out
 */
function stopGameMusic() {
    if (!gameAudio) return;

    const fadeStep = 50;
    const volumeDecrement = gameAudio.volume / (AUDIO_FADE_DURATION / fadeStep);

    const fadeOut = setInterval(() => {
        if (!gameAudio) {
            clearInterval(fadeOut);
            return;
        }
        if (gameAudio.volume > 0.05) {
            gameAudio.volume = Math.max(0, gameAudio.volume - volumeDecrement);
        } else {
            clearInterval(fadeOut);
            gameAudio.pause();
            gameAudio = null;
        }
    }, fadeStep);
}

// ============================================
// Panel Management
// ============================================

/**
 * Create the games sidebar panel
 */
export function createGamePanel() {
    if (gamePanel) return;

    gamePanel = document.createElement('div');
    gamePanel.id = 'rmr-games-sidebar';

    gamePanel.innerHTML = `
        <div class="rmr-games-icons">
            <button class="rmr-game-btn" data-game="snake" title="Snake">🐍</button>
            <button class="rmr-game-btn" data-game="breakout" title="Breakout">🧱</button>
            <button class="rmr-game-btn" data-game="tetris" title="Tetris">🟦</button>
        </div>
        <div class="rmr-games-canvas-container" style="display: none;">
            <div class="rmr-games-header">
                <span class="rmr-games-title">Game</span>
                <button class="rmr-games-close" title="Close">✕</button>
            </div>
            <canvas id="rmr-game-canvas"></canvas>
            <div class="rmr-games-score">Score: 0</div>
            <div class="rmr-games-controls">Controls</div>
        </div>
        <div class="rmr-games-complete-overlay" style="display: none;">
            <span>Loading Complete!</span>
        </div>
    `;

    // Set up event listeners for game buttons
    gamePanel.querySelectorAll('.rmr-game-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const gameName = btn.dataset.game;
            startGame(gameName);
        });
    });

    // Close button
    gamePanel.querySelector('.rmr-games-close').addEventListener('click', () => {
        closeGame();
    });

    document.body.appendChild(gamePanel);
}

/**
 * Show the games panel
 */
export function showGamePanel() {
    if (gamePanel) {
        gamePanel.style.display = 'flex';
    }
}

/**
 * Hide the games panel with optional warning
 * @param {boolean} showWarning - Whether to show "Loading Complete!" message
 */
export function hideGamePanel(showWarning = false) {
    if (!gamePanel) return;

    if (showWarning && activeGame) {
        // Show warning overlay
        const overlay = gamePanel.querySelector('.rmr-games-complete-overlay');
        overlay.style.display = 'flex';

        // Hide after animation
        setTimeout(() => {
            cleanupGames();
            gamePanel.style.display = 'none';
            overlay.style.display = 'none';
        }, 1500);
    } else {
        cleanupGames();
        gamePanel.style.display = 'none';
    }
}

/**
 * Start a game
 * @param {string} gameName - Game name (snake, breakout, tetris)
 */
function startGame(gameName) {
    const config = GAMES[gameName];
    if (!config) return;

    // Close any existing game
    closeGame();

    // Set up canvas
    const container = gamePanel.querySelector('.rmr-games-canvas-container');
    gameCanvas = gamePanel.querySelector('#rmr-game-canvas');
    gameCanvas.width = config.width;
    gameCanvas.height = config.height;
    gameCtx = gameCanvas.getContext('2d');

    // Update UI
    container.style.display = 'block';
    gamePanel.querySelector('.rmr-games-title').textContent = config.name;
    gamePanel.querySelector('.rmr-games-controls').textContent = config.controls;

    // Create game instance
    switch (gameName) {
        case 'snake':
            activeGame = new SnakeGame(gameCanvas, gameCtx);
            break;
        case 'breakout':
            activeGame = new BreakoutGame(gameCanvas, gameCtx);
            break;
        case 'tetris':
            activeGame = new TetrisGame(gameCanvas, gameCtx);
            break;
    }

    // Set up keyboard handlers
    keydownHandler = (e) => {
        if (!activeGame) return;
        // Prevent default for arrow keys to avoid scrolling
        if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' '].includes(e.key)) {
            e.preventDefault();
        }
        if (activeGame.handleKeyDown) {
            activeGame.handleKeyDown(e.key);
        } else {
            activeGame.handleInput(e.key);
        }
    };

    keyupHandler = (e) => {
        if (!activeGame) return;
        if (activeGame.handleKeyUp) {
            activeGame.handleKeyUp(e.key);
        }
    };

    document.addEventListener('keydown', keydownHandler);
    document.addEventListener('keyup', keyupHandler);

    // Pause loading screen music and start game music
    pauseLoadingMusic();
    startGameMusic();

    // Start game loop
    gameLoop(performance.now());
}

/**
 * Close the current game
 */
function closeGame() {
    // Only do cleanup if a game was actually active
    const wasGameActive = activeGame !== null;

    if (wasGameActive) {
        // Stop game music and resume loading screen music
        stopGameMusic();
        resumeLoadingMusic();
    }

    if (animationFrame) {
        cancelAnimationFrame(animationFrame);
        animationFrame = null;
    }

    if (keydownHandler) {
        document.removeEventListener('keydown', keydownHandler);
        keydownHandler = null;
    }

    if (keyupHandler) {
        document.removeEventListener('keyup', keyupHandler);
        keyupHandler = null;
    }

    activeGame = null;

    if (gamePanel) {
        const container = gamePanel.querySelector('.rmr-games-canvas-container');
        if (container) {
            container.style.display = 'none';
        }
    }
}

/**
 * Game loop
 * @param {number} timestamp - Current timestamp
 */
function gameLoop(timestamp) {
    if (!activeGame) return;

    activeGame.update(timestamp);
    activeGame.render();

    // Update score display
    if (gamePanel) {
        const scoreEl = gamePanel.querySelector('.rmr-games-score');
        if (scoreEl) {
            scoreEl.textContent = `Score: ${activeGame.getScore()}`;
        }
    }

    animationFrame = requestAnimationFrame(gameLoop);
}

/**
 * Clean up all game resources
 */
export function cleanupGames() {
    closeGame();

    if (gamePanel && gamePanel.parentNode) {
        gamePanel.parentNode.removeChild(gamePanel);
    }

    gamePanel = null;
    gameCanvas = null;
    gameCtx = null;
}

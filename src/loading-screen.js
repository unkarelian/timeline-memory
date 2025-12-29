/**
 * Loading Screen Module
 * Provides a fullscreen loading screen with ambient music, backgrounds, and fun facts
 * for timeline fill, agentic timeline fill, and lore management sessions.
 */

import { getExtensionAssetPath } from '../index.js';
import { createGamePanel, showGamePanel, hideGamePanel, cleanupGames, setGameCallbacks } from './loading-games.js';

// State
let loadingOverlay = null;
let audioElement = null;
let quoteInterval = null;
let abortCallback = null;
let currentQuoteIndex = 0;

// Configuration
const QUOTE_ROTATION_INTERVAL = 8000; // 8 seconds
const AUDIO_FADE_DURATION = 1000; // 1 second fade

// Fun facts array
const funFacts = [
    "The first computer bug was an actual moth found in a relay.",
    "Honey never spoils. Archaeologists found 3000-year-old honey that was still edible.",
    "Octopuses have three hearts and blue blood.",
    "A group of flamingos is called a 'flamboyance'.",
    "The shortest war in history lasted 38 to 45 minutes.",
    "Bananas are berries, but strawberries aren't.",
    "The inventor of the Pringles can is buried in one.",
    "A jiffy is an actual unit of time: 1/100th of a second.",
    "The Hawaiian alphabet only has 12 letters.",
    "Cows have best friends and get stressed when separated.",
    "The unicorn is Scotland's national animal.",
    "A day on Venus is longer than a year on Venus.",
    "Humans share 60% of their DNA with bananas.",
    "The shortest complete sentence in English is 'Go.'",
    "A group of porcupines is called a 'prickle'.",
    "The longest hiccuping spree lasted 68 years.",
    "Cleopatra lived closer in time to the Moon landing than to the construction of the Great Pyramid.",
    "There are more possible iterations of a game of chess than atoms in the observable universe.",
    "The dot over the letters 'i' and 'j' is called a 'tittle'.",
];

// Mode display names
const modeDisplayNames = {
    'timeline-fill': 'Timeline Retrieval',
    'agentic': 'Agentic Timeline Fill',
    'lore-management': 'Lore Management',
};

/**
 * Paired background and music assets.
 * Each pair is selected together when the loading screen appears.
 * Edit this array to add your own background/music combinations.
 *
 * background: filename in assets/backgrounds/ (png, jpg, jpeg, gif, webp)
 * music: filename in assets/music/ (mp3, ogg, wav) - can be null for no music
 */
const assetPairs = [
    { background: 'waterfall.png', music: 'uwasotemperate.mp3' },
    { background: 'castleTown.png', music: 'myCastleTown.mp3' },
    { background: 'fireplace.png', music: 'fireplace.mp3' },
    // Add more pairs here:
    // { background: 'your-image.png', music: 'your-music.mp3' },
    // { background: 'silent-bg.jpg', music: null }, // no music for this one
];

// Currently selected pair (set when loading screen is shown)
let currentPair = null;

/**
 * Shuffle array using Fisher-Yates algorithm
 * @param {Array} array - Array to shuffle
 * @returns {Array} Shuffled array
 */
function shuffleArray(array) {
    const shuffled = [...array];
    for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
}

/**
 * Select a random asset pair for the current loading screen
 */
function selectRandomPair() {
    if (assetPairs.length === 0) {
        currentPair = null;
        return;
    }
    currentPair = assetPairs[Math.floor(Math.random() * assetPairs.length)];
}

/**
 * Get the background URL from the current pair, or null if none
 * @returns {string|null}
 */
function getCurrentBackground() {
    if (!currentPair || !currentPair.background) return null;
    return getExtensionAssetPath(`assets/backgrounds/${currentPair.background}`);
}

/**
 * Get the music URL from the current pair, or null if none
 * @returns {string|null}
 */
function getCurrentMusic() {
    if (!currentPair || !currentPair.music) return null;
    return getExtensionAssetPath(`assets/music/${currentPair.music}`);
}

/**
 * Create the loading screen HTML
 * @param {string} mode - The current mode
 * @returns {HTMLElement}
 */
function createLoadingOverlay(mode) {
    const overlay = document.createElement('div');
    overlay.id = 'rmr-loading-screen';
    overlay.className = 'rmr-loading-screen-overlay';

    const modeText = modeDisplayNames[mode] || 'Processing';
    const randomQuote = funFacts[Math.floor(Math.random() * funFacts.length)];

    overlay.innerHTML = `
        <div class="rmr-loading-screen-background"></div>
        <div class="rmr-loading-screen-particles"></div>
        <div class="rmr-loading-screen-content">
            <div class="rmr-loading-screen-header">
                <i class="fa-solid fa-brain fa-beat-fade rmr-loading-icon"></i>
                <span class="rmr-loading-mode-text">${modeText}</span>
            </div>
            <div class="rmr-loading-quote-container">
                <p class="rmr-loading-quote">"${randomQuote}"</p>
            </div>
            <button class="rmr-loading-abort-btn" type="button">
                <i class="fa-solid fa-stop"></i> Abort
            </button>
        </div>
    `;

    return overlay;
}

/**
 * Start rotating quotes
 */
function startQuoteRotation() {
    const shuffledFacts = shuffleArray(funFacts);
    currentQuoteIndex = 0;

    quoteInterval = setInterval(() => {
        if (!loadingOverlay) return;

        const quoteElement = loadingOverlay.querySelector('.rmr-loading-quote');
        if (!quoteElement) return;

        // Fade out
        quoteElement.style.opacity = '0';

        setTimeout(() => {
            currentQuoteIndex = (currentQuoteIndex + 1) % shuffledFacts.length;
            quoteElement.textContent = `"${shuffledFacts[currentQuoteIndex]}"`;
            // Fade in
            quoteElement.style.opacity = '1';
        }, 300);
    }, QUOTE_ROTATION_INTERVAL);
}

/**
 * Stop quote rotation
 */
function stopQuoteRotation() {
    if (quoteInterval) {
        clearInterval(quoteInterval);
        quoteInterval = null;
    }
}

/**
 * Start playing ambient music with fade in
 * @param {string} musicUrl - URL to the music file
 */
async function startMusic(musicUrl) {
    if (!musicUrl) return;

    try {
        audioElement = new Audio(musicUrl);
        audioElement.loop = true;
        audioElement.volume = 0;

        await audioElement.play();

        // Fade in
        const fadeStep = 50;
        const volumeIncrement = 1 / (AUDIO_FADE_DURATION / fadeStep);
        const fadeIn = setInterval(() => {
            if (!audioElement) {
                clearInterval(fadeIn);
                return;
            }
            if (audioElement.volume < 0.5) {
                audioElement.volume = Math.min(0.5, audioElement.volume + volumeIncrement);
            } else {
                clearInterval(fadeIn);
            }
        }, fadeStep);
    } catch (err) {
        console.warn('[Timeline Memory] Could not play loading screen music:', err.message);
        audioElement = null;
    }
}

/**
 * Pause music (for when games are playing)
 */
export function pauseLoadingMusic() {
    if (!audioElement) return;

    const fadeStep = 50;
    const volumeDecrement = audioElement.volume / (AUDIO_FADE_DURATION / fadeStep);

    const fadeOut = setInterval(() => {
        if (!audioElement) {
            clearInterval(fadeOut);
            return;
        }
        if (audioElement.volume > 0.05) {
            audioElement.volume = Math.max(0, audioElement.volume - volumeDecrement);
        } else {
            clearInterval(fadeOut);
            audioElement.pause();
        }
    }, fadeStep);
}

/**
 * Resume music (when games stop)
 */
export function resumeLoadingMusic() {
    if (!audioElement) return;

    audioElement.play().then(() => {
        // Fade in
        const fadeStep = 50;
        const volumeIncrement = 1 / (AUDIO_FADE_DURATION / fadeStep);
        const fadeIn = setInterval(() => {
            if (!audioElement) {
                clearInterval(fadeIn);
                return;
            }
            if (audioElement.volume < 0.5) {
                audioElement.volume = Math.min(0.5, audioElement.volume + volumeIncrement);
            } else {
                clearInterval(fadeIn);
            }
        }, fadeStep);
    }).catch(() => {
        // Ignore play errors
    });
}

/**
 * Stop music with fade out
 */
function stopMusic() {
    if (!audioElement) return;

    const fadeStep = 50;
    const volumeDecrement = audioElement.volume / (AUDIO_FADE_DURATION / fadeStep);

    const fadeOut = setInterval(() => {
        if (!audioElement) {
            clearInterval(fadeOut);
            return;
        }
        if (audioElement.volume > 0.05) {
            audioElement.volume = Math.max(0, audioElement.volume - volumeDecrement);
        } else {
            clearInterval(fadeOut);
            audioElement.pause();
            audioElement = null;
        }
    }, fadeStep);
}

/**
 * Create floating particles for visual effect
 * @param {HTMLElement} container - Container to add particles to
 */
function createParticles(container) {
    const particleCount = 20;
    for (let i = 0; i < particleCount; i++) {
        const particle = document.createElement('div');
        particle.className = 'rmr-loading-particle';
        particle.style.left = `${Math.random() * 100}%`;
        particle.style.animationDelay = `${Math.random() * 5}s`;
        particle.style.animationDuration = `${5 + Math.random() * 10}s`;
        container.appendChild(particle);
    }
}

/**
 * Set the abort callback function
 * @param {Function} callback - Function to call when abort is clicked
 */
export function setAbortCallback(callback) {
    abortCallback = callback;
}

/**
 * Show the loading screen
 * @param {string} mode - The mode: 'timeline-fill' | 'agentic' | 'lore-management'
 */
export async function showLoadingScreen(mode) {
    // Remove existing overlay if any
    hideLoadingScreen();

    // Select a random asset pair for this loading screen
    selectRandomPair();

    // Create overlay
    loadingOverlay = createLoadingOverlay(mode);
    document.body.appendChild(loadingOverlay);

    // Get background image from selected pair
    const backgroundUrl = getCurrentBackground();
    const bgElement = loadingOverlay.querySelector('.rmr-loading-screen-background');
    if (backgroundUrl) {
        bgElement.style.backgroundImage = `url('${backgroundUrl}')`;
    } else {
        bgElement.classList.add('no-image');
    }

    // Create particles
    const particlesContainer = loadingOverlay.querySelector('.rmr-loading-screen-particles');
    createParticles(particlesContainer);

    // Set up abort button
    const abortBtn = loadingOverlay.querySelector('.rmr-loading-abort-btn');
    abortBtn.addEventListener('click', () => {
        if (abortCallback) {
            abortCallback();
        }
        hideLoadingScreen();
    });

    // Trigger show animation
    requestAnimationFrame(() => {
        loadingOverlay.classList.add('active');
    });

    // Start quote rotation
    startQuoteRotation();

    // Start music from selected pair
    const musicUrl = getCurrentMusic();
    if (musicUrl) {
        startMusic(musicUrl);
    }

    // Create and show games sidebar
    setGameCallbacks(pauseLoadingMusic, resumeLoadingMusic);
    createGamePanel();
    showGamePanel();
}

/**
 * Hide the loading screen
 */
export function hideLoadingScreen() {
    if (!loadingOverlay) return;

    // Stop quote rotation
    stopQuoteRotation();

    // Fade out music
    stopMusic();

    // Hide games with "Loading Complete!" warning
    hideGamePanel(true);

    // Fade out overlay
    loadingOverlay.classList.remove('active');
    loadingOverlay.classList.add('hiding');

    // Remove after animation (slightly longer to allow game warning to show)
    const overlayToRemove = loadingOverlay;
    setTimeout(() => {
        if (overlayToRemove && overlayToRemove.parentNode) {
            overlayToRemove.parentNode.removeChild(overlayToRemove);
        }
        // Clean up games after overlay is removed
        cleanupGames();
    }, 1600);

    loadingOverlay = null;
    abortCallback = null;
}

/**
 * Check if the loading screen is currently active
 * @returns {boolean}
 */
export function isLoadingScreenActive() {
    return loadingOverlay !== null && loadingOverlay.classList.contains('active');
}

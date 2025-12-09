/**
 * Retrieval Progress Notification Module
 * Shows cute loading notifications for timeline retrieval operations
 */

let progressOverlay = null;
let currentPhase = null;

/**
 * Create the progress notification HTML structure
 * @returns {HTMLElement} The progress overlay element
 */
function createProgressOverlay() {
    const overlay = document.createElement('div');
    overlay.id = 'rmr-retrieval-progress';
    overlay.className = 'rmr-retrieval-progress-overlay';
    overlay.innerHTML = `
        <div class="rmr-retrieval-progress-popup">
            <div class="rmr-retrieval-progress-header">
                <i class="fa-solid fa-brain rmr-retrieval-icon"></i>
                <span class="rmr-retrieval-title">Timeline Retrieval</span>
            </div>
            <div class="rmr-retrieval-progress-body">
                <div class="rmr-retrieval-phase" id="rmr-phase-analysis">
                    <div class="rmr-phase-indicator">
                        <i class="fa-solid fa-magnifying-glass fa-bounce"></i>
                    </div>
                    <div class="rmr-phase-content">
                        <span class="rmr-phase-title">Analysis</span>
                        <span class="rmr-phase-desc">Determining what to remember...</span>
                    </div>
                </div>
                <div class="rmr-retrieval-phase" id="rmr-phase-querying">
                    <div class="rmr-phase-indicator">
                        <i class="fa-solid fa-book-open"></i>
                    </div>
                    <div class="rmr-phase-content">
                        <span class="rmr-phase-title">Querying</span>
                        <span class="rmr-phase-desc" id="rmr-query-status">Waiting...</span>
                        <div id="rmr-progress-container">
                            <div class="rmr-progress-bar-container">
                                <div class="rmr-progress-bar" id="rmr-progress-bar"></div>
                                <div class="rmr-progress-bar-pending" id="rmr-progress-bar-pending"></div>
                            </div>
                            <span class="rmr-progress-text" id="rmr-progress-text">0/0</span>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    `;
    return overlay;
}

/**
 * Show the retrieval progress notification
 * @param {string} phase - The initial phase: 'analysis' or 'querying'
 */
export function showRetrievalProgress(phase = 'analysis') {
    // Remove existing overlay if any
    hideRetrievalProgress();

    progressOverlay = createProgressOverlay();
    document.body.appendChild(progressOverlay);

    // Trigger animation
    requestAnimationFrame(() => {
        progressOverlay.classList.add('active');
    });

    currentPhase = phase;
    updatePhaseDisplay(phase);
}

/**
 * Hide the retrieval progress notification
 */
export function hideRetrievalProgress() {
    if (progressOverlay) {
        progressOverlay.classList.remove('active');
        progressOverlay.classList.add('hiding');

        // Remove after animation
        setTimeout(() => {
            if (progressOverlay && progressOverlay.parentNode) {
                progressOverlay.parentNode.removeChild(progressOverlay);
            }
            progressOverlay = null;
            currentPhase = null;
        }, 300);
    }
}

/**
 * Update the phase display
 * @param {string} phase - The current phase
 */
function updatePhaseDisplay(phase) {
    if (!progressOverlay) return;

    const analysisPhase = progressOverlay.querySelector('#rmr-phase-analysis');
    const queryingPhase = progressOverlay.querySelector('#rmr-phase-querying');

    if (phase === 'analysis') {
        analysisPhase.classList.add('active');
        analysisPhase.classList.remove('completed');
        queryingPhase.classList.remove('active', 'completed');

        // Update analysis icon to animated
        const analysisIcon = analysisPhase.querySelector('.rmr-phase-indicator i');
        analysisIcon.className = 'fa-solid fa-magnifying-glass fa-bounce';
    } else if (phase === 'querying') {
        analysisPhase.classList.remove('active');
        analysisPhase.classList.add('completed');
        queryingPhase.classList.add('active');
        queryingPhase.classList.remove('completed');

        // Update icons
        const analysisIcon = analysisPhase.querySelector('.rmr-phase-indicator i');
        analysisIcon.className = 'fa-solid fa-check';

        const queryIcon = queryingPhase.querySelector('.rmr-phase-indicator i');
        queryIcon.className = 'fa-solid fa-book-open fa-beat-fade';
    } else if (phase === 'complete') {
        analysisPhase.classList.remove('active');
        analysisPhase.classList.add('completed');
        queryingPhase.classList.remove('active');
        queryingPhase.classList.add('completed');

        // Update all icons to checkmarks
        const analysisIcon = analysisPhase.querySelector('.rmr-phase-indicator i');
        analysisIcon.className = 'fa-solid fa-check';

        const queryIcon = queryingPhase.querySelector('.rmr-phase-indicator i');
        queryIcon.className = 'fa-solid fa-check';
    }

    currentPhase = phase;
}

/**
 * Update the retrieval progress
 * @param {object} options - Progress options
 * @param {string} [options.phase] - The current phase
 * @param {number} [options.current] - Current query number
 * @param {number} [options.total] - Total number of queries
 * @param {string} [options.message] - Optional custom message
 */
export function updateRetrievalProgress({ phase, current, total, message } = {}) {
    if (!progressOverlay) return;

    // Update phase if specified
    if (phase && phase !== currentPhase) {
        updatePhaseDisplay(phase);
    }

    // Update progress bar if we're in querying phase
    if (currentPhase === 'querying' && typeof current === 'number' && typeof total === 'number') {
        const progressBar = progressOverlay.querySelector('#rmr-progress-bar');
        const pendingBar = progressOverlay.querySelector('#rmr-progress-bar-pending');
        const progressText = progressOverlay.querySelector('#rmr-progress-text');
        const queryStatus = progressOverlay.querySelector('#rmr-query-status');

        const completedPercentage = total > 0 ? (current / total) * 100 : 0;
        const pendingPercentage = total > 0 ? (1 / total) * 100 : 0;

        progressBar.style.width = `${completedPercentage}%`;

        // Show pending segment only if there are more queries to run
        if (current < total && pendingBar) {
            pendingBar.style.width = `${pendingPercentage}%`;
            pendingBar.style.left = `${completedPercentage}%`;
            pendingBar.style.display = 'block';
        } else if (pendingBar) {
            pendingBar.style.display = 'none';
        }

        progressText.textContent = `${current}/${total}`;

        if (current < total) {
            queryStatus.textContent = message || `Retrieving chapter memories...`;
        } else {
            queryStatus.textContent = message || 'All queries complete!';
        }
    }

    // Update custom message for analysis phase
    if (currentPhase === 'analysis' && message) {
        const analysisDesc = progressOverlay.querySelector('#rmr-phase-analysis .rmr-phase-desc');
        if (analysisDesc) {
            analysisDesc.textContent = message;
        }
    }
}

/**
 * Get whether the progress overlay is currently visible
 * @returns {boolean}
 */
export function isProgressVisible() {
    return progressOverlay !== null && progressOverlay.classList.contains('active');
}

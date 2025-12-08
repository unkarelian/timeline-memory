const TUTORIAL_VERSION = 1;
const STORAGE_KEY = 'timeline-memory-tutorial-completed';

// Tutorial step definitions
const tutorialSteps = [
    {
        id: 'welcome',
        title: 'Welcome to Timeline Memory',
        content: `Timeline Memory is a system made for accurate recall of long stories. It can seem complex, but with this tutorial, we'll walk you through how it works.`
    },
    {
        id: 'arc-analyzer',
        title: 'Arc Analyzer - The Easy Way',
        content: `Arc Analyzer is the easiest way to create chapters. It scans your chat and suggests natural chapter endpoints based on story beats.

<b>How to use it:</b>
1. Select a <i>Connection Profile</i> (the AI that will analyze your chat)
2. Click <i>"Analyze Arcs"</i>
3. Review the suggested chapter breaks
4. Click on any arc to create a chapter ending at that point

The AI will then summarize everything from the start (or last chapter) to that point.
<i>Tip<i>: Use a fast and cheap model for this, like Grok 4 Fast or Gemini Flash`,
        highlight: '#rmr_run_arc_analyzer'
    },
    {
        id: 'manual-chapter',
        title: 'Manual Chapter Creation',
        content: `You can also manually end chapters by clicking the <b>⏹</b> button on any message. This marks that message as a chapter endpoint.

The button appears when you hover over a message. Once clicked, the AI will summarize all messages from the previous chapter end (or chat start) to that message.`
    },
    {
        id: 'summaries',
        title: 'Viewing & Editing Summaries',
        content: `Your chapter summaries appear in the <i>Summaries</i> section. You can:

• <b>Edit</b> summaries by clicking the text directly
• <b>Expand</b> using the expand button for a larger editor
• <b>Save</b> your changes with the Save button

Well-written summaries improve how accurately the AI recalls past events.`,
        highlight: '#rmr_summaries_container'
    },
    {
        id: 'timeline-fill',
        title: 'Timeline Fill - AI Memory Retrieval',
        content: `<b>/timeline-fill</b> is a powerful command that automatically queries your chapter history to gather relevant context for the current scene.

<b>How it works:</b>
1. The AI reads your current chat and chapter summaries
2. It identifies what past information is relevant
3. It queries the appropriate chapters and retrieves details

<b>Quick Reply for pre-existing messages (aka if you want to swipe):</b>
<pre>/hide {{lastMessageId}} |
/timeline-fill await=true |
/unhide {{lastMessageId}}</pre>

<b>Quick Reply for sending a new message (put your message in the input bar, but don't send!):</b>
<pre>/send {{input}} |
/setinput |
/timeline-fill await=true |
/trigger</pre>

These let you inject timeline context before generating responses.`
    },
    {
        id: 'macros',
        title: 'Adding Timeline to Prompts',
        content: `For the AI to use your chapter summaries during chat, add these macros to your <i>Chat Completion</i> prompt:

<b>{{timeline}}</b> - JSON array of all chapter summaries
<b>{{timelineResponses}}</b> - Results from /timeline-fill queries

<b>Where to add them:</b>
1. Open SillyTavern settings
2. Go to <i>AI Response Formatting</i> or your system prompt
3. Add the macros where you want timeline context to appear

<b>Example prompt section:</b>
<pre>&lt;past_events&gt;
{{timeline}}
{{timelineResponses}}
&lt;/past_events&gt;</pre>

This ensures the AI has access to your story's history.`
    },
    {
        id: 'profiles',
        title: 'Connection Profiles',
        content: `Timeline Memory uses <i>Connection Manager profiles</i> to make API calls. You can set different profiles for:

• <b>Summarization</b> - AI that creates chapter summaries
• <b>Chapter Query</b> - AI that answers questions about chapters
• <b>Timeline Fill</b> - AI that retrieves relevant context
• <b>Arc Analyzer</b> - AI that suggests chapter breaks

If no profile is selected, the extension uses your current chat API settings.

<i>Tip:</i> Use a powerful model on summarization - quality matters! Use a cheap but fast model for the rest.`,
        highlight: '#rmr_profile'
    },
    {
        id: 'complete',
        title: 'You\'re Ready!',
        content: `You now know the basics of Timeline Memory!

<b>Quick reference:</b>
• <b>Arc Analyzer</b> - Automatic chapter suggestions
• <b>⏹ Button</b> - Manual chapter endpoints
• <b>/timeline-fill</b> - Retrieve relevant past context
• <b>{{timeline}}</b> - Add summaries to prompts

<b>Commands:</b>
• <code>/chapter-end</code> - End chapter at current message
• <code>/timeline-query chapter=N question</code> - Query a chapter
• <code>/arc-analyze</code> - Open arc analyzer

You can restart this tutorial anytime from the settings panel.`
    }
];

let currentStep = 0;
let isActive = false;
let tutorialPopup = null;
let isDragging = false;
let dragOffset = { x: 0, y: 0 };

// Start the tutorial
export function startTutorial(fromStep = 0) {
    if (isActive) return;

    currentStep = fromStep;
    isActive = true;

    createPopup();
    showStep(currentStep);
}

// End the tutorial
export function endTutorial(completed = true) {
    if (!isActive) return;

    isActive = false;

    if (completed) {
        markTutorialCompleted();
    }

    removePopup();
    removeHighlight();
}

// Create the draggable popup
function createPopup() {
    if (tutorialPopup) return;

    tutorialPopup = document.createElement('div');
    tutorialPopup.id = 'rmr-tutorial-popup';
    tutorialPopup.innerHTML = `
        <div class="rmr-tutorial-header" id="rmr-tutorial-drag-handle">
            <span class="rmr-tutorial-title"></span>
            <span class="rmr-tutorial-step-indicator"></span>
            <button class="rmr-tutorial-close" title="Close tutorial">
                <i class="fa-solid fa-xmark"></i>
            </button>
        </div>
        <div class="rmr-tutorial-body"></div>
        <div class="rmr-tutorial-footer">
            <button class="rmr-tutorial-btn rmr-tutorial-prev menu_button">
                <i class="fa-solid fa-arrow-left"></i> Back
            </button>
            <button class="rmr-tutorial-btn rmr-tutorial-next menu_button">
                Next <i class="fa-solid fa-arrow-right"></i>
            </button>
        </div>
    `;

    document.body.appendChild(tutorialPopup);

    // Position in bottom-right by default
    tutorialPopup.style.right = '20px';
    tutorialPopup.style.bottom = '20px';

    // Event listeners - stop propagation to prevent clicks from affecting background
    tutorialPopup.querySelector('.rmr-tutorial-close').addEventListener('click', (e) => {
        e.stopPropagation();
        e.preventDefault();
        endTutorial(false);
    });

    tutorialPopup.querySelector('.rmr-tutorial-prev').addEventListener('click', (e) => {
        e.stopPropagation();
        e.preventDefault();
        if (currentStep > 0) {
            showStep(currentStep - 1);
        }
    });

    tutorialPopup.querySelector('.rmr-tutorial-next').addEventListener('click', (e) => {
        e.stopPropagation();
        e.preventDefault();
        if (currentStep < tutorialSteps.length - 1) {
            showStep(currentStep + 1);
        } else {
            endTutorial(true);
        }
    });

    // Prevent any clicks on the popup from bubbling to the document
    tutorialPopup.addEventListener('click', (e) => {
        e.stopPropagation();
    });

    tutorialPopup.addEventListener('mousedown', (e) => {
        e.stopPropagation();
    });

    // Dragging functionality
    const dragHandle = tutorialPopup.querySelector('#rmr-tutorial-drag-handle');

    dragHandle.addEventListener('mousedown', (e) => {
        if (e.target.closest('.rmr-tutorial-close')) return;

        isDragging = true;
        const rect = tutorialPopup.getBoundingClientRect();

        // Switch from right/bottom positioning to left/top for dragging
        tutorialPopup.style.left = rect.left + 'px';
        tutorialPopup.style.top = rect.top + 'px';
        tutorialPopup.style.right = 'auto';
        tutorialPopup.style.bottom = 'auto';

        dragOffset.x = e.clientX - rect.left;
        dragOffset.y = e.clientY - rect.top;

        document.addEventListener('mousemove', onDrag);
        document.addEventListener('mouseup', onDragEnd);
    });
}

function onDrag(e) {
    if (!isDragging || !tutorialPopup) return;

    const x = Math.max(0, Math.min(e.clientX - dragOffset.x, window.innerWidth - tutorialPopup.offsetWidth));
    const y = Math.max(0, Math.min(e.clientY - dragOffset.y, window.innerHeight - tutorialPopup.offsetHeight));

    tutorialPopup.style.left = x + 'px';
    tutorialPopup.style.top = y + 'px';
}

function onDragEnd() {
    isDragging = false;
    document.removeEventListener('mousemove', onDrag);
    document.removeEventListener('mouseup', onDragEnd);
}

// Remove popup
function removePopup() {
    if (tutorialPopup) {
        tutorialPopup.remove();
        tutorialPopup = null;
    }
}

// Show a specific step
function showStep(stepIndex) {
    currentStep = stepIndex;
    const step = tutorialSteps[stepIndex];

    if (!tutorialPopup) return;

    // Update content
    tutorialPopup.querySelector('.rmr-tutorial-title').textContent = step.title;
    tutorialPopup.querySelector('.rmr-tutorial-step-indicator').textContent =
        `${stepIndex + 1}/${tutorialSteps.length}`;
    tutorialPopup.querySelector('.rmr-tutorial-body').innerHTML = step.content;

    // Update buttons
    const prevBtn = tutorialPopup.querySelector('.rmr-tutorial-prev');
    const nextBtn = tutorialPopup.querySelector('.rmr-tutorial-next');

    prevBtn.style.visibility = stepIndex === 0 ? 'hidden' : 'visible';

    if (stepIndex === tutorialSteps.length - 1) {
        nextBtn.innerHTML = 'Finish <i class="fa-solid fa-check"></i>';
    } else {
        nextBtn.innerHTML = 'Next <i class="fa-solid fa-arrow-right"></i>';
    }

    // Handle highlighting
    removeHighlight();

    if (step.highlight) {
        const element = document.querySelector(step.highlight);
        if (element) {
            highlightElement(element);
            // Scroll element into view
            element.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
    }
}

// Highlight an element
function highlightElement(element) {
    element.classList.add('rmr-tutorial-highlighted');
}

// Remove highlight
function removeHighlight() {
    document.querySelectorAll('.rmr-tutorial-highlighted').forEach(el => {
        el.classList.remove('rmr-tutorial-highlighted');
    });
}

// Mark tutorial as completed
function markTutorialCompleted() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
        version: TUTORIAL_VERSION,
        completedAt: new Date().toISOString()
    }));
}

// Initialize tutorial button in settings
export function initTutorialUI() {
    $('#rmr_start_tutorial').off('click').on('click', () => {
        startTutorial(0);
    });
}

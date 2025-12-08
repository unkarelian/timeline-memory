const TUTORIAL_VERSION = 2;
const STORAGE_KEY = 'timeline-memory-tutorial-completed';

// Tutorial step definitions
const tutorialSteps = [
    {
        id: 'welcome',
        title: 'Welcome to Timeline Memory',
        content: `Timeline Memory is a system made for accurate recall of long stories. It can seem complex, but with this tutorial, we'll walk you through how it works.

<i>Tip:</i> You can drag this popup around and navigate with the buttons below. You can also scroll!`
    },
    {
        id: 'connection-profiles',
        title: 'Creating Connection Profiles',
        content: `Timeline Memory uses <b>Connection Profiles</b> from the Connection Manager extension to make API calls.

<b>What are Connection Profiles?</b>
Profiles let you save different API configurations (provider, model, settings) and switch between them. This extension uses profiles to call different models for different tasks.

<b>To create a profile:</b>
1. Open <i>API Connections</i> (top-left 'plug' icon in SillyTavern)
2. Set up your desired API provider and model
3. Click <i>"Save as Profile"</i> in the Connection Manager section
4. Name your profile (e.g., "Deepseek", "GLM 4.6")

<b>Recommended profiles:</b>
• <b>Summarization:</b> A powerful model (quality matters!)
• <b>Everything else:</b> Fast, cheap models work fine`,
        highlight: '#rmr_profile'
    },
    {
        id: 'inject-at-depth',
        title: 'Inject at Depth - The Easy Way',
        content: `<b>Inject at Depth</b> automatically adds your timeline to the AI's context - no manual prompt editing needed!

<b>What it does:</b>
Instead of manually adding {{timeline}} macros to your prompts, this feature injects the timeline information at a specific position in the message history.

<b>When to use it:</b>
• You don't want to mess with prompting
• You want to easily toggle timeline on/off

<b>Inject vs Macros:</b>
• <i>Inject:</i> Automatic, works everywhere, easy toggle
• <i>Macros:</i> Manual, more control over exact placement (recommended for advanced users)

For most users, <b>Inject at Depth is recommended</b>.`,
        highlight: '#rmr_inject_enabled'
    },
    {
        id: 'inject-setup',
        title: 'Setting Up Inject at Depth',
        content: `<b>To enable timeline injection:</b>

1. Check <i>"Enable Timeline Injection"</i>
2. Set <i>Injection Depth</i> (0 = at the end, higher = further back in history)
3. Choose <i>Injection Role</i> (System recommended)
4. The default prompt template works well for most cases

<b>Default template includes:</b>
• {{timeline}} - Your chapter summaries
• {{timelineResponses}} - Retrieved context from /timeline-fill
• {{lastMessageId}} and {{firstIncludedMessageId}} - Position info

<b>Depth explained:</b>
• Depth 0: Appears after all messages (closest to AI response)
• Depth 1: Appears before the last message
• Higher depths: Pushes the injection further back

<i>Recommended:</i> Start with depth 0 or 1.`,
        highlight: '#rmr_inject_depth'
    },
    {
        id: 'arc-analyzer',
        title: 'Arc Analyzer - Creating Chapters',
        content: `<b>Arc Analyzer</b> is the easiest way to create chapters. It scans your chat and suggests natural chapter endpoints based on story beats.

<b>How to use it:</b>
1. Select an <i>Arc Analyzer Profile</i> (or use default)
2. Click <i>"Analyze Arcs"</i>
3. Review the suggested chapter breaks
4. Click on any arc to create a chapter ending at that point

The AI will then summarize everything from the start (or last chapter) to that point.

<i>Tip:</i> Use a fast and cheap model for arc analysis - it doesn't need to be as smart as summarization.`,
        highlight: '#rmr_run_arc_analyzer'
    },
    {
        id: 'manual-chapter',
        title: 'Manual Chapter Creation',
        content: `You can also manually end chapters by clicking the <b>⏹</b> button on any message.

<b>How it works:</b>
1. Hover over any message in the chat
2. Click the stop (⏹) button that appears
3. The AI will summarize all messages from the previous chapter end (or chat start) to that message

<b>When to use manual vs Arc Analyzer:</b>
• <i>Arc Analyzer:</i> Great for catching up on long chats
• <i>Manual:</i> Better for ongoing chats where you know good stopping points

The button only appears if <i>"End Chapter"</i> is enabled in Message Buttons settings.`
    },
    {
        id: 'summaries',
        title: 'Viewing & Editing Summaries',
        content: `Your chapter summaries appear in the <i>Summaries</i> section. You can:

• <b>Edit</b> summaries by clicking the text directly
• <b>Expand</b> using the expand button for a larger editor
• <b>Save</b> your changes with the Save button

<b>Why edit summaries?</b>
The AI's summaries might miss important details or include unnecessary ones. Good summaries lead to better recall.

<b>Tips for good summaries:</b>
• Focus on key plot points and character changes
• Include important names, places, and relationships
• Keep them concise but informative`,
        highlight: '#rmr_summaries_container'
    },
    {
        id: 'timeline-fill',
        title: 'Timeline Fill - Smart Retrieval',
        content: `<b>Timeline Fill</b> automatically queries your chapter history to gather relevant context for the current scene.

<b>How it works:</b>
1. The AI reads your current chat and chapter summaries
2. It identifies what past information is relevant
3. It queries the appropriate chapters and retrieves details
4. Results appear in the AI's context via {{timelineResponses}}

<b>Using the Quick Buttons:</b>
Look for these buttons in the bottom bar (near the send button):

• <b>💬 Chat bubble</b> (comment-dots) - <i>Retrieve and Send</i>
  Retrieves timeline context, then sends your message

• <b>🔄 Recycle wheel</b> (rotate) - <i>Retrieve and Swipe</i>
  Retrieves timeline context, then regenerates the last response

These buttons replace the need for Quick Reply macros!

<i>With Inject at Depth enabled, retrieved context appears automatically.</i>`,
        highlight: '#rmr-retrieve-send'
    },
    {
        id: 'presets',
        title: 'Presets - Save Your Configurations',
        content: `<b>Presets</b> let you save and switch between different prompt configurations.

<b>Preset types:</b>
• <b>Summarization:</b> Prompts for creating chapter summaries
• <b>Query:</b> Prompts for answering chapter questions
• <b>Timeline Fill:</b> Prompts for context retrieval
• <b>Arc Analyzer:</b> Prompts for detecting story arcs

<b>Managing presets:</b>
• <i>Save:</i> Create a new preset from current settings
• <i>Update:</i> Overwrite the selected preset
• <i>Delete:</i> Remove the selected preset
• <i>Export/Import:</i> Share presets as JSON files

<b>Tip:</b> Use "Export All" to backup your entire configuration!`,
        highlight: '#rmr_summarize_preset'
    },
    {
        id: 'lore-management-intro',
        title: 'Lore Manager Mode - Overview',
        content: `<b>Lore Manager Mode</b> is an advanced feature that lets the AI automatically update your character's lorebook based on story events.

<b>What it does:</b>
The AI reads your story, identifies important lore (characters, locations, events, relationships), and creates/updates lorebook entries automatically.

<b>Use cases:</b>
• Keeping track of OCs and NPCs
• Recording location descriptions
• Tracking relationship developments
• Maintaining story consistency

<b>Requirements:</b>
• A character with an assigned World Info/Lorebook
• A capable, agentic AI model (GLM 4.6, Kimi, Claude (set effort to 'auto!'), Grok 4 fast, etc)
• A properly configured Lore Management profile

<i>This is powerful but requires setup. Next steps explain how.</i>`
    },
    {
        id: 'lore-management-setup',
        title: 'Setting Up Lore Manager',
        content: `<b>To use Lore Manager Mode:</b>

1. <b>Create a Lore Management Profile:</b>
   • Use a powerful model
   • The model needs to support function/tool calls

2. <b>Select the profile</b> in the Lore Management section

3. <b>Ensure your character has a lorebook assigned</b>

4. <b>(Optional) Import a Chat Completion preset</b> optimized for lore management:
   <a href="https://raw.githubusercontent.com/unkarelian/timeline-extension-prompts/refs/heads/master/timeline-memory-config-2025-12-04(1).json" target="_blank">Download Preset</a>
   (Import via SillyTavern's Chat Completion settings)

<b>Running Lore Management:</b>
1. Enable "Lore Management Mode"
2. Click "Run Lore Management"
3. The AI will analyze your story and edit the lorebook
4. When done, it signals completion automatically`,
        highlight: '#rmr_lore_management_enabled'
    },
    {
        id: 'lore-management-details',
        title: 'How Lore Manager Works',
        content: `<b>Behind the scenes:</b>

When you run Lore Management:
1. Your current chat is temporarily hidden
2. The AI receives lore management tools
3. It can: <i>list entries</i>, <i>create entries</i>, <i>update entries</i>, <i>delete entries</i>
4. When finished, it calls <i>end_lore_management</i>
5. The chat is restored and changes are saved

<b>The AI can:</b>
• Create new lorebook entries with keywords
• Update existing entries with new information
• Set entries as "constant" (always active) or keyword-triggered

<b>Safety features:</b>
• Original chat is preserved
• Session can be aborted if needed
• Lorebook changes are saved immediately

<i>Tip:</i> Review lorebook entries after the AI is done to ensure quality.`
    },
    {
        id: 'commands-reference',
        title: 'Command Reference',
        content: `<b>Quick Buttons (Bottom Bar):</b>
• 💬 <b>Retrieve and Send</b> - Send with timeline context
• 🔄 <b>Retrieve and Swipe</b> - Regenerate with timeline context

<b>Slash Commands:</b>

<b>Chapter Management:</b>
• <code>/chapter-end</code> - End chapter at current message
• <code>/timeline-undo</code> - Remove last chapter marker

<b>Queries:</b>
• <code>/timeline-query chapter=N [question]</code> - Query a chapter
• <code>/timeline-query-chapters start=N end=M [question]</code> - Query range
• <code>/chapter-summary N</code> - Get chapter N summary
• <code>/resummarize chapter=N</code> - Re-summarize a chapter

<b>Advanced:</b>
• <code>/timeline-fill</code> - Manual context retrieval
• <code>/arc-analyze</code> - Open Arc Analyzer
• <code>/remove-reasoning N-M</code> - Remove reasoning blocks`
    },
    {
        id: 'complete',
        title: 'You\'re Ready!',
        content: `Congratulations! You now know everything about Timeline Memory.

<b>Quick Start Checklist:</b>
☐ Create connection profiles for your AI providers
☐ Enable "Inject at Depth" for automatic timeline context
☐ Create some chapters using Arc Analyzer or manual buttons
☐ (Optional) Set up Lore Manager for automatic lorebook updates

<b>Key Features:</b>
• <b>Arc Analyzer</b> - Automatic chapter suggestions
• <b>Inject at Depth</b> - Automatic timeline injection
• <b>Lore Manager</b> - Automatic lorebook updates
• <b>Import/Export</b> - Easy configuration sharing

<b>Need help?</b>
You can restart this tutorial anytime from the settings panel.

<i>Happy storytelling!</i>`
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

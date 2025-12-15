import { loadTutorialTranslations, getTutorialText } from './locales.js';

const TUTORIAL_VERSION = 3;
const STORAGE_KEY = 'timeline-memory-tutorial-completed';

// Tutorial step definitions with translation keys and English defaults
const tutorialSteps = [
    {
        id: 'welcome',
        titleKey: 'tutorial_welcome_title',
        titleDefault: 'Welcome to Timeline Memory',
        contentKey: 'tutorial_welcome_content',
        contentDefault: `Timeline Memory is a system made for accurate recall of long stories. It can seem complex, but with this tutorial, we'll walk you through how it works.

<i>Tip:</i> You can drag this popup around and navigate with the buttons below. You can also scroll!`
    },
    {
        id: 'connection-profiles',
        titleKey: 'tutorial_connection_profiles_title',
        titleDefault: 'Creating Connection Profiles',
        contentKey: 'tutorial_connection_profiles_content',
        contentDefault: `Timeline Memory uses <b>Connection Profiles</b> from the Connection Manager extension to make API calls.

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
        id: 'query-limits',
        titleKey: 'tutorial_query_limits_title',
        titleDefault: 'Query Limits - Coherency Control',
        contentKey: 'tutorial_query_limits_content',
        contentDefault: `<b>Query Limits</b> help you control API costs and prevent context rot.

<b>Max Chapters per Query:</b>
Limits how many chapters can be queried at once. When the AI (or Timeline Fill) tries to query more chapters than this limit, the request is rejected or skipped.

• Default: 3 chapters
• Set to 0 for unlimited

<i>Why use it?</i> Querying many chapters at once uses lots of tokens. While many models claim to have context length in the hundreds of thousands, real performance degrades after 16k-32k.

<b>Max Timeline Fill Queries:</b>
Limits the total number of queries a single Timeline Fill operation can make.

• Default: 0 (unlimited)
• Set to a number to cap queries

<i>Why use it?</i> Timeline Fill asks the AI to generate queries, which can sometimes produce many requests. This can take up large amounts of time.

<b>Tip:</b> Start with defaults and adjust based on your usage patterns.`,
        highlight: '#rmr_query_chapter_limit'
    },
    {
        id: 'inject-at-depth',
        titleKey: 'tutorial_inject_at_depth_title',
        titleDefault: 'Inject at Depth - The Easy Way',
        contentKey: 'tutorial_inject_at_depth_content',
        contentDefault: `<b>Inject at Depth</b> automatically adds your timeline to the AI's context - no manual prompt editing needed!

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
        titleKey: 'tutorial_inject_setup_title',
        titleDefault: 'Setting Up Inject at Depth',
        contentKey: 'tutorial_inject_setup_content',
        contentDefault: `<b>To enable timeline injection:</b>

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
        titleKey: 'tutorial_arc_analyzer_title',
        titleDefault: 'Arc Analyzer - Creating Chapters',
        contentKey: 'tutorial_arc_analyzer_content',
        contentDefault: `<b>Arc Analyzer</b> is the easiest way to create chapters. It scans your chat and suggests natural chapter endpoints based on story beats.

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
        titleKey: 'tutorial_manual_chapter_title',
        titleDefault: 'Manual Chapter Creation',
        contentKey: 'tutorial_manual_chapter_content',
        contentDefault: `You can also manually end chapters by clicking the <b>⏹</b> button on any message.

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
        titleKey: 'tutorial_summaries_title',
        titleDefault: 'Viewing & Editing Summaries',
        contentKey: 'tutorial_summaries_content',
        contentDefault: `Your chapter summaries appear in the <i>Summaries</i> section. You can:

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
        titleKey: 'tutorial_timeline_fill_title',
        titleDefault: 'Timeline Fill - Smart Retrieval',
        contentKey: 'tutorial_timeline_fill_content',
        contentDefault: `<b>Timeline Fill</b> automatically queries your chapter history to gather relevant context for the current scene.

<b>How it works:</b>
1. The AI reads your current chat and chapter summaries
2. It identifies what past information is relevant
3. It queries the appropriate chapters and retrieves details
4. Results appear in the AI's context via {{timelineResponses}}

<b>Using the Quick Buttons:</b>
Look for these buttons in the bottom bar (near the send button):

• <b>💬 Chat bubble</b> (comment-dots) - <i>Retrieve and Send</i>
  Retrieves timeline context, then sends your message

• <b>🔄 Recycle wheel</b> (rotate) - <i>Retrieve to Swipe</i>
  Retrieves timeline context, then regenerates the last response

The results persist even after the message is done generating! Swipes automatically keep the retrieved information, even if you don't use 'Retrieve to Swipe'.

<i>With Inject at Depth enabled, retrieved context appears automatically.</i>`,
        highlight: '#rmr-retrieve-send'
    },
    {
        id: 'agentic-timeline-fill',
        titleKey: 'tutorial_agentic_timeline_fill_title',
        titleDefault: 'Agentic Timeline Fill - Advanced Retrieval',
        contentKey: 'tutorial_agentic_timeline_fill_content',
        contentDefault: `<b>Agentic Timeline Fill</b> is an advanced alternate mode where an AI agent dynamically retrieves context using tools - similar to Lore Management mode.

<b>How it differs from static Timeline Fill:</b>
• <i>Static:</i> AI proposes queries in one batch, all executed automatically
• <i>Agentic:</i> AI actively uses tools to query chapters, can adapt based on results

<b>Available tools for the agent:</b>
• <b>query_timeline_chapter</b> - Query a single chapter
• <b>query_timeline_chapters</b> - Query a range of chapters (respects chapter limit)
• <b>list_lorebook_entries</b> - Access the character's lorebook/world info
• <b>end_information_retrieval</b> - Signal completion with final summary

<b>Requirements:</b>
• A model that supports function/tool calls
• An Agentic Timeline Fill profile configured

The agent ends its session by calling <i>end_information_retrieval</i> with the crucial information it found, which is saved to {{timelineResponses}}.`,
        highlight: '#rmr_agentic_timeline_fill_enabled'
    },
    {
        id: 'agentic-timeline-fill-setup',
        titleKey: 'tutorial_agentic_timeline_fill_setup_title',
        titleDefault: 'Setting Up Agentic Timeline Fill',
        contentKey: 'tutorial_agentic_timeline_fill_setup_content',
        contentDefault: `<b>To use Agentic Timeline Fill:</b>

1. <b>Create an Agentic Timeline Fill Profile:</b>
   • Use a capable model that supports tool calls
   • GLM 4.6, Claude, Grok 4 Fast, etc. work well

2. <b>Select the profile</b> in the Agentic Timeline Fill section

3. <b>Enable "Agentic Timeline Fill Mode"</b>

4. <b>(Optional) Import a Chat Completion preset</b> optimized for retrieval:
   <a href="https://raw.githubusercontent.com/unkarelian/timeline-extension-prompts/refs/heads/master/Retrieval%20Management.json" target="_blank">Download Preset</a>
   (Import via SillyTavern's Chat Completion settings)

<b>Running Agentic Timeline Fill:</b>
• Use the quick buttons (💬 or 🔄) - they automatically use agentic mode when enabled
• Or click "Run Agentic Timeline Fill" manually
• Or use <code>/timeline-fill</code> command

<b>Note:</b> The "Max Timeline Fill Queries" limit does NOT apply to agentic mode - the agent decides when to stop.`,
        highlight: '#rmr_agentic_timeline_fill_profile'
    },
    {
        id: 'presets',
        titleKey: 'tutorial_presets_title',
        titleDefault: 'Presets - Save Your Configurations',
        contentKey: 'tutorial_presets_content',
        contentDefault: `<b>Presets</b> let you save and switch between different prompt configurations.

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
        titleKey: 'tutorial_lore_manager_intro_title',
        titleDefault: 'Lore Manager Mode - Overview',
        contentKey: 'tutorial_lore_manager_intro_content',
        contentDefault: `<b>Lore Manager Mode</b> is an advanced feature that lets the AI automatically update your character's lorebook based on story events.

<b>What it does:</b>
The AI reads your story, identifies important lore (characters, locations, events, relationships), and creates/updates lorebook entries automatically.

<b>Use cases:</b>
• Keeping track of OCs and NPCs
• Recording location descriptions
• Tracking relationship developments
• Maintaining story consistency

<b>Requirements:</b>
• A character with an assigned World Info/Lorebook
• A capable, agentic AI model (GLM 4.6, Kimi, Claude (set effort to 'auto!'), Grok 4 Fast, etc)
• A properly configured Lore Management profile

<i>This is powerful but requires setup. Next steps explain how.</i>`
    },
    {
        id: 'lore-management-setup',
        titleKey: 'tutorial_lore_manager_setup_title',
        titleDefault: 'Setting Up Lore Manager',
        contentKey: 'tutorial_lore_manager_setup_content',
        contentDefault: `<b>To use Lore Manager Mode:</b>

1. <b>Create a Lore Management Profile:</b>
   • Use a powerful model
   • The model needs to support function/tool calls

2. <b>Select the profile</b> in the Lore Management section

3. <b>Ensure your character has a lorebook assigned</b>

4. <b>(Optional) Import a Chat Completion preset</b> optimized for lore management:
   <a href="https://raw.githubusercontent.com/unkarelian/timeline-extension-prompts/refs/heads/master/Lore%20Management.json" target="_blank">Download Preset</a>
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
        titleKey: 'tutorial_lore_manager_details_title',
        titleDefault: 'How Lore Manager Works',
        contentKey: 'tutorial_lore_manager_details_content',
        contentDefault: `<b>Behind the scenes:</b>

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
        titleKey: 'tutorial_commands_reference_title',
        titleDefault: 'Command Reference',
        contentKey: 'tutorial_commands_reference_content',
        contentDefault: `<b>Quick Buttons (Bottom Bar):</b>
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
        titleKey: 'tutorial_complete_title',
        titleDefault: 'You\'re Ready!',
        contentKey: 'tutorial_complete_content',
        contentDefault: `Congratulations! You now know everything about Timeline Memory.

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
let tutorialBackdrop = null;
let isDragging = false;
let dragOffset = { x: 0, y: 0 };
let isMobile = false;

// Get translated text for a step
function getStepTitle(step) {
    return getTutorialText(step.titleKey, step.titleDefault);
}

function getStepContent(step) {
    return getTutorialText(step.contentKey, step.contentDefault);
}

// Get translated button text
function getButtonText(key, fallback) {
    return getTutorialText(key, fallback);
}

// Check if we're on mobile
function checkMobile() {
    // Check screen width and also verify it's likely a mobile device
    const isNarrowScreen = window.innerWidth <= 768;
    const isTouchDevice = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
    // Only use mobile layout if both narrow AND touch, or if very narrow
    return (isNarrowScreen && isTouchDevice) || window.innerWidth <= 500;
}

// Handle window resize/orientation change
function onResize() {
    if (!isActive || !tutorialPopup) return;

    const wasMobile = isMobile;
    isMobile = checkMobile();

    // If mode changed, recreate the popup
    if (wasMobile !== isMobile) {
        removePopup();
        createPopup();
        showStep(currentStep);
    }
}

// Start the tutorial
export async function startTutorial(fromStep = 0) {
    if (isActive) return;

    // Load translations before starting
    await loadTutorialTranslations();

    isMobile = checkMobile();
    currentStep = fromStep;
    isActive = true;

    // Listen for orientation/resize changes
    window.addEventListener('resize', onResize);

    createPopup();
    showStep(currentStep);
}

// End the tutorial
export function endTutorial(completed = true) {
    if (!isActive) return;

    isActive = false;

    // Remove resize listener
    window.removeEventListener('resize', onResize);

    if (completed) {
        markTutorialCompleted();
    }

    removePopup();
    removeHighlight();
}

// Create the draggable popup
function createPopup() {
    if (tutorialPopup) return;

    const backText = getButtonText('tutorial_btn_back', 'Back');
    const nextText = getButtonText('tutorial_btn_next', 'Next');

    tutorialPopup = document.createElement('div');
    tutorialPopup.id = 'rmr-tutorial-popup';

    if (isMobile) {
        tutorialPopup.classList.add('rmr-tutorial-mobile');
        tutorialPopup.innerHTML = `
            <div class="rmr-tutorial-mobile-header">
                <span class="rmr-tutorial-step-indicator"></span>
                <span class="rmr-tutorial-title"></span>
                <button class="rmr-tutorial-close" title="Close tutorial">
                    <i class="fa-solid fa-xmark"></i>
                </button>
            </div>
            <div class="rmr-tutorial-mobile-content">
                <div class="rmr-tutorial-body"></div>
                <div class="rmr-tutorial-mobile-nav">
                    <button class="rmr-tutorial-btn rmr-tutorial-prev menu_button">
                        <i class="fa-solid fa-chevron-left"></i>
                    </button>
                    <button class="rmr-tutorial-btn rmr-tutorial-next menu_button">
                        <i class="fa-solid fa-chevron-right"></i>
                    </button>
                </div>
            </div>
            <div class="rmr-tutorial-mobile-pointer"></div>
        `;
    } else {
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
                    <i class="fa-solid fa-arrow-left"></i> ${backText}
                </button>
                <button class="rmr-tutorial-btn rmr-tutorial-next menu_button">
                    ${nextText} <i class="fa-solid fa-arrow-right"></i>
                </button>
            </div>
        `;
    }

    document.body.appendChild(tutorialPopup);

    // Create backdrop for mobile
    if (isMobile && !tutorialBackdrop) {
        tutorialBackdrop = document.createElement('div');
        tutorialBackdrop.id = 'rmr-tutorial-backdrop';
        document.body.appendChild(tutorialBackdrop);

        // Clicking backdrop collapses the sheet
        tutorialBackdrop.addEventListener('click', () => {
            if (isBottomSheetExpanded) {
                collapseBottomSheet();
            }
        });

        // Show backdrop with slight delay for animation
        requestAnimationFrame(() => {
            tutorialBackdrop.classList.add('active');
        });
    }

    // Position based on mode
    if (isMobile) {
        // For mobile, position dynamically based on highlighted element
        // Use absolute positioning since fixed is broken in SillyTavern mobile
        const positionMobilePopup = (highlightedElement = null) => {
            if (!tutorialPopup) return;

            const viewportHeight = window.innerHeight;
            const margin = 10;
            let positionAtTop = true; // Default to top

            if (highlightedElement) {
                const rect = highlightedElement.getBoundingClientRect();
                const elementCenterY = rect.top + rect.height / 2;
                // If highlighted element is in top half, put tutorial at bottom
                positionAtTop = elementCenterY > viewportHeight / 2;
            }

            // Calculate absolute position
            const scrollY = window.scrollY || window.pageYOffset;
            const topValue = positionAtTop ? (scrollY + margin) : (scrollY + viewportHeight - tutorialPopup.offsetHeight - margin);

            tutorialPopup.style.cssText = `
                position: absolute !important;
                left: ${margin}px !important;
                right: ${margin}px !important;
                top: ${Math.max(scrollY, topValue)}px !important;
                width: calc(100% - ${margin * 2}px) !important;
                max-height: 45vh !important;
                z-index: 99999 !important;
                display: flex !important;
                flex-direction: column !important;
                background: var(--SmartThemeBlurTintColor, #1e1e2e) !important;
                border: 1px solid var(--SmartThemeBorderColor, #555) !important;
                border-radius: 12px !important;
                opacity: 1 !important;
                visibility: visible !important;
                overflow: hidden !important;
                box-shadow: 0 4px 20px rgba(0, 0, 0, 0.5) !important;
            `;

            // Update pointer position
            const pointer = tutorialPopup.querySelector('.rmr-tutorial-mobile-pointer');
            if (pointer) {
                pointer.className = `rmr-tutorial-mobile-pointer ${positionAtTop ? 'pointer-bottom' : 'pointer-top'}`;
            }

            // Toggle class for styling differences
            tutorialPopup.classList.toggle('position-top', positionAtTop);
            tutorialPopup.classList.toggle('position-bottom', !positionAtTop);
        };

        // Initial positioning (no highlight)
        positionMobilePopup();

        // Reposition after content renders to get correct height
        requestAnimationFrame(() => positionMobilePopup());

        // Store the function and current highlight for later use
        tutorialPopup._positionFunc = positionMobilePopup;
        tutorialPopup._currentHighlight = null;

        // Keep position updated on scroll
        const onScroll = () => positionMobilePopup(tutorialPopup._currentHighlight);
        window.addEventListener('scroll', onScroll, { passive: true });
        tutorialPopup._scrollHandler = onScroll;
    } else {
        tutorialPopup.style.right = '20px';
        tutorialPopup.style.bottom = '20px';
    }

    // Event listeners - stop propagation to prevent clicks from affecting background
    tutorialPopup.querySelector('.rmr-tutorial-close').addEventListener('click', (e) => {
        e.stopPropagation();
        e.preventDefault();
        endTutorial(false);
    });

    const prevBtn = tutorialPopup.querySelector('.rmr-tutorial-prev');
    const nextBtn = tutorialPopup.querySelector('.rmr-tutorial-next');

    prevBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        e.preventDefault();
        if (currentStep > 0) {
            showStep(currentStep - 1);
        }
    });

    nextBtn.addEventListener('click', (e) => {
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

    tutorialPopup.addEventListener('touchstart', (e) => {
        e.stopPropagation();
    }, { passive: true });

    // Desktop: dragging functionality
    if (!isMobile) {
        const dragHandle = tutorialPopup.querySelector('#rmr-tutorial-drag-handle');
        if (dragHandle) {
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
    }
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
    if (tutorialBackdrop) {
        tutorialBackdrop.remove();
        tutorialBackdrop = null;
    }
    if (tutorialPopup) {
        // Clean up scroll handler
        if (tutorialPopup._scrollHandler) {
            window.removeEventListener('scroll', tutorialPopup._scrollHandler);
        }
        tutorialPopup.remove();
        tutorialPopup = null;
    }
}

// Show a specific step
function showStep(stepIndex) {
    currentStep = stepIndex;
    const step = tutorialSteps[stepIndex];

    if (!tutorialPopup) return;

    // Update content with translations
    tutorialPopup.querySelector('.rmr-tutorial-title').textContent = getStepTitle(step);
    tutorialPopup.querySelector('.rmr-tutorial-step-indicator').textContent =
        `${stepIndex + 1}/${tutorialSteps.length}`;
    tutorialPopup.querySelector('.rmr-tutorial-body').innerHTML = getStepContent(step);

    // Update buttons
    const prevBtn = tutorialPopup.querySelector('.rmr-tutorial-prev');
    const nextBtn = tutorialPopup.querySelector('.rmr-tutorial-next');

    prevBtn.style.visibility = stepIndex === 0 ? 'hidden' : 'visible';

    if (isMobile) {
        // Mobile: icon-only buttons
        if (stepIndex === tutorialSteps.length - 1) {
            nextBtn.innerHTML = `<i class="fa-solid fa-check"></i>`;
        } else {
            nextBtn.innerHTML = `<i class="fa-solid fa-chevron-right"></i>`;
        }
    } else {
        // Desktop: text + icon buttons
        if (stepIndex === tutorialSteps.length - 1) {
            const finishText = getButtonText('tutorial_btn_finish', 'Finish');
            nextBtn.innerHTML = `${finishText} <i class="fa-solid fa-check"></i>`;
        } else {
            const nextText = getButtonText('tutorial_btn_next', 'Next');
            nextBtn.innerHTML = `${nextText} <i class="fa-solid fa-arrow-right"></i>`;
        }
    }

    // Handle highlighting
    removeHighlight();

    if (step.highlight) {
        const element = document.querySelector(step.highlight);
        if (element) {
            highlightElement(element);

            if (isMobile) {
                // Store the highlight reference and reposition
                if (tutorialPopup) {
                    tutorialPopup._currentHighlight = element;
                    if (tutorialPopup._positionFunc) {
                        tutorialPopup._positionFunc(element);
                    }
                }

                // Scroll element into view after a short delay to let positioning settle
                setTimeout(() => {
                    if (!tutorialPopup) return;

                    // Skip scrolling for elements that cause UI issues on mobile
                    const skipScrollSelectors = ['#rmr-retrieve-send', '#rmr-retrieve-swipe'];
                    if (skipScrollSelectors.includes(step.highlight)) {
                        return;
                    }

                    // Find the scrollable parent container (SillyTavern uses specific containers)
                    const findScrollableParent = (el) => {
                        let parent = el.parentElement;
                        while (parent) {
                            const style = window.getComputedStyle(parent);
                            const overflowY = style.overflowY;
                            const isScrollable = (overflowY === 'auto' || overflowY === 'scroll') &&
                                                  parent.scrollHeight > parent.clientHeight;
                            if (isScrollable) {
                                return parent;
                            }
                            parent = parent.parentElement;
                        }
                        return null;
                    };

                    const scrollContainer = findScrollableParent(element);

                    if (scrollContainer) {
                        // Scroll within the container
                        const containerRect = scrollContainer.getBoundingClientRect();
                        const elementRect = element.getBoundingClientRect();
                        const tutorialHeight = tutorialPopup.offsetHeight || 200;
                        const padding = 20;
                        const tutorialAtTop = tutorialPopup.classList.contains('position-top');

                        // Calculate offset within container
                        const elementOffsetInContainer = elementRect.top - containerRect.top + scrollContainer.scrollTop;

                        // Calculate target scroll position
                        let targetScroll;
                        if (tutorialAtTop) {
                            // Tutorial at top - scroll element to be visible below tutorial area
                            targetScroll = elementOffsetInContainer - tutorialHeight - padding;
                        } else {
                            // Tutorial at bottom - scroll element to upper portion
                            targetScroll = elementOffsetInContainer - padding;
                        }

                        scrollContainer.scrollTo({
                            top: Math.max(0, targetScroll),
                            behavior: 'smooth'
                        });
                    } else {
                        // Fallback to scrollIntoView
                        element.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    }
                }, 100);
            } else {
                // Desktop: center the element
                element.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }
        }
    } else {
        // No highlight - reposition to default (top)
        if (isMobile && tutorialPopup) {
            tutorialPopup._currentHighlight = null;
            if (tutorialPopup._positionFunc) {
                tutorialPopup._positionFunc(null);
            }
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

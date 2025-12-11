/**
 * Agentic Timeline Fill Module
 *
 * Provides an agentic mode for timeline fill where the AI can interactively
 * query chapters and build up information before ending the session.
 */

import { extension_settings, getContext } from "../../../../extensions.js";
import { saveChatConditional, reloadCurrentChat, eventSource, event_types, stopGeneration, isSwipingAllowed, swipe_right } from "../../../../../script.js";
import { executeSlashCommandsWithOptions } from "../../../../slash-commands.js";
import { settings } from "./settings.js";
import { log, debug, error } from "./logging.js";
import { createChatBackup } from "./backup.js";

// Note: setCurrentChatContent and clearCurrentChatContent are imported dynamically
// to avoid circular dependency issues with memories.js

/**
 * Switch to a profile using SlashCommandParser directly
 * @param {string} profileName - The profile name to switch to, or 'none' for no profile
 * @returns {Promise<void>}
 */
async function switchProfile(profileName) {
    const context = getContext();
    const SlashCommandParser = context.SlashCommandParser;

    if (!SlashCommandParser?.commands?.['profile']) {
        error('Profile slash command not available');
        return;
    }

    // Set up promise to wait for profile switch to complete
    const switchCompletePromise = new Promise((resolve) => {
        let resolved = false;

        const modelChangedHandler = () => {
            if (!resolved) {
                log('Profile switch complete (model changed)');
                resolved = true;
                eventSource.removeListener(event_types.CHATCOMPLETION_MODEL_CHANGED, modelChangedHandler);
                eventSource.removeListener(event_types.ONLINE_STATUS_CHANGED, statusChangedHandler);
                resolve();
            }
        };

        const statusChangedHandler = () => {
            if (!resolved) {
                log('Profile switch complete (status changed)');
                resolved = true;
                eventSource.removeListener(event_types.CHATCOMPLETION_MODEL_CHANGED, modelChangedHandler);
                eventSource.removeListener(event_types.ONLINE_STATUS_CHANGED, statusChangedHandler);
                resolve();
            }
        };

        eventSource.once(event_types.CHATCOMPLETION_MODEL_CHANGED, modelChangedHandler);
        eventSource.once(event_types.ONLINE_STATUS_CHANGED, statusChangedHandler);

        // Timeout in case neither event fires
        setTimeout(() => {
            if (!resolved) {
                log('Profile switch timeout - continuing anyway');
                resolved = true;
                eventSource.removeListener(event_types.CHATCOMPLETION_MODEL_CHANGED, modelChangedHandler);
                eventSource.removeListener(event_types.ONLINE_STATUS_CHANGED, statusChangedHandler);
                resolve();
            }
        }, 3000);
    });

    const args = {
        _scope: null,
        _abortController: null,
        _debugController: null,
        _parserFlags: {},
        _hasUnnamedArgument: false,
        quiet: 'true'
    };

    log(`Switching to profile: ${profileName}`);
    await SlashCommandParser.commands['profile'].callback(args, profileName);
    await switchCompletePromise;
    log('Profile switch complete');
}

// Session state
const agenticTimelineFillState = {
    active: false,
    savedProfileId: null,
    savedProfileName: null,
    startMessageIndex: 0,
    endRequested: false,
    hiddenMessageStart: -1,
    hiddenMessageEnd: -1,
    sessionChatId: null,
    retryCount: 0,
    sessionCompleteResolve: null, // Promise resolve function for await support
};

const MAX_RETRIES = 5;
const SWIPE_RETRY_DELAYS = [500, 1000, 2000, 3000];
const TRIGGER_RETRY_DELAYS = [500, 1000, 2000, 3000];

const AGENTIC_TIMELINE_FILL_METADATA_KEY = 'agentic_timeline_fill_session';

/**
 * Save session state to chat metadata for recovery after refresh
 */
function saveStateToMetadata() {
    const context = getContext();
    if (!context.chatMetadata) return;

    context.chatMetadata[AGENTIC_TIMELINE_FILL_METADATA_KEY] = {
        active: agenticTimelineFillState.active,
        savedProfileId: agenticTimelineFillState.savedProfileId,
        savedProfileName: agenticTimelineFillState.savedProfileName,
        startMessageIndex: agenticTimelineFillState.startMessageIndex,
        hiddenMessageStart: agenticTimelineFillState.hiddenMessageStart,
        hiddenMessageEnd: agenticTimelineFillState.hiddenMessageEnd,
        sessionChatId: agenticTimelineFillState.sessionChatId,
    };
    log('Saved agentic timeline fill state to metadata');
}

/**
 * Clear session state from chat metadata
 */
function clearStateFromMetadata() {
    const context = getContext();
    if (!context.chatMetadata) return;

    delete context.chatMetadata[AGENTIC_TIMELINE_FILL_METADATA_KEY];
    log('Cleared agentic timeline fill state from metadata');
}

/**
 * Check for and recover from an interrupted session
 * Call this on CHAT_CHANGED to handle page refresh recovery
 * @returns {Promise<boolean>} True if recovery was performed
 */
export async function recoverInterruptedSession() {
    const context = getContext();
    if (!context.chatMetadata) return false;

    const savedState = context.chatMetadata[AGENTIC_TIMELINE_FILL_METADATA_KEY];
    if (!savedState || !savedState.active) return false;

    log('Recovering from interrupted agentic timeline fill session');
    toastr.warning('Recovering from interrupted agentic timeline fill session...', 'Timeline Memory');

    const chat = context.chat;

    try {
        // Delete agentic messages (from startMessageIndex to end)
        const messagesToDelete = chat.length - savedState.startMessageIndex;
        if (messagesToDelete > 0) {
            log(`Deleting ${messagesToDelete} agentic messages`);
            chat.splice(savedState.startMessageIndex, messagesToDelete);
        }

        // Unhide the messages that were hidden
        if (savedState.hiddenMessageStart >= 0 && savedState.hiddenMessageEnd >= 0) {
            log(`Unhiding messages ${savedState.hiddenMessageStart} to ${savedState.hiddenMessageEnd}`);
            await executeSlashCommandsWithOptions(`/unhide ${savedState.hiddenMessageStart}-${savedState.hiddenMessageEnd}`);
        }

        // Clear the saved state
        clearStateFromMetadata();

        // Save and reload chat first
        await saveChatConditional();
        await reloadCurrentChat();

        // Restore original profile after chat reload
        if (savedState.savedProfileName) {
            await switchProfile(savedState.savedProfileName);
        } else {
            await switchProfile('none');
        }

        // Restore timeline injection now that session is done
        try {
            const { updateTimelineInjection } = await import('./memories.js');
            updateTimelineInjection();
        } catch (err) {
            debug('Could not restore timeline injection:', err.message);
        }

        log('Recovery completed successfully');
        toastr.success('Agentic timeline fill session recovered', 'Timeline Memory');
        return true;

    } catch (err) {
        error('Error during recovery:', err);
        toastr.error('Error recovering agentic timeline fill session', 'Timeline Memory');
        // Clear the state anyway to prevent repeated recovery attempts
        clearStateFromMetadata();

        // Still try to restore timeline injection
        try {
            const { updateTimelineInjection } = await import('./memories.js');
            updateTimelineInjection();
        } catch (injErr) {
            debug('Could not restore timeline injection:', injErr.message);
        }

        return false;
    }
}

/**
 * Check if an agentic timeline fill session is currently active
 * @returns {boolean}
 */
export function isAgenticTimelineFillActive() {
    return agenticTimelineFillState.active;
}

/**
 * Get the chat ID associated with the current session
 * @returns {string|null} The chat ID or null if no session is active
 */
export function getSessionChatId() {
    return agenticTimelineFillState.sessionChatId;
}

/**
 * Find the first visible (non-hidden/non-system) message index
 * @returns {number} The index of the first visible message, or -1 if none found
 */
function findFirstVisibleMessageIndex() {
    const context = getContext();
    const chat = context.chat;

    for (let i = 0; i < chat.length; i++) {
        if (!chat[i].is_system) {
            return i;
        }
    }
    return -1;
}

/**
 * Capture the current chat content for the {{currentChat}} macro
 * @returns {string} JSON string of chat messages
 */
function captureCurrentChat() {
    const context = getContext();
    const chat = Array.isArray(context.chat) ? context.chat : [];
    if (!chat.length) return '[]';

    // Map with original indices preserved, filter out system messages
    const chatContent = chat
        .map((m, idx) => ({ m, idx }))
        .filter(({ m }) => !m?.is_system)
        .map(({ m, idx }) => ({
            id: idx,
            name: String(m?.name || (m?.is_user ? context.name1 : context.name2) || ''),
            role: m?.is_user ? 'user' : 'assistant',
            text: String(m?.mes || ''),
        }));

    return JSON.stringify(chatContent, null, 2);
}

/**
 * Get the profile name by ID
 * @param {string} profileId - The profile ID
 * @returns {string|null} The profile name or null
 */
function getProfileNameById(profileId) {
    if (!profileId || !extension_settings.connectionManager?.profiles) {
        return null;
    }
    const profile = extension_settings.connectionManager.profiles.find(p => p.id === profileId);
    return profile ? profile.name : null;
}

/**
 * Signal the end of the agentic timeline fill session
 * @param {string} finalInformation - The crucial information learned during the session
 * @returns {string} Confirmation message
 */
async function endInformationRetrievalTool(finalInformation) {
    // Immediately disable the session to prevent any async callbacks from proceeding
    // This must happen BEFORE any await points to prevent race conditions
    agenticTimelineFillState.active = false;
    agenticTimelineFillState.endRequested = true;
    log('End information retrieval requested via tool - session marked inactive');

    // Stop the generation monitor FIRST to prevent spurious swipes
    stopGenerationMonitor();

    // Save the final information to timelineFillResults
    try {
        const { setTimelineFillResults } = await import('./memories.js');
        // Store as a single result with the final information
        setTimelineFillResults([{
            mode: 'agentic',
            query: 'Agentic Timeline Fill Session',
            response: finalInformation || '',
            startChapter: null,
            endChapter: null,
        }]);
        log('Saved final information to timelineFillResults');
    } catch (err) {
        error('Failed to save final information:', err);
    }

    // Schedule cleanup to happen after this tool returns
    // Use setTimeout to ensure the tool response is processed first
    setTimeout(() => {
        cleanupAgenticTimelineFillSession();
    }, 100);

    return 'Information retrieval session ending. Results have been saved to {{timelineResponses}}.';
}

/**
 * Register the agentic timeline fill tools
 */
export function registerAgenticTimelineTools() {
    const context = getContext();
    if (!context.ToolManager) {
        error('ToolManager not available, cannot register agentic timeline tools');
        return;
    }

    // Unregister existing tools first
    unregisterAgenticTimelineTools();

    log('Registering agentic timeline fill tools');

    // Tool: query_chapter
    context.ToolManager.registerFunctionTool({
        name: 'query_timeline_chapter',
        displayName: 'Query Timeline Chapter',
        description: 'Query a specific chapter from the timeline with a question. Returns information from that chapter based on your query.',
        stealth: false,
        parameters: {
            type: 'object',
            properties: {
                chapter: {
                    type: 'integer',
                    description: 'The chapter number to query (1-indexed)'
                },
                query: {
                    type: 'string',
                    description: 'The question or query to ask about the chapter'
                }
            },
            required: ['chapter', 'query']
        },
        action: async (args) => {
            try {
                const { queryChapter } = await import('./memories.js');
                const result = await queryChapter(args.chapter, args.query);
                // Reset retry count on successful tool call
                agenticTimelineFillState.retryCount = 0;
                return result || 'No information found.';
            } catch (err) {
                error('query_timeline_chapter error:', err);
                return `Error querying chapter: ${err.message}`;
            }
        },
        shouldRegister: () => agenticTimelineFillState.active,
        formatMessage: (args) => `Querying chapter ${args.chapter}...`,
    });

    // Tool: query_chapters (range)
    // Build dynamic description based on chapter limit setting
    const chapterLimit = settings.query_chapter_limit || 0;
    const limitDescription = chapterLimit > 0
        ? ` You can query a maximum of ${chapterLimit} chapters at a time.`
        : '';

    context.ToolManager.registerFunctionTool({
        name: 'query_timeline_chapters',
        displayName: 'Query Timeline Chapters',
        description: `Query a range of chapters from the timeline with a question. Returns information from those chapters based on your query.${limitDescription}`,
        stealth: false,
        parameters: {
            type: 'object',
            properties: {
                start_chapter: {
                    type: 'integer',
                    description: 'The starting chapter number (1-indexed, inclusive)'
                },
                end_chapter: {
                    type: 'integer',
                    description: 'The ending chapter number (1-indexed, inclusive)'
                },
                query: {
                    type: 'string',
                    description: 'The question or query to ask about the chapters'
                }
            },
            required: ['start_chapter', 'end_chapter', 'query']
        },
        action: async (args) => {
            try {
                // Enforce chapter limit if set
                const limit = settings.query_chapter_limit || 0;
                const chapterCount = args.end_chapter - args.start_chapter + 1;

                if (limit > 0 && chapterCount > limit) {
                    log(`query_timeline_chapters rejected: ${chapterCount} chapters exceeds limit of ${limit}`);
                    return `Error: Cannot query more than ${limit} chapters at once. Requested ${chapterCount} chapters (${args.start_chapter}-${args.end_chapter}). Please narrow your range.`;
                }

                const { queryChapters } = await import('./memories.js');
                const result = await queryChapters(args.start_chapter, args.end_chapter, args.query);
                // Reset retry count on successful tool call
                agenticTimelineFillState.retryCount = 0;
                return result || 'No information found.';
            } catch (err) {
                error('query_timeline_chapters error:', err);
                return `Error querying chapters: ${err.message}`;
            }
        },
        shouldRegister: () => agenticTimelineFillState.active,
        formatMessage: (args) => `Querying chapters ${args.start_chapter}-${args.end_chapter}...`,
    });

    // Tool: list_lorebook_entries (read-only access to lorebook)
    context.ToolManager.registerFunctionTool({
        name: 'list_lorebook_entries',
        displayName: 'List Lorebook Entries',
        description: 'List all entries in the character\'s assigned world info (lorebook). Returns the lorebook name, entry count, and details for each entry including uid, comment, keys, content, and settings. Use this to access stored world information and lore.',
        stealth: false,
        parameters: {
            type: 'object',
            properties: {},
            required: []
        },
        action: async () => {
            try {
                const { listEntries } = await import('./lore-management.js');
                const result = await listEntries();
                // Reset retry count on successful tool call
                agenticTimelineFillState.retryCount = 0;
                return JSON.stringify(result, null, 2);
            } catch (err) {
                error('list_lorebook_entries error:', err);
                return JSON.stringify({ error: `Failed to list lorebook entries: ${err.message}` });
            }
        },
        shouldRegister: () => agenticTimelineFillState.active,
        formatMessage: () => 'Listing lorebook entries...',
    });

    // Tool: end_information_retrieval (stealth)
    context.ToolManager.registerFunctionTool({
        name: 'end_information_retrieval',
        displayName: 'End Information Retrieval',
        description: 'Signal that you are done retrieving information from the timeline. Call this when you have gathered all necessary information. Provide a summary of the crucial information you have learned.',
        stealth: true,
        parameters: {
            type: 'object',
            properties: {
                final_information: {
                    type: 'string',
                    description: 'A summary of all the crucial information you have learned from querying the timeline. This will be saved and made available via {{timelineResponses}}.'
                }
            },
            required: ['final_information']
        },
        action: async (args) => {
            return await endInformationRetrievalTool(args.final_information);
        },
        shouldRegister: () => agenticTimelineFillState.active,
        formatMessage: () => 'Ending information retrieval session...',
    });

    log('Agentic timeline fill tools registered');
}

/**
 * Unregister the agentic timeline fill tools
 */
export function unregisterAgenticTimelineTools() {
    const context = getContext();
    if (!context.ToolManager) {
        return;
    }

    try {
        context.ToolManager.unregisterFunctionTool('query_timeline_chapter');
        context.ToolManager.unregisterFunctionTool('query_timeline_chapters');
        context.ToolManager.unregisterFunctionTool('list_lorebook_entries');
        context.ToolManager.unregisterFunctionTool('end_information_retrieval');
        debug('Agentic timeline fill tools unregistered');
    } catch (err) {
        // Tools may not have been registered
        debug('Some agentic timeline tools were not registered:', err.message);
    }
}

/**
 * Start an agentic timeline fill session
 * @returns {Promise<void>} Resolves when the session is fully complete
 */
export async function startAgenticTimelineFillSession() {
    if (agenticTimelineFillState.active) {
        toastr.warning('An agentic timeline fill session is already active', 'Timeline Memory');
        return;
    }

    // Create a backup before any operations
    await createChatBackup('agentic timeline fill');

    const profileId = settings.agentic_timeline_fill_profile;
    if (!profileId) {
        toastr.error('No agentic timeline fill profile configured', 'Timeline Memory');
        return;
    }

    const profileName = getProfileNameById(profileId);
    if (!profileName) {
        toastr.error('Configured agentic timeline fill profile not found', 'Timeline Memory');
        return;
    }

    const context = getContext();

    // Create a promise that resolves when the session is complete
    const sessionCompletePromise = new Promise((resolve) => {
        agenticTimelineFillState.sessionCompleteResolve = resolve;
    });

    // Save current state
    agenticTimelineFillState.savedProfileId = extension_settings.connectionManager?.selectedProfile || null;
    agenticTimelineFillState.savedProfileName = getProfileNameById(agenticTimelineFillState.savedProfileId);
    agenticTimelineFillState.startMessageIndex = context.chat.length;
    agenticTimelineFillState.endRequested = false;
    agenticTimelineFillState.retryCount = 0;
    agenticTimelineFillState.hiddenMessageStart = -1;
    agenticTimelineFillState.hiddenMessageEnd = -1;
    agenticTimelineFillState.sessionChatId = context.getCurrentChatId?.() || null;
    agenticTimelineFillState.active = true;

    // Capture current chat BEFORE hiding for {{currentChat}} macro
    try {
        const { setCurrentChatContent } = await import('./memories.js');
        setCurrentChatContent(captureCurrentChat());
        log('Captured current chat content for {{currentChat}} macro');
    } catch (err) {
        error('Failed to set currentChatContent:', err);
    }

    // Clear timeline injection while session is active
    try {
        const { updateTimelineInjection } = await import('./memories.js');
        updateTimelineInjection();
    } catch (err) {
        debug('Could not update timeline injection:', err.message);
    }

    log('Starting agentic timeline fill session');
    log(`Saved profile: ${agenticTimelineFillState.savedProfileName || 'none'}`);
    log(`Start message index: ${agenticTimelineFillState.startMessageIndex}`);
    log(`Session chat ID: ${agenticTimelineFillState.sessionChatId}`);

    try {
        // Hide existing messages to give the AI a clean slate
        const firstVisibleIndex = findFirstVisibleMessageIndex();
        if (firstVisibleIndex >= 0 && context.chat.length > 0) {
            agenticTimelineFillState.hiddenMessageStart = firstVisibleIndex;
            agenticTimelineFillState.hiddenMessageEnd = context.chat.length - 1;
            log(`Hiding messages ${firstVisibleIndex} to ${agenticTimelineFillState.hiddenMessageEnd} for clean context`);
            await executeSlashCommandsWithOptions(`/hide ${firstVisibleIndex}-${agenticTimelineFillState.hiddenMessageEnd}`);
        }

        // Save state to metadata for recovery after page refresh
        saveStateToMetadata();
        await saveChatConditional();

        // Register agentic timeline tools
        registerAgenticTimelineTools();

        // Swap to agentic timeline fill profile
        await switchProfile(profileName);

        // Wait for profile swap to fully settle
        await new Promise(resolve => setTimeout(resolve, 500));

        // Add user message using /send command (doesn't trigger generation)
        const prompt = settings.agentic_timeline_fill_prompt || 'begin timeline retrieval';
        log(`Sending user message: ${prompt}`);
        await executeSlashCommandsWithOptions(`/send ${prompt}`);

        log('Added agentic timeline fill user message');

        // Trigger initial generation (this starts the async monitoring loop)
        await triggerAgenticTimelineFill();

        // Wait for the session to complete (cleanup will resolve this)
        log('Waiting for agentic timeline fill session to complete...');
        await sessionCompletePromise;
        log('Agentic timeline fill session completed');

    } catch (err) {
        error('Agentic timeline fill session failed:', err);
        toastr.error('Agentic timeline fill session failed: ' + err.message, 'Timeline Memory');
        await cleanupAgenticTimelineFillSession();
    }
}

/**
 * Wait until isSwipingAllowed() returns true
 * @param {number} maxWait - Maximum time to wait in ms
 * @param {number} interval - Polling interval in ms
 * @returns {Promise<boolean>} True if swiping is allowed, false if timed out
 */
async function waitForSwipeReady(maxWait = 5000, interval = 100) {
    const startTime = Date.now();
    while (!isSwipingAllowed()) {
        if (Date.now() - startTime > maxWait) {
            return false;
        }
        await new Promise(resolve => setTimeout(resolve, interval));
    }
    return true;
}

/**
 * Handle generation end - retry since generation_ended only fires when no tool call continues
 */
function onGenerationEnded() {
    if (!agenticTimelineFillState.active || agenticTimelineFillState.endRequested) {
        return;
    }

    // Increment retry count and check limit
    agenticTimelineFillState.retryCount++;
    if (agenticTimelineFillState.retryCount > MAX_RETRIES) {
        error(`Max retries (${MAX_RETRIES}) exceeded, aborting agentic timeline fill session`);
        toastr.error('Agentic timeline fill aborted: AI failed to make valid tool calls', 'Timeline Memory');
        abortAgenticTimelineFillSession();
        return;
    }

    log(`Generation ended without tool call (retry ${agenticTimelineFillState.retryCount}/${MAX_RETRIES}), attempting retry...`);

    // Use setTimeout to not block the event handler
    setTimeout(async () => {
        log('Retry callback executing...');

        if (!agenticTimelineFillState.active) {
            log('Bailing: session no longer active');
            return;
        }
        if (agenticTimelineFillState.endRequested) {
            log('Bailing: end was requested');
            return;
        }

        // Try swipe attempts with increasing delays
        let swipeSucceeded = false;
        for (let i = 0; i < SWIPE_RETRY_DELAYS.length; i++) {
            if (!agenticTimelineFillState.active || agenticTimelineFillState.endRequested) {
                log('Bailing: session state changed during swipe retries');
                return;
            }

            // Wait for UI to settle
            log(`Swipe attempt ${i + 1}/${SWIPE_RETRY_DELAYS.length}: waiting for swipe to be allowed...`);
            const ready = await waitForSwipeReady(10000, 200);

            if (!ready) {
                log(`Swipe attempt ${i + 1}: timed out waiting for swipe readiness`);
                if (i < SWIPE_RETRY_DELAYS.length - 1) {
                    log(`Waiting ${SWIPE_RETRY_DELAYS[i]}ms before next swipe attempt...`);
                    await new Promise(resolve => setTimeout(resolve, SWIPE_RETRY_DELAYS[i]));
                }
                continue;
            }

            // On first attempt, wait extra 5 seconds for UI to fully settle
            if (i === 0) {
                log('Swipe allowed - waiting 5 seconds for UI to fully settle...');
                await new Promise(resolve => setTimeout(resolve, 5000));

                if (!agenticTimelineFillState.active || agenticTimelineFillState.endRequested) {
                    log('Bailing: session state changed during initial delay');
                    return;
                }
            }

            // Final check right before swipe
            if (!agenticTimelineFillState.active || agenticTimelineFillState.endRequested) {
                log('Bailing: session state changed after swipe wait');
                return;
            }

            // Reload chat to ensure fresh state before swipe
            log(`Swipe attempt ${i + 1}: reloading chat before swipe...`);
            try {
                await reloadCurrentChat();
            } catch (reloadErr) {
                log(`Chat reload failed: ${reloadErr.message}, continuing anyway`);
            }

            // Check again after reload
            if (!agenticTimelineFillState.active || agenticTimelineFillState.endRequested) {
                log('Bailing: session state changed after chat reload');
                return;
            }

            log(`Swipe attempt ${i + 1}: executing swipe...`);
            try {
                await swipe_right();
                log('Swipe completed successfully');
                swipeSucceeded = true;
                break;
            } catch (swipeErr) {
                // If session ended during swipe, bail silently
                if (!agenticTimelineFillState.active || agenticTimelineFillState.endRequested) {
                    log('Swipe error after session ended, bailing silently');
                    return;
                }
                log(`Swipe attempt ${i + 1} failed: ${swipeErr.message}`);
                if (i < SWIPE_RETRY_DELAYS.length - 1) {
                    log(`Waiting ${SWIPE_RETRY_DELAYS[i]}ms before next swipe attempt...`);
                    await new Promise(resolve => setTimeout(resolve, SWIPE_RETRY_DELAYS[i]));
                }
            }
        }

        if (swipeSucceeded) {
            return;  // Swipe worked, new generation will be triggered automatically
        }

        // All swipe attempts failed - try trigger attempts with increasing delays
        log('All swipe attempts failed, trying trigger instead...');

        for (let i = 0; i < TRIGGER_RETRY_DELAYS.length; i++) {
            if (!agenticTimelineFillState.active || agenticTimelineFillState.endRequested) {
                log('Bailing: session state changed during trigger retries');
                return;
            }

            log(`Trigger attempt ${i + 1}/${TRIGGER_RETRY_DELAYS.length}: executing trigger...`);
            try {
                await executeSlashCommandsWithOptions('/trigger');
                log('Trigger completed successfully');
                return;  // Trigger worked
            } catch (triggerErr) {
                // If session ended during trigger, bail silently
                if (!agenticTimelineFillState.active || agenticTimelineFillState.endRequested) {
                    log('Trigger error after session ended, bailing silently');
                    return;
                }
                log(`Trigger attempt ${i + 1} failed: ${triggerErr.message}`);
                if (i < TRIGGER_RETRY_DELAYS.length - 1) {
                    log(`Waiting ${TRIGGER_RETRY_DELAYS[i]}ms before next trigger attempt...`);
                    await new Promise(resolve => setTimeout(resolve, TRIGGER_RETRY_DELAYS[i]));
                }
            }
        }

        // Final check before aborting
        if (!agenticTimelineFillState.active || agenticTimelineFillState.endRequested) {
            log('Session ended during retries, no need to abort');
            return;
        }

        // All attempts failed - abort the session
        error('All swipe and trigger attempts failed, aborting agentic timeline fill session');
        toastr.error('Agentic timeline fill aborted: Failed to retry after AI did not make a tool call', 'Timeline Memory');
        abortAgenticTimelineFillSession();
    }, 0);
}

/**
 * Start monitoring for generation end
 */
function startGenerationMonitor() {
    log('Starting generation monitor');
    eventSource.on(event_types.GENERATION_ENDED, onGenerationEnded);
}

/**
 * Stop monitoring generation events
 */
function stopGenerationMonitor() {
    log('Stopping generation monitor');
    eventSource.removeListener(event_types.GENERATION_ENDED, onGenerationEnded);
}

/**
 * Trigger the initial generation
 */
async function triggerAgenticTimelineFill() {
    log('Triggering initial agentic timeline fill generation');

    // Start monitoring for generation completions
    startGenerationMonitor();

    try {
        // Trigger generation - SillyTavern will auto-continue after tool calls
        await executeSlashCommandsWithOptions('/trigger');
        log('Initial generation triggered');
    } catch (err) {
        error('Error triggering agentic timeline fill:', err);
        stopGenerationMonitor();
        // If initial trigger fails, clean up
        await cleanupAgenticTimelineFillSession();
    }
}

/**
 * Clean up after an agentic timeline fill session
 */
async function cleanupAgenticTimelineFillSession() {
    // Use sessionCompleteResolve as the indicator of whether cleanup is needed
    // (it's only set when a session starts and cleared when cleanup finishes)
    if (!agenticTimelineFillState.sessionCompleteResolve) {
        log('Cleanup called but no active session to clean up');
        return;
    }

    // Set active to false immediately to prevent any async callbacks from proceeding
    agenticTimelineFillState.active = false;

    log('Cleaning up agentic timeline fill session');

    const context = getContext();
    const chat = context.chat;

    try {
        // Stop monitoring and unregister tools first
        stopGenerationMonitor();
        unregisterAgenticTimelineTools();

        // Delete all messages from the session
        const messagesToDelete = chat.length - agenticTimelineFillState.startMessageIndex;
        if (messagesToDelete > 0) {
            log(`Deleting ${messagesToDelete} messages from agentic timeline fill session`);
            chat.splice(agenticTimelineFillState.startMessageIndex, messagesToDelete);
        }

        // Unhide the messages that were hidden at session start
        if (agenticTimelineFillState.hiddenMessageStart >= 0 && agenticTimelineFillState.hiddenMessageEnd >= 0) {
            log(`Unhiding messages ${agenticTimelineFillState.hiddenMessageStart} to ${agenticTimelineFillState.hiddenMessageEnd}`);
            await executeSlashCommandsWithOptions(`/unhide ${agenticTimelineFillState.hiddenMessageStart}-${agenticTimelineFillState.hiddenMessageEnd}`);
        }

        // Clear state from metadata BEFORE saving so it persists
        clearStateFromMetadata();

        // Save and reload chat
        await saveChatConditional();
        await reloadCurrentChat();

        // Restore original profile after chat reload
        const profileToRestore = agenticTimelineFillState.savedProfileName;
        if (profileToRestore) {
            await switchProfile(profileToRestore);
        } else {
            // No profile was selected before, select none
            await switchProfile('none');
        }

        log('Agentic timeline fill session cleaned up successfully');
        toastr.success('Agentic timeline fill session completed', 'Timeline Memory');

    } catch (err) {
        error('Error during cleanup:', err);
        toastr.error('Error cleaning up agentic timeline fill session', 'Timeline Memory');
    } finally {
        // Clear state from metadata (safety net in case of errors)
        clearStateFromMetadata();

        // Reset state
        agenticTimelineFillState.active = false;
        agenticTimelineFillState.savedProfileId = null;
        agenticTimelineFillState.savedProfileName = null;
        agenticTimelineFillState.startMessageIndex = 0;
        agenticTimelineFillState.endRequested = false;
        agenticTimelineFillState.retryCount = 0;
        agenticTimelineFillState.hiddenMessageStart = -1;
        agenticTimelineFillState.hiddenMessageEnd = -1;
        agenticTimelineFillState.sessionChatId = null;

        // Clear currentChatContent at session end (stored in memories.js)
        try {
            const { clearCurrentChatContent } = await import('./memories.js');
            clearCurrentChatContent();
        } catch (err) {
            debug('Could not clear currentChatContent:', err.message);
        }

        // Restore timeline injection now that session is done
        try {
            const { updateTimelineInjection } = await import('./memories.js');
            updateTimelineInjection();
        } catch (err) {
            debug('Could not restore timeline injection:', err.message);
        }

        // Resolve the session complete promise so awaiting callers can continue
        if (agenticTimelineFillState.sessionCompleteResolve) {
            log('Resolving session complete promise');
            agenticTimelineFillState.sessionCompleteResolve();
            agenticTimelineFillState.sessionCompleteResolve = null;
        }
    }
}

/**
 * Abort an active agentic timeline fill session
 */
export async function abortAgenticTimelineFillSession() {
    // Check if there's actually a session to abort
    if (!agenticTimelineFillState.sessionCompleteResolve) {
        return;
    }

    log('Aborting agentic timeline fill session');
    agenticTimelineFillState.active = false;
    agenticTimelineFillState.endRequested = true;
    stopGeneration();
    await cleanupAgenticTimelineFillSession();
}

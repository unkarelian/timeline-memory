/**
 * Lore Management Module
 *
 * Provides autonomous lorebook editing capabilities during lore management sessions.
 * The AI can list entries, create/update/delete entries in the character's assigned world info, and signal session end.
 */

import { extension_settings, getContext } from "../../../../extensions.js";
import { saveChatConditional, reloadCurrentChat, characters, this_chid, eventSource, event_types, stopGeneration, isSwipingAllowed } from "../../../../../script.js";
import { executeSlashCommandsWithOptions } from "../../../../slash-commands.js";
import { world_names, loadWorldInfo, createWorldInfoEntry, deleteWorldInfoEntry, saveWorldInfo } from "../../../../world-info.js";
import { settings } from "./settings.js";
import { log, debug, error } from "./logging.js";

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
const loreManagementState = {
    active: false,
    savedProfileId: null,
    savedProfileName: null,
    startMessageIndex: 0,
    endRequested: false,
    hiddenMessageStart: -1,  // First message index that was hidden
    hiddenMessageEnd: -1,    // Last message index that was hidden
    sessionChatId: null,     // Chat ID when session started (to detect actual chat switches)
    retryCount: 0,           // Counter to prevent infinite retry loops on errors
};

const MAX_RETRIES = 5;  // Maximum number of consecutive retries before aborting
const SWIPE_RETRY_DELAYS = [500, 1000, 2000, 3000];  // Delays between swipe attempts (ms)
const TRIGGER_RETRY_DELAYS = [500, 1000, 2000, 3000];  // Delays between trigger attempts (ms)

const LORE_MANAGEMENT_METADATA_KEY = 'lore_management_session';

/**
 * Save lore management state to chat metadata for recovery after refresh
 */
function saveStateToMetadata() {
    const context = getContext();
    if (!context.chatMetadata) return;

    context.chatMetadata[LORE_MANAGEMENT_METADATA_KEY] = {
        active: loreManagementState.active,
        savedProfileId: loreManagementState.savedProfileId,
        savedProfileName: loreManagementState.savedProfileName,
        startMessageIndex: loreManagementState.startMessageIndex,
        hiddenMessageStart: loreManagementState.hiddenMessageStart,
        hiddenMessageEnd: loreManagementState.hiddenMessageEnd,
        sessionChatId: loreManagementState.sessionChatId,
    };
    log('Saved lore management state to metadata');
}

/**
 * Clear lore management state from chat metadata
 */
function clearStateFromMetadata() {
    const context = getContext();
    if (!context.chatMetadata) return;

    delete context.chatMetadata[LORE_MANAGEMENT_METADATA_KEY];
    log('Cleared lore management state from metadata');
}

/**
 * Check for and recover from an interrupted lore management session
 * Call this on CHAT_CHANGED to handle page refresh recovery
 * @returns {Promise<boolean>} True if recovery was performed
 */
export async function recoverInterruptedSession() {
    const context = getContext();
    if (!context.chatMetadata) return false;

    const savedState = context.chatMetadata[LORE_MANAGEMENT_METADATA_KEY];
    if (!savedState || !savedState.active) return false;

    log('Recovering from interrupted lore management session');
    toastr.warning('Recovering from interrupted lore management session...', 'Timeline Memory');

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

        // Restore timeline injection now that lore management is done
        try {
            const { updateTimelineInjection } = await import('./memories.js');
            updateTimelineInjection();
        } catch (err) {
            debug('Could not restore timeline injection:', err.message);
        }

        log('Recovery completed successfully');
        toastr.success('Lore management session recovered', 'Timeline Memory');
        return true;

    } catch (err) {
        error('Error during recovery:', err);
        toastr.error('Error recovering lore management session', 'Timeline Memory');
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
 * Check if a lore management session is currently active
 * @returns {boolean}
 */
export function isLoreManagementActive() {
    return loreManagementState.active;
}

/**
 * Get the chat ID associated with the current lore management session
 * @returns {string|null} The chat ID or null if no session is active
 */
export function getSessionChatId() {
    return loreManagementState.sessionChatId;
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
 * Get the current character's assigned world info name
 * @returns {string|null} The world info name or null if not assigned
 */
function getCharacterWorldInfo() {
    if (this_chid === undefined || this_chid === null || this_chid < 0) {
        return null;
    }
    const character = characters[this_chid];
    return character?.data?.extensions?.world || null;
}

/**
 * List all entries in the character's assigned world info
 * @returns {Promise<Object>} Object with lorebook name and entries array
 */
export async function listEntries() {
    const worldName = getCharacterWorldInfo();

    if (!worldName) {
        return { error: 'No world info assigned to the current character' };
    }

    if (!world_names.includes(worldName)) {
        return { error: `World info "${worldName}" not found` };
    }

    try {
        const data = await loadWorldInfo(worldName);
        if (!data || !data.entries) {
            return { error: `Failed to load world info "${worldName}"` };
        }

        const entries = Object.entries(data.entries).map(([uid, entry]) => ({
            uid: Number(uid),
            comment: entry.comment || '',
            key: entry.key || [],
            keysecondary: entry.keysecondary || [],
            content: entry.content || '',
            constant: entry.constant || false,
            selective: entry.selective || false,
            enabled: !entry.disable,
        }));

        return {
            lorebook: worldName,
            entryCount: entries.length,
            entries: entries,
        };
    } catch (err) {
        error(`Failed to load world info ${worldName}:`, err);
        return { error: `Failed to load world info: ${err.message}` };
    }
}

/**
 * Convert literal \n strings to actual newlines
 * @param {string} str - The string to process
 * @returns {string} The string with newlines converted
 */
function convertNewlines(str) {
    if (typeof str !== 'string') return str;
    return str.replace(/\\n/g, '\n');
}

/**
 * Edit a lorebook entry (create, update, or delete) in the character's assigned world info
 * @param {Object} args - The arguments for the edit operation
 * @returns {Promise<string>} Result message
 */
async function editLorebookEntry(args) {
    const { action, uid, key, keysecondary, constant, selective } = args;
    // Convert literal \n to actual newlines in content and comment
    const content = convertNewlines(args.content);
    const comment = convertNewlines(args.comment);

    const lorebook = getCharacterWorldInfo();
    if (!lorebook) {
        return 'Error: No world info assigned to the current character';
    }

    if (!world_names.includes(lorebook)) {
        return `Error: world info "${lorebook}" not found`;
    }

    const data = await loadWorldInfo(lorebook);
    if (!data || !data.entries) {
        return `Error: failed to load world info "${lorebook}"`;
    }

    switch (action) {
        case 'create': {
            const entry = createWorldInfoEntry(lorebook, data);
            if (!entry) {
                return 'Error: failed to create entry';
            }

            // Set entry properties
            if (key && Array.isArray(key)) {
                entry.key = key;
            }
            if (keysecondary && Array.isArray(keysecondary)) {
                entry.keysecondary = keysecondary;
            }
            if (content) {
                entry.content = content;
            }
            if (comment) {
                entry.comment = comment;
                entry.addMemo = true;
            }
            if (constant !== undefined) {
                entry.constant = constant;
            }
            if (selective !== undefined) {
                entry.selective = selective;
            }

            await saveWorldInfo(lorebook, data, true);
            log(`Created entry ${entry.uid} in lorebook "${lorebook}"`);
            return `Successfully created entry with UID ${entry.uid} in lorebook "${lorebook}"`;
        }

        case 'update': {
            if (uid === undefined || uid === null) {
                return 'Error: uid is required for update action';
            }

            const entry = data.entries[uid];
            if (!entry) {
                return `Error: entry with UID ${uid} not found in lorebook "${lorebook}"`;
            }

            // Update entry properties
            if (key && Array.isArray(key)) {
                entry.key = key;
            }
            if (keysecondary && Array.isArray(keysecondary)) {
                entry.keysecondary = keysecondary;
            }
            if (content !== undefined) {
                entry.content = content;
            }
            if (comment !== undefined) {
                entry.comment = comment;
                if (comment) entry.addMemo = true;
            }
            if (constant !== undefined) {
                entry.constant = constant;
            }
            if (selective !== undefined) {
                entry.selective = selective;
            }

            await saveWorldInfo(lorebook, data, true);
            log(`Updated entry ${uid} in lorebook "${lorebook}"`);
            return `Successfully updated entry with UID ${uid} in lorebook "${lorebook}"`;
        }

        case 'delete': {
            if (uid === undefined || uid === null) {
                return 'Error: uid is required for delete action';
            }

            if (!data.entries[uid]) {
                return `Error: entry with UID ${uid} not found in lorebook "${lorebook}"`;
            }

            const deleted = await deleteWorldInfoEntry(data, uid, { silent: true });
            if (!deleted) {
                return `Error: failed to delete entry with UID ${uid}`;
            }

            await saveWorldInfo(lorebook, data, true);
            log(`Deleted entry ${uid} from lorebook "${lorebook}"`);
            return `Successfully deleted entry with UID ${uid} from lorebook "${lorebook}"`;
        }

        default:
            return `Error: unknown action "${action}". Valid actions are: create, update, delete`;
    }
}

/**
 * Signal the end of the lore management session
 * @returns {string} Confirmation message
 */
function endLoreManagementTool() {
    loreManagementState.endRequested = true;
    log('End lore management requested via tool');

    // Stop the generation monitor FIRST to prevent spurious swipes from generation_ended events
    stopGenerationMonitor();

    // Stop any further generation immediately
    stopGeneration();

    // Directly initiate cleanup (async, don't await)
    cleanupLoreManagementSession();

    return 'Lore management session ending. All lorebook changes have been saved.';
}

/**
 * Register the lore management tools
 */
export function registerLoreTools() {
    const context = getContext();
    if (!context.ToolManager) {
        error('ToolManager not available, cannot register lore tools');
        return;
    }

    // Unregister existing tools first
    unregisterLoreTools();

    log('Registering lore management tools');

    // Tool: list_entries
    context.ToolManager.registerFunctionTool({
        name: 'list_entries',
        displayName: 'List Lorebook Entries',
        description: 'List all entries in the character\'s assigned world info (lorebook). Returns the lorebook name, entry count, and details for each entry including uid, comment, keys, content, and settings. Use this to see what entries exist before editing them.',
        stealth: false,
        parameters: {
            type: 'object',
            properties: {},
            required: []
        },
        action: async () => {
            const result = await listEntries();
            return JSON.stringify(result, null, 2);
        },
        shouldRegister: () => loreManagementState.active,
        formatMessage: () => 'Listing lorebook entries...',
    });

    // Tool: edit_entry
    context.ToolManager.registerFunctionTool({
        name: 'edit_entry',
        displayName: 'Edit Lorebook Entry',
        description: 'Create, update, or delete an entry in the character\'s assigned world info (lorebook). For create/update, provide key (primary keywords array), content, and optionally keysecondary, comment, constant, and selective. For update/delete, uid is required.',
        stealth: false,
        parameters: {
            type: 'object',
            properties: {
                action: {
                    type: 'string',
                    enum: ['create', 'update', 'delete'],
                    description: 'The action to perform'
                },
                uid: {
                    type: 'integer',
                    description: 'Entry UID (required for update and delete)'
                },
                key: {
                    type: 'array',
                    items: { type: 'string' },
                    description: 'Primary keywords that trigger this entry'
                },
                keysecondary: {
                    type: 'array',
                    items: { type: 'string' },
                    description: 'Secondary keywords (used with selective mode)'
                },
                content: {
                    type: 'string',
                    description: 'The content/text of the entry'
                },
                comment: {
                    type: 'string',
                    description: 'Title/memo for the entry'
                },
                constant: {
                    type: 'boolean',
                    description: 'If true, entry is always active regardless of keywords'
                },
                selective: {
                    type: 'boolean',
                    description: 'If true, requires secondary keywords to also match'
                }
            },
            required: ['action']
        },
        action: async (args) => {
            return await editLorebookEntry(args);
        },
        shouldRegister: () => loreManagementState.active,
        formatMessage: (args) => {
            switch (args.action) {
                case 'create':
                    return 'Creating new entry...';
                case 'update':
                    return `Updating entry ${args.uid}...`;
                case 'delete':
                    return `Deleting entry ${args.uid}...`;
                default:
                    return 'Editing lorebook entry...';
            }
        },
    });

    // Tool: end_lore_management
    context.ToolManager.registerFunctionTool({
        name: 'end_lore_management',
        displayName: 'End Lore Management',
        description: 'Signal that you are done managing lorebooks. Call this when you have finished all lorebook edits.',
        stealth: true,
        parameters: {
            type: 'object',
            properties: {},
            required: []
        },
        action: () => {
            return endLoreManagementTool();
        },
        shouldRegister: () => loreManagementState.active,
        formatMessage: () => 'Ending lore management session...',
    });

    log('Lore management tools registered');
}

/**
 * Unregister the lore management tools
 */
export function unregisterLoreTools() {
    const context = getContext();
    if (!context.ToolManager) {
        return;
    }

    try {
        context.ToolManager.unregisterFunctionTool('list_entries');
        context.ToolManager.unregisterFunctionTool('edit_entry');
        context.ToolManager.unregisterFunctionTool('end_lore_management');
        debug('Lore management tools unregistered');
    } catch (err) {
        // Tools may not have been registered
        debug('Some lore tools were not registered:', err.message);
    }
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
 * Start a lore management session
 * @returns {Promise<void>}
 */
export async function startLoreManagementSession() {
    if (loreManagementState.active) {
        toastr.warning('A lore management session is already active', 'Timeline Memory');
        return;
    }

    const loreProfileId = settings.lore_management_profile;
    if (!loreProfileId) {
        toastr.error('No lore management profile configured', 'Timeline Memory');
        return;
    }

    const loreProfileName = getProfileNameById(loreProfileId);
    if (!loreProfileName) {
        toastr.error('Configured lore management profile not found', 'Timeline Memory');
        return;
    }

    const context = getContext();

    // Save current state
    loreManagementState.savedProfileId = extension_settings.connectionManager?.selectedProfile || null;
    loreManagementState.savedProfileName = getProfileNameById(loreManagementState.savedProfileId);
    loreManagementState.startMessageIndex = context.chat.length;
    loreManagementState.endRequested = false;
    loreManagementState.retryCount = 0;
    loreManagementState.hiddenMessageStart = -1;
    loreManagementState.hiddenMessageEnd = -1;
    loreManagementState.sessionChatId = context.getCurrentChatId?.() || null;
    loreManagementState.active = true;

    // Clear timeline injection while lore management is active
    try {
        const { updateTimelineInjection } = await import('./memories.js');
        updateTimelineInjection();
    } catch (err) {
        debug('Could not update timeline injection:', err.message);
    }

    log('Starting lore management session');
    log(`Saved profile: ${loreManagementState.savedProfileName || 'none'}`);
    log(`Start message index: ${loreManagementState.startMessageIndex}`);
    log(`Session chat ID: ${loreManagementState.sessionChatId}`);

    try {
        // Hide existing messages to give the AI a clean slate
        const firstVisibleIndex = findFirstVisibleMessageIndex();
        if (firstVisibleIndex >= 0 && context.chat.length > 0) {
            loreManagementState.hiddenMessageStart = firstVisibleIndex;
            loreManagementState.hiddenMessageEnd = context.chat.length - 1;
            log(`Hiding messages ${firstVisibleIndex} to ${loreManagementState.hiddenMessageEnd} for clean context`);
            await executeSlashCommandsWithOptions(`/hide ${firstVisibleIndex}-${loreManagementState.hiddenMessageEnd}`);
        }

        // Save state to metadata for recovery after page refresh
        saveStateToMetadata();
        await saveChatConditional();

        // Register lore tools
        registerLoreTools();

        // Swap to lore management profile
        await switchProfile(loreProfileName);

        // Wait for profile swap to fully settle
        await new Promise(resolve => setTimeout(resolve, 500));

        // Add user message using /send command (doesn't trigger generation)
        const prompt = settings.lore_management_prompt || 'begin lore retrieval';
        log(`Sending user message: ${prompt}`);
        await executeSlashCommandsWithOptions(`/send ${prompt}`);

        log('Added lore management user message');

        // Trigger initial generation - SillyTavern handles tool flow automatically
        await triggerLoreManagement();

    } catch (err) {
        error('Lore management session failed:', err);
        toastr.error('Lore management session failed: ' + err.message, 'Timeline Memory');
        await cleanupLoreManagementSession();
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
    if (!loreManagementState.active || loreManagementState.endRequested) {
        return;
    }

    // Increment retry count and check limit
    loreManagementState.retryCount++;
    if (loreManagementState.retryCount > MAX_RETRIES) {
        error(`Max retries (${MAX_RETRIES}) exceeded, aborting lore management session`);
        toastr.error('Lore management aborted: AI failed to make valid tool calls', 'Timeline Memory');
        abortLoreManagementSession();
        return;
    }

    log(`Generation ended without tool call (retry ${loreManagementState.retryCount}/${MAX_RETRIES}), attempting retry...`);

    // Use setTimeout to not block the event handler
    setTimeout(async () => {
        log('Retry callback executing...');

        if (!loreManagementState.active) {
            log('Bailing: session no longer active');
            return;
        }
        if (loreManagementState.endRequested) {
            log('Bailing: end was requested');
            return;
        }

        // Try swipe attempts with increasing delays
        let swipeSucceeded = false;
        for (let i = 0; i < SWIPE_RETRY_DELAYS.length; i++) {
            if (!loreManagementState.active || loreManagementState.endRequested) {
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

                if (!loreManagementState.active || loreManagementState.endRequested) {
                    log('Bailing: session state changed during initial delay');
                    return;
                }
            }

            if (!loreManagementState.active || loreManagementState.endRequested) {
                log('Bailing: session state changed after swipe wait');
                return;
            }

            log(`Swipe attempt ${i + 1}: executing swipe...`);
            try {
                await executeSlashCommandsWithOptions('/swipes-swipe');
                log('Swipe completed successfully');
                swipeSucceeded = true;
                break;
            } catch (swipeErr) {
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
            if (!loreManagementState.active || loreManagementState.endRequested) {
                log('Bailing: session state changed during trigger retries');
                return;
            }

            log(`Trigger attempt ${i + 1}/${TRIGGER_RETRY_DELAYS.length}: executing trigger...`);
            try {
                await executeSlashCommandsWithOptions('/trigger');
                log('Trigger completed successfully');
                return;  // Trigger worked
            } catch (triggerErr) {
                log(`Trigger attempt ${i + 1} failed: ${triggerErr.message}`);
                if (i < TRIGGER_RETRY_DELAYS.length - 1) {
                    log(`Waiting ${TRIGGER_RETRY_DELAYS[i]}ms before next trigger attempt...`);
                    await new Promise(resolve => setTimeout(resolve, TRIGGER_RETRY_DELAYS[i]));
                }
            }
        }

        // All attempts failed - abort the session
        error('All swipe and trigger attempts failed, aborting lore management session');
        toastr.error('Lore management aborted: Failed to retry after AI did not make a tool call', 'Timeline Memory');
        abortLoreManagementSession();
    }, 0);
}

/**
 * Start monitoring for generation end (only fires when no tool call auto-continues)
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
 * Trigger the initial lore management generation
 * SillyTavern's tool calling flow handles subsequent generations automatically.
 * The generation monitor handles re-triggering if AI doesn't make a tool call.
 */
async function triggerLoreManagement() {
    log('Triggering initial lore management generation');

    // Start monitoring for generation completions
    startGenerationMonitor();

    try {
        // Trigger generation - SillyTavern will auto-continue after tool calls
        // The end_lore_management tool (stealth) will handle cleanup when done
        await executeSlashCommandsWithOptions('/trigger');
        log('Initial generation triggered');
    } catch (err) {
        error('Error triggering lore management:', err);
        stopGenerationMonitor();
        // If initial trigger fails, clean up
        await cleanupLoreManagementSession();
    }
}

/**
 * Clean up after a lore management session
 */
async function cleanupLoreManagementSession() {
    if (!loreManagementState.active) {
        return;
    }

    // Set active to false immediately to prevent any async callbacks (like swipe retries) from proceeding
    loreManagementState.active = false;

    log('Cleaning up lore management session');

    const context = getContext();
    const chat = context.chat;

    try {
        // Stop monitoring and unregister tools first
        stopGenerationMonitor();
        unregisterLoreTools();

        // Delete all messages from the session
        const messagesToDelete = chat.length - loreManagementState.startMessageIndex;
        if (messagesToDelete > 0) {
            log(`Deleting ${messagesToDelete} messages from lore management session`);
            chat.splice(loreManagementState.startMessageIndex, messagesToDelete);
        }

        // Unhide the messages that were hidden at session start
        if (loreManagementState.hiddenMessageStart >= 0 && loreManagementState.hiddenMessageEnd >= 0) {
            log(`Unhiding messages ${loreManagementState.hiddenMessageStart} to ${loreManagementState.hiddenMessageEnd}`);
            await executeSlashCommandsWithOptions(`/unhide ${loreManagementState.hiddenMessageStart}-${loreManagementState.hiddenMessageEnd}`);
        }

        // Clear state from metadata BEFORE saving so it persists
        clearStateFromMetadata();

        // Save and reload chat
        await saveChatConditional();
        await reloadCurrentChat();

        // Restore original profile after chat reload
        // This ensures the profile swap persists and doesn't get overwritten
        const profileToRestore = loreManagementState.savedProfileName;
        if (profileToRestore) {
            await switchProfile(profileToRestore);
        } else {
            // No profile was selected before, select none
            await switchProfile('none');
        }

        log('Lore management session cleaned up successfully');
        toastr.success('Lore management session completed', 'Timeline Memory');

    } catch (err) {
        error('Error during cleanup:', err);
        toastr.error('Error cleaning up lore management session', 'Timeline Memory');
    } finally {
        // Clear state from metadata (safety net in case of errors)
        clearStateFromMetadata();

        // Reset state
        loreManagementState.active = false;
        loreManagementState.savedProfileId = null;
        loreManagementState.savedProfileName = null;
        loreManagementState.startMessageIndex = 0;
        loreManagementState.endRequested = false;
        loreManagementState.retryCount = 0;
        loreManagementState.hiddenMessageStart = -1;
        loreManagementState.hiddenMessageEnd = -1;
        loreManagementState.sessionChatId = null;

        // Restore timeline injection now that lore management is done
        try {
            const { updateTimelineInjection } = await import('./memories.js');
            updateTimelineInjection();
        } catch (err) {
            debug('Could not restore timeline injection:', err.message);
        }
    }
}

/**
 * Abort an active lore management session
 */
export async function abortLoreManagementSession() {
    if (!loreManagementState.active) {
        return;
    }

    log('Aborting lore management session');
    loreManagementState.endRequested = true;
    stopGeneration();
    await cleanupLoreManagementSession();
}

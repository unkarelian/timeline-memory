/**
 * Lore Management Module
 *
 * Provides autonomous lorebook editing capabilities during lore management sessions.
 * The AI can list entries, create/update/delete entries in the character's assigned world info, and signal session end.
 */

import { extension_settings, getContext } from "../../../../extensions.js";
import { saveChatConditional, reloadCurrentChat, characters, this_chid } from "../../../../../script.js";
import { executeSlashCommandsWithOptions } from "../../../../slash-commands.js";
import { world_names, loadWorldInfo, createWorldInfoEntry, deleteWorldInfoEntry, saveWorldInfo } from "../../../../world-info.js";
import { settings } from "./settings.js";
import { log, debug, error } from "./logging.js";

// Session state
const loreManagementState = {
    active: false,
    savedProfileId: null,
    savedProfileName: null,
    startMessageIndex: 0,
    endRequested: false,
    hiddenMessageStart: -1,  // First message index that was hidden
    hiddenMessageEnd: -1,    // Last message index that was hidden
};

/**
 * Check if a lore management session is currently active
 * @returns {boolean}
 */
export function isLoreManagementActive() {
    return loreManagementState.active;
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
async function listEntries() {
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
        stealth: false,
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
    loreManagementState.hiddenMessageStart = -1;
    loreManagementState.hiddenMessageEnd = -1;
    loreManagementState.active = true;

    log('Starting lore management session');
    log(`Saved profile: ${loreManagementState.savedProfileName || 'none'}`);
    log(`Start message index: ${loreManagementState.startMessageIndex}`);

    try {
        // Hide existing messages to give the AI a clean slate
        const firstVisibleIndex = findFirstVisibleMessageIndex();
        if (firstVisibleIndex >= 0 && context.chat.length > 0) {
            loreManagementState.hiddenMessageStart = firstVisibleIndex;
            loreManagementState.hiddenMessageEnd = context.chat.length - 1;
            log(`Hiding messages ${firstVisibleIndex} to ${loreManagementState.hiddenMessageEnd} for clean context`);
            await executeSlashCommandsWithOptions(`/hide ${firstVisibleIndex}-${loreManagementState.hiddenMessageEnd}`);
        }

        // Register lore tools
        registerLoreTools();

        // Swap to lore management profile
        log(`Swapping to lore management profile: ${loreProfileName}`);
        await executeSlashCommandsWithOptions(`/profile "${loreProfileName}" await=true`);

        // Wait for profile swap to fully settle
        await new Promise(resolve => setTimeout(resolve, 500));

        // Add user message using /send command (doesn't trigger generation)
        const prompt = settings.lore_management_prompt || 'begin lore retrieval';
        log(`Sending user message: ${prompt}`);
        await executeSlashCommandsWithOptions(`/send ${prompt}`);

        log('Added lore management user message');

        // Run the lore management loop
        await runLoreManagementLoop();

    } catch (err) {
        error('Lore management session failed:', err);
        toastr.error('Lore management session failed: ' + err.message, 'Timeline Memory');
        await cleanupLoreManagementSession();
    }
}

/**
 * Run the lore management generation loop
 * Uses end_lore_management tool call to detect when the AI is done
 */
async function runLoreManagementLoop() {
    log('Starting lore management loop');

    while (loreManagementState.active && !loreManagementState.endRequested) {
        try {
            log('Triggering generation...');

            // Trigger generation and wait for it to complete
            await executeSlashCommandsWithOptions('/trigger await=true');

            log('Generation completed, checking if end was requested...');
            log(`End requested: ${loreManagementState.endRequested}`);

            // Check if the end_lore_management tool was called
            if (loreManagementState.endRequested) {
                log('End lore management tool was called, ending loop');
                break;
            }

            // Small delay before next iteration
            await new Promise(resolve => setTimeout(resolve, 300));

        } catch (err) {
            error('Error in lore management loop:', err);
            // Don't break on error - the generation might have been cancelled but we can retry
            // Unless end was requested
            if (loreManagementState.endRequested) {
                break;
            }
            // Wait a bit before retrying
            await new Promise(resolve => setTimeout(resolve, 1000));
        }
    }

    await cleanupLoreManagementSession();
}

/**
 * Clean up after a lore management session
 */
async function cleanupLoreManagementSession() {
    if (!loreManagementState.active) {
        return;
    }

    log('Cleaning up lore management session');

    const context = getContext();
    const chat = context.chat;

    try {
        // Unregister tools first
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

        // Restore original profile if one was saved
        if (loreManagementState.savedProfileName) {
            log(`Restoring profile: ${loreManagementState.savedProfileName}`);
            await executeSlashCommandsWithOptions(`/profile "${loreManagementState.savedProfileName}" await=true`);
        } else if (loreManagementState.savedProfileId === null) {
            // No profile was selected before, select none
            log('Restoring to no profile');
            await executeSlashCommandsWithOptions('/profile "<None>" await=true');
        }

        // Save and reload chat
        await saveChatConditional();
        await reloadCurrentChat();

        log('Lore management session cleaned up successfully');
        toastr.success('Lore management session completed', 'Timeline Memory');

    } catch (err) {
        error('Error during cleanup:', err);
        toastr.error('Error cleaning up lore management session', 'Timeline Memory');
    } finally {
        // Reset state
        loreManagementState.active = false;
        loreManagementState.savedProfileId = null;
        loreManagementState.savedProfileName = null;
        loreManagementState.startMessageIndex = 0;
        loreManagementState.endRequested = false;
        loreManagementState.hiddenMessageStart = -1;
        loreManagementState.hiddenMessageEnd = -1;
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
    // The loop will detect this and clean up
}

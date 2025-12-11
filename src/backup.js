/**
 * Backup Utility Module
 *
 * Provides a function to create a chat backup before risky operations
 * like agentic timeline fill and lore management sessions.
 */

import { getContext } from "../../../../extensions.js";
import { log, debug, error } from "./logging.js";

/**
 * Create a backup of the current chat.
 * This saves the chat which triggers SillyTavern's automatic backup system.
 *
 * @param {string} operationName - Name of the operation requesting the backup (for logging)
 * @returns {Promise<boolean>} True if backup was created successfully, false otherwise
 */
export async function createChatBackup(operationName = 'unknown operation') {
    const context = getContext();

    // Check if there's a chat to backup
    if (!context.chat || context.chat.length === 0) {
        debug(`No chat to backup for ${operationName}`);
        return false;
    }

    // Check if saveChat is available
    if (typeof context.saveChat !== 'function') {
        error(`saveChat not available in context for ${operationName}`);
        return false;
    }

    try {
        log(`Creating chat backup before ${operationName}...`);
        await context.saveChat();
        log(`Chat backup created successfully for ${operationName}`);
        return true;
    } catch (err) {
        error(`Failed to create chat backup for ${operationName}:`, err);
        return false;
    }
}

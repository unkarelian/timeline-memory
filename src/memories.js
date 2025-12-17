import { extension_settings, getContext } from "../../../../extensions.js";
import { MacrosParser, evaluateMacros } from "../../../../macros.js";
import { getRegexedString, regex_placement } from '../../../regex/engine.js';
import { getCharaFilename, escapeRegex, trimSpaces } from "../../../../utils.js";
import { settings, ChapterEndMode } from "./settings.js";
import { toggleChapterHighlight } from "./messages.js";
import { debug } from "./logging.js";
import { ConnectionManagerRequestService } from "../../../shared.js";
import { amount_gen, main_api, setExtensionPrompt, extension_prompt_types, extension_prompt_roles } from "../../../../../script.js";
import { oai_settings, openai_settings, chat_completion_sources, reasoning_effort_types } from "../../../../../scripts/openai.js";
import { reasoning_templates } from "../../../../../scripts/reasoning.js";
import { getPresetManager } from "../../../../../scripts/preset-manager.js";
import { isLoreManagementActive } from "./lore-management.js";
import { isAgenticTimelineFillActive } from "./agentic-timeline-fill.js";
import { updateRetrievalProgress, isProgressVisible } from "./retrieval-progress.js";
import { translate } from "../../../../../scripts/i18n.js";
import { createChatBackup } from "./backup.js";

const runSlashCommand = getContext().executeSlashCommandsWithOptions;
const CHAT_COMPLETION_APIS = ['claude', 'openrouter', 'windowai', 'scale', 'ai21', 'makersuite', 'vertexai', 'mistralai', 'custom', 'google', 'cohere', 'perplexity', 'groq', '01ai', 'nanogpt', 'deepseek', 'aimlapi', 'xai', 'pollinations', 'moonshot', 'zai'];

/**
 * Get the reasoning effort value based on the profile's chat completion source.
 * This replicates the logic from SillyTavern's openai.js getReasoningEffort function.
 * @param {string} profileId - The connection profile ID
 * @returns {string|undefined} The reasoning effort value to use
 */
function getReasoningEffort(profileId) {
	// Get profile settings
	try {
		const profiles = extension_settings?.connectionManager?.profiles || [];
		const profile = profiles.find(p => p.id === profileId);

		if (!profile) {
			debug('Profile not found for reasoning effort:', profileId);
			// Fallback to current settings
			return oai_settings.reasoning_effort;
		}

		// Get preset settings to find reasoning_effort
		let reasoningEffort = null;
		if (profile.preset) {
			// Claude and other chat completion sources use the 'openai' preset manager
			let presetManagerApi = profile.api;

			if (CHAT_COMPLETION_APIS.includes(profile.api) || profile.api === 'openai') {
				presetManagerApi = 'openai';
			}

			const presetManager = getPresetManager(presetManagerApi);
			if (presetManager) {
				// Get preset settings
				if (presetManagerApi === 'openai') {
					const openaiPresets = presetManager.getAllPresets();
					const presetIndex = openaiPresets.indexOf(profile.preset);

					if (presetIndex >= 0 && openai_settings[presetIndex]) {
						reasoningEffort = openai_settings[presetIndex].reasoning_effort;
						debug('Found reasoning effort from preset:', reasoningEffort);
					}
				}
			}
		}

		// If no reasoning effort in preset, use current settings
		if (!reasoningEffort) {
			reasoningEffort = oai_settings.reasoning_effort;
			debug('Using default reasoning effort:', reasoningEffort);
		}

		// Map the API type to chat completion source for proper value conversion
		const apiToSource = {
			'openai': chat_completion_sources.OPENAI,
			'claude': chat_completion_sources.CLAUDE,
			'openrouter': chat_completion_sources.OPENROUTER,
			'ai21': chat_completion_sources.AI21,
			'makersuite': chat_completion_sources.MAKERSUITE,
			'vertexai': chat_completion_sources.VERTEXAI,
			'google': chat_completion_sources.VERTEXAI,
			'mistralai': chat_completion_sources.MISTRALAI,
			'custom': chat_completion_sources.CUSTOM,
			'cohere': chat_completion_sources.COHERE,
			'perplexity': chat_completion_sources.PERPLEXITY,
			'groq': chat_completion_sources.GROQ,
			'deepseek': chat_completion_sources.DEEPSEEK,
			'aimlapi': chat_completion_sources.AIMLAPI,
			'xai': chat_completion_sources.XAI,
			'pollinations': chat_completion_sources.POLLINATIONS,
		};

		const source = apiToSource[profile.api] || profile.api;

		// These sources expect the effort as string
		const reasoningEffortSources = [
			chat_completion_sources.OPENAI,
			chat_completion_sources.CUSTOM,
			chat_completion_sources.XAI,
			chat_completion_sources.AIMLAPI,
			chat_completion_sources.OPENROUTER,
			chat_completion_sources.POLLINATIONS,
			chat_completion_sources.PERPLEXITY,
			chat_completion_sources.COMETAPI,
		];

		if (!reasoningEffortSources.includes(source)) {
			return reasoningEffort;
		}

		// Apply value mapping based on source
		switch (reasoningEffort) {
			case reasoning_effort_types.auto:
				return undefined;
			case reasoning_effort_types.min:
				// Check if we're using OpenAI with a gpt-5 model
				if (source === chat_completion_sources.OPENAI && profile.model?.startsWith('gpt-5')) {
					return 'min';
				}
				return 'low';
			case reasoning_effort_types.max:
				return 'high';
			default:
				return reasoningEffort;
		}
	} catch (error) {
		debug('Error getting reasoning effort for profile:', error);
		// Fallback to current settings
		return oai_settings.reasoning_effort;
	}
}

/**
 * Determine whether to include reasoning content for a profile.
 * Currently only applies to z.ai which expects an explicit thinking flag.
 * @param {string} profileId - The connection profile ID
 * @returns {boolean|undefined} True/false for include_reasoning, or undefined when not applicable
 */
function getIncludeReasoning(profileId) {
	try {
		const profiles = extension_settings?.connectionManager?.profiles || [];
		const profile = profiles.find(p => p.id === profileId);

		if (!profile) {
			debug('Profile not found for include_reasoning:', profileId);
			return undefined;
		}

		if (profile.api !== 'zai') {
			return undefined;
		}

		let includeReasoning = null;

		if (profile.preset) {
			let presetManagerApi = profile.api;
			if (CHAT_COMPLETION_APIS.includes(profile.api) || profile.api === 'openai') {
				presetManagerApi = 'openai';
			}

			const presetManager = getPresetManager(presetManagerApi);
			if (presetManager) {
				if (presetManagerApi === 'openai') {
					const openaiPresets = presetManager.getAllPresets();
					const presetIndex = openaiPresets.indexOf(profile.preset);

					if (presetIndex >= 0 && openai_settings[presetIndex]) {
						includeReasoning = openai_settings[presetIndex].show_thoughts;
						debug('Found include_reasoning from preset:', includeReasoning);
					}
				} else {
					const presetSettings = presetManager.getPresetSettings(profile.preset);
					if (presetSettings && typeof presetSettings.show_thoughts === 'boolean') {
						includeReasoning = presetSettings.show_thoughts;
						debug('Found include_reasoning from preset:', includeReasoning);
					}
				}
			}
		}

		if (includeReasoning === null || includeReasoning === undefined) {
			includeReasoning = oai_settings.show_thoughts;
			debug('Using default include_reasoning:', includeReasoning);
		}

		return Boolean(includeReasoning);
	} catch (error) {
		debug('Error getting include_reasoning for profile:', error);
		return undefined;
	}
}

// Store timeline data
let timelineData = [];
let timelineFillResults = [];
let currentChatContent = null; // Captured chat content for {{currentChat}} macro

// Flag to track when we're doing internal generations (arc analyzer, queries, etc.)
// This is used to prevent timeline injection during these operations
let isInternalGeneration = false;

// Session-level storage for arc analyzer state (persists until page refresh or chat change)
let arcSessionState = {
    chatId: null,           // To detect chat changes
    arcs: [],               // The analyzed arcs
    completedArcEnds: new Set(),  // Set of chapterEnd values that have been completed
    summarizingArcEnd: null,      // The chapterEnd currently being summarized (null if none)
    currentOverlay: null,         // Reference to currently open popup overlay (for updating from background)
};

/**
 * Reset arc session state (call on chat change)
 */
export function resetArcSessionState() {
    arcSessionState = {
        chatId: null,
        arcs: [],
        completedArcEnds: new Set(),
        summarizingArcEnd: null,
        currentOverlay: null,
    };
}

let commandArgs;

const infoToast = (text)=>{if (!commandArgs?.quiet) toastr.info(text, "Timeline Memory")};
const doneToast = (text)=>{if (!commandArgs?.quiet) toastr.success(text, "Timeline Memory")};
const oopsToast = (text)=>{if (!commandArgs?.quiet) toastr.warning(text, "Timeline Memory")};
const errorToast = (text)=>{if (!commandArgs?.quiet) toastr.error(text, "Timeline Memory")};

const delay_ms = ()=> {
	return Math.max(500, 60000 / Number(settings.rate_limit));
}
let last_gen_timestamp = 0;

export function getTimelineFillResults() {
	return Array.isArray(timelineFillResults) ? [...timelineFillResults] : [];
}

// Save timeline fill results to chat metadata
function saveTimelineFillResults() {
	const context = getContext();
	if (!context.chatMetadata) {
		context.chatMetadata = {};
	}
	context.chatMetadata.timelineFillResults = timelineFillResults;
	context.saveMetadata();
}

export function setTimelineFillResults(results) {
	if (Array.isArray(results)) {
		timelineFillResults = [...results];
	} else {
		timelineFillResults = [];
	}
	saveTimelineFillResults();
	// Update injection prompt with new data
	updateTimelineInjection();
}

export function resetTimelineFillResults() {
	timelineFillResults = [];
	saveTimelineFillResults();
	// Update injection prompt with new data
	updateTimelineInjection();
}

/**
 * Get the current chat content captured at start of agentic timeline fill session
 * @returns {string|null} The chat content or null
 */
export function getCurrentChatContent() {
	return currentChatContent;
}

/**
 * Set the current chat content (called by agentic-timeline-fill.js)
 * @param {string|null} content - The chat content to store
 */
export function setCurrentChatContent(content) {
	currentChatContent = content;
	debug('Set currentChatContent:', content ? `${content.length} chars` : 'null');
}

/**
 * Clear the current chat content
 */
export function clearCurrentChatContent() {
	currentChatContent = null;
	debug('Cleared currentChatContent');
}

export function getTimelineEntries() {
	return Array.isArray(timelineData) ? [...timelineData] : [];
}

/**
 * Get the max tokens setting for the current connection or a specific profile
 * @param {string} profileId - The connection profile ID (optional)
 * @returns {Promise<number>} The max tokens value
 */
async function getMaxTokensForProfile(profileId) {
	if (!profileId || profileId === 'current') {
		// Use current settings based on active API
		switch (main_api) {
			case 'openai':
			case 'openrouter':
			case 'claude':
			case 'windowai':
			case 'scale':
			case 'ai21':
			case 'makersuite':
			case 'vertexai':
			case 'mistralai':
			case 'custom':
			case 'cohere':
			case 'perplexity':
			case 'groq':
			case '01ai':
			case 'nanogpt':
			case 'deepseek':
			case 'aimlapi':
			case 'xai':
			case 'pollinations':
			case 'moonshot':
			case 'zai':
				// All chat completion sources use openai_max_tokens
				return oai_settings.openai_max_tokens || amount_gen || 2048;
			default:
				return amount_gen || 2048;
		}
	}

	// For specific profiles, try to get from profile settings
	try {
		const profiles = extension_settings?.connectionManager?.profiles || [];
		const profile = profiles.find(p => p.id === profileId);

		if (!profile) {
			debug('Profile not found:', profileId);
			return amount_gen || 2048;
		}

		debug('Found profile:', profile.name, 'API:', profile.api, 'Preset:', profile.preset);

		// If profile has a preset, try to get max tokens from it
		if (profile.preset) {
			// Claude and other chat completion sources use the 'openai' preset manager
			let presetManagerApi = profile.api;

			if (CHAT_COMPLETION_APIS.includes(profile.api) || profile.api === 'openai') {
				presetManagerApi = 'openai';
				debug('Using openai preset manager for chat completion API:', profile.api);
			}

			const presetManager = getPresetManager(presetManagerApi);
			if (!presetManager) {
				debug('No preset manager found for API:', presetManagerApi);
				return amount_gen || 2048;
			}

			// Get preset settings
			let presetSettings = null;

			if (presetManagerApi === 'openai') {
				// For OpenAI-based APIs, we need to get the preset from openai_settings
				const openaiPresets = presetManager.getAllPresets();
				const presetIndex = openaiPresets.indexOf(profile.preset);

				if (presetIndex >= 0 && openai_settings[presetIndex]) {
					presetSettings = openai_settings[presetIndex];
					debug('Found OpenAI preset at index:', presetIndex);
				} else {
					debug('OpenAI preset not found in list:', profile.preset);
					return amount_gen || 2048;
				}
			} else {
				// For other APIs, use the normal method
				presetSettings = presetManager.getPresetSettings(profile.preset);
				if (!presetSettings) {
					debug('No preset settings found for preset:', profile.preset);
					return amount_gen || 2048;
				}
			}

			// Get max tokens from preset based on API type
			let maxTokens = null;
			switch (profile.api) {
				case 'openai':
				case 'openrouter':
				case 'claude':
				case 'windowai':
				case 'scale':
				case 'ai21':
				case 'makersuite':
				case 'vertexai':
				case 'mistralai':
                case 'google':
				case 'custom':
				case 'cohere':
				case 'perplexity':
				case 'groq':
				case '01ai':
				case 'nanogpt':
				case 'deepseek':
				case 'aimlapi':
				case 'xai':
				case 'pollinations':
				case 'moonshot':
				case 'zai':
					// All chat completion sources use openai_max_tokens
					maxTokens = presetSettings.openai_max_tokens;
					debug('Chat completion max tokens (openai_max_tokens):', maxTokens);
					break;
				default:
					// Generic fallback
					maxTokens = presetSettings.max_tokens || presetSettings.max_length || presetSettings.genamt;
					debug('Generic max tokens:', maxTokens);
			}

			if (maxTokens !== null && maxTokens !== undefined) {
				return maxTokens;
			}
		} else {
			debug('Profile has no preset');
		}
	} catch (error) {
		debug('Error getting max tokens for profile:', error);
	}

	return amount_gen || 2048;
}

/**
 * Build override payload for ConnectionManagerRequestService based on profile API
 * @param {string} profileId - The connection profile ID
 * @param {number} maxTokens - The max tokens value
 * @returns {object} Override payload for the request
 */
function buildOverridePayload(profileId, maxTokens) {
	try {
		const profiles = extension_settings?.connectionManager?.profiles || [];
		const profile = profiles.find(p => p.id === profileId);

		if (profile && profile.api === 'openai' && profile.model) {
			// Check if this is a model that needs special parameters
			const needsSpecialParams = profile.model.startsWith('o1') ||
				profile.model.startsWith('o3') ||
				profile.model.startsWith('o4') ||
				profile.model.startsWith('gpt-5');

			if (needsSpecialParams) {
				debug(`Using special parameters for model ${profile.model}`);
				// These models require max_completion_tokens instead of max_tokens
				// and only support temperature=1
				return {
					max_tokens: undefined,  // Remove max_tokens from the payload
					max_completion_tokens: maxTokens,
					temperature: 1,  // Override to default temperature
					top_p: undefined,  // Remove top_p as it may not be supported
					frequency_penalty: undefined,  // Remove frequency_penalty
					presence_penalty: undefined  // Remove presence_penalty
				};
			}
		}
	} catch (error) {
		debug('Error building override payload:', error);
	}

	// Default: let ConnectionManagerRequestService handle it normally
	return {};
}

function bookForChar(characterId) {
	debug('getting books for character', characterId);
	let char_data, char_file;
	if (characterId.endsWith('png')) {
		char_data = getContext().characters.find((e) => e.avatar === characterId);
		char_file = getCharaFilename(null, {'manualAvatarKey':characterId});
	}
	else {
		char_data = getContext().characters[characterId];
		char_file = getCharaFilename(characterId);
	}
	if (char_file in settings.book_assignments) {
		return settings.book_assignments[char_file];
	}
	return "";
}

// Initialize the timeline macro
export function initTimelineMacro() {
	MacrosParser.registerMacro('timeline', () => {
		if (!timelineData || timelineData.length === 0) return '[]';

		// Return structured JSON format
		const jsonTimeline = timelineData.map((chapter, index) => {
			return {
				chapter_id: index + 1,
				message_range: {
					start: chapter.startMsgId,
					end: chapter.endMsgId
				},
				summary: chapter.summary
			};
		});

		// Return as JSON string (MacrosParser will handle the stringification)
		return jsonTimeline;
	}, 'A timeline of summarized chapters from the chat in JSON format');

	// Register the chapter macro - returns all chapter contents with headers
	MacrosParser.registerMacro('chapter', async () => {
		if (!timelineData || timelineData.length === 0) return '';

		const chat = getContext().chat;
		const chaptersContent = [];
		
		for (let i = 0; i < timelineData.length; i++) {
			const chapter = timelineData[i];
			const chapterHistory = await getChapterHistory(i + 1);
			
			if (chapterHistory) {
				const chapterContent = chapterHistory.map((it) => `${it.name}: ${it.mes}`).join("\n\n");
				chaptersContent.push(`Chapter: ${i + 1}\n${chapterContent}`);
			}
		}
		
		return chaptersContent.join("\n\n");
	}, 'All chapter contents with headers in order');

    // Register the chapterSummary macro - returns all chapter summaries with headers
    MacrosParser.registerMacro('chapterSummary', () => {
        if (!timelineData || timelineData.length === 0) return '';

		const summaries = timelineData.map((chapter, index) => {
			return `Chapter ${index + 1} Summary: ${chapter.summary}`;
		});

        return summaries.join("\n\n");
    }, 'All chapter summaries with headers in order');

    // Register chapterHistory macro - returns visible chat history as a JSON array of { id, name, role, text }
    MacrosParser.registerMacro('chapterHistory', () => {
        const context = getContext();
        const chat = Array.isArray(context.chat) ? context.chat : [];
        if (!chat.length) return [];
        const items = chat
            .map((m, idx) => ({ m, idx }))
            .filter(({ m }) => !m?.is_system)
            .map(({ m, idx }) => ({
                id: idx,
                name: String(m?.name || (m?.is_user ? context.name1 : context.name2) || ''),
                role: m?.is_user ? 'user' : 'assistant',
                text: String(m?.mes || ''),
            }));
        return items; // Macros engine will stringify this array
    }, 'Visible chat history as JSON array of { id, name, role, text }');

    MacrosParser.registerMacro('timelineResponses', () => {
        if (!Array.isArray(timelineFillResults) || timelineFillResults.length === 0) {
            return [];
        }
        // For agentic mode, return just the plaintext response
        if (timelineFillResults.length === 1 && timelineFillResults[0].mode === 'agentic') {
            return timelineFillResults[0].response || '';
        }
        // For static mode, return the full JSON array
        return timelineFillResults;
    }, 'Latest timeline fill query results - plaintext for agentic mode, JSON array for static mode');

    // Register currentChat macro - returns the chat content captured at start of agentic timeline fill session
    MacrosParser.registerMacro('currentChat', () => {
        const content = getCurrentChatContent();
        if (!content) return '';
        return content;
    }, 'Chat content captured at start of agentic timeline fill session (only available during agentic mode)');

    // Register lastMessageId macro - returns the ID of the most recent message
    MacrosParser.registerMacro('lastMessageId', () => {
        const context = getContext();
        const chat = context.chat || [];
        return Math.max(0, chat.length - 1);
    }, 'The ID of the most recent message in the chat');

    // Register firstIncludedMessageId macro - returns the ID of the first message after the last chapter end
    MacrosParser.registerMacro('firstIncludedMessageId', () => {
        const context = getContext();
        const chat = context.chat || [];
        if (!chat.length) return 0;

        // Find the last chapter end marker
        let lastChapterEnd = -1;
        for (let i = chat.length - 1; i >= 0; i--) {
            if (chat[i].extra?.rmr_chapter) {
                lastChapterEnd = i;
                break;
            }
        }

        // Return the message after the last chapter end, or 0 if no chapters
        return lastChapterEnd >= 0 ? lastChapterEnd + 1 : 0;
    }, 'The ID of the first message in the current chapter (after the last chapter end)');
}

// Extension prompt injection key
const TIMELINE_INJECT_KEY = 'TIMELINE_MEMORY_INJECT';

/**
 * Check if timeline injection should be active
 * Returns false during internal generations (arc analyzer, queries), lore management, or agentic timeline fill
 * @returns {boolean}
 */
function shouldInjectTimeline() {
    // Don't inject during internal extension generations
    if (isInternalGeneration) {
        debug('Timeline injection skipped: internal generation in progress');
        return false;
    }

    // Don't inject during lore management mode
    if (isLoreManagementActive()) {
        debug('Timeline injection skipped: lore management active');
        return false;
    }

    // Don't inject during agentic timeline fill mode
    if (isAgenticTimelineFillActive()) {
        debug('Timeline injection skipped: agentic timeline fill active');
        return false;
    }

    return true;
}

/**
 * Update the timeline injection prompt
 * Called when settings change or timeline data is updated
 */
export function updateTimelineInjection() {
    // Clear injection if disabled or if lore management is active
    if (!settings.inject_enabled) {
        setExtensionPrompt(TIMELINE_INJECT_KEY, '', extension_prompt_types.IN_CHAT, 0);
        debug('Timeline injection disabled');
        return;
    }

    // Clear injection during lore management mode
    if (isLoreManagementActive()) {
        setExtensionPrompt(TIMELINE_INJECT_KEY, '', extension_prompt_types.IN_CHAT, 0);
        debug('Timeline injection cleared: lore management active');
        return;
    }

    // Clear injection during agentic timeline fill mode
    if (isAgenticTimelineFillActive()) {
        setExtensionPrompt(TIMELINE_INJECT_KEY, '', extension_prompt_types.IN_CHAT, 0);
        debug('Timeline injection cleared: agentic timeline fill active');
        return;
    }

    const context = getContext();

    // Build the injection prompt by evaluating macros
    let prompt = settings.inject_prompt || '';

    // Replace timeline-specific macros
    const timelineContext = evaluateMacros('{{timeline}}', {});
    const timelineResponsesContext = evaluateMacros('{{timelineResponses}}', {});
    const lastMessageId = evaluateMacros('{{lastMessageId}}', {});
    const firstIncludedMessageId = evaluateMacros('{{firstIncludedMessageId}}', {});

    // Convert to strings if they're arrays/objects
    const timelineStr = typeof timelineContext === 'string' ? timelineContext : JSON.stringify(timelineContext, null, 2);
    const timelineResponsesStr = typeof timelineResponsesContext === 'string' ? timelineResponsesContext : JSON.stringify(timelineResponsesContext, null, 2);

    prompt = prompt.replace(/{{timeline}}/gi, timelineStr);
    prompt = prompt.replace(/{{timelineResponses}}/gi, timelineResponsesStr);
    prompt = prompt.replace(/{{lastMessageId}}/gi, String(lastMessageId));
    prompt = prompt.replace(/{{firstIncludedMessageId}}/gi, String(firstIncludedMessageId));

    // Substitute standard params like {{char}}, {{user}}, etc.
    prompt = context.substituteParams(prompt, context.name1, context.name2);

    // Set the extension prompt
    const depth = settings.inject_depth || 0;
    const role = settings.inject_role ?? extension_prompt_roles.SYSTEM;

    // Use a filter function to prevent injection during internal generations and lore management
    const injectionFilter = () => shouldInjectTimeline();

    setExtensionPrompt(
        TIMELINE_INJECT_KEY,
        prompt,
        extension_prompt_types.IN_CHAT,
        depth,
        false, // scan for WI
        role,
        injectionFilter
    );

    debug(`Timeline injection updated: depth=${depth}, role=${role}, length=${prompt.length}`);
}

// Load timeline data from chat metadata
export function loadTimelineData() {
	const context = getContext();
	if (context.chatMetadata?.timeline) {
		timelineData = context.chatMetadata.timeline;
	} else {
		timelineData = [];
	}
	// Also load timeline fill results from metadata
	if (Array.isArray(context.chatMetadata?.timelineFillResults)) {
		timelineFillResults = context.chatMetadata.timelineFillResults;
	} else {
		timelineFillResults = [];
	}
	// Update injection prompt with new data
	updateTimelineInjection();
}

// Save timeline data to chat metadata
function saveTimelineData() {
	const context = getContext();
	if (!context.chatMetadata) {
		context.chatMetadata = {};
	}
	context.chatMetadata.timeline = timelineData;
	context.saveMetadata();

	// Refresh the summaries list in the settings panel
	refreshSummariesList();

	// Update injection prompt with new data
	updateTimelineInjection();
}

// Helper function to refresh the summaries list UI
async function refreshSummariesList() {
	try {
		const { renderSummariesList } = await import('./settings.js');
		renderSummariesList();
	} catch (err) {
		// Settings module might not be fully loaded yet, ignore
		debug('Could not refresh summaries list:', err.message);
	}
}

// Add a chapter to the timeline
function addChapterToTimeline(summary, startMsgId, endMsgId) {
	const newChapter = {
		summary: summary,
		startMsgId: startMsgId,
		endMsgId: endMsgId
	};

	timelineData.push(newChapter);
	saveTimelineData();
	debug('Added chapter to timeline:', newChapter);
}

// Migrate old timeline entries - timestamp removal, plaintext format conversion, and scene->chapter key migration
export function migrateTimelineData() {
	let migrated = 0;
	let convertedFromPlaintext = false;
	let hadTimestamps = false;
	let convertedSceneToChapter = false;

	if (!timelineData || timelineData.length === 0) {
		return { migrated: 0, hadTimestamps: false, convertedFromPlaintext: false, convertedSceneToChapter: false };
	}

	// Check if we need to convert from plaintext format
	// Old plaintext format detection: if timeline is a string instead of array
	const context = getContext();
	if (context.chatMetadata?.timeline && typeof context.chatMetadata.timeline === 'string') {
		// Parse old plaintext format: "Scene X (Messages Y-Z): Summary" or "Chapter X (Messages Y-Z): Summary"
		const plaintextTimeline = context.chatMetadata.timeline;
		const chapterRegex = /(?:Scene|Chapter)\s+(\d+)\s+\(Messages\s+(\d+)-(\d+)\):\s+(.+?)(?=\n\n(?:Scene|Chapter)\s+\d+|$)/gs;
		const newTimeline = [];
		let match;

		while ((match = chapterRegex.exec(plaintextTimeline)) !== null) {
			newTimeline.push({
				summary: match[4].trim(),
				startMsgId: parseInt(match[2]),
				endMsgId: parseInt(match[3])
			});
			migrated++;
		}

		if (newTimeline.length > 0) {
			timelineData = newTimeline;
			convertedFromPlaintext = true;
			debug(`Converted ${migrated} chapters from plaintext format to structured format`);
		}
	}

	// Check if any entries have timestamps (for backward compatibility)
	const hasTimestamps = timelineData.some(chapter => 'timestamp' in chapter);

	if (hasTimestamps) {
		hadTimestamps = true;
		// Remove timestamp from each chapter
		timelineData = timelineData.map(chapter => {
			if ('timestamp' in chapter) {
				if (!convertedFromPlaintext) migrated++;
				// Create new object without timestamp
				const { timestamp, ...chapterWithoutTimestamp } = chapter;
				return chapterWithoutTimestamp;
			}
			return chapter;
		});
	}

	// Also migrate chat metadata that may have scene markers
	if (context.chat && context.chat.length > 0) {
		let chatUpdated = false;
		context.chat.forEach(message => {
			if (message.extra?.rmr_scene) {
				delete message.extra.rmr_scene;
				message.extra.rmr_chapter = true;
				chatUpdated = true;
				convertedSceneToChapter = true;
			}
		});
		if (chatUpdated) {
			context.saveChat();
			debug('Migrated scene markers to chapter markers in chat');
		}
	}

	// Save the updated timeline if we made any changes
	if (convertedFromPlaintext || hasTimestamps || convertedSceneToChapter) {
		saveTimelineData();
		debug(`Migration complete: ${migrated} entries updated`);
	}

	return { migrated, hadTimestamps, convertedFromPlaintext, convertedSceneToChapter };
}

// Remove a chapter from the timeline
export function removeChapterFromTimeline(endMsgId) {
	// Find the chapter with this endMsgId
	const chapterIndex = timelineData.findIndex(chapter => chapter.endMsgId === endMsgId);

	if (chapterIndex === -1) {
		debug('No chapter found with endMsgId:', endMsgId);
		return false;
	}

	// Get the chapter before removing it
	const removedChapter = timelineData[chapterIndex];

	// If hide_chapter is enabled, unhide the messages from this chapter
	if (settings.hide_chapter) {
		const chat = getContext().chat;
		const startIdx = removedChapter.startMsgId === 0 ? 0 : removedChapter.startMsgId + 1;

		// Unhide all messages in the chapter range
		for (let i = startIdx; i <= removedChapter.endMsgId; i++) {
			if (chat[i] && chat[i].is_system === true) {
				// Unhide the message
				chat[i].is_system = false;

				// Also update the visible message element
				const mes_elem = $(`.mes[mesid="${i}"]`);
				if (mes_elem.length) {
					mes_elem.attr('is_system', 'false');
				}
			}
		}

		getContext().saveChat();
	}

	// Remove the chapter from timeline
	timelineData.splice(chapterIndex, 1);
	saveTimelineData();
	debug('Removed chapter from timeline:', removedChapter);

	return removedChapter;
}

// Get a specific chapter's summary
export function getChapterSummary(chapterNumber) {
	if (chapterNumber < 1 || chapterNumber > timelineData.length) {
		return null;
	}
	return timelineData[chapterNumber - 1].summary;
}

// Update a specific chapter's summary
export function updateChapterSummary(chapterNumber, newSummary) {
	if (chapterNumber < 1 || chapterNumber > timelineData.length) {
		return false;
	}
	timelineData[chapterNumber - 1].summary = newSummary;
	saveTimelineData();
	debug('Updated chapter summary:', chapterNumber, newSummary);
	return true;
}

// Get a specific chapter's full chat history
export async function getChapterHistory(chapterNumber) {
	if (chapterNumber < 1 || chapterNumber > timelineData.length) {
		return null;
	}

	const chapter = timelineData[chapterNumber - 1];
	const chat = getContext().chat;

	// Determine the actual start index
	// If startMsgId is 0, start from 0. Otherwise, start from startMsgId + 1 to skip the previous chapter marker
	const actualStartIdx = chapter.startMsgId === 0 ? 0 : chapter.startMsgId + 1;

	debug(`Getting chapter ${chapterNumber} history:`, {
		startMsgId: chapter.startMsgId,
		endMsgId: chapter.endMsgId,
		actualStartIdx: actualStartIdx,
		totalMessages: chapter.endMsgId - actualStartIdx + 1
	});

	// Get messages from the chapter
	const chapterMessages = chat.slice(actualStartIdx, chapter.endMsgId + 1);

	// Process messages for regex/hidden
	const processedMessages = await Promise.all(chapterMessages.map(async (message, index) => {
		let placement = message.is_user ? regex_placement.USER_INPUT : regex_placement.AI_OUTPUT;
		let options = { isPrompt: true, depth: 0 };
		let mes_text = message.is_system ? message.mes : getRegexedString(message.mes, placement, options);
		return {
			...message,
			mes: mes_text
		};
	}));

	// Don't filter out system messages here - they might be hidden chapter messages!
	// The chapter query needs to see ALL messages in the chapter, including those hidden by the extension
	return processedMessages;
}

async function processMessageSlice(mes_id, count=0, start=0) {
	const chat = getContext().chat;
	const length = chat.length;

	// slice to just the history from this message
	let message_history = chat.slice(start, mes_id+1);

	// process for regex/hidden
	message_history = await Promise.all(message_history.map(async (message, index) => {
		let placement = message.is_user ? regex_placement.USER_INPUT : regex_placement.AI_OUTPUT;
		let options = { isPrompt: true, depth: (length - (start+index) - 1) };
		// no point in running the regexing on hidden messages
		let mes_text = message.is_system ? message.mes : getRegexedString(message.mes, placement, options);
		return {
			...message,
			mes: mes_text,
			index: start+index,
		};
  }));

	// filter out hidden messages
	message_history = message_history.filter((it) => {return !it.is_system});
	if (count > 0) {
		count++;
		if (message_history.length > count) {
			// slice it again
			message_history = message_history.slice(-1*count);
		}
	}
	return message_history;
}

async function swapProfile(profileId = null) {
	let swapped = false;
	if (!extension_settings.connectionManager?.profiles || !extension_settings.connectionManager?.selectedProfile) {
		debug('Connection Manager extension not available');
		return false;
	}
	const current = extension_settings.connectionManager.selectedProfile;
	const profile_list = extension_settings.connectionManager.profiles;
	let target_id = profileId || settings.profile;
	if (commandArgs?.profile) target_id = commandArgs.profile;
	if (current != target_id) {
		// we have to swap
		debug('swapping profile');
		swapped = current;
		if (profile_list.findIndex(p => p.id === target_id) < 0) {
			oopsToast("Invalid connection profile override; using current profile.");
			return false
		}
		$('#connection_profiles').val(target_id);
		document.getElementById('connection_profiles').dispatchEvent(new Event('change'));
		await new Promise((resolve) => getContext().eventSource.once(getContext().event_types.CONNECTION_PROFILE_LOADED, resolve));
	}
	return swapped;
}

async function genSummaryWithSlash(history, id=0, { resummarizeChapterNumber = null } = {}) {
	// Initialize commandArgs if not set
	if (!commandArgs) {
		commandArgs = {};
	}

	// Mark as internal generation to prevent timeline injection
	isInternalGeneration = true;

	try {
		let this_delay = delay_ms() - (Date.now() - last_gen_timestamp);
		debug('delaying', this_delay, "out of", delay_ms());
		if (this_delay > 0) {
			await new Promise(resolve => setTimeout(resolve, this_delay));
		}
		last_gen_timestamp = Date.now();

		if (id > 0) {
			infoToast("Generating summary #"+id+"....");
		}
		// Get timeline context for macro replacement
		// If resummarizing a chapter, only include chapters before the target (the AI shouldn't know about future events)
		let timelineContext;
		if (resummarizeChapterNumber !== null && timelineData && timelineData.length > 0) {
			const chapterIndex = resummarizeChapterNumber - 1;
			// Only include chapters before the target chapter
			const modifiedTimeline = timelineData.slice(0, chapterIndex).map((chapter, index) => {
				return {
					chapter_id: index + 1,
					message_range: {
						start: chapter.startMsgId,
						end: chapter.endMsgId
					},
					summary: chapter.summary
				};
			});
			// Stringify to match the format evaluateMacros would produce
			timelineContext = JSON.stringify(modifiedTimeline);
		} else {
			timelineContext = evaluateMacros('{{timeline}}', {});
		}

		const prompt_text = settings.memory_prompt_template.replace('{{content}}', history.trim());

		// Replace {{timeline}} macro in prompt
		let finalPrompt = prompt_text.replace(/{{timeline}}/gi, timelineContext);

		// Also substitute standard params like {{char}}, {{user}}, etc.
		const context = getContext();
		finalPrompt = context.substituteParams(finalPrompt, context.name1, context.name2);

		// Process system prompt with macro replacements
		let systemPrompt = '';
		if (settings.memory_system_prompt && settings.memory_system_prompt.trim()) {
			systemPrompt = settings.memory_system_prompt.replace('{{content}}', history.trim());
			// Replace {{timeline}} macro in system prompt
			systemPrompt = systemPrompt.replace(/{{timeline}}/gi, timelineContext);
			// Also substitute standard params like {{char}}, {{user}}, etc.
			systemPrompt = context.substituteParams(systemPrompt, context.name1, context.name2);
		}

		// Determine which profile to use
		const profileId = commandArgs?.profile || settings.profile;

		// Use ConnectionManagerRequestService if a profile is specified
		if (profileId && ConnectionManagerRequestService) {
			debug(`Using ConnectionManagerRequestService with profile: ${profileId}`);

			// Build messages array for the request
			const messages = [];
			if (systemPrompt) {
				messages.push({ role: 'system', content: systemPrompt });
			}
			messages.push({ role: 'user', content: finalPrompt });

			// Get max tokens for the profile
			const maxTokens = await getMaxTokensForProfile(profileId);
			debug(`Using max tokens: ${maxTokens} for profile: ${profileId}`);

			// Build override payload for special cases like OpenAI o1 models
			const overridePayload = buildOverridePayload(profileId, maxTokens);

			// Get the reasoning effort value for this profile
			const reasoningEffort = getReasoningEffort(profileId);

			// Add reasoning_effort to override payload if it exists
			if (reasoningEffort !== undefined) {
				overridePayload.reasoning_effort = reasoningEffort;
			}

			// z.ai requires an explicit flag to return reasoning content
			const includeReasoning = getIncludeReasoning(profileId);
			if (includeReasoning !== undefined) {
				overridePayload.include_reasoning = includeReasoning;
			}

			// Use ConnectionManagerRequestService to send the request
			const result = await ConnectionManagerRequestService.sendRequest(
				profileId,              // profileId
				messages,               // prompt (as messages array)
				maxTokens,              // maxTokens
				{                       // custom options
					includePreset: true,  // Include generation preset from profile
					includeInstruct: true, // Include instruct settings
					stream: false         // Don't stream the response
				},
				overridePayload         // overridePayload with correct parameter names
			);

			// Extract content from response - parse reasoning if needed
			const content = result?.content || result || '';
			const parsed_result = getContext().parseReasoningFromString(content);
			const final_content = parsed_result ? parsed_result.content : content;

			debug('Successfully used ConnectionManagerRequestService for summary');
			return final_content;
		}

		// No profile specified and no fallback available
		throw new Error('No connection profile specified for summary generation');
	} finally {
		// Always reset the flag when done
		isInternalGeneration = false;
	}
}

async function generateMemory(message) {
	const mes_id = Number(message.attr('mesid'));

	const memory_history = await processMessageSlice(mes_id, settings.memory_span);
	debug('memory history', memory_history);
	const memory_context = memory_history.map((it) => `${it.name}: ${it.mes}`).join("\n\n");
	return await genSummaryWithSlash(memory_context);
}

async function reasoningParser(str, profileId, { strict=true } = {}) {
    const profiles = extension_settings?.connectionManager?.profiles || [];
    const profile = profiles.find(p => p.id === profileId);
    const templateName = profile['reasoning-template'];
    console.log(templateName);
    const template = reasoning_templates.find(t => t.name === templateName);
    if (template) {
        const regex = new RegExp(`${(strict ? '^\\s*?' : '')}${escapeRegex(template.prefix)}(.*?)${escapeRegex(template.suffix)}`, 's');
        let didReplace = false;
        let reasoning = '';
        let content = String(str).replace(regex, (_match, captureGroup) => {
            didReplace = true;
            reasoning = captureGroup;
            return '';
        });

        if (didReplace) {
            reasoning = trimSpaces(reasoning);
            content = trimSpaces(content);
        }

        return { reasoning, content };
        //const parser = new ReasoningParser(template.prefix, template.suffix, template.separator);
       // const parsed = parser.parse(content);
    }
}

function stripCodeFences(text) {
	if (typeof text !== 'string') {
		return '';
	}
	let cleaned = text.trim();
	const fenceMatch = cleaned.match(/^```(?:json)?\s*([\s\S]*?)```$/i);
	if (fenceMatch) {
		cleaned = fenceMatch[1].trim();
	}
	return cleaned;
}

function extractJsonArrayFromText(text) {
	if (!text) {
		return null;
	}
	const cleaned = stripCodeFences(text);
	const firstBracket = cleaned.indexOf('[');
	const lastBracket = cleaned.lastIndexOf(']');

	if (firstBracket !== -1 && lastBracket !== -1 && lastBracket > firstBracket) {
		const candidate = cleaned.slice(firstBracket, lastBracket + 1);
		try {
			return JSON.parse(candidate);
		} catch (error) {
			debug('Failed to parse candidate JSON array:', error);
		}
	}

	try {
		return JSON.parse(cleaned);
	} catch (error) {
		debug('Failed to parse full response as JSON:', error);
		return null;
	}
}

function coerceChapterNumber(value) {
	const num = Number(value);
	if (!Number.isFinite(num)) {
		return null;
	}
	const int = Math.floor(num);
	return int >= 1 ? int : null;
}

function uniqueSortedChapters(chapters) {
	return Array.from(new Set(chapters.filter((num) => typeof num === 'number')))
		.sort((a, b) => a - b);
}

function chaptersAreContiguous(chapters) {
	if (chapters.length <= 1) {
		return true;
	}
	for (let i = 1; i < chapters.length; i++) {
		if (chapters[i] !== chapters[i - 1] + 1) {
			return false;
		}
	}
	return true;
}

function normalizeTimelineFillItem(item, index) {
	const errors = [];
	if (!item || typeof item !== 'object') {
		errors.push(`Item at index ${index} is not an object.`);
		return { errors };
	}

	const query = typeof item.query === 'string' ? item.query.trim() : '';
	if (!query) {
		errors.push(`Item ${index} is missing a valid "query" string.`);
	}

	const collectedChapters = [];
	const chapterArrays = [
		item.chapters,
		item.chapterNumbers,
		item.chapter_ids,
		Array.isArray(item.chapterRange) && item.chapterRange.length === 2 ? item.chapterRange : null,
	];

	for (const candidate of chapterArrays) {
		if (Array.isArray(candidate)) {
			for (const value of candidate) {
				const num = coerceChapterNumber(value);
				if (num !== null) {
					collectedChapters.push(num);
				}
			}
		}
	}

	const singleChapterCandidates = [
		item.chapter,
		item.chapterNumber,
		item.chapter_id,
	];

	for (const candidate of singleChapterCandidates) {
		const num = coerceChapterNumber(candidate);
		if (num !== null) {
			collectedChapters.push(num);
		}
	}

	let rangeStart = coerceChapterNumber(
		item.startChapter ?? item.chapterStart ?? item.range?.start ?? item.range?.from,
	);
	let rangeEnd = coerceChapterNumber(
		item.endChapter ?? item.chapterEnd ?? item.range?.end ?? item.range?.to,
	);

	if (Array.isArray(item.range) && item.range.length === 2) {
		const [a, b] = item.range;
		const rangeValues = [coerceChapterNumber(a), coerceChapterNumber(b)];
		if (rangeValues[0] !== null && rangeValues[1] !== null) {
			rangeStart = rangeValues[0];
			rangeEnd = rangeValues[1];
		}
	}

	if (rangeStart !== null && rangeEnd !== null) {
		if (rangeEnd < rangeStart) {
			[rangeStart, rangeEnd] = [rangeEnd, rangeStart];
		}
		for (let chapter = rangeStart; chapter <= rangeEnd; chapter++) {
			collectedChapters.push(chapter);
		}
	}

	const chapters = uniqueSortedChapters(collectedChapters);
	if (!chapters.length) {
		errors.push(`Item ${index} must include either "chapters" array, a single "chapter", or a "startChapter"/"endChapter" range.`);
	}

	return {
		errors,
		item: {
			query,
			chapters,
			startChapter: chapters.length ? chapters[0] : null,
			endChapter: chapters.length ? chapters[chapters.length - 1] : null,
		},
	};
}

function validateTimelineFillItems(rawItems) {
	if (!Array.isArray(rawItems)) {
		throw new Error('Timeline fill response must be a JSON array.');
	}

	const normalized = [];
	const errors = [];

	rawItems.forEach((entry, index) => {
		const result = normalizeTimelineFillItem(entry, index);
		if (result.errors.length) {
			errors.push(...result.errors);
			return;
		}
		normalized.push(result.item);
	});

	if (errors.length) {
		throw new Error(errors.join('\n'));
	}

	return normalized;
}

export async function runTimelineFill({ profileOverride, quiet = true } = {}) {
	// Create a backup before any operations
	await createChatBackup('timeline fill');

	loadTimelineData();

	const profileId = profileOverride || settings.timeline_fill_profile;
	if (!profileId) {
		throw new Error('Timeline fill profile is not configured. Please select one in the settings.');
	}

	// Mark as internal generation to prevent timeline injection
	isInternalGeneration = true;

	const context = getContext();
	const timelineMacroResult = evaluateMacros('{{timeline}}', {}) ?? [];
	const historyMacroResult = evaluateMacros('{{chapterHistory}}', {}) ?? [];

	const timelineContext = typeof timelineMacroResult === 'string'
		? timelineMacroResult
		: JSON.stringify(timelineMacroResult, null, 2);

	const historyContext = typeof historyMacroResult === 'string'
		? historyMacroResult
		: JSON.stringify(historyMacroResult, null, 2);

	let userPrompt = settings.timeline_fill_prompt_template || '';
	userPrompt = userPrompt.replace(/{{timeline}}/gi, timelineContext);
	userPrompt = userPrompt.replace(/{{chapterHistory}}/gi, historyContext);
	userPrompt = context.substituteParams(userPrompt, context.name1, context.name2);

	let systemPrompt = settings.timeline_fill_system_prompt || '';
	if (systemPrompt) {
		systemPrompt = systemPrompt.replace(/{{timeline}}/gi, timelineContext);
		systemPrompt = systemPrompt.replace(/{{chapterHistory}}/gi, historyContext);
		systemPrompt = context.substituteParams(systemPrompt, context.name1, context.name2);
	}

	const messages = [];
	if (systemPrompt) {
		messages.push({ role: 'system', content: systemPrompt });
	}
	messages.push({ role: 'user', content: userPrompt });

	try {
		debug('Timeline fill request messages:', messages);

		const maxTokens = await getMaxTokensForProfile(profileId);
		const overridePayload = buildOverridePayload(profileId, maxTokens);
		const reasoningEffort = getReasoningEffort(profileId);
		if (reasoningEffort !== undefined) {
			overridePayload.reasoning_effort = reasoningEffort;
		}
		const includeReasoning = getIncludeReasoning(profileId);
		if (includeReasoning !== undefined) {
			overridePayload.include_reasoning = includeReasoning;
		}

		const result = await ConnectionManagerRequestService.sendRequest(
			profileId,
			messages,
			maxTokens,
			{
				includePreset: true,
				includeInstruct: true,
				stream: false,
			},
			overridePayload,
		);

		const rawContent = result?.content || result || '';
		const parsedReasoning = await reasoningParser(rawContent, profileId, { strict: false });
		const content = parsedReasoning ? parsedReasoning.content : rawContent;

		debug('Timeline fill raw response:', content);

		const parsed = extractJsonArrayFromText(content);
		let items = [];

		if (Array.isArray(parsed)) {
			items = parsed;
		} else if (parsed?.queries && Array.isArray(parsed.queries)) {
			items = parsed.queries;
		} else if (parsed?.timelineQueries && Array.isArray(parsed.timelineQueries)) {
			items = parsed.timelineQueries;
		} else {
			throw new Error('Timeline fill response did not include a JSON array of queries.');
		}

		const tasks = validateTimelineFillItems(items);
		const aggregatedResults = [];
		const previousCommandArgs = commandArgs;
		commandArgs = { ...(previousCommandArgs || {}), quiet };

		setTimelineFillResults([]);

		// Count total queries for progress tracking (excluding those that exceed the chapter limit)
		const chapterLimit = settings.query_chapter_limit || 0;
		const queryLimit = settings.timeline_fill_query_limit || 0;
		let totalQueries = 0;
		for (const task of tasks) {
			const { chapters } = task;
			if (!chapters.length) continue;
			const contiguous = chaptersAreContiguous(chapters);
			// Range queries count as 1, non-contiguous chapters count individually
			// Skip range queries that exceed the chapter limit (if limit is set)
			if (contiguous && chapters.length > 1) {
				if (chapterLimit === 0 || chapters.length <= chapterLimit) {
					totalQueries += 1;
				}
			} else {
				totalQueries += chapters.length;
			}
		}

		// Apply query limit if set
		if (queryLimit > 0 && totalQueries > queryLimit) {
			debug(`Timeline fill limiting queries from ${totalQueries} to ${queryLimit}`);
			totalQueries = queryLimit;
		}

		// Switch to querying phase if progress is visible
		if (isProgressVisible()) {
			updateRetrievalProgress({ phase: 'querying', current: 0, total: totalQueries });
		}

		let completedQueries = 0;

		try {
			for (const task of tasks) {
				const { query, chapters } = task;
				if (!chapters.length) {
					continue;
				}

				const contiguous = chaptersAreContiguous(chapters);
				const start = chapters[0];
				const end = chapters[chapters.length - 1];

				if (contiguous && chapters.length > 1) {
					// Skip queries that exceed the chapter limit (if limit is set)
					if (chapterLimit > 0 && chapters.length > chapterLimit) {
						debug(`Timeline fill skipping query: exceeds ${chapterLimit}-chapter limit (${chapters.length} chapters requested)`);
						continue;
					}
					try {
						const response = await queryChapters(start, end, query);
						aggregatedResults.push({
							mode: 'range',
							query,
							chapters,
							startChapter: start,
							endChapter: end,
							response: String(response ?? ''),
						});
					} catch (error) {
						debug('Timeline fill range query failed:', error);
						aggregatedResults.push({
							mode: 'range',
							query,
							chapters,
							startChapter: start,
							endChapter: end,
							response: '',
							error: error?.message || String(error),
						});
					}
					completedQueries++;
					if (isProgressVisible()) {
						updateRetrievalProgress({ current: completedQueries, total: totalQueries });
					}
					// Stop if we've hit the query limit
					if (queryLimit > 0 && completedQueries >= queryLimit) {
						debug(`Timeline fill reached query limit of ${queryLimit}`);
						break;
					}
				} else {
					for (const chapter of chapters) {
						// Stop if we've hit the query limit
						if (queryLimit > 0 && completedQueries >= queryLimit) {
							debug(`Timeline fill reached query limit of ${queryLimit}`);
							break;
						}
						try {
							const response = await queryChapter(chapter, query);
							aggregatedResults.push({
								mode: 'single',
								query,
								chapters: [chapter],
								startChapter: chapter,
								endChapter: chapter,
								response: String(response ?? ''),
							});
						} catch (error) {
							debug('Timeline fill chapter query failed:', error);
							aggregatedResults.push({
								mode: 'single',
								query,
								chapters: [chapter],
								startChapter: chapter,
								endChapter: chapter,
								response: '',
								error: error?.message || String(error),
							});
						}
						completedQueries++;
						if (isProgressVisible()) {
							updateRetrievalProgress({ current: completedQueries, total: totalQueries });
						}
					}
				}
				// Stop outer loop if we've hit the query limit
				if (queryLimit > 0 && completedQueries >= queryLimit) {
					break;
				}
			}

			// Mark as complete
			if (isProgressVisible()) {
				updateRetrievalProgress({ phase: 'complete', current: completedQueries, total: totalQueries, message: 'All queries complete!' });
			}
		} finally {
			commandArgs = previousCommandArgs;
		}

		setTimelineFillResults(aggregatedResults);
		return aggregatedResults;
	} catch (error) {
		debug('Timeline fill failed:', error);
		throw error;
	} finally {
		// Always reset the flag when done
		isInternalGeneration = false;
	}
}


// Query a chapter with a specific question
export async function queryChapter(chapterNumber, query) {
	// Initialize commandArgs if not set
	if (!commandArgs) {
		commandArgs = {};
	}

	// Mark as internal generation to prevent timeline injection
	isInternalGeneration = true;

	try {
		// Check if timeline has any chapters
		if (!timelineData || timelineData.length === 0) {
			const msg = 'No chapters exist in the timeline yet.';
			errorToast(msg);
			return msg;
		}

		// Check if chapter is within valid range
		if (chapterNumber < 1 || chapterNumber > timelineData.length) {
			const msg = `Chapter ${chapterNumber} does not exist. Valid chapter range is 1-${timelineData.length}.`;
			errorToast(msg);
			return msg;
		}

		const chapterHistory = await getChapterHistory(chapterNumber);
		if (!chapterHistory) {
			const msg = `Chapter ${chapterNumber} not found.`;
			errorToast(msg);
			return msg;
		}

		const chapter = timelineData[chapterNumber - 1];
		debug(`Querying chapter ${chapterNumber}:`, chapter);
		debug(`Chapter history length: ${chapterHistory.length} messages`);

		const timelineContext = evaluateMacros('{{timeline}}', {});

		// Format the chapter history - this is ALL messages from the chapter
		const chapterContext = chapterHistory.map((it) => `${it.name}: ${it.mes}`).join("\n\n");

		debug(`Chapter context length: ${chapterContext.length} characters`);
		debug(`Timeline context length: ${timelineContext.length} characters`);
		debug(`Query: ${query}`);

		// Build the prompt - for now, use simple string replacement to ensure it works
		let prompt = settings.chapter_query_prompt_template;

		// Replace macros in order - most specific first
		prompt = prompt.replace(/{{timeline}}/gi, timelineContext);
		prompt = prompt.replace(/{{chapter}}/gi, chapterContext);
		// Also replace {{chapterSummary}} with the actual chapter summary
		prompt = prompt.replace(/{{chapterSummary}}/gi, chapter.summary);
		prompt = prompt.replace(/{{query}}/gi, query);

		// Then use substituteParams for any remaining standard macros like {{char}}, {{user}}, etc.
		const context = getContext();
		prompt = context.substituteParams(prompt, context.name1, context.name2);

		// Process system prompt with the same macro replacements
		let systemPrompt = '';
		if (settings.chapter_query_system_prompt && settings.chapter_query_system_prompt.trim()) {
			systemPrompt = settings.chapter_query_system_prompt;
			// Replace the same macros in system prompt
			systemPrompt = systemPrompt.replace(/{{timeline}}/gi, timelineContext);
			systemPrompt = systemPrompt.replace(/{{chapter}}/gi, chapterContext);
			// Also replace {{chapterSummary}} with the actual chapter summary
			systemPrompt = systemPrompt.replace(/{{chapterSummary}}/gi, chapter.summary);
			systemPrompt = systemPrompt.replace(/{{query}}/gi, query);
			// Also substitute standard params
			systemPrompt = context.substituteParams(systemPrompt, context.name1, context.name2);
		}

		debug(`Final prompt length: ${prompt.length} characters`);
		debug(`System prompt length: ${systemPrompt.length} characters`);

		infoToast(`Querying chapter ${chapterNumber}...`);

		// Use ConnectionManagerRequestService if a profile is specified
		if (settings.query_profile && ConnectionManagerRequestService) {
			debug(`Using ConnectionManagerRequestService with profile: ${settings.query_profile}`);

			// Build messages array for the request
			const messages = [];
			if (systemPrompt) {
				messages.push({ role: 'system', content: systemPrompt });
			}
			messages.push({ role: 'user', content: prompt });

			// Get max tokens for the profile
			const maxTokens = await getMaxTokensForProfile(settings.query_profile);
			debug(`Using max tokens: ${maxTokens} for profile: ${settings.query_profile}`);

			// Build override payload for special cases like OpenAI o1 models
			const overridePayload = buildOverridePayload(settings.query_profile, maxTokens);

			// Get the reasoning effort value for this profile
			const reasoningEffort = getReasoningEffort(settings.query_profile);

			// Add reasoning_effort to override payload if it exists
			if (reasoningEffort !== undefined) {
				overridePayload.reasoning_effort = reasoningEffort;
			}
			const includeReasoning = getIncludeReasoning(settings.query_profile);
			if (includeReasoning !== undefined) {
				overridePayload.include_reasoning = includeReasoning;
			}

			// Use ConnectionManagerRequestService to send the request
			const result = await ConnectionManagerRequestService.sendRequest(
				settings.query_profile,  // profileId
				messages,                // prompt (as messages array)
				maxTokens,               // maxTokens
				{                        // custom options
					includePreset: true, // Include generation preset from profile
					stream: false        // Don't stream the response
				},
				overridePayload          // overridePayload with correct parameter names
			);

			// Extract content from response - parse reasoning if needed
			const content = result?.content || result || '';
			const parsed_reasoning = await reasoningParser(content, settings.query_profile);
			const final_content = parsed_reasoning ? parsed_reasoning.content : content;
			console.log('final_content', final_content);
			debug('Successfully used ConnectionManagerRequestService for query');
			return final_content;
		}

		// No profile specified and no fallback available
		throw new Error('No connection profile specified for query');
	} catch (error) {
		errorToast('Error using connection profile for query');
		debug('ConnectionManagerRequestService error:', error);
		throw new Error(`Failed to generate query response: ${error.message}`);
	} finally {
		// Always reset the flag when done
		isInternalGeneration = false;
	}
}

// Query multiple chapters with a specific question
export async function queryChapters(startChapter, endChapter, query) {
	// Initialize commandArgs if not set
	if (!commandArgs) {
		commandArgs = {};
	}

	// Mark as internal generation to prevent timeline injection
	isInternalGeneration = true;

	try {
		// Check if timeline has any chapters
		if (!timelineData || timelineData.length === 0) {
			const msg = 'No chapters exist in the timeline yet.';
			errorToast(msg);
			return msg;
		}

		// Validate chapter range
		if (startChapter < 1 || startChapter > timelineData.length) {
			const msg = `Start chapter ${startChapter} does not exist. Valid chapter range is 1-${timelineData.length}.`;
			errorToast(msg);
			return msg;
		}
		if (endChapter < 1 || endChapter > timelineData.length) {
			const msg = `End chapter ${endChapter} does not exist. Valid chapter range is 1-${timelineData.length}.`;
			errorToast(msg);
			return msg;
		}
		if (startChapter > endChapter) {
			const msg = `Invalid range: start chapter ${startChapter} must be before or equal to end chapter ${endChapter}.`;
			errorToast(msg);
			return msg;
		}

		debug(`Querying chapters ${startChapter} to ${endChapter}`);

		// Collect all chapter histories and summaries
		const chaptersData = [];
		const chapterSummaries = [];

		for (let i = startChapter; i <= endChapter; i++) {
			const chapterHistory = await getChapterHistory(i);
			if (!chapterHistory) {
				const msg = `Chapter ${i} not found.`;
				errorToast(msg);
				return msg;
			}

			const chapter = timelineData[i - 1];
			chaptersData.push({
				number: i,
				history: chapterHistory,
				summary: chapter.summary
			});
			chapterSummaries.push(`Chapter ${i} Summary: ${chapter.summary}`);
		}

		const timelineContext = evaluateMacros('{{timeline}}', {});

		// Format all chapters with headers
		const allChaptersContext = chaptersData.map(chapterData => {
			const chapterContent = chapterData.history.map((it) => `${it.name}: ${it.mes}`).join("\n\n");
			return `Chapter: ${chapterData.number}\n${chapterContent}`;
		}).join("\n\n");

		// Format all summaries with headers
		const allSummariesContext = chapterSummaries.join("\n\n");

		debug(`Total chapters context length: ${allChaptersContext.length} characters`);
		debug(`Timeline context length: ${timelineContext.length} characters`);
		debug(`Query: ${query}`);

		// Build the prompt - use simple string replacement to ensure it works
		let prompt = settings.chapter_query_prompt_template;

		// Replace macros in order - most specific first
		prompt = prompt.replace(/{{timeline}}/gi, timelineContext);
		prompt = prompt.replace(/{{chapter}}/gi, allChaptersContext);
		// Replace {{chapterSummary}} with all chapter summaries
		prompt = prompt.replace(/{{chapterSummary}}/gi, allSummariesContext);
		prompt = prompt.replace(/{{query}}/gi, query);

		// Then use substituteParams for any remaining standard macros like {{char}}, {{user}}, etc.
		const context = getContext();
		prompt = context.substituteParams(prompt, context.name1, context.name2);

		// Process system prompt with the same macro replacements
		let systemPrompt = '';
		if (settings.chapter_query_system_prompt && settings.chapter_query_system_prompt.trim()) {
			systemPrompt = settings.chapter_query_system_prompt;
			// Replace the same macros in system prompt
			systemPrompt = systemPrompt.replace(/{{timeline}}/gi, timelineContext);
			systemPrompt = systemPrompt.replace(/{{chapter}}/gi, allChaptersContext);
			// Replace {{chapterSummary}} with all chapter summaries
			systemPrompt = systemPrompt.replace(/{{chapterSummary}}/gi, allSummariesContext);
			systemPrompt = systemPrompt.replace(/{{query}}/gi, query);
			// Also substitute standard params
			systemPrompt = context.substituteParams(systemPrompt, context.name1, context.name2);
		}

		debug(`Final prompt length: ${prompt.length} characters`);
		debug(`System prompt length: ${systemPrompt.length} characters`);

		const chapterRange = startChapter === endChapter ? `chapter ${startChapter}` : `chapters ${startChapter}-${endChapter}`;
		infoToast(`Querying ${chapterRange}...`);

		// Use ConnectionManagerRequestService if a profile is specified
		if (settings.query_profile && ConnectionManagerRequestService) {
			debug(`Using ConnectionManagerRequestService with profile: ${settings.query_profile}`);

			// Build messages array for the request
			const messages = [];
			if (systemPrompt) {
				messages.push({ role: 'system', content: systemPrompt });
			}
			messages.push({ role: 'user', content: prompt });

			// Get max tokens for the profile
			const maxTokens = await getMaxTokensForProfile(settings.query_profile);
			debug(`Using max tokens: ${maxTokens} for profile: ${settings.query_profile}`);

			// Build override payload for special cases like OpenAI o1 models
			const overridePayload = buildOverridePayload(settings.query_profile, maxTokens);

			// Get the reasoning effort value for this profile
			const reasoningEffort = getReasoningEffort(settings.query_profile);

			// Add reasoning_effort to override payload if it exists
			if (reasoningEffort !== undefined) {
				overridePayload.reasoning_effort = reasoningEffort;
			}
			const includeReasoning = getIncludeReasoning(settings.query_profile);
			if (includeReasoning !== undefined) {
				overridePayload.include_reasoning = includeReasoning;
			}

			// Use ConnectionManagerRequestService to send the request
			const result = await ConnectionManagerRequestService.sendRequest(
				settings.query_profile,  // profileId
				messages,                // prompt (as messages array)
				maxTokens,               // maxTokens
				{                        // custom options
					includePreset: true, // Include generation preset from profile
					stream: false        // Don't stream the response
				},
				overridePayload          // overridePayload with correct parameter names
			);

			// Extract content from response - parse reasoning if needed
			const content = result?.content || result || '';
			const parsed_reasoning = await reasoningParser(content, settings.query_profile);
			const final_content = parsed_reasoning ? parsed_reasoning.content : content;
			console.log('final_content', final_content);
			debug('Successfully used ConnectionManagerRequestService for query');
			return final_content;
		}

		// No profile specified and no fallback available
		throw new Error('No connection profile specified for query');
	} catch (error) {
		errorToast('Error using connection profile for query');
		debug('ConnectionManagerRequestService error:', error);
		throw new Error(`Failed to generate query response: ${error.message}`);
	} finally {
		// Always reset the flag when done
		isInternalGeneration = false;
	}
}

async function summarizeHistoryEntries(message_history, { targetMessageId, hideAfter = false, resummarizeChapterNumber = null } = {}) {
	if (!Array.isArray(message_history) || message_history.length === 0) {
		oopsToast("No visible chapter content! Skipping summary.");
		return "";
	}

	const max_tokens = getContext().maxContext - 100; // reserve space for instructions
	const getTokenCount = getContext().getTokenCountAsync;

	let chunks = [];
	let current = "";
	for (const mes of message_history) {
		const speaker = mes?.name ?? '';
		const content = mes?.mes ?? '';
		const mes_text = speaker.length ? `${speaker}: ${content}` : content;
		const next_text = current ? `${current}\n\n${mes_text}` : mes_text;
		const tokens = await getTokenCount((current || "") + mes_text);
		if (tokens > max_tokens && current.length) {
			chunks.push(current);
			current = mes_text;
		} else if (tokens > max_tokens) {
			// chunk would overflow even on first message; push as-is to avoid infinite loop
			chunks.push(mes_text);
			current = "";
		} else {
			current = next_text;
		}
	}
	if (current.length) chunks.push(current);

	let final_context;
	if (chunks.length === 1) {
		final_context = chunks[0];
	} else if (chunks.length > 1) {
		infoToast(`Generating summaries for ${chunks.length} chunks....`);
		const chunk_sums = [];
		let cid = 0;
		while (cid < chunks.length) {
			const chunk_sum = await genSummaryWithSlash(chunks[cid], Number(cid) + 1, { resummarizeChapterNumber });
			if (chunk_sum.length > 0) {
				chunk_sums.push(chunk_sum);
				cid++;
			} else {
				const result = await getContext().Popup.show.text(
					"Timeline Memory",
					"There was an error generating a summary for chunk #" + (Number(cid) + 1),
					{ okButton: 'Retry', cancelButton: 'Cancel' });
				if (result !== 1) return "";
			}
		}
		final_context = chunk_sums.join("\n\n");
		if (settings.add_chunk_summaries && targetMessageId !== undefined) {
			await runSlashCommand(`/comment at=${targetMessageId + 1} <details class="rmr-summary-chunks"><summary>Chunk Summaries</summary>${final_context}</details>`);
		}
	} else {
		oopsToast("No visible chapter content! Skipping summary.");
		return "";
	}

	if (!final_context?.length) {
		oopsToast("No final content - skipping summary.");
		return "";
	}

	infoToast("Generating chapter summary....");
	const result = await genSummaryWithSlash(final_context, 0, { resummarizeChapterNumber });
	const trimmedResult = typeof result === 'string' ? result.trim() : '';

	if (trimmedResult.length > 0 && hideAfter && settings.hide_chapter) {
		const chat = getContext().chat;
		for (const mes of message_history) {
			if (mes?.index === undefined) continue;
			chat[mes.index].is_system = true;
			const mes_elem = $(`.mes[mesid="${mes.index}"]`);
			if (mes_elem.length) mes_elem.attr('is_system', 'true');
		}
		getContext().saveChat();
	}

	if (!trimmedResult.length) {
		oopsToast("No final content - skipping summary.");
	}

	return trimmedResult;
}

async function generateChapterSummary(mes_id) {
	const chat = getContext().chat;
	// slice to just the history from this message
	// slice to messages since the last chapter end, if there was one
	let last_end = chat.slice(0, mes_id + 1).findLastIndex((it) => it.extra.rmr_chapter);
	if (last_end < 0) { last_end = 0; }
	const memory_history = await processMessageSlice(mes_id, 0, last_end);

	return await summarizeHistoryEntries(memory_history, { targetMessageId: mes_id, hideAfter: true });
}

// Simplified chapter summarization - just creates a summary
// Accepts either a message ID (number) or a jQuery element for backwards compatibility
export async function summarizeChapter(messageOrId, options={}) {
	commandArgs = options;
	// Accept either a message ID (number) or a jQuery element
	const mes_id = typeof messageOrId === 'number'
		? messageOrId
		: Number(messageOrId.attr('mesid'));
	const chat = getContext().chat;

	// Find the last chapter end marker
	let last_end = chat.slice(0, mes_id + 1).findLastIndex((it) => it.extra?.rmr_chapter);
	if (last_end < 0) { last_end = 0; }

	const summary = await generateChapterSummary(mes_id);
	if (summary.length === 0) {
		errorToast("Chapter summary returned empty!");
		return;
	}

	// Add to timeline
	addChapterToTimeline(summary, last_end, mes_id);

	// Mark chapter end
	chat[mes_id].extra.rmr_chapter = true;
	getContext().saveChat();
	// Toggle highlight only if message is rendered (may not be visible in DOM)
	const highlightEl = $(`.mes[mesid="${mes_id}"] .rmr-button.fa-circle-stop`);
	if (highlightEl.length > 0) {
		toggleChapterHighlight(highlightEl, mes_id);
	}

	doneToast(`Chapter ${timelineData.length} added to timeline.`);
}

// Alias for backward compatibility
export async function endChapter(message, options={}) {
	return summarizeChapter(message, options);
}

export async function resummarizeChapter(chapterNumber, options = {}) {
	commandArgs = options;
	loadTimelineData();
	if (!timelineData || timelineData.length === 0) {
		oopsToast("No chapters available to re-summarize.");
		return "";
	}

	if (chapterNumber < 1 || chapterNumber > timelineData.length) {
		errorToast(`Chapter ${chapterNumber} not found.`);
		return "";
	}

	const chapterIndex = chapterNumber - 1;
	const chapter = timelineData[chapterIndex];
	const chat = getContext().chat;

	const startIdx = chapter.startMsgId === 0 ? 0 : chapter.startMsgId + 1;
	const endIdx = chapter.endMsgId;
	if (endIdx >= chat.length) {
		errorToast(`Chapter ${chapterNumber} references messages that are no longer available.`);
		return "";
	}

	const rawHistory = chat.slice(startIdx, endIdx + 1);
	if (!rawHistory.length) {
		oopsToast("No visible chapter content! Skipping summary.");
		return "";
	}

	const processedHistory = await Promise.all(rawHistory.map(async (message, offset) => {
		const absoluteIndex = startIdx + offset;
		let placement = message.is_user ? regex_placement.USER_INPUT : regex_placement.AI_OUTPUT;
		const depth = Math.max(0, chat.length - absoluteIndex - 1);
		const options = { isPrompt: true, depth };
		const original = message?.mes ?? '';
		const mes_text = message.is_system ? original : getRegexedString(original, placement, options);
		return {
			...message,
			mes: mes_text,
			index: absoluteIndex,
		};
	}));

	const summary = await summarizeHistoryEntries(processedHistory, { targetMessageId: endIdx, hideAfter: false, resummarizeChapterNumber: chapterNumber });
	if (!summary.length) {
		return "";
	}

	timelineData[chapterIndex].summary = summary;
	saveTimelineData();
	doneToast(`Chapter ${chapterNumber} summary updated.`);
	return summary;
}

// Removed lorebook functionality - these functions are no longer needed
export async function rememberEvent() {
	oopsToast("Memory events are no longer saved to lorebooks. Chapters are now tracked in the timeline.");
}

export async function logMessage() {
	oopsToast("Message logging to lorebooks has been removed. Use chapter summaries instead.");
}

export async function fadeMemories() {
    // No longer needed
}

// ---- Arc Analyzer ----

function stripJsonFences(text) {
    if (typeof text !== 'string') return '';
    const fenced = text.match(/```(?:json)?\n([\s\S]*?)\n```/i);
    if (fenced && fenced[1]) return fenced[1].trim();
    return text.trim();
}

function tryParseJsonArray(text) {
    try {
        return JSON.parse(text);
    } catch (_) {
        // Try to extract first array
        const start = text.indexOf('[');
        const end = text.lastIndexOf(']');
        if (start !== -1 && end !== -1 && end > start) {
            const slice = text.slice(start, end + 1);
            try {
                return JSON.parse(slice);
            } catch (_) { /* noop */ }
        }
    }
    return null;
}

function validateArcItems(items) {
    if (!Array.isArray(items)) return [];
    const context = getContext();
    const maxId = (context.chat?.length ?? 1) - 1;
    return items
        .map((it, idx) => {
            const title = String(it?.title ?? '').trim();
            const summary = String(it?.summary ?? '').trim();
            const justification = String(it?.justification ?? '').trim();
            const chapterEnd = Number(it?.chapterEnd);
            const validId = Number.isInteger(chapterEnd) && chapterEnd >= 0 && chapterEnd <= maxId;
            return validId && title && summary ? { title, summary, justification, chapterEnd, _idx: idx } : null;
        })
        .filter(Boolean);
}

function _sanitize(text) {
    try {
        if (typeof DOMPurify !== 'undefined') return DOMPurify.sanitize(String(text ?? ''));
    } catch (_) { /* ignore */ }
    return String(text ?? '').replace(/[&<>"']/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'}[c]));
}

/**
 * Find the first visible (non-system/non-hidden) message index
 * @returns {number} The index of the first visible message, or 0 if none found
 */
function findFirstVisibleMessageIndex() {
    const context = getContext();
    const chat = context.chat || [];
    for (let i = 0; i < chat.length; i++) {
        if (!chat[i].is_system) {
            return i;
        }
    }
    return 0;
}

/**
 * Get the most recent message ID
 * @returns {number} The index of the last message, or 0 if chat is empty
 */
function getMostRecentMessageId() {
    const context = getContext();
    const chat = context.chat || [];
    return Math.max(0, chat.length - 1);
}

/**
 * Fetch arcs from the API (without showing popup or managing session state)
 * @param {string|null} profileOverride - Optional profile ID override
 * @returns {Promise<Array>} Array of validated arc objects
 */
async function fetchArcsFromAPI(profileOverride = null) {
    const context = getContext();
    const profileId = profileOverride || settings.arc_profile;

    if (!profileId) {
        throw new Error('No arc analyzer profile selected');
    }

    // Build prompt content
    const history = evaluateMacros('{{chapterHistory}}', {});
    let prompt = settings.arc_analyzer_prompt_template || '';
    prompt = prompt.replace(/{{chapterHistory}}/gi, history);
    prompt = context.substituteParams(prompt, context.name1, context.name2);

    let systemPrompt = '';
    if (settings.arc_analyzer_system_prompt && settings.arc_analyzer_system_prompt.trim()) {
        systemPrompt = settings.arc_analyzer_system_prompt;
        systemPrompt = systemPrompt.replace(/{{chapterHistory}}/gi, history);
        systemPrompt = context.substituteParams(systemPrompt, context.name1, context.name2);
    }

    // Prepare messages
    const messages = [];
    if (systemPrompt) messages.push({ role: 'system', content: systemPrompt });
    messages.push({ role: 'user', content: prompt });

    // Token + overrides
    const maxTokens = await getMaxTokensForProfile(profileId);
    const overridePayload = buildOverridePayload(profileId, maxTokens);
    const reasoningEffort = getReasoningEffort(profileId);
    if (reasoningEffort !== undefined) overridePayload.reasoning_effort = reasoningEffort;
    const includeReasoning = getIncludeReasoning(profileId);
    if (includeReasoning !== undefined) overridePayload.include_reasoning = includeReasoning;

    // Send via ConnectionManagerRequestService
    const result = await ConnectionManagerRequestService.sendRequest(
        profileId,
        messages,
        maxTokens,
        { includePreset: true, includeInstruct: true, stream: false },
        overridePayload,
    );

    const content = result?.content || result || '';
    const parsed = await reasoningParser(content, profileId);
    const finalContent = parsed ? parsed.content : content;

    const unfenced = stripJsonFences(finalContent);
    const arr = tryParseJsonArray(unfenced);
    return validateArcItems(arr);
}

/**
 * Show the arc analyzer popup with persistent display
 * @param {Array} arcs - Array of arc objects from the analyzer
 */
async function showArcPopup(arcs) {
    const context = getContext();
    const Popup = context.Popup;

    if (!Array.isArray(arcs) || arcs.length === 0) {
        await Popup.show.text('Arc Analyzer', 'No valid arcs found.');
        return;
    }

    // Get current position info
    const firstVisibleId = findFirstVisibleMessageIndex();
    const mostRecentId = getMostRecentMessageId();

    // Filter out arcs that are now before the first visible message (negative range)
    // This handles the case where user closed popup, summarization completed, and now reopens
    const filteredArcs = arcs.filter(arc => {
        const messageCount = arc.chapterEnd - firstVisibleId + 1;
        return messageCount > 0;
    });

    // Update session state with filtered arcs
    arcSessionState.arcs = filteredArcs;

    if (filteredArcs.length === 0) {
        await Popup.show.text('Arc Analyzer', translate('All arcs have been processed. Run Re-analyze for new arcs.', 'rmr_arc_all_processed'));
        return;
    }

    // Check if there's an active summarization
    const isSummarizing = arcSessionState.summarizingArcEnd !== null;

    // Create custom popup HTML
    const overlayEl = document.createElement('div');
    overlayEl.className = 'rmr-arc-popup-overlay';
    overlayEl.innerHTML = `
        <div class="rmr-arc-popup${isSummarizing ? ' loading' : ''}">
            <div class="rmr-arc-popup-header">
                <span class="rmr-arc-popup-title">Arc Analyzer</span>
                <span class="rmr-arc-popup-position">
                    First visible: <strong id="rmr-arc-first-visible">${firstVisibleId}</strong> |
                    Most recent: <strong id="rmr-arc-most-recent">${mostRecentId}</strong>
                </span>
                <div class="rmr-arc-popup-actions">
                    <button class="menu_button rmr-arc-reanalyze-btn" title="Run fresh analysis">
                        <i class="fa-solid fa-rotate"></i> ${translate('Re-analyze', 'rmr_arc_reanalyze')}
                    </button>
                </div>
                <button class="rmr-arc-popup-close" title="Close">×</button>
            </div>
            <div class="rmr-arc-popup-body">
                <div class="rmr-arc-list" id="rmr-arc-list"></div>
            </div>
            <div class="rmr-arc-popup-loading${isSummarizing ? ' active' : ''}" id="rmr-arc-loading">
                <i class="fa-solid fa-gear fa-spin"></i>
                <span>Summarizing chapter...</span>
            </div>
        </div>
    `;

    // Build arc items
    const arcListEl = overlayEl.querySelector('#rmr-arc-list');

    for (const arc of filteredArcs) {
        const messageCount = arc.chapterEnd - firstVisibleId + 1;
        const isCompleted = arcSessionState.completedArcEnds.has(arc.chapterEnd);
        const isSummarizingThis = arcSessionState.summarizingArcEnd === arc.chapterEnd;
        const arcItem = document.createElement('div');
        arcItem.className = 'rmr-arc-item' + (isCompleted ? ' completed' : '');
        arcItem.dataset.arcEnd = arc.chapterEnd;
        arcItem.innerHTML = `
            <div class="rmr-arc-item-header">
                <span class="rmr-arc-item-title">${_sanitize(arc.title)}</span>
                <span class="rmr-arc-item-meta">
                    End @ <strong>${arc.chapterEnd}</strong>
                    (<span class="rmr-arc-item-count">${messageCount}</span> messages)
                </span>
            </div>
            <div class="rmr-arc-item-summary">${_sanitize(arc.summary)}</div>
            ${arc.justification ? `<div class="rmr-arc-item-justification"><i>${_sanitize(arc.justification)}</i></div>` : ''}
            <button class="menu_button rmr-arc-item-btn" ${isCompleted || isSummarizingThis ? 'disabled' : ''}>${isCompleted ? '✓ Completed' : (isSummarizingThis ? 'Summarizing...' : 'Create Chapter Here')}</button>
        `;

        // Button click handler
        const btn = arcItem.querySelector('.rmr-arc-item-btn');
        btn.addEventListener('click', async () => {
            // Prevent double-clicks
            if (arcSessionState.summarizingArcEnd !== null) {
                return;
            }

            const loadingEl = overlayEl.querySelector('#rmr-arc-loading');
            const popupEl = overlayEl.querySelector('.rmr-arc-popup');

            try {
                // Validate the target message exists in chat array (not DOM - allows unrendered messages)
                const mesId = Number(arc.chapterEnd);
                const chat = getContext().chat;
                if (mesId < 0 || mesId >= chat.length) {
                    toastr.error(`Message ${mesId} not found. The chat may have changed.`, 'Arc Analyzer');
                    return;
                }

                // Track summarization state in session (persists even if popup closes)
                arcSessionState.summarizingArcEnd = arc.chapterEnd;

                // Show loading state (if popup is still open)
                if (loadingEl) loadingEl.classList.add('active');
                if (popupEl) popupEl.classList.add('loading');
                btn.textContent = 'Summarizing...';
                btn.disabled = true;

                // Call summarizeChapter directly with the profile override (pass ID directly)
                const options = {};
                if (settings.profile) {
                    options.profile = settings.profile;
                }
                await summarizeChapter(mesId, options);

                // Mark this arc as completed in session state (always do this)
                arcSessionState.completedArcEnds.add(arc.chapterEnd);

                // Get new position info for filtering
                const newFirstVisible = findFirstVisibleMessageIndex();
                const newMostRecent = getMostRecentMessageId();

                // Filter out arcs that are now in negative range from session state
                arcSessionState.arcs = arcSessionState.arcs.filter(a => {
                    const count = a.chapterEnd - newFirstVisible + 1;
                    return count > 0;
                });

                // Update UI using the CURRENT overlay (may be different if user closed and reopened)
                const currentOverlay = arcSessionState.currentOverlay;
                if (currentOverlay && document.body.contains(currentOverlay)) {
                    // Update position info
                    const firstVisibleEl = currentOverlay.querySelector('#rmr-arc-first-visible');
                    const mostRecentEl = currentOverlay.querySelector('#rmr-arc-most-recent');
                    if (firstVisibleEl) firstVisibleEl.textContent = newFirstVisible;
                    if (mostRecentEl) mostRecentEl.textContent = newMostRecent;

                    // Update message counts and remove arcs that are now before the first visible message
                    currentOverlay.querySelectorAll('.rmr-arc-item').forEach(item => {
                        const arcEnd = parseInt(item.dataset.arcEnd, 10);
                        const newCount = arcEnd - newFirstVisible + 1;

                        // Remove arcs that are now before the first visible message
                        if (newCount <= 0) {
                            item.classList.add('fade-out');
                            setTimeout(() => item.remove(), 200);
                            return;
                        }

                        const countEl = item.querySelector('.rmr-arc-item-count');
                        if (countEl) {
                            countEl.textContent = newCount;
                        }
                    });

                    // Find and mark the completed arc item in the current overlay
                    const completedArcItem = currentOverlay.querySelector(`.rmr-arc-item[data-arc-end="${arc.chapterEnd}"]`);
                    if (completedArcItem) {
                        completedArcItem.classList.add('completed');
                        const completedBtn = completedArcItem.querySelector('.rmr-arc-item-btn');
                        if (completedBtn) {
                            completedBtn.textContent = '✓ Completed';
                            completedBtn.disabled = true;
                        }
                    }
                }

            } catch (err) {
                console.error('Arc apply error:', err);
                toastr.error('Failed to apply chapter end', 'Arc Analyzer');

                // Reset button state if popup is still open (use current overlay)
                const currentOverlay = arcSessionState.currentOverlay;
                if (currentOverlay && document.body.contains(currentOverlay)) {
                    const errorArcItem = currentOverlay.querySelector(`.rmr-arc-item[data-arc-end="${arc.chapterEnd}"]`);
                    if (errorArcItem) {
                        const errorBtn = errorArcItem.querySelector('.rmr-arc-item-btn');
                        if (errorBtn) {
                            errorBtn.textContent = 'Create Chapter Here';
                            errorBtn.disabled = false;
                        }
                    }
                }
            } finally {
                // Clear summarization state
                arcSessionState.summarizingArcEnd = null;

                // Hide loading state (use current overlay)
                const currentOverlay = arcSessionState.currentOverlay;
                if (currentOverlay && document.body.contains(currentOverlay)) {
                    const loadingEl = currentOverlay.querySelector('#rmr-arc-loading');
                    const popupEl = currentOverlay.querySelector('.rmr-arc-popup');
                    if (loadingEl) loadingEl.classList.remove('active');
                    if (popupEl) popupEl.classList.remove('loading');
                }
            }
        });

        arcListEl.appendChild(arcItem);
    }

    // Re-analyze button handler with smooth animation
    const reanalyzeBtn = overlayEl.querySelector('.rmr-arc-reanalyze-btn');
    reanalyzeBtn.addEventListener('click', async () => {
        const loadingEl = overlayEl.querySelector('#rmr-arc-loading');
        const popupEl = overlayEl.querySelector('.rmr-arc-popup');
        const loadingText = loadingEl.querySelector('span');

        // Prevent re-analyze during summarization
        if (arcSessionState.summarizingArcEnd !== null) {
            toastr.warning(translate('Please wait for current summarization to complete', 'rmr_arc_wait_summarization'), 'Arc Analyzer');
            return;
        }

        try {
            // Disable re-analyze button during operation
            reanalyzeBtn.disabled = true;

            // Show re-analyzing loading state
            loadingText.textContent = translate('Re-analyzing arcs...', 'rmr_arc_reanalyzing');
            loadingEl.classList.add('active');
            popupEl.classList.add('loading');

            // Fade out existing arc items
            const existingItems = arcListEl.querySelectorAll('.rmr-arc-item');
            existingItems.forEach(item => {
                item.classList.add('fade-out');
            });

            // Wait for fade-out animation
            await new Promise(resolve => setTimeout(resolve, 200));

            // Mark as internal generation
            isInternalGeneration = true;

            // Fetch new arcs from API
            const newArcs = await fetchArcsFromAPI();

            // Get current position info
            const newFirstVisible = findFirstVisibleMessageIndex();
            const newMostRecent = getMostRecentMessageId();

            // Filter arcs for valid range
            const filteredArcs = newArcs.filter(arc => {
                const messageCount = arc.chapterEnd - newFirstVisible + 1;
                return messageCount > 0;
            });

            // Update session state
            const context = getContext();
            arcSessionState.chatId = context.getCurrentChatId?.() || null;
            arcSessionState.arcs = filteredArcs;
            arcSessionState.completedArcEnds = new Set();

            // Update position info in header
            const firstVisibleEl = overlayEl.querySelector('#rmr-arc-first-visible');
            const mostRecentEl = overlayEl.querySelector('#rmr-arc-most-recent');
            if (firstVisibleEl) firstVisibleEl.textContent = newFirstVisible;
            if (mostRecentEl) mostRecentEl.textContent = newMostRecent;

            // Clear existing arc list
            arcListEl.innerHTML = '';

            if (filteredArcs.length === 0) {
                // Show empty state
                const emptyEl = document.createElement('div');
                emptyEl.className = 'rmr-arc-empty fade-in';
                emptyEl.textContent = translate('No valid arcs found. Try adjusting your prompts.', 'rmr_arc_no_valid');
                arcListEl.appendChild(emptyEl);
            } else {
                // Rebuild arc items with staggered fade-in
                filteredArcs.forEach((arc, index) => {
                    const messageCount = arc.chapterEnd - newFirstVisible + 1;
                    const arcItem = document.createElement('div');
                    arcItem.className = 'rmr-arc-item fade-in';
                    arcItem.dataset.arcEnd = arc.chapterEnd;
                    arcItem.style.animationDelay = `${index * 50}ms`;
                    arcItem.innerHTML = `
                        <div class="rmr-arc-item-header">
                            <span class="rmr-arc-item-title">${_sanitize(arc.title)}</span>
                            <span class="rmr-arc-item-meta">
                                End @ <strong>${arc.chapterEnd}</strong>
                                (<span class="rmr-arc-item-count">${messageCount}</span> messages)
                            </span>
                        </div>
                        <div class="rmr-arc-item-summary">${_sanitize(arc.summary)}</div>
                        ${arc.justification ? `<div class="rmr-arc-item-justification"><i>${_sanitize(arc.justification)}</i></div>` : ''}
                        <button class="menu_button rmr-arc-item-btn">Create Chapter Here</button>
                    `;

                    // Button click handler (same logic as original, using currentOverlay for updates)
                    const btn = arcItem.querySelector('.rmr-arc-item-btn');
                    btn.addEventListener('click', async () => {
                        if (arcSessionState.summarizingArcEnd !== null) return;

                        const innerLoadingEl = overlayEl.querySelector('#rmr-arc-loading');
                        const innerPopupEl = overlayEl.querySelector('.rmr-arc-popup');
                        const innerLoadingText = innerLoadingEl?.querySelector('span');

                        try {
                            // Validate the target message exists in chat array (not DOM - allows unrendered messages)
                            const mesId = Number(arc.chapterEnd);
                            const chat = getContext().chat;
                            if (mesId < 0 || mesId >= chat.length) {
                                toastr.error(`Message ${mesId} not found.`, 'Arc Analyzer');
                                return;
                            }

                            arcSessionState.summarizingArcEnd = arc.chapterEnd;
                            if (innerLoadingText) innerLoadingText.textContent = 'Summarizing chapter...';
                            if (innerLoadingEl) innerLoadingEl.classList.add('active');
                            if (innerPopupEl) innerPopupEl.classList.add('loading');
                            btn.textContent = 'Summarizing...';
                            btn.disabled = true;

                            const options = {};
                            if (settings.profile) options.profile = settings.profile;
                            await summarizeChapter(mesId, options);

                            arcSessionState.completedArcEnds.add(arc.chapterEnd);

                            const updatedFirstVisible = findFirstVisibleMessageIndex();
                            const updatedMostRecent = getMostRecentMessageId();

                            arcSessionState.arcs = arcSessionState.arcs.filter(a => {
                                const count = a.chapterEnd - updatedFirstVisible + 1;
                                return count > 0;
                            });

                            // Use currentOverlay for updates (may be different if user closed/reopened)
                            const currentOverlay = arcSessionState.currentOverlay;
                            if (currentOverlay && document.body.contains(currentOverlay)) {
                                const fvEl = currentOverlay.querySelector('#rmr-arc-first-visible');
                                const mrEl = currentOverlay.querySelector('#rmr-arc-most-recent');
                                if (fvEl) fvEl.textContent = updatedFirstVisible;
                                if (mrEl) mrEl.textContent = updatedMostRecent;

                                currentOverlay.querySelectorAll('.rmr-arc-item').forEach(item => {
                                    const arcEnd = parseInt(item.dataset.arcEnd, 10);
                                    const newCount = arcEnd - updatedFirstVisible + 1;
                                    if (newCount <= 0) {
                                        item.classList.add('fade-out');
                                        setTimeout(() => item.remove(), 200);
                                        return;
                                    }
                                    const countEl = item.querySelector('.rmr-arc-item-count');
                                    if (countEl) countEl.textContent = newCount;
                                });

                                // Find and mark the completed arc in current overlay
                                const completedArcItem = currentOverlay.querySelector(`.rmr-arc-item[data-arc-end="${arc.chapterEnd}"]`);
                                if (completedArcItem) {
                                    completedArcItem.classList.add('completed');
                                    const completedBtn = completedArcItem.querySelector('.rmr-arc-item-btn');
                                    if (completedBtn) {
                                        completedBtn.textContent = '✓ Completed';
                                        completedBtn.disabled = true;
                                    }
                                }
                            }
                        } catch (err) {
                            console.error('Arc apply error:', err);
                            toastr.error('Failed to apply chapter end', 'Arc Analyzer');
                            const currentOverlay = arcSessionState.currentOverlay;
                            if (currentOverlay && document.body.contains(currentOverlay)) {
                                const errorArcItem = currentOverlay.querySelector(`.rmr-arc-item[data-arc-end="${arc.chapterEnd}"]`);
                                if (errorArcItem) {
                                    const errorBtn = errorArcItem.querySelector('.rmr-arc-item-btn');
                                    if (errorBtn) {
                                        errorBtn.textContent = 'Create Chapter Here';
                                        errorBtn.disabled = false;
                                    }
                                }
                            }
                        } finally {
                            arcSessionState.summarizingArcEnd = null;
                            const currentOverlay = arcSessionState.currentOverlay;
                            if (currentOverlay && document.body.contains(currentOverlay)) {
                                const el = currentOverlay.querySelector('#rmr-arc-loading');
                                const pel = currentOverlay.querySelector('.rmr-arc-popup');
                                if (el) el.classList.remove('active');
                                if (pel) pel.classList.remove('loading');
                            }
                        }
                    });

                    arcListEl.appendChild(arcItem);
                });
            }

            doneToast(translate('Arcs re-analyzed', 'rmr_arc_reanalyzed'));

        } catch (err) {
            console.error('Re-analyze error:', err);
            toastr.error('Failed to re-analyze arcs', 'Arc Analyzer');
        } finally {
            isInternalGeneration = false;
            reanalyzeBtn.disabled = false;
            loadingText.textContent = 'Summarizing chapter...';
            loadingEl.classList.remove('active');
            popupEl.classList.remove('loading');
        }
    });

    // Helper to close and unregister overlay
    const closeOverlay = () => {
        arcSessionState.currentOverlay = null;
        overlayEl.remove();
    };

    // Close button handler
    overlayEl.querySelector('.rmr-arc-popup-close').addEventListener('click', closeOverlay);

    // Click outside to close
    overlayEl.addEventListener('click', (e) => {
        if (e.target === overlayEl) {
            closeOverlay();
        }
    });

    // ESC key to close
    const escHandler = (e) => {
        if (e.key === 'Escape') {
            closeOverlay();
            document.removeEventListener('keydown', escHandler);
        }
    };
    document.addEventListener('keydown', escHandler);

    // Register as current overlay and add to DOM
    arcSessionState.currentOverlay = overlayEl;
    document.body.appendChild(overlayEl);
}

export async function analyzeArcs(profileOverride = null, forceReanalyze = false) {
    const context = getContext();
    const currentChatId = context.getCurrentChatId?.() || null;

    // Check if we have valid session state for this chat (and not forcing re-analysis)
    if (!forceReanalyze &&
        arcSessionState.chatId === currentChatId &&
        arcSessionState.arcs.length > 0) {
        // Reuse existing arcs - show popup and continue from where left off
        infoToast(translate('Resuming arc analyzer...', 'rmr_arc_resuming'));
        await showArcPopup(arcSessionState.arcs);
        return;
    }

    // Mark as internal generation to prevent timeline injection
    isInternalGeneration = true;

    try {
        const profileId = profileOverride || settings.arc_profile;
        if (!profileId) {
            toastr.error('Select an Arc Analyzer profile first', 'Timeline Memory');
            return;
        }

        // Build prompt content
        const history = evaluateMacros('{{chapterHistory}}', {});
        let prompt = settings.arc_analyzer_prompt_template || '';
        prompt = prompt.replace(/{{chapterHistory}}/gi, history);
        prompt = context.substituteParams(prompt, context.name1, context.name2);

        let systemPrompt = '';
        if (settings.arc_analyzer_system_prompt && settings.arc_analyzer_system_prompt.trim()) {
            systemPrompt = settings.arc_analyzer_system_prompt;
            systemPrompt = systemPrompt.replace(/{{chapterHistory}}/gi, history);
            systemPrompt = context.substituteParams(systemPrompt, context.name1, context.name2);
        }

        infoToast('Analyzing arcs...');

        // Prepare messages
        const messages = [];
        if (systemPrompt) messages.push({ role: 'system', content: systemPrompt });
        messages.push({ role: 'user', content: prompt });

        // Token + overrides
        const maxTokens = await getMaxTokensForProfile(profileId);
        const overridePayload = buildOverridePayload(profileId, maxTokens);
        const reasoningEffort = getReasoningEffort(profileId);
        if (reasoningEffort !== undefined) overridePayload.reasoning_effort = reasoningEffort;
        const includeReasoning = getIncludeReasoning(profileId);
        if (includeReasoning !== undefined) overridePayload.include_reasoning = includeReasoning;

        // Send via ConnectionManagerRequestService
        const result = await ConnectionManagerRequestService.sendRequest(
            profileId,
            messages,
            maxTokens,
            { includePreset: true, includeInstruct: true, stream: false },
            overridePayload,
        );

        const content = result?.content || result || '';
        const parsed = await reasoningParser(content, profileId);
        const finalContent = parsed ? parsed.content : content;

        const unfenced = stripJsonFences(finalContent);
        const arr = tryParseJsonArray(unfenced);
        const arcs = validateArcItems(arr);

        if (!arcs.length) {
            toastr.warning('No valid arc entries found in output', 'Arc Analyzer');
        }

        // Store arcs in session state
        arcSessionState.chatId = currentChatId;
        arcSessionState.arcs = arcs;
        // Reset completed arcs on fresh analysis
        arcSessionState.completedArcEnds = new Set();

        await showArcPopup(arcs);
    } catch (err) {
        console.error('Arc Analyzer failure:', err);
        toastr.error('Arc analysis failed', 'Timeline Memory');
    } finally {
        // Always reset the flag when done
        isInternalGeneration = false;
    }
}

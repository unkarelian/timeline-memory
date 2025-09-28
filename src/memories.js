import { extension_settings, getContext } from "../../../../extensions.js";
import { MacrosParser, evaluateMacros } from "../../../../macros.js";
import { getRegexedString, regex_placement } from '../../../regex/engine.js';
import { getCharaFilename, escapeRegex, trimSpaces } from "../../../../utils.js";
import { settings, ChapterEndMode } from "./settings.js";
import { toggleChapterHighlight } from "./messages.js";
import { debug } from "./logging.js";
import { ConnectionManagerRequestService } from "../../../shared.js";
import { amount_gen, main_api } from "../../../../../script.js";
import { oai_settings, openai_settings, chat_completion_sources, reasoning_effort_types } from "../../../../../scripts/openai.js";
import { reasoning_templates } from "../../../../../scripts/reasoning.js";
import { getPresetManager } from "../../../../../scripts/preset-manager.js";

const runSlashCommand = getContext().executeSlashCommandsWithOptions;

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
			const chatCompletionApis = ['claude', 'openrouter', 'windowai', 'scale', 'ai21', 'makersuite','vertexai', 'mistralai', 'custom', 'google', 'cohere', 'perplexity', 'groq', '01ai', 'nanogpt', 'deepseek', 'aimlapi', 'xai', 'pollinations'];

			if (chatCompletionApis.includes(profile.api) || profile.api === 'openai') {
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

// Store timeline data
let timelineData = [];

let commandArgs;

const infoToast = (text)=>{if (!commandArgs?.quiet) toastr.info(text, "Timeline Memory")};
const doneToast = (text)=>{if (!commandArgs?.quiet) toastr.success(text, "Timeline Memory")};
const oopsToast = (text)=>{if (!commandArgs?.quiet) toastr.warning(text, "Timeline Memory")};
const errorToast = (text)=>{if (!commandArgs?.quiet) toastr.error(text, "Timeline Memory")};

const delay_ms = ()=> {
	return Math.max(500, 60000 / Number(settings.rate_limit));
}
let last_gen_timestamp = 0;

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
			const chatCompletionApis = ['claude', 'openrouter', 'windowai', 'scale', 'ai21', 'makersuite','vertexai', 'mistralai', 'custom', 'google', 'cohere', 'perplexity', 'groq', '01ai', 'nanogpt', 'deepseek', 'aimlapi', 'xai', 'pollinations'];

			if (chatCompletionApis.includes(profile.api) || profile.api === 'openai') {
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
}

// Load timeline data from chat metadata
export function loadTimelineData() {
	const context = getContext();
	if (context.chatMetadata?.timeline) {
		timelineData = context.chatMetadata.timeline;
	} else {
		timelineData = [];
	}
}

// Save timeline data to chat metadata
function saveTimelineData() {
	const context = getContext();
	if (!context.chatMetadata) {
		context.chatMetadata = {};
	}
	context.chatMetadata.timeline = timelineData;
	context.saveMetadata();
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

async function genSummaryWithSlash(history, id=0) {
	// Initialize commandArgs if not set
	if (!commandArgs) {
		commandArgs = {};
	}

	let this_delay = delay_ms() - (Date.now() - last_gen_timestamp);
	debug('delaying', this_delay, "out of", delay_ms());
	if (this_delay > 0) {
		await new Promise(resolve => setTimeout(resolve, this_delay));
	}
	last_gen_timestamp = Date.now();

	if (id > 0) {
		infoToast("Generating summary #"+id+"....");
	}
	const prompt_text = settings.memory_prompt_template.replace('{{content}}', history.trim());

	// Process system prompt with macro replacements
	let systemPrompt = '';
	if (settings.memory_system_prompt && settings.memory_system_prompt.trim()) {
		systemPrompt = settings.memory_system_prompt.replace('{{content}}', history.trim());
		// Also substitute standard params like {{char}}, {{user}}, etc.
		const context = getContext();
		systemPrompt = context.substituteParams(systemPrompt, context.name1, context.name2);
	}

	// Determine which profile to use
	const profileId = commandArgs?.profile || settings.profile;

	// Use ConnectionManagerRequestService if a profile is specified
	if (profileId && ConnectionManagerRequestService) {
		try {
			debug(`Using ConnectionManagerRequestService with profile: ${profileId}`);

			// Build messages array for the request
			const messages = [];
			if (systemPrompt) {
				messages.push({ role: 'system', content: systemPrompt });
			}
			messages.push({ role: 'user', content: prompt_text });

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
		} catch (error) {
			errorToast('Error using connection profile for summary');
			debug('ConnectionManagerRequestService error:', error);
			throw new Error(`Failed to generate summary: ${error.message}`);
		}
	}

	// No profile specified and no fallback available
	throw new Error('No connection profile specified for summary generation');
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


// Query a chapter with a specific question
export async function queryChapter(chapterNumber, query) {
	// Initialize commandArgs if not set
	if (!commandArgs) {
		commandArgs = {};
	}

	const chapterHistory = await getChapterHistory(chapterNumber);
	if (!chapterHistory) {
		errorToast(`Chapter ${chapterNumber} not found`);
		return '';
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
		try {
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
          //  console.log('parsed_reasoning', parsed_reasoning.content);
		//	const parsed_result = getContext().parseReasoningFromString(content);
           // console.log('parsed_result', parsed_result);
			const final_content = parsed_reasoning ? parsed_reasoning.content : content;
            console.log('final_content', final_content);
			debug('Successfully used ConnectionManagerRequestService for query');
			return final_content;
		} catch (error) {
			errorToast('Error using connection profile for query');
			debug('ConnectionManagerRequestService error:', error);
			throw new Error(`Failed to generate query response: ${error.message}`);
		}
	}

	// No profile specified and no fallback available
	throw new Error('No connection profile specified for query');
}

// Query multiple chapters with a specific question
export async function queryChapters(startChapter, endChapter, query) {
	// Initialize commandArgs if not set
	if (!commandArgs) {
		commandArgs = {};
	}

	// Validate chapter range
	if (startChapter < 1 || startChapter > timelineData.length) {
		errorToast(`Start chapter ${startChapter} is out of range (1-${timelineData.length})`);
		return '';
	}
	if (endChapter < 1 || endChapter > timelineData.length) {
		errorToast(`End chapter ${endChapter} is out of range (1-${timelineData.length})`);
		return '';
	}
	if (startChapter > endChapter) {
		errorToast(`Start chapter ${startChapter} must be before or equal to end chapter ${endChapter}`);
		return '';
	}

	debug(`Querying chapters ${startChapter} to ${endChapter}`);

	// Collect all chapter histories and summaries
	const chaptersData = [];
	const chapterSummaries = [];
	
	for (let i = startChapter; i <= endChapter; i++) {
		const chapterHistory = await getChapterHistory(i);
		if (!chapterHistory) {
			errorToast(`Chapter ${i} not found`);
			return '';
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
		try {
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
		} catch (error) {
			errorToast('Error using connection profile for query');
			debug('ConnectionManagerRequestService error:', error);
			throw new Error(`Failed to generate query response: ${error.message}`);
		}
	}

	// No profile specified and no fallback available
	throw new Error('No connection profile specified for query');
}

async function generateChapterSummary(mes_id) {
	const chat = getContext().chat;
	// slice to just the history from this message
	// slice to messages since the last chapter end, if there was one
	let last_end = chat.slice(0, mes_id+1).findLastIndex((it) => it.extra.rmr_chapter);
	if (last_end < 0) { last_end = 0; }
	const memory_history = await processMessageSlice(mes_id, 0, last_end);

	const max_tokens = getContext().maxContext - 100; // take out padding for the instructions
	const getTokenCount = getContext().getTokenCountAsync;

	let chunks = [];
	let current = "";
	for (const mes of memory_history) {
		const mes_text = `${mes.name}: ${mes.mes}`;
		const next_text = current+"\n\n"+mes_text;
		const tokens = await getTokenCount(current+mes_text);
		if (tokens > max_tokens) {
			chunks.push(current);
			current = mes_text;
		} else {
			current = next_text;
		}
	}
	if (current.length) chunks.push(current);
	let final_context;
	if (chunks.length == 1) {
		final_context = chunks[0];
	}
	else if (chunks.length > 1) {
		infoToast(`Generating summaries for ${chunks.length} chunks....`);
		let chunk_sums = [];
		let cid = 0;
		while (cid < chunks.length) {
			const chunk_sum = await genSummaryWithSlash(chunks[cid], Number(cid)+1);
			if (chunk_sum.length > 0) {
				chunk_sums.push(chunk_sum);
				cid++;
			} else {
				// popup
		    const result = await getContext().Popup.show.text(
					"Timeline Memory",
					"There was an error generating a summary for chunk #"+Number(cid)+1,
					{okButton: 'Retry', cancelButton: 'Cancel'});
		    if (result != 1) return "";
			}
		}
		// now we have a summary for each chunk, we need to combine them
		final_context = chunk_sums.join("\n\n");
		if (settings.add_chunk_summaries) {
			await runSlashCommand(`/comment at=${mes_id+1} <details class="rmr-summary-chunks"><summary>Chunk Summaries</summary>${final_context}</details>`)
		}
	}
	else {
		oopsToast("No visible chapter content! Skipping summary.");
		return "";
	}
	if (final_context.length > 0) {
		infoToast("Generating chapter summary....");
		const result = await genSummaryWithSlash(final_context);
		// at this point we have a history that we've successfully summarized
		// if chapter hiding is on, we want to hide all the messages we summarized, now
		debug(settings.hide_chapter, memory_history);
		if (settings.hide_chapter) {
			for (const mes of memory_history) {
				chat[mes.index].is_system = true;
				// Also toggle "hidden" state for all visible messages
				const mes_elem = $(`.mes[mesid="${mes.index}"]`);
				debug(mes_elem);
				if (mes_elem.length) mes_elem.attr('is_system', 'true');
			}
			getContext().saveChat();
		}
		return result;
	} else {
		oopsToast("No final content - skipping summary.");
		return "";
	}

}

// Simplified chapter summarization - just creates a summary
export async function summarizeChapter(message, options={}) {
	commandArgs = options;
	const mes_id = Number(message.attr('mesid'));
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
	toggleChapterHighlight($(`.mes[mesid="${mes_id}"] .rmr-button.fa-circle-stop`), mes_id);

	doneToast(`Chapter ${timelineData.length} added to timeline.`);
}

// Alias for backward compatibility
export async function endChapter(message, options={}) {
	return summarizeChapter(message, options);
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

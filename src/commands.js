import { extension_settings, getContext } from "../../../../extensions.js";
import { commonEnumProviders } from '../../../../slash-commands/SlashCommandCommonEnumsProvider.js';
import { enumTypes, SlashCommandEnumValue } from "../../../../slash-commands/SlashCommandEnumValue.js";
import { saveChatConditional, reloadCurrentChat, systemUserName } from "../../../../../script.js";
import { stringToRange, isTrueBoolean } from "../../../../utils.js";
import { endChapter, queryChapter, queryChapters, loadTimelineData, removeChapterFromTimeline, migrateTimelineData, getChapterSummary, resummarizeChapter, runTimelineFill, getTimelineFillResults, getTimelineEntries } from "./memories.js";
import { settings } from "./settings.js";
import { debug } from "./logging.js";
import { toggleChapterHighlight } from "./messages.js";

// it's not exported for me to use, rip
const profilesProvider = () => {
	if (!extension_settings.connectionManager?.profiles) {
		return [new SlashCommandEnumValue('<None>')];
	}
	return [
		new SlashCommandEnumValue('<None>'),
		...extension_settings.connectionManager.profiles.map(p => new SlashCommandEnumValue(p.name, null, enumTypes.name)),
	];
};

function getMesFromInput(value) {
	if (value.length > 0) {
		const mes_id = Number(value);
		if (isNaN(mes_id)) {
			toastr.error(`Invalid message ID: ${value} is not a number.`);
		}
		return $(`.mes[mesid=${mes_id}]`);
	} else {
		const mes_id = getContext().chat.length-1;
		return $(`.mes[mesid=${mes_id}]`);
	}
}

function profileIdFromName(profile_name) {
	if (!extension_settings.connectionManager?.profiles) {
		return '';
	}
	const profile = extension_settings.connectionManager.profiles.find(p => p.name == profile_name);
	if (profile) return profile.id;
	return '';
}

function shouldRegisterTimelineTools() {
	return Boolean(settings?.tools_enabled && settings?.is_enabled !== false);
}


async function removeReasoningBlocks(rangeInput) {
	const context = getContext();
	const chatLog = context.chat;

	if (!rangeInput) {
		toastr.warning('No message range provided. Usage: /remove-reasoning 1-10', 'Timeline Memory');
		return '';
	}

	if (!Array.isArray(chatLog) || chatLog.length === 0) {
		toastr.info('No messages in chat to process.', 'Timeline Memory');
		return '';
	}

	try {
		const range = stringToRange(rangeInput.trim(), 0, chatLog.length - 1);
		if (!range) {
			toastr.error('Invalid range format. Use a single ID (e.g., 5) or range (e.g., 1-10)', 'Timeline Memory');
			return '';
		}

		let removedCount = 0;
		let skippedCount = 0;

		for (let i = range.start; i <= range.end; i++) {
			const message = chatLog[i];
			if (!message) {
				continue;
			}

			if (message.is_user) {
				skippedCount++;
				continue;
			}

			const hasReasoning = message.extra?.reasoning !== undefined;
			if (hasReasoning) {
				delete message.extra.reasoning;
				delete message.extra.reasoning_duration;
				delete message.extra.reasoning_type;

				const messageBlock = $(`.mes[mesid="${i}"]`);
				if (messageBlock.length) {
					messageBlock.find('.mes_reasoning_details').remove();
					messageBlock.find('.mes_reasoning').remove();
				}

				removedCount++;
			}
		}

		if (removedCount > 0) {
			await saveChatConditional();
			await reloadCurrentChat();
			toastr.success(`Removed reasoning blocks from ${removedCount} message${removedCount === 1 ? '' : 's'}`, 'Timeline Memory');
		} else {
			toastr.info('No reasoning blocks found in the specified range.', 'Timeline Memory');
		}

		if (skippedCount > 0) {
			toastr.info(`Skipped ${skippedCount} user message${skippedCount === 1 ? '' : 's'}`, 'Timeline Memory');
		}

		return `Removed ${removedCount} reasoning block${removedCount === 1 ? '' : 's'}`;
	} catch (error) {
		debug('Error removing reasoning blocks:', error);
		toastr.error('Failed to remove reasoning blocks.', 'Timeline Memory');
		return '';
	}
}

async function removeToolCalls() {
	const context = getContext();
	const chatLog = context.chat;

	if (!Array.isArray(chatLog) || chatLog.length === 0) {
		const message = 'No messages in chat to process.';
		toastr.info(message, 'Timeline Memory');
		return message;
	}

	const indicesToRemove = new Set();

	for (let i = 0; i < chatLog.length; i++) {
		const message = chatLog[i];
		if (!message) {
			continue;
		}

		const isToolMessage =
			message.extra?.tool_invocations !== undefined ||
			(message.is_system && message.name === systemUserName && message.mes?.includes('Tool calls:')) ||
			(message.extra?.isSmallSys === true && message.mes?.includes('Tool calls:'));

		if (isToolMessage) {
			indicesToRemove.add(i);

			if (i > 0) {
				const previousMessage = chatLog[i - 1];
				if (previousMessage && previousMessage.is_user === false && !previousMessage.is_system) {
					const isSpecialSystemMessage = previousMessage.extra?.type === 'narrator' || previousMessage.name === systemUserName;
					if (!isSpecialSystemMessage) {
						indicesToRemove.add(i - 1);
					}
				}
			}
		}
	}

	if (indicesToRemove.size === 0) {
		const message = 'No tool call messages found in the chat.';
		toastr.info(message, 'Timeline Memory');
		return message;
	}

	const sortedIndices = Array.from(indicesToRemove).sort((a, b) => b - a);
	for (const index of sortedIndices) {
		chatLog.splice(index, 1);
	}

	await saveChatConditional();
	await reloadCurrentChat();

	const removedCount = sortedIndices.length;
	const statusMessage = `Removed ${removedCount} message${removedCount === 1 ? '' : 's'} (tool calls and related assistant messages).`;
	toastr.success(statusMessage, 'Timeline Memory');
	return statusMessage;
}


// Register tool/function call for chapter queries
function registerChapterQueryTool() {
	const context = getContext();
	if (!context.ToolManager) return;

	// Clear stale definitions before re-registering
	context.ToolManager.unregisterFunctionTool('query_timeline_chapter');
	context.ToolManager.unregisterFunctionTool('query_timeline_chapters');

	if (!shouldRegisterTimelineTools()) return;

	context.ToolManager.registerFunctionTool({
		name: 'query_timeline_chapter',
		displayName: 'Query Timeline Chapter',
		description: 'Query a specific chapter from the chat timeline with a question',
		stealth: false,  // Keep visible tool results and allow the model to follow up
		parameters: {
			type: 'object',
			properties: {
				chapterNumber: {
					type: 'integer',
					description: 'The chapter number to query (1-based index)',
					minimum: 1
				},
				query: {
					type: 'string',
					description: 'The question to ask about the chapter'
				}
			},
			required: ['chapterNumber', 'query']
		},
		action: async (args) => {
			loadTimelineData(); // Ensure timeline is loaded
			const result = await queryChapter(args.chapterNumber, args.query);
			return result;
		},
		shouldRegister: shouldRegisterTimelineTools,
		formatMessage: (args) => {
			return `Querying chapter ${args.chapterNumber} with: "${args.query}"`;
		}
	});

	// Register the multiple chapters query tool
	context.ToolManager.registerFunctionTool({
		name: 'query_timeline_chapters',
		displayName: 'Query Timeline Chapters',
		description: 'Query multiple chapters from the chat timeline with a question',
		stealth: false,
		parameters: {
			type: 'object',
			properties: {
				startChapter: {
					type: 'integer',
					description: 'The starting chapter number (1-based index, inclusive)',
					minimum: 1
				},
				endChapter: {
					type: 'integer',
					description: 'The ending chapter number (1-based index, inclusive)',
					minimum: 1
				},
				query: {
					type: 'string',
					description: 'The question to ask about the chapters'
				}
			},
			required: ['startChapter', 'endChapter', 'query']
		},
		action: async (args) => {
			loadTimelineData(); // Ensure timeline is loaded
			const result = await queryChapters(args.startChapter, args.endChapter, args.query);
			return result;
		},
		shouldRegister: shouldRegisterTimelineTools,
		formatMessage: (args) => {
			const range = args.startChapter === args.endChapter 
				? `chapter ${args.startChapter}` 
				: `chapters ${args.startChapter}-${args.endChapter}`;
			return `Querying ${range} with: "${args.query}"`;
		}
	});
}

export function loadSlashCommands() {
	const parser = getContext().SlashCommandParser;
	const command = getContext().SlashCommand;
	const commandArg = getContext().SlashCommandArgument;
	const namedArg = getContext().SlashCommandNamedArgument;
	const arg_types = getContext().ARGUMENT_TYPE;

	// Register the tool/function call
	registerChapterQueryTool();

	// Register main chapter-end command
	parser.addCommandObject(command.fromProps({
		name: 'arc-analyze',
		callback: async (args) => {
			try {
				const { analyzeArcs } = await import('./memories.js');
				let overrideProfile = undefined;
				if (args.profile !== undefined) {
					overrideProfile = profileIdFromName(args.profile);
				}
				await analyzeArcs(overrideProfile);
				return '';
			} catch (err) {
				console.error('Arc Analyze command failed:', err);
				return '';
			}
		},
		namedArgumentList: [
			namedArg.fromProps({
				name: 'profile',
				description: 'Name of a connection profile to override the analyzer profile',
				enumProvider: profilesProvider,
				isRequired: false,
			}),
		],
		helpString: 'Analyze the chat history to propose arc endpoints and show them in a popup.',
	}));

	parser.addCommandObject(command.fromProps({
		name: 'chapter-end',
		callback: (args, value) => {
			const message = getMesFromInput(value);
			if (message) {
				if (args.profile !== undefined) {
					args.profile = profileIdFromName(args.profile);
				}
				endChapter(message, args);
			}
		},
		unnamedArgumentList: [
			commandArg.fromProps({
				description: 'message index (starts with 0)',
				typeList: [arg_types.NUMBER],
				isRequired: false,
				enumProvider: commonEnumProviders.messages(),
			}),
		],
		namedArgumentList: [
			namedArg.fromProps({
				name: 'mode',
				description: 'override summarization mode for chapter endings',
				typeList: [arg_types.STRING],
				isRequired: false,
				enumList: [
					new SlashCommandEnumValue('none', "don't summarize"),
					new SlashCommandEnumValue('message', 'add summary to chat'),
					new SlashCommandEnumValue('memory', 'create memory entry with summary'),
				],
			}),
			namedArg.fromProps({
				name: 'title',
				description: 'comment/title for the memory entry. only used when chapter end mode is `memory`',
				typeList: [arg_types.STRING],
				isRequired: false,
			}),
			namedArg.fromProps({
				name: 'popup',
				description: 'override the "popup memory" setting. only used when chapter end mode is `memory`',
				typeList: [arg_types.BOOLEAN],
				isRequired: false,
			}),
			namedArg.fromProps({
				name: 'profile',
				description: 'name of a connection profile to override the current one',
				enumProvider: profilesProvider,
				isRequired: false,
			}),
		],
		helpString: 'Marks the message as a chapter endpoint and generates a summary from the previous endpoint. Defaults to the most recent message if no ID is provided.',
	}));

	// Register scene-end as alias for backward compatibility
	parser.addCommandObject(command.fromProps({
		name: 'scene-end',
		callback: (args, value) => {
			const message = getMesFromInput(value);
			if (message) {
				if (args.profile !== undefined) {
					args.profile = profileIdFromName(args.profile);
				}
				endChapter(message, args);
			}
		},
		unnamedArgumentList: [
			commandArg.fromProps({
				description: 'message index (starts with 0)',
				typeList: [arg_types.NUMBER],
				isRequired: false,
				enumProvider: commonEnumProviders.messages(),
			}),
		],
		namedArgumentList: [
			namedArg.fromProps({
				name: 'mode',
				description: 'override summarization mode for chapter endings',
				typeList: [arg_types.STRING],
				isRequired: false,
				enumList: [
					new SlashCommandEnumValue('none', "don't summarize"),
					new SlashCommandEnumValue('message', 'add summary to chat'),
					new SlashCommandEnumValue('memory', 'create memory entry with summary'),
				],
			}),
			namedArg.fromProps({
				name: 'title',
				description: 'comment/title for the memory entry. only used when chapter end mode is `memory`',
				typeList: [arg_types.STRING],
				isRequired: false,
			}),
			namedArg.fromProps({
				name: 'popup',
				description: 'override the "popup memory" setting. only used when chapter end mode is `memory`',
				typeList: [arg_types.BOOLEAN],
				isRequired: false,
			}),
			namedArg.fromProps({
				name: 'profile',
				description: 'name of a connection profile to override the current one',
				enumProvider: profilesProvider,
				isRequired: false,
			}),
		],
		helpString: '(Deprecated alias for /chapter-end) Marks the message as a chapter endpoint and generates a summary from the previous endpoint.',
	}));

	parser.addCommandObject(command.fromProps({
		name: 'timeline-query',
		callback: async (args, value) => {
			if (!args.chapter || !value) {
				toastr.error('Chapter number and query are required', 'Timeline Memory');
				return '';
			}
			loadTimelineData();
			const result = await queryChapter(parseInt(args.chapter), value);
			return result;
		},
		unnamedArgumentList: [
			commandArg.fromProps({
				description: 'The question to ask about the chapter',
				typeList: [arg_types.STRING],
				isRequired: true,
			}),
		],
		namedArgumentList: [
			namedArg.fromProps({
				name: 'chapter',
				description: 'Chapter number to query (1-based)',
				typeList: [arg_types.NUMBER],
				isRequired: true,
			}),
		],
		helpString: 'Query a specific chapter from the timeline with a question.',
	}));

	parser.addCommandObject(command.fromProps({
		name: 'timeline-query-chapters',
		callback: async (args, value) => {
			if (!args.start || !args.end || !value) {
				toastr.error('Start chapter, end chapter, and query are required', 'Timeline Memory');
				return '';
			}
			loadTimelineData();
			const result = await queryChapters(parseInt(args.start), parseInt(args.end), value);
			return result;
		},
		unnamedArgumentList: [
			commandArg.fromProps({
				description: 'The question to ask about the chapters',
				typeList: [arg_types.STRING],
				isRequired: true,
			}),
		],
		namedArgumentList: [
			namedArg.fromProps({
				name: 'start',
				description: 'Starting chapter number (1-based, inclusive)',
				typeList: [arg_types.NUMBER],
				isRequired: true,
			}),
			namedArg.fromProps({
				name: 'end',
				description: 'Ending chapter number (1-based, inclusive)',
				typeList: [arg_types.NUMBER],
				isRequired: true,
			}),
		],
		helpString: 'Query a range of chapters from the timeline with a question.',
	}));

	parser.addCommandObject(command.fromProps({
		name: 'timeline-fill',
		callback: async (args) => {
			const shouldAwait = isTrueBoolean(args?.await);

			const executeFill = async () => {
				try {
					let profileOverride;
					if (args.profile !== undefined) {
						profileOverride = profileIdFromName(args.profile);
						if (!profileOverride) {
							toastr.error(`Profile "${args.profile}" not found.`, 'Timeline Memory');
							return;
						}
					}

					const results = await runTimelineFill({ profileOverride, quiet: true });
					const successCount = results.filter(result => !result.error).length;
					const errorCount = results.length - successCount;

					if (results.length === 0) {
						toastr.info('Timeline fill finished with no queries to run.', 'Timeline Memory');
					} else if (errorCount === 0) {
						toastr.success(`Timeline fill stored ${successCount} result${successCount === 1 ? '' : 's'} in {{timelineResponses}}.`, 'Timeline Memory');
					} else {
						toastr.warning(`Timeline fill stored ${successCount} result${successCount === 1 ? '' : 's'}; ${errorCount} errored. Check console for details.`, 'Timeline Memory');
					}
				} catch (error) {
					console.error('Timeline fill command failed:', error);
					toastr.error(error?.message || 'Timeline fill failed.', 'Timeline Memory');
				}
			};

			const promise = executeFill();

			if (shouldAwait) {
				await promise;
			}

			return '';
		},
		namedArgumentList: [
			namedArg.fromProps({
				name: 'profile',
				description: 'Name of a connection profile to override the timeline fill profile',
				enumProvider: profilesProvider,
				isRequired: false,
			}),
			namedArg.fromProps({
				name: 'await',
				description: 'Await completion before running subsequent slash commands',
				typeList: [arg_types.BOOLEAN],
				isRequired: false,
				defaultValue: 'false',
			}),
		],
		helpString: 'Generate timeline queries via the configured profile, execute them, and store results in {{timelineResponses}}.',
	}));

	parser.addCommandObject(command.fromProps({
		name: 'timeline-fill-status',
		callback: () => {
			const results = getTimelineFillResults();
			if (!results.length) {
				toastr.info('No timeline fill results stored.', 'Timeline Memory');
				return '';
			}

			const preview = results.slice(0, 5).map((entry, index) => {
				const range = entry.startChapter === entry.endChapter
					? `Chapter ${entry.startChapter}`
					: `Chapters ${entry.startChapter}-${entry.endChapter}`;
				const status = entry.error ? '⚠️' : '✅';
				const truncatedQuery = entry.query.length > 80 ? `${entry.query.substring(0, 77)}…` : entry.query;
				return `${status} ${index + 1}. ${range}: ${truncatedQuery}`;
			}).join('\n');

			toastr.info(preview, 'Timeline Memory');
			if (results.length > 5) {
				toastr.info(`Showing first 5 of ${results.length} stored results.`, 'Timeline Memory');
			}
			debug('Timeline fill status results:', results);
			return '';
		},
		helpString: 'Preview stored timeline fill results without using the macro.',
	}));

	parser.addCommandObject(command.fromProps({
		name: 'timeline-undo',
		callback: (args, value) => {
			const message = getMesFromInput(value);
			if (message) {
				const mes_id = Number(message.attr('mesid'));
				const chat = getContext().chat;

				// Check if this message is marked as a chapter end
				if (!chat[mes_id]?.extra?.rmr_chapter) {
					toastr.warning('This message is not marked as a chapter end', 'Timeline Memory');
					return;
				}

				// Remove from timeline
				const removed = removeChapterFromTimeline(mes_id);

				// Remove the chapter end marker
				chat[mes_id].extra.rmr_chapter = false;
				getContext().saveChat();

				// Update the button if visible
				const button = $(`.mes[mesid="${mes_id}"] .rmr-button.rmr-chapter-point`);
				if (button.length) {
					toggleChapterHighlight(button, mes_id);
				}

				if (removed) {
					toastr.success(`Chapter ${removed.summary.substring(0, 50)}... removed from timeline`, 'Timeline Memory');
				}
			}
		},
		unnamedArgumentList: [
			commandArg.fromProps({
				description: 'message index of the chapter end to undo (starts with 0)',
				typeList: [arg_types.NUMBER],
				isRequired: false,
				enumProvider: commonEnumProviders.messages(),
			}),
		],
		helpString: 'Removes a chapter end marker and its timeline entry. Defaults to the most recent message if no ID is provided.',
	}));

	parser.addCommandObject(command.fromProps({
		name: 'timeline-remove',
		aliases: ['chapter-remove', 'remove-chapter'],
		callback: (args, value) => {
			loadTimelineData();
			const timeline = getTimelineEntries();
			const input = args.chapter ?? value;

			if (!timeline.length) {
				toastr.warning('No chapters in the timeline to remove', 'Timeline Memory');
				return '';
			}

			if (input === undefined || input === null || input === '') {
				toastr.error('Chapter number is required', 'Timeline Memory');
				return '';
			}

			const chapterNumber = parseInt(input);
			if (isNaN(chapterNumber)) {
				toastr.error('Invalid chapter number', 'Timeline Memory');
				return '';
			}

			if (chapterNumber < 1 || chapterNumber > timeline.length) {
				toastr.error(`Chapter ${chapterNumber} is out of range (1-${timeline.length})`, 'Timeline Memory');
				return '';
			}

			const chapter = timeline[chapterNumber - 1];
			const removed = removeChapterFromTimeline(chapter.endMsgId);

			if (!removed) {
				toastr.error('Failed to remove the chapter from the timeline', 'Timeline Memory');
				return '';
			}

			const chat = getContext().chat;
			if (chat?.[chapter.endMsgId]?.extra?.rmr_chapter) {
				chat[chapter.endMsgId].extra.rmr_chapter = false;
				getContext().saveChat();
			}

			const button = $(`.mes[mesid="${chapter.endMsgId}"] .rmr-button.rmr-chapter-point`);
			if (button.length) {
				toggleChapterHighlight(button, chapter.endMsgId);
			}

			toastr.success(`Chapter ${chapterNumber} removed from the timeline`, 'Timeline Memory');
			return `Removed chapter ${chapterNumber}`;
		},
		unnamedArgumentList: [
			commandArg.fromProps({
				description: 'Chapter number to remove (1-based)',
				typeList: [arg_types.NUMBER],
				isRequired: false,
			}),
		],
		namedArgumentList: [
			namedArg.fromProps({
				name: 'chapter',
				description: 'Chapter number to remove (1-based)',
				typeList: [arg_types.NUMBER],
				isRequired: false,
			}),
		],
		helpString: 'Force removes a chapter entry from the timeline by number, even if the chat marker is missing.',
	}));

	parser.addCommandObject(command.fromProps({
		name: 'timeline-migrate',
		callback: (args, value) => {
			loadTimelineData();
			const result = migrateTimelineData();
			
			if (result.convertedFromPlaintext) {
				toastr.success(`Successfully converted ${result.migrated} timeline entries from plaintext to JSON format`, 'Timeline Memory');
			} else if (result.hadTimestamps) {
				toastr.success(`Successfully migrated ${result.migrated} timeline entries to the new format`, 'Timeline Memory');
			} else if (result.convertedSceneToChapter) {
				toastr.success(`Successfully converted scene markers to chapter markers in chat`, 'Timeline Memory');
			} else if (result.migrated === 0) {
				toastr.info('No migration needed - timeline entries are already in the current format', 'Timeline Memory');
			} else {
				toastr.warning('No timeline entries found to migrate', 'Timeline Memory');
			}
			
			return `Migrated ${result.migrated} entries`;
		},
		helpString: 'Migrate old timeline entries to the new JSON format. Converts plaintext format including scene->chapter terminology to structured JSON and removes timestamps from legacy entries.',
	}));

	parser.addCommandObject(command.fromProps({
		name: 'chapter-summary',
		callback: (args, value) => {
			loadTimelineData();
			const chapterNumber = parseInt(value);
			if (isNaN(chapterNumber)) {
				toastr.error('Invalid chapter number', 'Timeline Memory');
				return '';
			}
			const summary = getChapterSummary(chapterNumber);
			if (!summary) {
				toastr.error(`Chapter ${chapterNumber} not found`, 'Timeline Memory');
				return '';
			}
			return summary;
		},
		unnamedArgumentList: [
			commandArg.fromProps({
				description: 'The chapter number to get the summary for (1-based)',
				typeList: [arg_types.NUMBER],
				isRequired: true,
			}),
		],
		helpString: 'Get the summary of a specific chapter from the timeline.',
	}));

	parser.addCommandObject(command.fromProps({
		name: 'resummarize',
		callback: async (args) => {
			if (!args.chapter) {
				toastr.error('Chapter number is required', 'Timeline Memory');
				return '';
			}

			const chapterNumber = parseInt(args.chapter);
			if (isNaN(chapterNumber)) {
				toastr.error('Invalid chapter number', 'Timeline Memory');
				return '';
			}

			if (args.profile !== undefined) {
				args.profile = profileIdFromName(args.profile);
			}

			loadTimelineData();
			const summary = await resummarizeChapter(chapterNumber, args);
			return summary;
		},
		namedArgumentList: [
			namedArg.fromProps({
				name: 'chapter',
				description: 'Chapter number to re-summarize (1-based)',
				typeList: [arg_types.NUMBER],
				isRequired: true,
			}),
			namedArg.fromProps({
				name: 'profile',
				description: 'Name of a connection profile to override the current one',
				enumProvider: profilesProvider,
				isRequired: false,
			}),
			namedArg.fromProps({
				name: 'quiet',
				description: 'Suppress toast notifications for this command',
				typeList: [arg_types.BOOLEAN],
				isRequired: false,
			}),
		],
		helpString: 'Regenerate the summary for an existing chapter without altering its position in the timeline.',
	}));

	parser.addCommandObject(command.fromProps({
		name: 'remove-reasoning',
		aliases: ['removereasoning', 'remreason'],
		callback: async (args, value) => removeReasoningBlocks(value),
		unnamedArgumentList: [
			commandArg.fromProps({
				description: 'Message ID or range (e.g., 5 or 1-10)',
				typeList: [arg_types.STRING],
				isRequired: true,
			}),
		],
		helpString: 'Removes thinking/reasoning blocks from the specified message range.',
		returns: 'Status message about removed reasoning blocks',
	}));

	parser.addCommandObject(command.fromProps({
		name: 'remove-tool-calls',
		aliases: ['rtc', 'removetoolcalls'],
		callback: async () => removeToolCalls(),
		helpString: 'Removes all tool call results and their invoking assistant messages from the chat history.',
		returns: 'Status message indicating how many messages were removed',
	}));

}

// Update tool registration when settings change
export function updateToolRegistration() {
	const context = getContext();
	if (!context.ToolManager) return;
	
	// Check if settings is initialized before accessing it
	if (!settings) return;

	if (shouldRegisterTimelineTools()) {
		registerChapterQueryTool();
	} else {
		context.ToolManager.unregisterFunctionTool('query_timeline_chapter');
		context.ToolManager.unregisterFunctionTool('query_timeline_chapters');
	}
}

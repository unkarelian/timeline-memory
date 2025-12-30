import { eventSource, event_types, saveChatConditional, reloadCurrentChat, swipe_right } from "../../../../script.js";
import { getContext } from "../../../extensions.js";
import { loadSlashCommands, updateToolRegistration } from "./src/commands.js";
import { addMessageButtons, resetMessageButtons } from "./src/messages.js";
import { loadSettings, changeCharaName, renderSummariesList, settings } from "./src/settings.js";
import { initTimelineMacro, loadTimelineData, resetTimelineFillResults, updateTimelineInjection, resetArcSessionState, checkAutoSummarize } from "./src/memories.js";
import { showRetrievalProgress, hideRetrievalProgress } from "./src/retrieval-progress.js";
import { loadUITranslations } from "./src/locales.js";

export const extension_name = 'timeline-memory';

const extensionBasePath = new URL('.', import.meta.url).pathname.replace(/\/$/, '');

export const extension_path = extensionBasePath.replace(/^\//, '');

export function getExtensionAssetPath(relativePath = '') {
	const sanitized = relativePath.replace(/^\/+/, '');
	return sanitized ? `${extensionBasePath}/${sanitized}` : extensionBasePath;
}

export let STVersion;


function onMessageRendered(mes_id) {
	let message = $('.mes[mesid="'+mes_id+'"]');
	addMessageButtons(message);
}

function checkVersion(version_string) {
	let ver = version_string.pkgVersion.split('.').map(x=>Number(x));
	if (ver[1] < 13) return false;
	else return true;
}

export function updateQuickReplyButtonsLocation() {
	const buttons = $('.rmr-quick-reply-btn');
	const icons = $('.rmr-btn-icon');
	const extensionsMenu = $('#extensionsMenu');
	const rightSendForm = $('#rightSendForm');
	const sendButton = rightSendForm.find('#send_but');

	// Ensure our container exists in extensions menu
	let extContainer = $('#rmr_timeline_wand_container');
	if (!extContainer.length && extensionsMenu.length) {
		extContainer = $('<div id="rmr_timeline_wand_container" class="extension_container"></div>');
		extensionsMenu.append(extContainer);
	}

	if (settings.quick_reply_buttons_location === 'extensions_menu') {
		// Add standard SillyTavern extension menu classes
		buttons.addClass('list-group-item flex-container flexGap5');
		icons.addClass('extensionsMenuExtensionButton');
		// Move buttons to extensions menu
		if (extContainer.length) {
			buttons.detach().appendTo(extContainer);
			extContainer.show();
		}
	} else {
		// Remove extension menu classes for send form
		buttons.removeClass('list-group-item flex-container flexGap5');
		icons.removeClass('extensionsMenuExtensionButton');
		// Move buttons back to send form (default)
		if (sendButton.length) {
			const retrieveAndSwipeBtn = $('#rmr-retrieve-swipe').detach();
			const retrieveAndSendBtn = $('#rmr-retrieve-send').detach();
			retrieveAndSwipeBtn.insertBefore(sendButton);
			retrieveAndSendBtn.insertBefore(retrieveAndSwipeBtn);
		}
		if (extContainer.length) {
			extContainer.hide();
		}
	}
}

function initQuickReplyButtons() {
	const rightSendForm = $('#rightSendForm');
	if (!rightSendForm.length) return;

	// Remove existing buttons if any (in case of re-initialization)
	rightSendForm.find('.rmr-quick-reply-btn').remove();

	// Retrieve and Send button
	const retrieveAndSendBtn = $(`
		<div id="rmr-retrieve-send"
			class="rmr-quick-reply-btn interactable"
			title="Retrieve and Send - Send message with timeline context"
			data-i18n="[title]Retrieve and Send - Send message with timeline context"
			tabindex="0"
			role="button"
			aria-label="Retrieve and Send">
			<div class="fa-solid fa-comment-dots rmr-btn-icon"></div>
			<span class="rmr-btn-text" data-i18n="rmr_retrieve_send">Retrieve and Send</span>
		</div>
	`);

	// Retrieve and Swipe button
	const retrieveAndSwipeBtn = $(`
		<div id="rmr-retrieve-swipe"
			class="rmr-quick-reply-btn interactable"
			title="Retrieve and Swipe - Refresh with timeline context"
			data-i18n="[title]Retrieve and Swipe - Refresh with timeline context"
			tabindex="0"
			role="button"
			aria-label="Retrieve and Swipe">
			<div class="fa-solid fa-rotate rmr-btn-icon"></div>
			<span class="rmr-btn-text" data-i18n="rmr_retrieve_swipe">Retrieve and Swipe</span>
		</div>
	`);

	// Insert before the send button
	const sendButton = rightSendForm.find('#send_but');
	if (sendButton.length) {
		retrieveAndSwipeBtn.insertBefore(sendButton);
		retrieveAndSendBtn.insertBefore(retrieveAndSwipeBtn);
	} else {
		// Fallback: append to rightSendForm
		rightSendForm.append(retrieveAndSendBtn);
		rightSendForm.append(retrieveAndSwipeBtn);
	}

	// Click handler for Retrieve and Send
	retrieveAndSendBtn.on('click', async () => {
		if (retrieveAndSendBtn.hasClass('disabled')) return;
		retrieveAndSendBtn.addClass('disabled');
		// Change icon to spinning gear
		const sendIcon = retrieveAndSendBtn.find('.rmr-btn-icon');
		sendIcon.removeClass('fa-comment-dots').addClass('fa-gear fa-spin');
		// Only show progress UI for non-agentic mode
		const showProgress = !settings.agentic_timeline_fill_enabled;
		if (showProgress) showRetrievalProgress('analysis');
		try {
			await getContext().executeSlashCommandsWithOptions('/send {{input}} | /setinput | /timeline-fill await=true | /trigger |');
		} catch (err) {
			console.error('Timeline Memory: Retrieve and Send failed:', err);
			toastr.error('Retrieve and Send failed: ' + err.message, 'Timeline Memory');
		} finally {
			if (showProgress) hideRetrievalProgress();
			// Restore original icon
			sendIcon.removeClass('fa-gear fa-spin').addClass('fa-comment-dots');
			retrieveAndSendBtn.removeClass('disabled');
		}
	});

	// Click handler for Retrieve and Swipe
	retrieveAndSwipeBtn.on('click', async () => {
		if (retrieveAndSwipeBtn.hasClass('disabled')) return;
		retrieveAndSwipeBtn.addClass('disabled');
		// Change icon to spinning gear
		const swipeIcon = retrieveAndSwipeBtn.find('.rmr-btn-icon');
		swipeIcon.removeClass('fa-rotate').addClass('fa-gear fa-spin');
		// Only show progress UI for non-agentic mode
		const showProgress = !settings.agentic_timeline_fill_enabled;
		if (showProgress) showRetrievalProgress('analysis');

		const context = getContext();
		const chat = context.chat;
		const lastMessageId = chat.length - 1;

		try {
			// Step 1: Hide the last message programmatically
			if (lastMessageId >= 0 && chat[lastMessageId]) {
				chat[lastMessageId].is_system = true;
				// Update DOM
				$(`.mes[mesid="${lastMessageId}"]`).attr('is_system', 'true');
				await saveChatConditional();
			}

			// Step 2: Run timeline-fill (agentic mode will await completion)
			await context.executeSlashCommandsWithOptions('/timeline-fill await=true');

			// Step 3: Unhide the last message
			if (lastMessageId >= 0 && chat[lastMessageId]) {
				chat[lastMessageId].is_system = false;
				$(`.mes[mesid="${lastMessageId}"]`).attr('is_system', 'false');
				await saveChatConditional();
			}

			// Step 4: Reload chat to ensure fresh state
			await reloadCurrentChat();

			// Step 5: Wait for UI to fully settle after reload
			await new Promise(resolve => setTimeout(resolve, 5000));

			// Step 6: Trigger swipe
			await swipe_right();
		} catch (err) {
			console.error('Timeline Memory: Retrieve and Swipe failed:', err);
			toastr.error('Retrieve and Swipe failed: ' + err.message, 'Timeline Memory');
		} finally {
			if (showProgress) hideRetrievalProgress();
			// Restore original icon
			swipeIcon.removeClass('fa-gear fa-spin').addClass('fa-rotate');
			retrieveAndSwipeBtn.removeClass('disabled');
		}
	});

	// Keyboard shortcut: Shift+Enter to trigger Retrieve and Send
	$('#send_textarea').on('keydown', (e) => {
		if (settings.shift_enter_hotkey_enabled && e.shiftKey && e.key === 'Enter') {
			e.preventDefault();
			e.stopPropagation();
			retrieveAndSendBtn.trigger('click');
		}
	});

	// Apply initial location based on setting
	updateQuickReplyButtonsLocation();
}

jQuery(() => {
	// Register event handlers synchronously to avoid race conditions with APP_READY
	eventSource.on(event_types.APP_READY, async () => {
		const res = await fetch('/version');
		STVersion = await res.json();
		if (checkVersion(STVersion) !== true) {
			toastr.error("SillyTavern version is incompatible! Please update to the latest release.", "Timeline Memory");
			throw new Error("Timeline Memory: SillyTavern version is incompatible! Please update to the latest release.");
		}
		// Load UI translations before settings panel
		await loadUITranslations();
		loadSettings();
		initTimelineMacro();
		loadSlashCommands();
		// Initialize timeline injection after settings are loaded
		updateTimelineInjection();
		// Initialize quick reply buttons in send form
		initQuickReplyButtons();
	});
	eventSource.on(event_types.USER_MESSAGE_RENDERED, (mesId) => onMessageRendered(mesId));
	eventSource.on(event_types.CHARACTER_MESSAGE_RENDERED, async (mesId) => {
		onMessageRendered(mesId);
		// Check if auto-summarize should trigger
		await checkAutoSummarize();
	});
	eventSource.on(event_types.CHAT_CHANGED, async (chatId) => {
		if (!chatId) return;

		// SAFETY: Check for conflicting session metadata before recovery
		// If both sessions have metadata, that's an error state - clear both to prevent corruption
		const context = getContext();
		const hasLoreMetadata = context.chatMetadata?.lore_management_session?.active;
		const hasAgenticMetadata = context.chatMetadata?.agentic_timeline_fill_session?.active;

		if (hasLoreMetadata && hasAgenticMetadata) {
			console.error('Timeline Memory: Both lore management and agentic timeline fill have active metadata - clearing both to prevent corruption');
			toastr.error('Conflicting session states detected - clearing both. Chat backup should be available.', 'Timeline Memory');
			delete context.chatMetadata.lore_management_session;
			delete context.chatMetadata.agentic_timeline_fill_session;
			await saveChatConditional();
			// Skip recovery for both - let the backup be the safety net
		} else {
			// Abort any active lore management session when chat changes to a DIFFERENT chat
			// Also check for and recover from interrupted sessions (e.g., page refresh)
			try {
				const { abortLoreManagementSession, isLoreManagementActive, getSessionChatId, recoverInterruptedSession } = await import('./src/lore-management.js');
				if (isLoreManagementActive()) {
					// Only abort if we're switching to a different chat
					// (CHAT_CHANGED also fires during save/reload of the same chat)
					const sessionChatId = getSessionChatId();
					if (sessionChatId && chatId !== sessionChatId) {
						await abortLoreManagementSession();
					}
				} else {
					// Check for interrupted session that needs recovery
					await recoverInterruptedSession();
				}
			} catch (err) {
				// Module might not be loaded yet, ignore
			}
			// Handle agentic timeline fill session recovery/abort
			try {
				const {
					abortAgenticTimelineFillSession,
					isAgenticTimelineFillActive,
					getSessionChatId: getAgenticSessionChatId,
					recoverInterruptedSession: recoverAgenticSession
				} = await import('./src/agentic-timeline-fill.js');
				if (isAgenticTimelineFillActive()) {
					// Only abort if we're switching to a different chat
					const sessionChatId = getAgenticSessionChatId();
					if (sessionChatId && chatId !== sessionChatId) {
						await abortAgenticTimelineFillSession();
					}
				} else {
					// Check for interrupted session that needs recovery
					await recoverAgenticSession();
				}
			} catch (err) {
				// Module might not be loaded yet, ignore
			}
		}
		// Reset arc analyzer session state when chat changes
		resetArcSessionState();
		loadTimelineData();
		resetMessageButtons();
		renderSummariesList();
	});
	eventSource.on(event_types.MESSAGE_SENT, resetTimelineFillResults);
	eventSource.on(event_types.MORE_MESSAGES_LOADED, resetMessageButtons);
	eventSource.on(event_types.CHARACTER_RENAMED, changeCharaName);

	// Update tool registration when settings change
	eventSource.on(event_types.EXTENSION_SETTINGS_LOADED, () => {
		if (STVersion) updateToolRegistration();
	});
});

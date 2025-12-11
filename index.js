import { eventSource, event_types, saveChatConditional, reloadCurrentChat, swipe_right } from "../../../../script.js";
import { getContext } from "../../../extensions.js";
import { loadSlashCommands, updateToolRegistration } from "./src/commands.js";
import { addMessageButtons, resetMessageButtons } from "./src/messages.js";
import { loadSettings, changeCharaName, renderSummariesList, settings } from "./src/settings.js";
import { initTimelineMacro, loadTimelineData, resetTimelineFillResults, updateTimelineInjection, resetArcSessionState } from "./src/memories.js";
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

function initQuickReplyButtons() {
	const rightSendForm = $('#rightSendForm');
	if (!rightSendForm.length) return;

	// Remove existing buttons if any (in case of re-initialization)
	rightSendForm.find('.rmr-quick-reply-btn').remove();

	// Retrieve and Send button
	const retrieveAndSendBtn = $(`
		<div id="rmr-retrieve-send"
			class="fa-solid fa-comment-dots rmr-quick-reply-btn interactable"
			title="Retrieve and Send - Send message with timeline context"
			tabindex="0">
		</div>
	`);

	// Retrieve and Swipe button
	const retrieveAndSwipeBtn = $(`
		<div id="rmr-retrieve-swipe"
			class="fa-solid fa-rotate rmr-quick-reply-btn interactable"
			title="Retrieve and Swipe - Refresh with timeline context"
			tabindex="0">
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
		retrieveAndSendBtn.removeClass('fa-comment-dots').addClass('fa-gear fa-spin');
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
			retrieveAndSendBtn.removeClass('fa-gear fa-spin').addClass('fa-comment-dots');
			retrieveAndSendBtn.removeClass('disabled');
		}
	});

	// Click handler for Retrieve and Swipe
	retrieveAndSwipeBtn.on('click', async () => {
		if (retrieveAndSwipeBtn.hasClass('disabled')) return;
		retrieveAndSwipeBtn.addClass('disabled');
		// Change icon to spinning gear
		retrieveAndSwipeBtn.removeClass('fa-rotate').addClass('fa-gear fa-spin');
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
			retrieveAndSwipeBtn.removeClass('fa-gear fa-spin').addClass('fa-rotate');
			retrieveAndSwipeBtn.removeClass('disabled');
		}
	});
}

jQuery(async () => {
	const res = await fetch('/version');
	STVersion = await res.json();
	if (checkVersion(STVersion)===true) {
		eventSource.on(event_types.APP_READY, async () => {
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
		eventSource.on(event_types.USER_MESSAGE_RENDERED, (mesId)=>onMessageRendered(mesId));
		eventSource.on(event_types.CHARACTER_MESSAGE_RENDERED, (mesId)=>onMessageRendered(mesId));
		eventSource.on(event_types.CHAT_CHANGED, async (chatId)=>{
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
	}
	else {
		toastr.error("SillyTavern version is incompatible! Please update to the latest release.", "Timeline Memory");
		throw new Error("Timeline Memory: SillyTavern version is incompatible! Please update to the latest release.");
	}
});

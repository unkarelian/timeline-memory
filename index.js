import { eventSource, event_types } from "../../../../script.js";
import { loadSlashCommands, updateToolRegistration } from "./src/commands.js";
import { addMessageButtons, resetMessageButtons } from "./src/messages.js";
import { loadSettings, changeCharaName } from "./src/settings.js";
import { initTimelineMacro, loadTimelineData, resetTimelineFillResults } from "./src/memories.js";

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

jQuery(async () => {
	const res = await fetch('/version');
	STVersion = await res.json();
	if (checkVersion(STVersion)===true) {
		eventSource.on(event_types.APP_READY, async () => {
			loadSettings();
			initTimelineMacro();
			loadSlashCommands();
		});
		eventSource.on(event_types.USER_MESSAGE_RENDERED, (mesId)=>onMessageRendered(mesId));
		eventSource.on(event_types.CHARACTER_MESSAGE_RENDERED, (mesId)=>onMessageRendered(mesId));
		eventSource.on(event_types.CHAT_CHANGED, (chatId)=>{
			resetTimelineFillResults();
			if (!chatId) return;
			loadTimelineData();
			resetMessageButtons();
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

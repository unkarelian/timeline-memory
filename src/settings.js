import { extension_settings, getContext } from "../../../../extensions.js";
import { extension_prompt_roles } from "../../../../../script.js";
import { getCharaFilename } from "../../../../utils.js";
import { extension_name, getExtensionAssetPath } from '../index.js';
import { resetMessageButtons } from './messages.js';
import { debug } from "./logging.js";

export let settings;

export const Buttons = {
	LOG: "log_button",
	STOP: "chapter_button",
	REMEMBER: "memory_button",
}
export const ChapterEndMode = {
	NONE: "Don't summarize",
}

const defaultSettings = {
	// general settings
	"is_enabled": true,
	"tools_enabled": true,
	"show_buttons": [Buttons.STOP],
	// prompt/text injection settings
	"memory_system_prompt": "",
	"memory_prompt_template": `Consider the following history:

{{content}}

Briefly summarize the most important details and events that occured in that sequence of events. Write your summary in a single paragraph.`,
	"chapter_query_system_prompt": "",
	"chapter_query_prompt_template": `Timeline of chapters:
{{timeline}}

Current chapter content:
{{chapter}}

User query: {{query}}

Based on the chapter content above, please answer the user's query.`,
	"rate_limit": 0, // requests per minute. 0 means no limit
	"profile": null, // optional connection-profile override for summarization
	"query_profile": null, // optional connection-profile override for chapter queries
	// chapter end settings
	"hide_chapter": true, // hide messages after summarizing the chapter
	"add_chunk_summaries": false, // add a comment containing all of the individual chunk summaries
	"chapter_end_mode": ChapterEndMode.NONE, // whether final summary is added as a chat message or memory book entry
}

function toggleCheckboxSetting(event) {
	const setting_key = event.target.id.replace('rmr_', '');
	settings[setting_key] = event.target.checked;
	getContext().saveSettingsDebounced();
}

function handleStringValueChange(event) {
	const setting_key = event.target.id.replace('rmr_', '');
	let value = event.target.value;
	if (value.length > 0) {
		settings[setting_key] = value;
	} else {
		settings[setting_key] = defaultSettings[setting_key];
	}
	getContext().saveSettingsDebounced();
}

function handleIntValueChange(event) {
	const setting_key = event.target.id.replace('rmr_', '');
	let value = parseInt(event.target.value);
	debug("setting numeric value", value);
	if (isNaN(value)) {
		debug('Invalid value for setting', setting_key, event.target.value);
		if (event.target.value.length === 0) event.target.value = defaultSettings[setting_key];
		else event.target.value = settings[setting_key];
		return;
	}

	if (event.target.max.length > 0) {
		debug("max value", event.target.max);
		value = Math.min(value, event.target.max);
	}
	if (event.target.min.length > 0) {
		debug("min value", event.target.min);
		value = Math.max(value, event.target.min);
	}
	debug("numeric value is now", value);

	if (event.target.value !== value) {
		event.target.value = value;
	}
	debug("numeric value is now", value);

	settings[setting_key] = value;
	getContext().saveSettingsDebounced();
}

function reloadProfiles() {
	const profileSelect = $('#rmr_profile');
	profileSelect.not(':first').remove();
	if (!extension_settings.connectionManager?.profiles) {
		return;
	}
	for (const profile of extension_settings.connectionManager.profiles) {
		profileSelect.append(
			$('<option></option>')
				.attr('value', profile.id)
				.text(profile.name)
		);
		if (settings.profile == profile.id) profileSelect.val(profile.id);
	}
}

async function loadSettingsUI() {
	// add settings UI
	const settingsDiv = await $.get(getExtensionAssetPath('templates/settings_panel.html'));
	$('#extensions_settings').append(settingsDiv);
	$('#rmr_memory_system_prompt').attr('placeholder', defaultSettings.memory_system_prompt || 'System-level instructions for summarization (optional)');
	$('#rmr_memory_prompt_template').attr('placeholder', defaultSettings.memory_prompt_template);
	$('#rmr_chapter_query_system_prompt').attr('placeholder', defaultSettings.chapter_query_system_prompt || 'System-level instructions for chapter queries (optional)');
	$('#rmr_chapter_query_prompt_template').attr('placeholder', defaultSettings.chapter_query_prompt_template);
	const mode_div = $(`#rmr_chapter_end_mode`);
	for (const end_mode in ChapterEndMode) {
		mode_div.append(
			$('<option></option>')
				.attr('value', end_mode)
				.text(ChapterEndMode[end_mode])
		);
		if (ChapterEndMode[end_mode] === settings.chapter_end_mode) {
			mode_div.val(end_mode);
		}
	}
	mode_div.on('input', () => {
		const mode = $('#rmr_chapter_end_mode').val();
		if (!Object.keys(ChapterEndMode).includes(mode)) return;
		settings.chapter_end_mode = ChapterEndMode[mode];
		getContext().saveSettingsDebounced();
	});

	const role_div = $(`#rmr_memory_role`);
	for (const role in extension_prompt_roles) {
		role_div.append(
			$('<option></option>')
				.attr('value', extension_prompt_roles[role])
				.text(role[0]+role.substring(1).toLowerCase())
		);
		if (extension_prompt_roles[role] == settings.memory_role) {
			role_div.val(role);
		}
	}
	role_div.on('input', () => {
		const role = Number($('#rmr_memory_role').val());
		if (!Object.values(extension_prompt_roles).includes(role)) return;
		settings.memory_role = role;
		getContext().saveSettingsDebounced();
	});


	// handle button checkboxes
	for (const button in Buttons) {
		const button_name = Buttons[button];
		const button_elem = $(`#rmr_${button_name}`);
		// set initial state
		if (settings.show_buttons.includes(button_name)) {
			button_elem.prop('checked', true);
		}
		// set up event listener
		button_elem.on('click', (e) => {
			if (e.target.checked && !settings.show_buttons.includes(button_name)) {
				settings.show_buttons.push(button_name);
			}
			else if (!e.target.checked && settings.show_buttons.includes(button_name)) {
				settings.show_buttons = settings.show_buttons.filter(it => it !== button_name);
			}
			resetMessageButtons();
			getContext().saveSettingsDebounced();
		});
	}
	// handle other checkboxes
	$("#rmr_hide_chapter").prop('checked', settings.hide_chapter).on('click', toggleCheckboxSetting);
	$("#rmr_add_chunk_summaries").prop('checked', settings.add_chunk_summaries).on('click', toggleCheckboxSetting);
	$("#rmr_tools_enabled").prop('checked', settings.tools_enabled).on('click', async (e) => {
		toggleCheckboxSetting(e);
		// Update tool registration when toggle changes
		const { updateToolRegistration } = await import('./commands.js');
		updateToolRegistration();
	});
	// handle dropdowns
	reloadProfiles();
	$('#rmr_profile').on('input', () => {
		const profile = $('#rmr_profile').val();
		if (!profile.length) {
			// no override, we won't change
			settings.profile = null;
			getContext().saveSettingsDebounced();
			return;
		}
		const profileID = extension_settings.connectionManager?.profiles ? extension_settings.connectionManager.profiles.findIndex(it => it.id == profile) : -1;
		if (profileID >= 0) {
			settings.profile = profile;
			getContext().saveSettingsDebounced();
		}
		else {
			toastr.error("Non-existent profile selected.", "Timeline Memory");
			$('rmr_profile').val('');
			settings.profile = null;
			getContext().saveSettingsDebounced();
		}
	});
	
	// Add query profile dropdown
	const queryProfileSelect = $('#rmr_query_profile');
	queryProfileSelect.append('<option value="">-- No Override --</option>');
	if (extension_settings.connectionManager?.profiles) {
		for (const profile of extension_settings.connectionManager.profiles) {
			queryProfileSelect.append(
				$('<option></option>')
					.attr('value', profile.id)
					.text(profile.name)
			);
			if (settings.query_profile == profile.id) queryProfileSelect.val(profile.id);
		}
	}
	
	queryProfileSelect.on('input', () => {
		const profile = queryProfileSelect.val();
		if (!profile.length) {
			settings.query_profile = null;
			getContext().saveSettingsDebounced();
			return;
		}
		const profileID = extension_settings.connectionManager?.profiles ? extension_settings.connectionManager.profiles.findIndex(it => it.id == profile) : -1;
		if (profileID >= 0) {
			settings.query_profile = profile;
			getContext().saveSettingsDebounced();
		}
		else {
			toastr.error("Non-existent profile selected.", "Timeline Memory");
			queryProfileSelect.val('');
			settings.query_profile = null;
			getContext().saveSettingsDebounced();
		}
	});
	
	// load all numeric settings
	$(`.rmr-extension_block input[type="number"]`).each((_i, elem) => {
		const setting_key = elem.id.replace('rmr_', '');
		elem.value = settings[setting_key];
		$(elem).on('change', handleIntValueChange);
	});
	// load all text settings
	$(`.rmr-extension_block textarea`).each((_i, elem) => {
		const setting_key = elem.id.replace('rmr_', '');
		elem.value = settings[setting_key];
		$(elem).on('change', handleStringValueChange);
	});

	debug('Settings UI loaded');
}

// Removed book selector as we no longer save to lorebooks

export function loadSettings() {
	// load settings
	settings = extension_settings[extension_name] || {};

	// special handling for converting old prompt settings to new ones
	if (settings.memory_prompt) {
		settings.memory_prompt_template = `Consider the following history:

{{content}}

${settings.memory_prompt}`;
		delete settings.memory_prompt;
	}
	if (settings.keywords_prompt) {
		settings.keywords_prompt_template = `Consider the following quote:

"{{content}}"

${settings.keywords_prompt}`;
		delete settings.keywords_prompt;
	}

	// Migrate old scene settings to chapter settings
	if (settings.hide_scene !== undefined) {
		settings.hide_chapter = settings.hide_scene;
		delete settings.hide_scene;
	}
	if (settings.scene_end_mode !== undefined) {
		settings.chapter_end_mode = settings.scene_end_mode;
		delete settings.scene_end_mode;
	}
	if (settings.scene_query_system_prompt !== undefined) {
		settings.chapter_query_system_prompt = settings.scene_query_system_prompt;
		delete settings.scene_query_system_prompt;
	}
	if (settings.scene_query_prompt_template !== undefined) {
		// Also update the template content to use {{chapter}} instead of {{scene}}
		settings.chapter_query_prompt_template = settings.scene_query_prompt_template.replace(/{{scene}}/gi, '{{chapter}}').replace(/scenes/gi, 'chapters');
		delete settings.scene_query_prompt_template;
	}
	
	// load default values into settings
	for (const key in defaultSettings) {
		if (settings[key] === undefined) {
			settings[key] = defaultSettings[key];
		}
	}

	extension_settings[extension_name] = settings;

	// load settings UI
	loadSettingsUI();
}

export function changeCharaName(old_key, new_key) {
	// No longer needed as we don't track book assignments
}

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
	// preset settings
	"summarize_presets": [],
	"query_presets": [],
	"current_summarize_preset": null,
	"current_query_preset": null,
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

	// Initialize preset UI
	loadPresetUI();

	debug('Settings UI loaded');
}

function loadPresetUI() {
	// Load summarize presets
	reloadPresetOptions('summarize');

	// Load query presets
	reloadPresetOptions('query');

	// Set current preset selections
	$('#rmr_summarize_preset').val(settings.current_summarize_preset || '');
	$('#rmr_query_preset').val(settings.current_query_preset || '');

	// Handle preset selection changes
	$('#rmr_summarize_preset').on('change', function() {
		const presetId = $(this).val();
		if (presetId) {
			applyPreset('summarize', presetId);
			updatePresetButtons('summarize', presetId);
			// Refresh UI to show loaded values
			refreshPromptFields();
		} else {
			// Custom mode - clear preset
			settings.current_summarize_preset = null;
			getContext().saveSettingsDebounced();
			updatePresetButtons('summarize', null);
		}
	});

	$('#rmr_query_preset').on('change', function() {
		const presetId = $(this).val();
		if (presetId) {
			applyPreset('query', presetId);
			updatePresetButtons('query', presetId);
			// Refresh UI to show loaded values
			refreshPromptFields();
		} else {
			// Custom mode - clear preset
			settings.current_query_preset = null;
			getContext().saveSettingsDebounced();
			updatePresetButtons('query', null);
		}
	});

	// Handle preset save/update/delete buttons
	$('#rmr_save_summarize_preset').on('click', () => handleSavePreset('summarize'));
	$('#rmr_update_summarize_preset').on('click', () => handleUpdatePreset('summarize'));
	$('#rmr_delete_summarize_preset').on('click', () => handleDeletePreset('summarize'));

	$('#rmr_save_query_preset').on('click', () => handleSavePreset('query'));
	$('#rmr_update_query_preset').on('click', () => handleUpdatePreset('query'));
	$('#rmr_delete_query_preset').on('click', () => handleDeletePreset('query'));

	// Update initial button states
	updatePresetButtons('summarize', settings.current_summarize_preset);
	updatePresetButtons('query', settings.current_query_preset);

	// Set up individual preset import/export handlers
	$('#rmr_export_summarize_preset').on('click', () => handleExportPreset('summarize'));
	$('#rmr_import_summarize_preset').on('click', () => handleImportPreset('summarize'));
	$('#rmr_export_query_preset').on('click', () => handleExportPreset('query'));
	$('#rmr_import_query_preset').on('click', () => handleImportPreset('query'));
}

// Handle export single preset
function handleExportPreset(presetType) {
	try {
		const exportData = exportCurrentPreset(presetType);

		// Create blob and download
		const blob = new Blob([exportData], { type: 'application/json' });
		const url = URL.createObjectURL(blob);
		const a = document.createElement('a');
		a.href = url;
		const presetName = presetType === 'summarize' ? settings.current_summarize_preset : settings.current_query_preset;
		const presetLabel = findPresetById(presetType, presetName)?.name || 'preset';
		a.download = `${presetType}-${presetName}-${presetLabel.replace(/[^a-z0-9]/gi, '_')}.json`;
		document.body.appendChild(a);
		a.click();
		document.body.removeChild(a);
		URL.revokeObjectURL(url);

		toastr.success(`${presetType} preset exported successfully.`);
	} catch (error) {
		console.error('Export error:', error);
		toastr.error(`Failed to export ${presetType} preset: ${error.message}`);
	}
}

// Handle import single preset
async function handleImportPreset(presetType) {
	const input = document.createElement('input');
	input.type = 'file';
	input.accept = '.json';

	input.onchange = async function(event) {
		const file = event.target.files[0];
		if (!file) return;

		const reader = new FileReader();
		reader.onload = async function(e) {
			try {
				const jsonData = e.target.result;
				const result = await importPreset(jsonData);

				// Reload preset UI
				reloadPresetOptions(result.type);

				// Show appropriate success message based on action
				let message = `Successfully imported ${result.type} preset: ${result.preset.name}`;
				if (result.action === 'overwrite') {
					message = `Successfully overwritten ${result.type} preset: ${result.preset.name}`;
				} else if (result.action === 'renamed') {
					message = `Successfully imported ${result.type} preset as: ${result.preset.name}`;
				}
				toastr.success(message);
			} catch (error) {
				console.error('Import error:', error);
				toastr.error(error.message);
			}
		};

		reader.onerror = function() {
			toastr.error('Failed to read file.');
		};

		reader.readAsText(file);
	};

	input.click();
}

function reloadPresetOptions(presetType) {
	const selectId = presetType === 'summarize' ? '#rmr_summarize_preset' : '#rmr_query_preset';
	const select = $(selectId);
	const currentVal = select.val();

	// Clear existing options except "Custom"
	select.find('option:not([value=""])').remove();

	const presets = presetType === 'summarize' ? getSummarizePresets() : getQueryPresets();
	presets.forEach(preset => {
		select.append(
			$('<option></option>')
				.attr('value', preset.id)
				.text(preset.name)
		);
	});

	// Restore selection if it still exists
	select.val(currentVal);
}

function updatePresetButtons(presetType, presetId) {
	const hasPreset = Boolean(presetId);
	const updateButton = presetType === 'summarize' ? '#rmr_update_summarize_preset' : '#rmr_update_query_preset';
	const deleteButton = presetType === 'summarize' ? '#rmr_delete_summarize_preset' : '#rmr_delete_query_preset';

	$(updateButton).prop('disabled', !hasPreset);
	$(deleteButton).prop('disabled', !hasPreset);
}

function refreshPromptFields() {
	// Refresh all prompt field values from settings
	$('#rmr_memory_system_prompt').val(settings.memory_system_prompt);
	$('#rmr_memory_prompt_template').val(settings.memory_prompt_template);
	$('#rmr_chapter_query_system_prompt').val(settings.chapter_query_system_prompt);
	$('#rmr_chapter_query_prompt_template').val(settings.chapter_query_prompt_template);
	$('#rmr_profile').val(settings.profile || '');
	$('#rmr_query_profile').val(settings.query_profile || '');
	$('#rmr_rate_limit').val(settings.rate_limit);
}

function handleSavePreset(presetType) {
	const preset = createPresetFromCurrentSettings(presetType);
	if (preset) {
		reloadPresetOptions(presetType);
		const selectId = presetType === 'summarize' ? '#rmr_summarize_preset' : '#rmr_query_preset';
		$(selectId).val(preset.id);

		if (presetType === 'summarize') {
			settings.current_summarize_preset = preset.id;
		} else {
			settings.current_query_preset = preset.id;
		}

		updatePresetButtons(presetType, preset.id);
		getContext().saveSettingsDebounced();
		toastr.success(`${presetType} preset saved successfully.`);
	}
}

function handleUpdatePreset(presetType) {
	const currentPresetId = presetType === 'summarize' ? settings.current_summarize_preset : settings.current_query_preset;

	if (!currentPresetId) {
		toastr.warning(`No ${presetType} preset selected to update.`);
		return;
	}

	let systemPrompt, userPrompt, profile, rateLimit;

	if (presetType === 'summarize') {
		systemPrompt = settings.memory_system_prompt;
		userPrompt = settings.memory_prompt_template;
		profile = settings.profile;
		rateLimit = settings.rate_limit;
	} else if (presetType === 'query') {
		systemPrompt = settings.chapter_query_system_prompt;
		userPrompt = settings.chapter_query_prompt_template;
		profile = settings.query_profile;
		rateLimit = 0;
	}

	const updated = updatePreset(presetType, currentPresetId, {
		systemPrompt,
		userPrompt,
		profile,
		rateLimit
	});

	if (updated) {
		toastr.success(`${presetType} preset updated successfully.`);
	} else {
		toastr.error(`Failed to update ${presetType} preset.`);
	}
}

function handleDeletePreset(presetType) {
	const currentPresetId = presetType === 'summarize' ? settings.current_summarize_preset : settings.current_query_preset;

	if (!currentPresetId) {
		toastr.warning(`No ${presetType} preset selected to delete.`);
		return;
	}

	const preset = findPresetById(presetType, currentPresetId);
	const confirmed = confirm(`Are you sure you want to delete the "${preset.name}" ${presetType} preset?`);

	if (!confirmed) return;

	const deleted = deletePreset(presetType, currentPresetId);

	if (deleted) {
		reloadPresetOptions(presetType);
		const selectId = presetType === 'summarize' ? '#rmr_summarize_preset' : '#rmr_query_preset';
		$(selectId).val('');
		updatePresetButtons(presetType, null);
		toastr.success(`${presetType} preset deleted successfully.`);
	} else {
		toastr.error(`Failed to delete ${presetType} preset.`);
	}
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

function generatePresetId() {
	return `preset-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
}

export function getSummarizePresets() {
	return settings.summarize_presets || [];
}

export function getQueryPresets() {
	return settings.query_presets || [];
}

export function findPresetById(presetType, presetId) {
	if (!presetId) return null;
	const presets = presetType === 'summarize' ? getSummarizePresets() : getQueryPresets();
	return presets.find(preset => preset.id === presetId) || null;
}

export function createPreset(presetType, name, systemPrompt, userPrompt, profile, rateLimit) {
	const preset = {
		id: generatePresetId(),
		name: name,
		systemPrompt: systemPrompt || '',
		userPrompt: userPrompt || '',
		profile: profile || null,
		rateLimit: rateLimit || 0,
	};

	if (presetType === 'summarize') {
		settings.summarize_presets.push(preset);
	} else if (presetType === 'query') {
		settings.query_presets.push(preset);
	}

	getContext().saveSettingsDebounced();
	return preset;
}

export function updatePreset(presetType, presetId, updates) {
	const presets = presetType === 'summarize' ? getSummarizePresets() : getQueryPresets();
	const presetIndex = presets.findIndex(preset => preset.id === presetId);

	if (presetIndex === -1) return null;

	Object.assign(presets[presetIndex], updates);
	getContext().saveSettingsDebounced();
	return presets[presetIndex];
}

export function deletePreset(presetType, presetId) {
	const presets = presetType === 'summarize' ? getSummarizePresets() : getQueryPresets();
	const presetIndex = presets.findIndex(preset => preset.id === presetId);

	if (presetIndex === -1) return false;

	presets.splice(presetIndex, 1);

	// Clear current preset if it was deleted
	if (presetType === 'summarize' && settings.current_summarize_preset === presetId) {
		settings.current_summarize_preset = null;
	} else if (presetType === 'query' && settings.current_query_preset === presetId) {
		settings.current_query_preset = null;
	}

	getContext().saveSettingsDebounced();
	return true;
}

export function applyPreset(presetType, presetId) {
	const preset = findPresetById(presetType, presetId);
	if (!preset) return false;

	if (presetType === 'summarize') {
		settings.current_summarize_preset = presetId;
		settings.memory_system_prompt = preset.systemPrompt;
		settings.memory_prompt_template = preset.userPrompt;
		settings.profile = preset.profile;
		settings.rate_limit = preset.rateLimit;
	} else if (presetType === 'query') {
		settings.current_query_preset = presetId;
		settings.chapter_query_system_prompt = preset.systemPrompt;
		settings.chapter_query_prompt_template = preset.userPrompt;
		settings.query_profile = preset.profile;
	}

	getContext().saveSettingsDebounced();
	return true;
}

export function createPresetFromCurrentSettings(presetType) {
	const name = prompt(`Enter a name for this ${presetType} preset:`);
	if (!name) return null;

	let systemPrompt, userPrompt, profile, rateLimit;

	if (presetType === 'summarize') {
		systemPrompt = settings.memory_system_prompt;
		userPrompt = settings.memory_prompt_template;
		profile = settings.profile;
		rateLimit = settings.rate_limit;
	} else if (presetType === 'query') {
		systemPrompt = settings.chapter_query_system_prompt;
		userPrompt = settings.chapter_query_prompt_template;
		profile = settings.query_profile;
		rateLimit = 0; // Query presets don't use rate limiting
	}

	// Check for existing preset with same name
	const existingPresets = presetType === 'summarize' ? getSummarizePresets() : getQueryPresets();
	const existingPreset = existingPresets.find(p => p.name.toLowerCase() === name.toLowerCase());

	if (existingPreset) {
		const overwrite = confirm(`A preset named "${name}" already exists. Overwrite it?`);
		if (!overwrite) return null;

		return updatePreset(presetType, existingPreset.id, {
			systemPrompt,
			userPrompt,
			profile,
			rateLimit
		});
	}

	return createPreset(presetType, name, systemPrompt, userPrompt, profile, rateLimit);
}

// Export current preset to JSON
export function exportCurrentPreset(presetType) {
	const currentPresetId = presetType === 'summarize' ? settings.current_summarize_preset : settings.current_query_preset;

	if (!currentPresetId) {
		throw new Error(`No ${presetType} preset selected for export`);
	}

	const preset = findPresetById(presetType, currentPresetId);
	if (!preset) {
		throw new Error(`Selected ${presetType} preset not found`);
	}

	const exportData = {
		version: '1.0',
		type: presetType,
		timestamp: new Date().toISOString(),
		preset: preset
	};

	return JSON.stringify(exportData, null, 2);
}

// Find existing preset with same name
function findDuplicatePreset(presetType, presetName) {
	const presets = presetType === 'summarize' ? getSummarizePresets() : getQueryPresets();
	return presets.find(preset => preset.name.toLowerCase() === presetName.toLowerCase());
}

// Show dialog for handling duplicate preset names
async function handleDuplicatePreset(presetType, duplicatePreset, newPreset) {
	return new Promise((resolve) => {
		const action = confirm(
			`A preset named "${newPreset.name}" already exists in ${presetType} presets.\n\n` +
			`Click:\n` +
			`• "OK" to overwrite the existing preset\n` +
			`• "Cancel" to import with a new name\n`
		);

		if (action) {
			// Overwrite existing preset
			resolve({ action: 'overwrite', preset: duplicatePreset });
		} else {
			// Rename and create new
			const newName = prompt(`Enter a new name for the preset "${newPreset.name}":`, `${newPreset.name} - imported`);
			if (newName && newName.trim()) {
				resolve({ action: 'rename', newName: newName.trim() });
			} else {
				resolve({ action: 'cancel' });
			}
		}
	});
}

// Import single preset from JSON
export async function importPreset(jsonData) {
	try {
		const importData = JSON.parse(jsonData);

		// Validate import data structure
		if (!importData.preset || !importData.type) {
			throw new Error('Invalid preset file: missing preset data or type');
		}

		const presetType = importData.type;
		if (presetType !== 'summarize' && presetType !== 'query') {
			throw new Error('Invalid preset file: unknown preset type');
		}

		if (!validatePreset(importData.preset)) {
			throw new Error('Invalid preset file: preset data is malformed');
		}

		// Check for duplicate names
		const duplicatePreset = findDuplicatePreset(presetType, importData.preset.name);
		let finalPreset = { ...importData.preset };

		if (duplicatePreset) {
			const result = await handleDuplicatePreset(presetType, duplicatePreset, importData.preset);

			if (result.action === 'cancel') {
				throw new Error('Import cancelled by user');
			} else if (result.action === 'overwrite') {
				// Overwrite existing preset
				finalPreset.id = duplicatePreset.id;
				const updated = updatePreset(presetType, duplicatePreset.id, {
					name: importData.preset.name,
					systemPrompt: importData.preset.systemPrompt,
					userPrompt: importData.preset.userPrompt,
					profile: importData.preset.profile,
					rateLimit: importData.preset.rateLimit
				});
				return { type: presetType, preset: updated, action: 'overwrite' };
			} else if (result.action === 'rename') {
				// Rename and create new
				finalPreset.name = result.newName;
			}
		}

		// Generate new ID for new preset
		finalPreset.id = generatePresetId();

		if (presetType === 'summarize') {
			settings.summarize_presets.push(finalPreset);
		} else if (presetType === 'query') {
			settings.query_presets.push(finalPreset);
		}

		getContext().saveSettingsDebounced();
		return { type: presetType, preset: finalPreset, action: duplicatePreset ? 'renamed' : 'new' };

	} catch (error) {
		console.error('Error importing preset:', error);
		throw new Error(`Failed to import preset: ${error.message}`);
	}
}

// Validate preset structure
function validatePreset(preset) {
	if (!preset || typeof preset !== 'object') return false;
	if (!preset.name || typeof preset.name !== 'string') return false;
	if (!preset.systemPrompt || typeof preset.systemPrompt !== 'string') return false;
	if (!preset.userPrompt || typeof preset.userPrompt !== 'string') return false;
	// profile and rateLimit are optional
	return true;
}

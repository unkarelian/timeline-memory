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
	"memory_system_prompt": `<role>You are a literary analysis expert specializing in narrative structure and scene summarization. Your expertise is in distilling complex narrative elements into concise, query-friendly summaries.</role>

<task>Your task is to create a 'story map' summary of the provided text. This summary will be used as part of a searchable timeline database, allowing users to quickly identify and locate specific scenes based on key narrative elements.</task>

<instructions>
For each scene provided, create a concise plaintext summary that includes ONLY:
1. The most critical plot developments that drive the story forward
2. Key character turning points or significant changes in motivation/goals
3. Major shifts in narrative direction, tone, or setting
4. Essential conflicts introduced or resolved
5. Critical character moments and their reactions

Do NOT include:
- Minor details or descriptive passages
- Dialogue excerpts
- Stylistic or thematic analysis
- Personal interpretations or opinions

Format your response as an unformatted block of plaintext with no markdown, or special characters. The summary should be written as a high-level overview for someone who has already read the story and needs to quickly identify the scene's core elements for querying purposes, but still needs to know what happened.
</instructions>`,
	"memory_prompt_template": `<document>
{{content}}
</document>

<previous_chapter_summaries>
{{timeline}}
NOTE: Only use for reference. This is NOT what you will be summarizing.
</previous_chapter_summaries>

<output_format>
Respond with a single block of unformatted, concise plaintext summarizing the critical elements of the scene. Do not use line breaks, bullet points, markdown, or any special formatting.
</output_format>

<example>
Example of desired output format:
The protagonist discovers the hidden letter revealing the antagonist's true identity, causing a shift in their motivation from revenge to understanding. Meanwhile, the secondary character's betrayal is revealed to the main group, creating internal conflict and dividing the allies. The scene concludes with the protagonist deciding to confront the antagonist directly, setting up the final confrontation.
</example>

The scene summary is:`,
	"chapter_query_system_prompt": `<role>
You are Clau, an expert at analyzing stories and understanding the subtext within them. You take pride in your ability to understand the connections between plot points, even when they are not immediately obvious.
</role>

<task>
Your task is to analyze the provided chapter content and answer the user's questions based on the information given. Provide concise, focused, and insightful responses that fully address the user's inquiries.
</task>

<guidelines>
1. Directly address the user's questions with clear and focused answers.
2. Use evidence from the chapter content to support your answers.
3. Only state information that is explicitly supported by the chapter content.
4. Respond with only new information, noting that the user has already read the <chapter_summary>. `,
	"chapter_query_prompt_template": `<current_chapter>
{{chapter}}
</current_chapter>

<chapter_summary>
{{chapterSummary}}
</chapter_summary>

<user_query>
{{query}}
</user_query>`,
	"timeline_fill_system_prompt": `<role>
You are an expert narrative analyzer, who is able to efficiently determine what crucial information is missing from the current narrative.
</role>

<task>
You will be provided with the entirety of the current chapter, as well as summaries of previous chapters. Your task is to succinctly ascertain what information is needed from previous chapters for the most recent scene and query accordingly, as to ensure that all information needed for accurate portrayal of the current scene is gathered.
</task>

<constraints>
Query based ONLY on the information visible in the chapter summaries or things that may be implied to have happened in them. Do not reference current events in your queries, as the assistant that answers queries is only provided the history of that chapter, and would have no knowledge of events outside of the chapters queried. However, do not ask about information directly answered in the summaries. Instead, try to ask questions that 'fill in the gaps'. The maximum range of chapters for a single query is 3, but you may make as many queries as you wish.
</constraints>`,
	"timeline_fill_prompt_template": `Visible chat history:
{{chapterHistory}}

Existing chapter timeline:
{{timeline}}

Provide a JSON array where each item describes a question to ask about the timeline. Each item MUST be an object with:
- "query": the question string.
- EITHER "chapters": an array of chapter numbers to query,
  OR both "startChapter" and "endChapter" integers defining an inclusive range.
You may include both styles in the same array. Return ONLY the JSON array, no code fences or commentary.`,
	"rate_limit": 0, // requests per minute. 0 means no limit
	"profile": null, // optional connection-profile override for summarization
	"query_profile": null, // optional connection-profile override for chapter queries
	"timeline_fill_profile": null, // optional profile override for timeline fill generation
	// chapter end settings
	"hide_chapter": true, // hide messages after summarizing the chapter
	"add_chunk_summaries": false, // add a comment containing all of the individual chunk summaries
	"chapter_end_mode": ChapterEndMode.NONE, // whether final summary is added as a chat message or memory book entry
	// preset settings
	"summarize_presets": [
		{
			"id": "preset-default-summarize",
			"name": "Basic",
			"systemPrompt": `<role>You are a literary analysis expert specializing in narrative structure and scene summarization. Your expertise is in distilling complex narrative elements into concise, query-friendly summaries.</role>

<task>Your task is to create a 'story map' summary of the provided text. This summary will be used as part of a searchable timeline database, allowing users to quickly identify and locate specific scenes based on key narrative elements.</task>

<instructions>
For each scene provided, create a concise plaintext summary that includes ONLY:
1. The most critical plot developments that drive the story forward
2. Key character turning points or significant changes in motivation/goals
3. Major shifts in narrative direction, tone, or setting
4. Essential conflicts introduced or resolved
5. Critical character moments and their reactions

Do NOT include:
- Minor details or descriptive passages
- Dialogue excerpts
- Stylistic or thematic analysis
- Personal interpretations or opinions

Format your response as an unformatted block of plaintext with no markdown, or special characters. The summary should be written as a high-level overview for someone who has already read the story and needs to quickly identify the scene's core elements for querying purposes, but still needs to know what happened.
</instructions>`,
			"userPrompt": `<document>
{{content}}
</document>

<previous_chapter_summaries>
{{timeline}}
NOTE: Only use for reference. This is NOT what you will be summarizing.
</previous_chapter_summaries>

<output_format>
Respond with a single block of unformatted, concise plaintext summarizing the critical elements of the scene. Do not use line breaks, bullet points, markdown, or any special formatting.
</output_format>

<example>
Example of desired output format:
The protagonist discovers the hidden letter revealing the antagonist's true identity, causing a shift in their motivation from revenge to understanding. Meanwhile, the secondary character's betrayal is revealed to the main group, creating internal conflict and dividing the allies. The scene concludes with the protagonist deciding to confront the antagonist directly, setting up the final confrontation.
</example>

The scene summary is:`,
			"rateLimit": 0
		}
	],
	"query_presets": [
		{
			"id": "preset-default-query",
			"name": "Concise Query Optimized",
			"systemPrompt": `<role>
You are Clau, an expert at analyzing stories and understanding the subtext within them. You take pride in your ability to understand the connections between plot points, even when they are not immediately obvious.
</role>

<task>
Your task is to analyze the provided chapter content and answer the user's questions based on the information given. Provide concise, focused, and insightful responses that fully address the user's inquiries.
</task>

<guidelines>
1. Directly address the user's questions with clear and focused answers.
2. Use evidence from the chapter content to support your answers.
3. Only state information that is explicitly supported by the chapter content.
4. Respond with only new information, noting that the user has already read the <chapter_summary>. `,
			"userPrompt": `<current_chapter>
{{chapter}}
</current_chapter>

<chapter_summary>
{{chapterSummary}}
</chapter_summary>

<user_query>
{{query}}
</user_query>`,
			"rateLimit": 0
		}
	],
	"current_summarize_preset": "preset-default-summarize",
	"current_query_preset": "preset-default-query",
	"timeline_fill_presets": [
		{
			"id": "preset-default-timeline-fill",
			"name": "Basic",
			"systemPrompt": `<role>
You are an expert narrative analyzer, who is able to efficiently determine what crucial information is missing from the current narrative.
</role>

<task>
You will be provided with the entirety of the current chapter, as well as summaries of previous chapters. Your task is to succinctly ascertain what information is needed from previous chapters for the most recent scene and query accordingly, as to ensure that all information needed for accurate portrayal of the current scene is gathered.
</task>

<constraints>
Query based ONLY on the information visible in the chapter summaries or things that may be implied to have happened in them. Do not reference current events in your queries, as the assistant that answers queries is only provided the history of that chapter, and would have no knowledge of events outside of the chapters queried. However, do not ask about information directly answered in the summaries. Instead, try to ask questions that 'fill in the gaps'. The maximum range of chapters for a single query is 3, but you may make as many queries as you wish.
</constraints>`,
			"userPrompt": `Visible chat history:
{{chapterHistory}}

Existing chapter timeline:
{{timeline}}

Provide a JSON array where each item describes a question to ask about the timeline. Each item MUST be an object with:
- "query": the question string.
- EITHER "chapters": an array of chapter numbers to query,
  OR both "startChapter" and "endChapter" integers defining an inclusive range.
You may include both styles in the same array. Return ONLY the JSON array, no code fences or commentary.`,
			"rateLimit": 0
		}
	],
	"current_timeline_fill_preset": "preset-default-timeline-fill",

	// Arc analyzer settings
	"arc_analyzer_system_prompt": `# Role

You are Arc Analyzer. Your task is to identify potential narrative arcs in a chat transcript that could serve as chapters. Each arc begins at the start of the conversation (the first message with the lowest ID) and ends at a natural narrative conclusion point. You'll be suggesting multiple possible "endings" to the story that begins at the chat's opening.

## Output Format (Strict)
Return ONLY a JSON array (no prose, no code fences). Each item is an object with:
- title: Short, concrete title (≤ 8 words)
- summary: 2-4 sentences summarizing the arc's main beats
- chapterEnd: Integer index of the final message in this arc (must exactly match the absolute ID provided in the transcript for that message, such as the number in [id [N]]; do not calculate or use relative positions—use the exact ID value as given)
- justification: 1-2 sentences explaining why this endpoint is a coherent boundary

## Rules
- Produce 3-7 arcs when possible; fewer is acceptable for shorter chats.
- Arcs must be contiguous and strictly increasing by chapterEnd.
- Arcs may overlap (end points may be only a few messages apart) to provide options for where to conclude a chapter.
- Each arc should be at minimum 15 messages (defined as the smallest id you see in chat history - the chosen chapterEnd id).
- Choose chapterEnd at natural narrative beats: resolutions, decisions, scene changes, or clear transitions.
- Each arc should be self-contained in terms of information.
- Prefer the latest message that still completes the arc (avoid cutting mid-beat).
- Base everything only on the provided transcript (no invented details).
- Use only valid message IDs that exist in the transcript (exactly as provided, without modification. Each id in the JSON array refers to the text it contains exactly).`,
	"arc_analyzer_prompt_template": `# Chat History:
{{chapterHistory}}

## Timeline
NOTE: This is strictly for reference to past events. NEVER use an ID mentioned here in your response.
{{timeline}}`,
	"arc_profile": null,
	"arc_presets": [
		{
			"id": "preset-default-arc",
			"name": "BasicArc",
			"systemPrompt": `# Role

You are Arc Analyzer. Your task is to identify potential narrative arcs in a chat transcript that could serve as chapters. Each arc begins at the start of the conversation (the first message with the lowest ID) and ends at a natural narrative conclusion point. You'll be suggesting multiple possible "endings" to the story that begins at the chat's opening.

## Output Format (Strict)
Return ONLY a JSON array (no prose, no code fences). Each item is an object with:
- title: Short, concrete title (≤ 8 words)
- summary: 2-4 sentences summarizing the arc's main beats
- chapterEnd: Integer index of the final message in this arc (must exactly match the absolute ID provided in the transcript for that message, such as the number in [id [N]]; do not calculate or use relative positions—use the exact ID value as given)
- justification: 1-2 sentences explaining why this endpoint is a coherent boundary

## Rules
- Produce 3-7 arcs when possible; fewer is acceptable for shorter chats.
- Arcs must be contiguous and strictly increasing by chapterEnd.
- Arcs may overlap (end points may be only a few messages apart) to provide options for where to conclude a chapter.
- Each arc should be at minimum 15 messages (defined as the smallest id you see in chat history - the chosen chapterEnd id).
- Choose chapterEnd at natural narrative beats: resolutions, decisions, scene changes, or clear transitions.
- Each arc should be self-contained in terms of information.
- Prefer the latest message that still completes the arc (avoid cutting mid-beat).
- Base everything only on the provided transcript (no invented details).
- Use only valid message IDs that exist in the transcript (exactly as provided, without modification. Each id in the JSON array refers to the text it contains exactly).`,
			"userPrompt": `# Chat History:
{{chapterHistory}}

## Timeline
NOTE: This is strictly for reference to past events. NEVER use an ID mentioned here in your response.
{{timeline}}`,
			"rateLimit": 0
		}
	],
	"current_arc_preset": "preset-default-arc",

	// Lore management settings
	"lore_management_enabled": false,
	"lore_management_profile": null,
	"lore_management_prompt": "begin lore retrieval",
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
    const timelineFillSelect = $('#rmr_timeline_fill_profile');
    if (timelineFillSelect?.length) {
        timelineFillSelect.not(':first').remove();
    }
    const arcProfileSelect = $('#rmr_arc_profile');
    if (arcProfileSelect?.length) {
        arcProfileSelect.not(':first').remove();
    }
    const loreManagementSelect = $('#rmr_lore_management_profile');
    if (loreManagementSelect?.length) {
        loreManagementSelect.not(':first').remove();
    }
    if (!extension_settings.connectionManager?.profiles) {
        if (timelineFillSelect?.length) {
            timelineFillSelect.val('');
        }
        if (arcProfileSelect?.length) {
            arcProfileSelect.val('');
        }
        if (loreManagementSelect?.length) {
            loreManagementSelect.val('');
        }
        return;
    }
    for (const profile of extension_settings.connectionManager.profiles) {
        profileSelect.append(
            $('<option></option>')
                .attr('value', profile.id)
                .text(profile.name)
        );
        if (settings.profile == profile.id) profileSelect.val(profile.id);
        if (timelineFillSelect?.length) {
            timelineFillSelect.append(
                $('<option></option>')
                    .attr('value', profile.id)
                    .text(profile.name)
            );
            if (settings.timeline_fill_profile == profile.id) {
                timelineFillSelect.val(profile.id);
            }
        }
        if (arcProfileSelect?.length) {
            arcProfileSelect.append(
                $('<option></option>')
                    .attr('value', profile.id)
                    .text(profile.name)
            );
            if (settings.arc_profile == profile.id) {
                arcProfileSelect.val(profile.id);
            }
        }
        if (loreManagementSelect?.length) {
            loreManagementSelect.append(
                $('<option></option>')
                    .attr('value', profile.id)
                    .text(profile.name)
            );
            if (settings.lore_management_profile == profile.id) {
                loreManagementSelect.val(profile.id);
            }
        }
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
    $('#rmr_arc_analyzer_system_prompt').attr('placeholder', defaultSettings.arc_analyzer_system_prompt || 'System-level instructions for arc analysis (optional)');
    $('#rmr_arc_analyzer_prompt_template').attr('placeholder', defaultSettings.arc_analyzer_prompt_template);
    $('#rmr_timeline_fill_system_prompt').attr('placeholder', defaultSettings.timeline_fill_system_prompt || 'System-level instructions for timeline fill (optional)');
    $('#rmr_timeline_fill_prompt_template').attr('placeholder', defaultSettings.timeline_fill_prompt_template);
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

    // Timeline fill profile dropdown
    const timelineFillProfileSelect = $('#rmr_timeline_fill_profile');
    timelineFillProfileSelect.on('input', () => {
        const profile = timelineFillProfileSelect.val();
        if (!profile.length) {
            settings.timeline_fill_profile = null;
            getContext().saveSettingsDebounced();
            return;
        }
        const profileID = extension_settings.connectionManager?.profiles ? extension_settings.connectionManager.profiles.findIndex(it => it.id == profile) : -1;
        if (profileID >= 0) {
            settings.timeline_fill_profile = profile;
            getContext().saveSettingsDebounced();
        }
        else {
            toastr.error("Non-existent profile selected.", "Timeline Memory");
            timelineFillProfileSelect.val('');
            settings.timeline_fill_profile = null;
            getContext().saveSettingsDebounced();
        }
    });

    // Arc analyzer profile dropdown
    const arcProfileSelect = $('#rmr_arc_profile');
    arcProfileSelect.on('input', () => {
        const profile = arcProfileSelect.val();
        if (!profile.length) {
            settings.arc_profile = null;
            getContext().saveSettingsDebounced();
            return;
        }
        const profileID = extension_settings.connectionManager?.profiles ? extension_settings.connectionManager.profiles.findIndex(it => it.id == profile) : -1;
        if (profileID >= 0) {
            settings.arc_profile = profile;
            getContext().saveSettingsDebounced();
        } else {
            toastr.error("Non-existent profile selected.", "Timeline Memory");
            arcProfileSelect.val('');
            settings.arc_profile = null;
            getContext().saveSettingsDebounced();
        }
    });

    // Lore management settings
    $('#rmr_lore_management_enabled').prop('checked', settings.lore_management_enabled).on('click', toggleCheckboxSetting);
    $('#rmr_lore_management_prompt').val(settings.lore_management_prompt).on('change', handleStringValueChange);

    // Lore management profile dropdown
    const loreManagementProfileSelect = $('#rmr_lore_management_profile');
    loreManagementProfileSelect.on('input', () => {
        const profile = loreManagementProfileSelect.val();
        if (!profile.length) {
            settings.lore_management_profile = null;
            getContext().saveSettingsDebounced();
            return;
        }
        const profileID = extension_settings.connectionManager?.profiles ? extension_settings.connectionManager.profiles.findIndex(it => it.id == profile) : -1;
        if (profileID >= 0) {
            settings.lore_management_profile = profile;
            getContext().saveSettingsDebounced();
        } else {
            toastr.error("Non-existent profile selected.", "Timeline Memory");
            loreManagementProfileSelect.val('');
            settings.lore_management_profile = null;
            getContext().saveSettingsDebounced();
        }
    });

    // Wire the lore management button
    $('#rmr_run_lore_manage').on('click', async () => {
        try {
            const { startLoreManagementSession } = await import('./lore-management.js');
            await startLoreManagementSession();
        } catch (err) {
            console.error('Lore Management error:', err);
            toastr.error('Failed to start Lore Management', 'Timeline Memory');
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

    // Wire the Arc Analyzer run button
    $('#rmr_run_arc_analyzer').on('click', async () => {
        try {
            const { analyzeArcs } = await import('./memories.js');
            await analyzeArcs();
        } catch (err) {
            console.error('Arc Analyzer error:', err);
            toastr.error('Failed to run Arc Analyzer', 'Timeline Memory');
        }
    });

    // Render summaries list after a short delay to ensure timeline data is loaded
    setTimeout(() => renderSummariesList(), 100);

	debug('Settings UI loaded');
}

function loadPresetUI() {
    // Load summarize presets
    reloadPresetOptions('summarize');

    // Load query presets
    reloadPresetOptions('query');

    // Load timeline fill presets
    reloadPresetOptions('timeline_fill');

    // Load arc presets
    reloadPresetOptions('arc');

	// Set current preset selections
    $('#rmr_summarize_preset').val(settings.current_summarize_preset || '');
    $('#rmr_query_preset').val(settings.current_query_preset || '');
    $('#rmr_timeline_fill_preset').val(settings.current_timeline_fill_preset || '');
    $('#rmr_arc_preset').val(settings.current_arc_preset || '');

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

    $('#rmr_timeline_fill_preset').on('change', function() {
        const presetId = $(this).val();
        if (presetId) {
            applyPreset('timeline_fill', presetId);
            updatePresetButtons('timeline_fill', presetId);
            refreshPromptFields();
        } else {
            settings.current_timeline_fill_preset = null;
            getContext().saveSettingsDebounced();
            updatePresetButtons('timeline_fill', null);
        }
    });

    $('#rmr_arc_preset').on('change', function() {
        const presetId = $(this).val();
        if (presetId) {
            applyPreset('arc', presetId);
            updatePresetButtons('arc', presetId);
            refreshPromptFields();
        } else {
            settings.current_arc_preset = null;
            getContext().saveSettingsDebounced();
            updatePresetButtons('arc', null);
        }
    });

	// Handle preset save/update/delete buttons
    $('#rmr_save_summarize_preset').on('click', () => handleSavePreset('summarize'));
    $('#rmr_update_summarize_preset').on('click', () => handleUpdatePreset('summarize'));
    $('#rmr_delete_summarize_preset').on('click', () => handleDeletePreset('summarize'));

    $('#rmr_save_query_preset').on('click', () => handleSavePreset('query'));
    $('#rmr_update_query_preset').on('click', () => handleUpdatePreset('query'));
    $('#rmr_delete_query_preset').on('click', () => handleDeletePreset('query'));

    $('#rmr_save_timeline_fill_preset').on('click', () => handleSavePreset('timeline_fill'));
    $('#rmr_update_timeline_fill_preset').on('click', () => handleUpdatePreset('timeline_fill'));
    $('#rmr_delete_timeline_fill_preset').on('click', () => handleDeletePreset('timeline_fill'));

    $('#rmr_save_arc_preset').on('click', () => handleSavePreset('arc'));
    $('#rmr_update_arc_preset').on('click', () => handleUpdatePreset('arc'));
    $('#rmr_delete_arc_preset').on('click', () => handleDeletePreset('arc'));

	// Update initial button states
    updatePresetButtons('summarize', settings.current_summarize_preset);
    updatePresetButtons('query', settings.current_query_preset);
    updatePresetButtons('timeline_fill', settings.current_timeline_fill_preset);
    updatePresetButtons('arc', settings.current_arc_preset);

	// Set up individual preset import/export handlers
    $('#rmr_export_summarize_preset').on('click', () => handleExportPreset('summarize'));
    $('#rmr_import_summarize_preset').on('click', () => handleImportPreset('summarize'));
    $('#rmr_export_query_preset').on('click', () => handleExportPreset('query'));
    $('#rmr_import_query_preset').on('click', () => handleImportPreset('query'));
    $('#rmr_export_timeline_fill_preset').on('click', () => handleExportPreset('timeline_fill'));
    $('#rmr_import_timeline_fill_preset').on('click', () => handleImportPreset('timeline_fill'));
    $('#rmr_export_arc_preset').on('click', () => handleExportPreset('arc'));
    $('#rmr_import_arc_preset').on('click', () => handleImportPreset('arc'));

    // Set up master export/import handlers
    $('#rmr_master_export').on('click', handleMasterExport);
    $('#rmr_master_import').on('click', handleMasterImport);
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
		let currentPresetId = settings.current_summarize_preset;
		if (presetType === 'query') currentPresetId = settings.current_query_preset;
		if (presetType === 'timeline_fill') currentPresetId = settings.current_timeline_fill_preset;
		if (presetType === 'arc') currentPresetId = settings.current_arc_preset;
		const presetLabel = findPresetById(presetType, currentPresetId)?.name || 'preset';
		a.download = `${presetType}-${currentPresetId}-${presetLabel.replace(/[^a-z0-9]/gi, '_')}.json`;
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
    let selectId = '#rmr_summarize_preset';
    if (presetType === 'query') selectId = '#rmr_query_preset';
    if (presetType === 'timeline_fill') selectId = '#rmr_timeline_fill_preset';
    if (presetType === 'arc') selectId = '#rmr_arc_preset';
    const select = $(selectId);
    const currentVal = select.val();

	// Clear existing options except "Custom"
	select.find('option:not([value=""])').remove();

    let presets = getSummarizePresets();
    if (presetType === 'query') presets = getQueryPresets();
    if (presetType === 'timeline_fill') presets = getTimelineFillPresets();
    if (presetType === 'arc') presets = getArcPresets();
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
    let updateButton = '#rmr_update_summarize_preset';
    let deleteButton = '#rmr_delete_summarize_preset';
    if (presetType === 'query') {
        updateButton = '#rmr_update_query_preset';
        deleteButton = '#rmr_delete_query_preset';
    }
    if (presetType === 'timeline_fill') {
        updateButton = '#rmr_update_timeline_fill_preset';
        deleteButton = '#rmr_delete_timeline_fill_preset';
    }
    if (presetType === 'arc') {
        updateButton = '#rmr_update_arc_preset';
        deleteButton = '#rmr_delete_arc_preset';
    }

	$(updateButton).prop('disabled', !hasPreset);
	$(deleteButton).prop('disabled', !hasPreset);
}

function refreshPromptFields() {
    // Refresh all prompt field values from settings
    $('#rmr_memory_system_prompt').val(settings.memory_system_prompt);
    $('#rmr_memory_prompt_template').val(settings.memory_prompt_template);
    $('#rmr_chapter_query_system_prompt').val(settings.chapter_query_system_prompt);
    $('#rmr_chapter_query_prompt_template').val(settings.chapter_query_prompt_template);
    $('#rmr_timeline_fill_system_prompt').val(settings.timeline_fill_system_prompt);
    $('#rmr_timeline_fill_prompt_template').val(settings.timeline_fill_prompt_template);
    $('#rmr_profile').val(settings.profile || '');
    $('#rmr_query_profile').val(settings.query_profile || '');
    $('#rmr_timeline_fill_profile').val(settings.timeline_fill_profile || '');
    $('#rmr_arc_analyzer_system_prompt').val(settings.arc_analyzer_system_prompt);
    $('#rmr_arc_analyzer_prompt_template').val(settings.arc_analyzer_prompt_template);
    $('#rmr_arc_profile').val(settings.arc_profile || '');
    $('#rmr_rate_limit').val(settings.rate_limit);
    // Lore management fields
    $('#rmr_lore_management_enabled').prop('checked', settings.lore_management_enabled);
    $('#rmr_lore_management_prompt').val(settings.lore_management_prompt);
    $('#rmr_lore_management_profile').val(settings.lore_management_profile || '');
}

function handleSavePreset(presetType) {
    const preset = createPresetFromCurrentSettings(presetType);
    if (preset) {
        reloadPresetOptions(presetType);
        let selectId = '#rmr_summarize_preset';
        if (presetType === 'query') selectId = '#rmr_query_preset';
        if (presetType === 'timeline_fill') selectId = '#rmr_timeline_fill_preset';
        if (presetType === 'arc') selectId = '#rmr_arc_preset';
        $(selectId).val(preset.id);

        if (presetType === 'summarize') {
            settings.current_summarize_preset = preset.id;
        } else if (presetType === 'query') {
            settings.current_query_preset = preset.id;
        } else if (presetType === 'timeline_fill') {
            settings.current_timeline_fill_preset = preset.id;
        } else if (presetType === 'arc') {
            settings.current_arc_preset = preset.id;
        }

        updatePresetButtons(presetType, preset.id);
        getContext().saveSettingsDebounced();
        toastr.success(`${presetType} preset saved successfully.`);
    }
}

function handleUpdatePreset(presetType) {
    let currentPresetId = settings.current_summarize_preset;
    if (presetType === 'query') currentPresetId = settings.current_query_preset;
    if (presetType === 'timeline_fill') currentPresetId = settings.current_timeline_fill_preset;
    if (presetType === 'arc') currentPresetId = settings.current_arc_preset;

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
    } else if (presetType === 'timeline_fill') {
        systemPrompt = settings.timeline_fill_system_prompt;
        userPrompt = settings.timeline_fill_prompt_template;
        profile = settings.timeline_fill_profile;
        rateLimit = 0;
    } else if (presetType === 'arc') {
        systemPrompt = settings.arc_analyzer_system_prompt;
        userPrompt = settings.arc_analyzer_prompt_template;
        profile = settings.arc_profile;
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
    let currentPresetId = settings.current_summarize_preset;
    if (presetType === 'query') currentPresetId = settings.current_query_preset;
    if (presetType === 'timeline_fill') currentPresetId = settings.current_timeline_fill_preset;
    if (presetType === 'arc') currentPresetId = settings.current_arc_preset;

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
        let selectId = '#rmr_summarize_preset';
        if (presetType === 'query') selectId = '#rmr_query_preset';
        if (presetType === 'timeline_fill') selectId = '#rmr_timeline_fill_preset';
        if (presetType === 'arc') selectId = '#rmr_arc_preset';
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

export function getTimelineFillPresets() {
    return settings.timeline_fill_presets || [];
}

export function getArcPresets() {
    return settings.arc_presets || [];
}

export function findPresetById(presetType, presetId) {
    if (!presetId) return null;
    let presets = getSummarizePresets();
    if (presetType === 'query') presets = getQueryPresets();
    if (presetType === 'timeline_fill') presets = getTimelineFillPresets();
    if (presetType === 'arc') presets = getArcPresets();
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
    } else if (presetType === 'timeline_fill') {
        settings.timeline_fill_presets.push(preset);
    } else if (presetType === 'arc') {
        settings.arc_presets.push(preset);
    }

	getContext().saveSettingsDebounced();
	return preset;
}

export function updatePreset(presetType, presetId, updates) {
    let presets = getSummarizePresets();
    if (presetType === 'query') presets = getQueryPresets();
    if (presetType === 'timeline_fill') presets = getTimelineFillPresets();
    if (presetType === 'arc') presets = getArcPresets();
    const presetIndex = presets.findIndex(preset => preset.id === presetId);

	if (presetIndex === -1) return null;

	Object.assign(presets[presetIndex], updates);
	getContext().saveSettingsDebounced();
	return presets[presetIndex];
}

export function deletePreset(presetType, presetId) {
    let presets = getSummarizePresets();
    if (presetType === 'query') presets = getQueryPresets();
    if (presetType === 'timeline_fill') presets = getTimelineFillPresets();
    if (presetType === 'arc') presets = getArcPresets();
    const presetIndex = presets.findIndex(preset => preset.id === presetId);

	if (presetIndex === -1) return false;

	presets.splice(presetIndex, 1);

	// Clear current preset if it was deleted
    if (presetType === 'summarize' && settings.current_summarize_preset === presetId) {
        settings.current_summarize_preset = null;
    } else if (presetType === 'query' && settings.current_query_preset === presetId) {
        settings.current_query_preset = null;
    } else if (presetType === 'timeline_fill' && settings.current_timeline_fill_preset === presetId) {
        settings.current_timeline_fill_preset = null;
    } else if (presetType === 'arc' && settings.current_arc_preset === presetId) {
        settings.current_arc_preset = null;
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
        // Only set profile if preset has one, otherwise keep current setting
        if (preset.profile !== null && preset.profile !== undefined) {
            settings.profile = preset.profile;
        }
        settings.rate_limit = preset.rateLimit;
    } else if (presetType === 'query') {
        settings.current_query_preset = presetId;
        settings.chapter_query_system_prompt = preset.systemPrompt;
        settings.chapter_query_prompt_template = preset.userPrompt;
        // Only set profile if preset has one, otherwise keep current setting
        if (preset.profile !== null && preset.profile !== undefined) {
            settings.query_profile = preset.profile;
        }
    } else if (presetType === 'timeline_fill') {
        settings.current_timeline_fill_preset = presetId;
        settings.timeline_fill_system_prompt = preset.systemPrompt;
        settings.timeline_fill_prompt_template = preset.userPrompt;
        if (preset.profile !== null && preset.profile !== undefined) {
            settings.timeline_fill_profile = preset.profile;
        }
    } else if (presetType === 'arc') {
        settings.current_arc_preset = presetId;
        settings.arc_analyzer_system_prompt = preset.systemPrompt;
        settings.arc_analyzer_prompt_template = preset.userPrompt;
        if (preset.profile !== null && preset.profile !== undefined) {
            settings.arc_profile = preset.profile;
        }
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
    } else if (presetType === 'timeline_fill') {
        systemPrompt = settings.timeline_fill_system_prompt;
        userPrompt = settings.timeline_fill_prompt_template;
        profile = settings.timeline_fill_profile;
        rateLimit = 0;
    } else if (presetType === 'arc') {
        systemPrompt = settings.arc_analyzer_system_prompt;
        userPrompt = settings.arc_analyzer_prompt_template;
        profile = settings.arc_profile;
        rateLimit = 0;
    }

	// Check for existing preset with same name
    let existingPresets = getSummarizePresets();
    if (presetType === 'query') existingPresets = getQueryPresets();
    if (presetType === 'timeline_fill') existingPresets = getTimelineFillPresets();
    if (presetType === 'arc') existingPresets = getArcPresets();
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
    let currentPresetId = settings.current_summarize_preset;
    if (presetType === 'query') currentPresetId = settings.current_query_preset;
    if (presetType === 'timeline_fill') currentPresetId = settings.current_timeline_fill_preset;
    if (presetType === 'arc') currentPresetId = settings.current_arc_preset;

	if (!currentPresetId) {
		throw new Error(`No ${presetType} preset selected for export`);
	}

    const preset = findPresetById(presetType, currentPresetId);
	if (!preset) {
		throw new Error(`Selected ${presetType} preset not found`);
	}

	// Create a copy of the preset without the profile field
	const presetWithoutProfile = {
		id: preset.id,
		name: preset.name,
		systemPrompt: preset.systemPrompt,
		userPrompt: preset.userPrompt,
		rateLimit: preset.rateLimit
	};

	const exportData = {
		version: '1.0',
		type: presetType,
		timestamp: new Date().toISOString(),
		preset: presetWithoutProfile
	};

	return JSON.stringify(exportData, null, 2);
}

// Find existing preset with same name
function findDuplicatePreset(presetType, presetName) {
    let presets = getSummarizePresets();
    if (presetType === 'query') presets = getQueryPresets();
    if (presetType === 'timeline_fill') presets = getTimelineFillPresets();
    if (presetType === 'arc') presets = getArcPresets();
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
        if (presetType !== 'summarize' && presetType !== 'query' && presetType !== 'timeline_fill' && presetType !== 'arc') {
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
					profile: importData.preset.profile || null, // Handle missing profile field
					rateLimit: importData.preset.rateLimit
				});
				return { type: presetType, preset: updated, action: 'overwrite' };
			} else if (result.action === 'rename') {
				// Rename and create new
				finalPreset.name = result.newName;
			}
		}

		// Generate new ID for new preset and ensure profile field is set
		finalPreset.id = generatePresetId();
		if (finalPreset.profile === undefined) {
			finalPreset.profile = null;
		}

        if (presetType === 'summarize') {
            settings.summarize_presets.push(finalPreset);
        } else if (presetType === 'query') {
            settings.query_presets.push(finalPreset);
        } else if (presetType === 'timeline_fill') {
            settings.timeline_fill_presets.push(finalPreset);
        } else if (presetType === 'arc') {
            settings.arc_presets.push(finalPreset);
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

// Master export - export all settings and currently selected presets
export function exportAllSettings() {
	// Helper to get current preset if selected
	const getSelectedPreset = (presetType) => {
		let currentId = null;
		if (presetType === 'summarize') currentId = settings.current_summarize_preset;
		else if (presetType === 'query') currentId = settings.current_query_preset;
		else if (presetType === 'timeline_fill') currentId = settings.current_timeline_fill_preset;
		else if (presetType === 'arc') currentId = settings.current_arc_preset;

		if (!currentId) return null;

		const preset = findPresetById(presetType, currentId);
		if (!preset) return null;

		return {
			id: preset.id,
			name: preset.name,
			systemPrompt: preset.systemPrompt,
			userPrompt: preset.userPrompt,
			rateLimit: preset.rateLimit
		};
	};

	const exportData = {
		version: '1.0',
		extension: 'timeline-memory',
		timestamp: new Date().toISOString(),
		settings: {
			// Core settings
			is_enabled: settings.is_enabled,
			tools_enabled: settings.tools_enabled,
			show_buttons: settings.show_buttons,
			hide_chapter: settings.hide_chapter,
			add_chunk_summaries: settings.add_chunk_summaries,
			chapter_end_mode: settings.chapter_end_mode,
			rate_limit: settings.rate_limit,

			// Custom prompts (used when no preset selected)
			memory_system_prompt: settings.memory_system_prompt,
			memory_prompt_template: settings.memory_prompt_template,
			chapter_query_system_prompt: settings.chapter_query_system_prompt,
			chapter_query_prompt_template: settings.chapter_query_prompt_template,
			timeline_fill_system_prompt: settings.timeline_fill_system_prompt,
			timeline_fill_prompt_template: settings.timeline_fill_prompt_template,
			arc_analyzer_system_prompt: settings.arc_analyzer_system_prompt,
			arc_analyzer_prompt_template: settings.arc_analyzer_prompt_template,

			// Current preset selections
			current_summarize_preset: settings.current_summarize_preset,
			current_query_preset: settings.current_query_preset,
			current_timeline_fill_preset: settings.current_timeline_fill_preset,
			current_arc_preset: settings.current_arc_preset
		},
		presets: {
			summarize: getSelectedPreset('summarize') ? [getSelectedPreset('summarize')] : [],
			query: getSelectedPreset('query') ? [getSelectedPreset('query')] : [],
			timeline_fill: getSelectedPreset('timeline_fill') ? [getSelectedPreset('timeline_fill')] : [],
			arc: getSelectedPreset('arc') ? [getSelectedPreset('arc')] : []
		}
	};

	return JSON.stringify(exportData, null, 2);
}

// Master import - import all settings and presets
export async function importAllSettings(jsonData) {
	try {
		const importData = JSON.parse(jsonData);

		// Validate import data structure
		if (!importData.extension || importData.extension !== 'timeline-memory') {
			throw new Error('Invalid export file: not a Timeline Memory configuration');
		}

		if (!importData.settings || !importData.presets) {
			throw new Error('Invalid export file: missing settings or presets data');
		}

		// Show confirmation dialog with import options
		const result = await showMasterImportDialog(importData);

		if (result.action === 'cancel') {
			throw new Error('Import cancelled by user');
		}

		// Import settings
		if (result.importSettings) {
			// Core settings
			if (importData.settings.is_enabled !== undefined) settings.is_enabled = importData.settings.is_enabled;
			if (importData.settings.tools_enabled !== undefined) settings.tools_enabled = importData.settings.tools_enabled;
			if (importData.settings.show_buttons !== undefined) settings.show_buttons = importData.settings.show_buttons;
			if (importData.settings.hide_chapter !== undefined) settings.hide_chapter = importData.settings.hide_chapter;
			if (importData.settings.add_chunk_summaries !== undefined) settings.add_chunk_summaries = importData.settings.add_chunk_summaries;
			if (importData.settings.chapter_end_mode !== undefined) settings.chapter_end_mode = importData.settings.chapter_end_mode;
			if (importData.settings.rate_limit !== undefined) settings.rate_limit = importData.settings.rate_limit;

			// Prompts
			if (importData.settings.memory_system_prompt !== undefined) settings.memory_system_prompt = importData.settings.memory_system_prompt;
			if (importData.settings.memory_prompt_template !== undefined) settings.memory_prompt_template = importData.settings.memory_prompt_template;
			if (importData.settings.chapter_query_system_prompt !== undefined) settings.chapter_query_system_prompt = importData.settings.chapter_query_system_prompt;
			if (importData.settings.chapter_query_prompt_template !== undefined) settings.chapter_query_prompt_template = importData.settings.chapter_query_prompt_template;
			if (importData.settings.timeline_fill_system_prompt !== undefined) settings.timeline_fill_system_prompt = importData.settings.timeline_fill_system_prompt;
			if (importData.settings.timeline_fill_prompt_template !== undefined) settings.timeline_fill_prompt_template = importData.settings.timeline_fill_prompt_template;
			if (importData.settings.arc_analyzer_system_prompt !== undefined) settings.arc_analyzer_system_prompt = importData.settings.arc_analyzer_system_prompt;
			if (importData.settings.arc_analyzer_prompt_template !== undefined) settings.arc_analyzer_prompt_template = importData.settings.arc_analyzer_prompt_template;
		}

		// Import presets
		if (result.importPresets) {
			const presetTypes = ['summarize', 'query', 'timeline_fill', 'arc'];

			for (const presetType of presetTypes) {
				const importedPresets = importData.presets[presetType] || [];

				for (const importedPreset of importedPresets) {
					if (!validatePreset(importedPreset)) continue;

					// Check for existing preset with same name
					const existingPreset = findDuplicatePreset(presetType, importedPreset.name);

					if (existingPreset) {
						if (result.presetConflict === 'skip') {
							continue; // Skip duplicates
						} else if (result.presetConflict === 'overwrite') {
							// Overwrite existing preset
							updatePreset(presetType, existingPreset.id, {
								systemPrompt: importedPreset.systemPrompt,
								userPrompt: importedPreset.userPrompt,
								rateLimit: importedPreset.rateLimit || 0
							});
						}
						// 'merge' adds as new with different ID (falls through below)
						else if (result.presetConflict === 'merge') {
							// Add as new preset with new ID
							createPreset(
								presetType,
								importedPreset.name,
								importedPreset.systemPrompt,
								importedPreset.userPrompt,
								null,
								importedPreset.rateLimit || 0
							);
						}
					} else {
						// No duplicate, create new preset
						createPreset(
							presetType,
							importedPreset.name,
							importedPreset.systemPrompt,
							importedPreset.userPrompt,
							null,
							importedPreset.rateLimit || 0
						);
					}
				}
			}
		}

		// Restore current preset selections if importing settings
		if (result.importSettings && result.importPresets) {
			// Only restore selection if the preset exists
			if (importData.settings.current_summarize_preset) {
				const preset = findPresetById('summarize', importData.settings.current_summarize_preset);
				if (preset) settings.current_summarize_preset = preset.id;
			}
			if (importData.settings.current_query_preset) {
				const preset = findPresetById('query', importData.settings.current_query_preset);
				if (preset) settings.current_query_preset = preset.id;
			}
			if (importData.settings.current_timeline_fill_preset) {
				const preset = findPresetById('timeline_fill', importData.settings.current_timeline_fill_preset);
				if (preset) settings.current_timeline_fill_preset = preset.id;
			}
			if (importData.settings.current_arc_preset) {
				const preset = findPresetById('arc', importData.settings.current_arc_preset);
				if (preset) settings.current_arc_preset = preset.id;
			}
		}

		getContext().saveSettingsDebounced();

		return {
			settingsImported: result.importSettings,
			presetsImported: result.importPresets,
			presetConflict: result.presetConflict
		};

	} catch (error) {
		console.error('Error importing settings:', error);
		throw new Error(`Failed to import settings: ${error.message}`);
	}
}

// Show dialog for master import options
async function showMasterImportDialog(importData) {
	return new Promise((resolve) => {
		const presetCounts = {
			summarize: (importData.presets.summarize || []).length,
			query: (importData.presets.query || []).length,
			timeline_fill: (importData.presets.timeline_fill || []).length,
			arc: (importData.presets.arc || []).length
		};
		const totalPresets = presetCounts.summarize + presetCounts.query + presetCounts.timeline_fill + presetCounts.arc;

		const message = `Timeline Memory Configuration Import\n\n` +
			`This file contains:\n` +
			`• Settings configuration\n` +
			`• ${totalPresets} presets (${presetCounts.summarize} summarize, ${presetCounts.query} query, ${presetCounts.timeline_fill} timeline fill, ${presetCounts.arc} arc)\n\n` +
			`How would you like to handle preset name conflicts?\n\n` +
			`Click OK to import all and OVERWRITE duplicates\n` +
			`Click Cancel to abort import`;

		const confirmed = confirm(message);

		if (!confirmed) {
			resolve({ action: 'cancel' });
			return;
		}

		resolve({
			action: 'import',
			importSettings: true,
			importPresets: true,
			presetConflict: 'overwrite'
		});
	});
}

// Handle master export button click
function handleMasterExport() {
	try {
		const exportData = exportAllSettings();

		// Create blob and download
		const blob = new Blob([exportData], { type: 'application/json' });
		const url = URL.createObjectURL(blob);
		const a = document.createElement('a');
		a.href = url;
		a.download = `timeline-memory-config-${new Date().toISOString().split('T')[0]}.json`;
		document.body.appendChild(a);
		a.click();
		document.body.removeChild(a);
		URL.revokeObjectURL(url);

		toastr.success('Configuration exported successfully.');
	} catch (error) {
		console.error('Master export error:', error);
		toastr.error(`Failed to export configuration: ${error.message}`);
	}
}

// Handle master import button click
async function handleMasterImport() {
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
				const result = await importAllSettings(jsonData);

				// Reload all preset options
				reloadPresetOptions('summarize');
				reloadPresetOptions('query');
				reloadPresetOptions('timeline_fill');
				reloadPresetOptions('arc');

				// Refresh UI with new values
				refreshPromptFields();
				refreshSettingsUI();

				// Update preset selections in dropdowns
				$('#rmr_summarize_preset').val(settings.current_summarize_preset || '');
				$('#rmr_query_preset').val(settings.current_query_preset || '');
				$('#rmr_timeline_fill_preset').val(settings.current_timeline_fill_preset || '');
				$('#rmr_arc_preset').val(settings.current_arc_preset || '');

				// Update button states
				updatePresetButtons('summarize', settings.current_summarize_preset);
				updatePresetButtons('query', settings.current_query_preset);
				updatePresetButtons('timeline_fill', settings.current_timeline_fill_preset);
				updatePresetButtons('arc', settings.current_arc_preset);

				toastr.success('Configuration imported successfully.');
			} catch (error) {
				console.error('Master import error:', error);
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

// Refresh all settings UI elements
function refreshSettingsUI() {
	// Checkboxes
	$('#rmr_tools_enabled').prop('checked', settings.tools_enabled);
	$('#rmr_hide_chapter').prop('checked', settings.hide_chapter);
	$('#rmr_add_chunk_summaries').prop('checked', settings.add_chunk_summaries);

	// Button checkboxes
	for (const button in Buttons) {
		const button_name = Buttons[button];
		$(`#rmr_${button_name}`).prop('checked', settings.show_buttons.includes(button_name));
	}

	// Numeric inputs
	$('#rmr_rate_limit').val(settings.rate_limit);
}

// Render the summaries list in the settings panel
export async function renderSummariesList() {
	const container = $('#rmr_summaries_container');
	if (!container.length) return;

	// Dynamically import to avoid circular dependencies
	const { getTimelineEntries, updateChapterSummary } = await import('./memories.js');
	const timeline = getTimelineEntries();

	container.empty();

	if (!timeline || timeline.length === 0) {
		container.append('<div class="rmr-summaries-empty">No chapters in current chat. End a chapter to create a summary.</div>');
		return;
	}

	timeline.forEach((chapter, index) => {
		const chapterNum = index + 1;
		const startMsg = chapter.startMsgId === 0 ? 0 : chapter.startMsgId + 1;
		const endMsg = chapter.endMsgId;

		const summaryItem = $(`
			<div class="rmr-summary-item" data-chapter="${chapterNum}">
				<div class="rmr-summary-header">
					<span>Chapter ${chapterNum}</span>
					<span class="rmr-summary-range">Messages ${startMsg} - ${endMsg}</span>
					<button type="button" class="rmr-summary-expand" data-chapter="${chapterNum}" data-start="${startMsg}" data-end="${endMsg}" title="Edit in fullscreen">
						<i class="fa-solid fa-expand"></i>
					</button>
				</div>
				<textarea class="rmr-summary-text text_pole" data-chapter="${chapterNum}">${escapeHtml(chapter.summary || '')}</textarea>
				<div class="rmr-summary-actions">
					<button type="button" class="menu_button rmr-save-summary" data-chapter="${chapterNum}" disabled>Save</button>
				</div>
			</div>
		`);

		container.append(summaryItem);
	});

	// Store original values and handle change detection
	container.find('.rmr-summary-text').each(function() {
		const textarea = $(this);
		textarea.data('original', textarea.val());

		textarea.on('input', function() {
			const chapterNum = $(this).data('chapter');
			const saveBtn = container.find(`.rmr-save-summary[data-chapter="${chapterNum}"]`);
			const hasChanged = $(this).val() !== $(this).data('original');
			saveBtn.prop('disabled', !hasChanged);
		});
	});

	// Handle save button clicks
	container.find('.rmr-save-summary').on('click', async function() {
		const chapterNum = $(this).data('chapter');
		const textarea = container.find(`.rmr-summary-text[data-chapter="${chapterNum}"]`);
		const newSummary = textarea.val();

		const success = updateChapterSummary(chapterNum, newSummary);

		if (success) {
			textarea.data('original', newSummary);
			$(this).prop('disabled', true);
			toastr.success(`Chapter ${chapterNum} summary updated.`, 'Timeline Memory');
		} else {
			toastr.error(`Failed to update chapter ${chapterNum} summary.`, 'Timeline Memory');
		}
	});

	// Handle expand button clicks to open popup
	container.find('.rmr-summary-expand').on('click', function() {
		const chapterNum = $(this).data('chapter');
		const startMsg = $(this).data('start');
		const endMsg = $(this).data('end');
		const textarea = container.find(`.rmr-summary-text[data-chapter="${chapterNum}"]`);
		const currentText = textarea.val();

		openSummaryPopup(chapterNum, startMsg, endMsg, currentText, updateChapterSummary);
	});
}

// Open the fullscreen summary popup
function openSummaryPopup(chapterNum, startMsg, endMsg, currentText, updateChapterSummary) {
	const popup = $('#rmr_summary_popup');
	const popupTextarea = $('#rmr_popup_textarea');
	const saveBtn = $('#rmr_popup_save');

	// Set popup content
	$('#rmr_popup_chapter_num').text(chapterNum);
	$('#rmr_popup_range').text(`Messages ${startMsg} - ${endMsg}`);
	popupTextarea.val(currentText);
	popupTextarea.data('original', currentText);
	popupTextarea.data('chapter', chapterNum);
	saveBtn.prop('disabled', true);

	// Show popup
	popup.css('display', 'flex');

	// Focus textarea
	popupTextarea.focus();

	// Handle text changes
	popupTextarea.off('input').on('input', function() {
		const hasChanged = $(this).val() !== $(this).data('original');
		saveBtn.prop('disabled', !hasChanged);
	});

	// Handle save
	saveBtn.off('click').on('click', async function() {
		const newSummary = popupTextarea.val();
		const chapter = popupTextarea.data('chapter');

		const success = updateChapterSummary(chapter, newSummary);

		if (success) {
			// Update the inline textarea as well
			const inlineTextarea = $(`.rmr-summary-text[data-chapter="${chapter}"]`);
			inlineTextarea.val(newSummary);
			inlineTextarea.data('original', newSummary);
			$(`.rmr-save-summary[data-chapter="${chapter}"]`).prop('disabled', true);

			// Update popup state
			popupTextarea.data('original', newSummary);
			saveBtn.prop('disabled', true);

			toastr.success(`Chapter ${chapter} summary updated.`, 'Timeline Memory');
			closeSummaryPopup();
		} else {
			toastr.error(`Failed to update chapter ${chapter} summary.`, 'Timeline Memory');
		}
	});

	// Handle cancel/close
	$('#rmr_popup_cancel').off('click').on('click', closeSummaryPopup);
	$('#rmr_popup_close').off('click').on('click', closeSummaryPopup);

	// Handle clicking outside popup to close
	popup.off('click').on('click', function(e) {
		if (e.target === this) {
			closeSummaryPopup();
		}
	});

	// Handle escape key to close
	$(document).off('keydown.summaryPopup').on('keydown.summaryPopup', function(e) {
		if (e.key === 'Escape') {
			closeSummaryPopup();
		}
	});
}

// Close the fullscreen summary popup
function closeSummaryPopup() {
	$('#rmr_summary_popup').hide();
	$(document).off('keydown.summaryPopup');
}

// Helper function to escape HTML
function escapeHtml(text) {
	const div = document.createElement('div');
	div.textContent = text;
	return div.innerHTML;
}

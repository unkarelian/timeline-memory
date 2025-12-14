import { getContext } from "../../../../extensions.js";
import { settings, Buttons } from "./settings.js";
import { endChapter, removeChapterFromTimeline } from "./memories.js";

const TITLE_END_CHAPTER = "Close off the chapter and summarize it";
const TITLE_UNSET_CHAPTER = "Unset this message as a chapter end";

const endChapterDiv = `<div class="mes_button rmr-button fa-solid fa-circle-stop interactable"
	title="${TITLE_END_CHAPTER}"
	data-i18n="[title]${TITLE_END_CHAPTER}"
	tabindex="0"
	role="button"
	aria-label="${TITLE_END_CHAPTER}"></div>`;

export function toggleChapterHighlight(button, mes_id) {
	button.off('click');
	if (getContext().chat[mes_id]?.extra?.rmr_chapter) {
		button.removeClass('fa-circle-stop');
		button.addClass('rmr-chapter-point fa-circle-check');
		button.prop("title", TITLE_UNSET_CHAPTER);
		button.attr("aria-label", TITLE_UNSET_CHAPTER);
		button.on('click', (e) => {
			const mesId = Number($(e.target).closest('.mes').attr('mesid'));

			// Remove the chapter from timeline
			const removed = removeChapterFromTimeline(mesId);

			// Remove the chapter end marker
			getContext().chat[mesId].extra.rmr_chapter = false;
			getContext().saveChat();

			// Update the button
			toggleChapterHighlight($(e.target), mesId);

			// Show feedback
			if (removed) {
				toastr.success('Chapter removed from timeline', 'Timeline Memory');
			}
		});
	} else {
		button.removeClass('rmr-chapter-point fa-circle-check');
		button.addClass('fa-circle-stop');
		button.prop("title", TITLE_END_CHAPTER);
		button.attr("aria-label", TITLE_END_CHAPTER);
		button.on('click', (e) => {
			const message = $(e.target).closest('.mes');
			endChapter(message);
		});
	}
}

export function addMessageButtons(message) {
	const mes_id = Number(message.attr('mesid'));
	const buttonbox = message.find('.extraMesButtons');

	// Check if button already exists to prevent duplicates
	if (buttonbox.find('.rmr-button').length) {
		// Update existing button state instead of recreating
		toggleChapterHighlight(buttonbox.find('.rmr-button'), mes_id);
		return;
	}

	if (settings.show_buttons.includes(Buttons.STOP)) {
		const newButton = $(endChapterDiv);
		toggleChapterHighlight(newButton, mes_id);

		// Smart positioning: insert after narrate button if it exists, otherwise prepend
		const narrateButton = buttonbox.find('.mes_narrate');
		if (narrateButton.length) {
			narrateButton.after(newButton);
		} else {
			buttonbox.prepend(newButton);
		}
	}
}

export function resetMessageButtons() {
	document.querySelectorAll('#chat > .mes[mesid]').forEach(it=>addMessageButtons($(it)));
}
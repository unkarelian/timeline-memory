import { getContext } from "../../../../extensions.js";
import { settings, Buttons } from "./settings.js";
import { endChapter, removeChapterFromTimeline } from "./memories.js";

const endChapterDiv = `<div class="rmr-button fa-solid fa-fw fa-circle-stop interactable" title="Close off the chapter and summarize it" tabindex="0"></div>`;

// context.executeSlashCommandsWithOptions('/echo title="My Echo" "My text here"');

export function toggleChapterHighlight(button, mes_id) {
	button.off('click');
	if (getContext().chat[mes_id]?.extra?.rmr_chapter) {
		button.removeClass('fa-circle-stop');
		button.addClass('rmr-chapter-point fa-circle-check');
		button.prop("title", "Unset this message as a chapter end");
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
		button.prop("title", "Close off the chapter and summarize it");
		button.on('click', (e) => {
			const message = $(e.target).closest('.mes');
			endChapter(message);
		});
	}
}

export function addMessageButtons(message) {
	const mes_id = Number(message.attr('mesid'));
	const buttonbox = message.find('.extraMesButtons');
	// clear out any existing buttons just in case
	buttonbox.find('.rmr-button').remove();

	if (settings.show_buttons.includes(Buttons.STOP)) {
		let newButton = $(endChapterDiv);
		toggleChapterHighlight(newButton, mes_id);
		buttonbox.prepend(newButton);
	}
}

export function resetMessageButtons() {
	document.querySelectorAll('#chat > .mes[mesid]').forEach(it=>addMessageButtons($(it)));
}
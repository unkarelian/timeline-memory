# timeline-memory

A reworked SillyTavern extension for creating a timeline of summarized chapters from your chat sessions.

## Features

- **Chapter Timeline**: Summarize chapters and track them in a linear timeline accessible via the `{{timeline}}` macro
- **AI Chapter Queries**: Enable function/tool calls to let the AI query specific chapters with questions
- **Customizable Prompts**: Configure prompts for scene summarization and queries
- **Connection Profile Support**: Select specific connection profiles for summarization and queries
- **Chat Cleanup Tools**: Built-in slash commands to remove reasoning traces and tool call artifacts

## Installation

Install like any other SillyTavern extension, with the Github link: `https://github.com/InspectorCaracal/timeline-memory`

## Usage

### Chapter Management

Click the "End Chapter" button (⏹️) on any message to:
- Summarize all messages from the last chapter marker (or chat start) to that message
- Add the summary to the timeline with message IDs for reference
- Optionally hide the summarized messages

Chapter end-point messages can be unset by clicking the checkmark button. This will:
- Remove the chapter from the timeline
- Unhide any messages that were hidden when the chapter was summarized
- Remove the chapter end marker from the message

### Macros

The extension provides the following macros:

- `{{timeline}}` - Outputs a JSON-formatted timeline of all chapter summaries in the current chat. The timeline includes structured information with chapter IDs, message ranges, and summaries.
- `{{chapterSummary}}` - A placeholder macro that gets replaced with the actual chapter summary during chapter queries. This is automatically substituted when using the `/timeline-query` command or the AI function tool.

### AI Chapter Queries

When "Enable Tool/Function Calls" is checked in settings, the AI can query specific chapters using the `query_timeline_chapter` function. This allows the AI to:
- Access the full content of any summarized chapter
- Answer questions about specific events
- Reference past conversations accurately

### Manual Chapter Queries

You can also manually query chapters using the slash command:
```
/timeline-query chapter=2 What did Alice say about the treasure map?
```

## Configuration

### General Settings
- **Enable Tool/Function Calls**: Allow the AI to query chapters via function calls

### API Connection Profiles
- **Summarization Profile**: Connection profile to use for chapter summarization
- **Chapter Query Profile**: Connection profile to use for chapter queries
- **Max Requests per Minute**: Rate limiting to avoid API throttling

### Prompts
- **Chapter Summary Prompt**: Customize the prompt used for summarizing chapters
  - Default uses `{{content}}` placeholder for the chapter content
- **Chapter Query Prompt**: Customize the prompt used for querying chapters
  - Uses `{{timeline}}`, `{{chapter}}`, and `{{query}}` placeholders

### Chapter Settings
- **Hide Summarized Messages**: Automatically hide messages after summarizing
- **Add chunk summaries**: Include individual chunk summaries as comments (for long chapters)

## Slash Commands

### `/chapter-end {id}`
End the chapter at a message (equivalent to the Stop button)
- `id`: Message ID (defaults to most recent)
- Named arguments:
  - `profile`: Connection profile override
- Note: `/scene-end` is still supported as an alias for backward compatibility

### `/timeline-query chapter={n} {query}`
Query a specific chapter from the timeline
- `chapter`: Chapter number (required, 1-based)
- `query`: The question to ask (required)

### `/timeline-undo {id}`
Remove a chapter end marker and its timeline entry
- `id`: Message ID (defaults to most recent)

### `/timeline-migrate`
Migrate old timeline entries to the new format by removing timestamps. Use this command if you have timeline entries created before version 2.1.0.
- No arguments required
- Will report how many entries were migrated

### `/chapter-summary {n}`
Get the summary of a specific chapter from the timeline
- `n`: Chapter number (required, 1-based)

### `/remove-reasoning {range}`
Remove reasoning/thinking blocks from assistant messages in the specified range
- `range`: Single ID (e.g., `5`) or range (`1-10`)
- Skips user messages automatically and refreshes the chat once complete

### `/remove-tool-calls`
Remove tool invocation messages and their associated assistant prompts
- No arguments required
- Clears both the tool call summaries and the assistant message that asked for them

## Requirements

- SillyTavern version 1.13.0 or higher
- Connection Manager extension (for profile selection)

## Changelog

### v2.3.0
- Added `/remove-reasoning` and `/remove-tool-calls` cleanup commands directly to Timeline Memory
- Improved chat refresh after cleanup toasts for better feedback

### v2.1.0
- **Removed**: System timestamps from timeline entries for cleaner output
- **Added**: `/timeline-migrate` command to update old timeline entries
- Timeline now shows only chapter number and message range without timestamps

## Changes from v1.x

This is a major rework that changes the core functionality:
- **Removed**: Lorebook/World Info memory entries
- **Removed**: Individual message memory generation
- **Added**: Timeline-based chapter tracking
- **Added**: AI function calls for chapter queries
- **Added**: {{timeline}} macro for accessing chapter history

## Support

Feel free to open issues or PRs directly here, although no promises on timely resolution.

There is also a thread in the official SillyTavern Discord you're welcome to comment in!

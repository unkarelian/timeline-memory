# Timeline Memory

A SillyTavern extension for creating a timeline of summarized chapters from your chat sessions, with intelligent context retrieval and lorebook management capabilities.

## Features

- **Chapter Timeline**: Summarize chapters and track them in a linear timeline accessible via macros
- **Arc Analyzer**: AI-powered detection of natural chapter endpoints in your chat
- **Timeline Fill**: Smart context retrieval that queries relevant chapters based on current conversation
- **Inject at Depth**: Automatic timeline injection into AI context without prompt editing
- **Lore Management Mode**: Autonomous AI-driven lorebook editing based on story events
- **Customizable Presets**: Save and share configurations for all workflow types
- **AI Tool Calls**: Enable the AI to query specific chapters directly via function calls
- **Chat Cleanup Tools**: Built-in commands to remove reasoning traces and tool call artifacts

## Installation

Install like any other SillyTavern extension using the GitHub link:
```
https://github.com/unkarelian/timeline-memory
```

## Requirements

- SillyTavern version 1.13.0 or higher
- Connection Manager extension (for profile selection)

## Quick Start

1. **Create Connection Profiles**: Set up profiles in Connection Manager for your AI providers
2. **Enable Inject at Depth**: Turn on automatic timeline injection (recommended for most users)
3. **Create Chapters**: Use Arc Analyzer or manual chapter buttons to create chapter summaries
4. **Use Timeline Fill**: Click the quick buttons to retrieve relevant context before sending messages

## Core Concepts

### Chapters

A chapter represents a segment of your chat with an AI-generated summary. Chapters are defined by their endpoints - when you "end a chapter," the extension summarizes all messages from the previous chapter end (or chat start) to that point.

### Timeline

The timeline is a chronological list of all your chapter summaries, stored in the chat metadata. It's accessible via the `{{timeline}}` macro and can be automatically injected into the AI's context.

### Connection Profiles

Timeline Memory uses SillyTavern's Connection Manager profiles for all AI API calls. Different profiles can be assigned to different tasks (summarization, queries, arc analysis, etc.).

## Features Guide

### Chapter Management

#### Arc Analyzer (Recommended)

The Arc Analyzer scans your chat and suggests natural chapter endpoints based on story beats.

1. Select an **Arc Analyzer Profile** in settings (or use default)
2. Click **"Analyze Arcs"** button
3. Review the suggested chapter breaks in the popup
4. Click on any arc to create a chapter ending at that point

The AI will summarize everything from the start (or last chapter) to the selected point.

#### Manual Chapter Creation

Click the **Stop button** on any message to manually end a chapter:

1. Hover over any message in the chat
2. Click the stop button that appears
3. The AI summarizes all messages from the previous chapter end to that message

The button only appears if "End Chapter" is enabled in Message Buttons settings.

#### Viewing & Editing Summaries

Chapter summaries appear in the **Summaries** section of the settings panel:

- **Edit** summaries by clicking directly on the text
- **Expand** using the expand button for a larger editor
- **Save** changes with the Save button

Good summaries lead to better recall - focus on key plot points, character changes, and important details.

### Timeline Fill (Smart Retrieval)

Timeline Fill automatically queries your chapter history to gather relevant context for the current conversation.

**How it works:**
1. The AI reads your current chat and chapter summaries
2. It identifies what past information is relevant
3. It queries the appropriate chapters and retrieves details
4. Results are stored in `{{timelineResponses}}` and injected into context

**Quick Buttons** (in the bottom bar near the send button):
- **Chat bubble** - Retrieve and Send: Retrieves timeline context, then sends your message
- **Recycle wheel** - Retrieve and Swipe: Retrieves timeline context, then regenerates the last response

### Inject at Depth

Inject at Depth automatically adds your timeline to the AI's context without manual prompt editing.

**To enable:**
1. Check "Enable Timeline Injection"
2. Set **Injection Depth** (0 = at the end, higher = further back in history)
3. Choose **Injection Role** (System recommended)

The default prompt template includes:
- `{{timeline}}` - Your chapter summaries
- `{{timelineResponses}}` - Retrieved context from Timeline Fill
- `{{lastMessageId}}` and `{{firstIncludedMessageId}}` - Position info

**Depth explained:**
- Depth 0: Appears after all messages (closest to AI response)
- Depth 1: Appears before the last message
- Higher depths: Pushes the injection further back

### Presets

Presets let you save and switch between different prompt configurations.

**Preset types:**
- **Summarization**: Prompts for creating chapter summaries
- **Query**: Prompts for answering chapter questions
- **Timeline Fill**: Prompts for context retrieval
- **Arc Analyzer**: Prompts for detecting story arcs

**Managing presets:**
- **Save**: Create a new preset from current settings
- **Update**: Overwrite the selected preset
- **Delete**: Remove the selected preset
- **Export/Import**: Share presets as JSON files
- **Export All / Import All**: Backup/restore your entire configuration

### Lore Management Mode

Lore Management Mode lets the AI automatically update your character's lorebook based on story events.

**What it does:**
The AI reads your story, identifies important lore (characters, locations, events, relationships), and creates/updates lorebook entries automatically.

**Requirements:**
- A character with an assigned World Info/Lorebook
- A capable AI model that supports function/tool calls
- A properly configured Lore Management profile

**To use:**
1. Create a Lore Management Profile using a powerful model with tool support
2. Select the profile in the Lore Management section
3. Ensure your character has a lorebook assigned
4. Enable "Lore Management Mode"
5. Click "Run Lore Management"
6. The AI analyzes your story and edits the lorebook
7. When done, it signals completion automatically

**The AI can:**
- List existing lorebook entries
- Create new entries with keywords
- Update existing entries with new information
- Set entries as "constant" (always active) or keyword-triggered
- Delete entries when appropriate

### AI Tool Calls

When "Enable Tool/Function Calls" is checked, the AI can query chapters directly:
- `query_timeline_chapter`: Query a single chapter
- `query_timeline_chapters`: Query a range of chapters

This allows the AI to access the full content of any summarized chapter and answer questions about specific events.

## Macros

The extension provides the following macros for use in prompts:

| Macro | Description |
|-------|-------------|
| `{{timeline}}` | JSON-formatted timeline of all chapter summaries with chapter IDs and message ranges |
| `{{chapter}}` | All chapter contents with headers in order |
| `{{chapterSummary}}` | All chapter summaries with headers in order |
| `{{chapterHistory}}` | Visible chat history as JSON array of `{ id, name, role, text }` |
| `{{timelineResponses}}` | Latest timeline fill query results as JSON array |
| `{{lastMessageId}}` | The ID of the most recent message in the chat |
| `{{firstIncludedMessageId}}` | The ID of the first message in the current chapter |

## Slash Commands

### Chapter Management

| Command | Description |
|---------|-------------|
| `/chapter-end {id}` | End the chapter at a message (defaults to most recent). Options: `profile` |
| `/timeline-undo {id}` | Remove a chapter end marker and its timeline entry |
| `/timeline-remove {n}` | Force remove a chapter by number (useful if marker cleanup failed) |
| `/resummarize chapter={n}` | Regenerate summary for an existing chapter. Options: `profile`, `quiet` |

### Queries

| Command | Description |
|---------|-------------|
| `/timeline-query chapter={n} {question}` | Query a specific chapter with a question |
| `/timeline-query-chapters start={n} end={m} {question}` | Query a range of chapters |
| `/chapter-summary {n}` | Get the summary of a specific chapter |

### Timeline Fill

| Command | Description |
|---------|-------------|
| `/timeline-fill` | Generate and execute timeline queries, store results in `{{timelineResponses}}`. Options: `profile`, `await` |
| `/timeline-fill-status` | Preview stored timeline fill results |

### Analysis & Management

| Command | Description |
|---------|-------------|
| `/arc-analyze` | Analyze the chat for arc endpoints and show popup. Options: `profile` |
| `/lore-manage` | Start a lore management session |

### Chat Cleanup

| Command | Description |
|---------|-------------|
| `/remove-reasoning {range}` | Remove reasoning/thinking blocks from messages (e.g., `5` or `1-10`) |
| `/remove-tool-calls` | Remove all tool call messages and their invoking prompts |

### Utility

| Command | Description |
|---------|-------------|
| `/timeline-migrate` | Migrate old timeline entries to current format |

## Configuration

### General Settings

- **Enable Tool/Function Calls**: Allow the AI to query chapters via function calls
- **Start Tutorial**: Launch the interactive tutorial
- **Export All / Import All**: Backup and restore your entire configuration

### API Connection Profiles

- **Summarization Profile**: For chapter summarization
- **Chapter Query Profile**: For answering chapter questions
- **Timeline Fill Profile**: For generating retrieval queries
- **Arc Analyzer Profile**: For detecting story arcs
- **Lore Management Profile**: For lorebook editing
- **Max Requests per Minute**: Rate limiting to avoid API throttling

### Prompts

Each workflow type has configurable system and user prompts with macro support.

### Chapter Settings

- **Hide Summarized Messages**: Automatically hide messages after summarizing
- **Add chunk summaries**: Include individual chunk summaries as comments (for long chapters)

### Inject at Depth

- **Enable Timeline Injection**: Toggle automatic timeline injection
- **Injection Depth**: Position in message history (0 = end)
- **Injection Role**: System, User, or Assistant
- **Injection Prompt Template**: Customizable template with macro support

## Version History

| Version | Features |
|---------|----------|
| v1.0 | Initial release with tool calling for chapter queries |
| v1.1 | Added presets for summarization and query configurations |
| v1.2 | Added Arc Analyzer for automatic chapter endpoint detection |
| v1.3 | Added Timeline Fill for non-tool based memory retrieval |
| v1.4 | Fixed timeline responses, added master import/export |
| v1.5 | Added Lore Management Mode for autonomous lorebook editing |
| v1.6 | Arc Analyzer revamp, added modifiable chapter summaries |
| v1.7 | Updated default prompts |
| v1.8 | Usability update: tutorial mode, timeline-fill buttons, inject at depth, progress bar |

## Support

Feel free to open issues or PRs directly on GitHub, although no promises on timely resolution.

There is also a thread in the official SillyTavern Discord you're welcome to comment in!

# TUI Design: OpenClaude-Style Terminal Interface

**Date:** 2026-04-17
**Approach:** Full copy of OpenClaude's custom Ink rendering engine

## Overview

Replace minimal-agent's simple readline-based REPL with a full terminal UI using OpenClaude's custom Ink rendering engine. This gives the complete TUI experience: message history, styled prompt, status bar, and welcome art.

## Architecture

### New Dependencies

- `react` - React for UI components
- `react-dom` - React DOM for rendering
- `yoga-layout` - Yoga flexbox layout engine
- (Copy all other dependencies from OpenClaude: scheduler, react-reconciler, etc.)

### New Source Structure

```
src/
├── ink/                          # COPIED from OpenClaude
│   ├── ink.tsx                  # Core Ink class
│   ├── layout/
│   │   └── yoga.ts              # Yoga layout engine
│   ├── screen.ts                # Screen management
│   ├── render-node-to-output.ts # Rendering pipeline
│   └── components/
│       ├── App.tsx
│       ├── Box.tsx
│       ├── Text.tsx
│       ├── Button.tsx
│       ├── ScrollBox.tsx
│       ├── Link.tsx
│       └── AlternateScreen.tsx
├── components/                  # TUI components
│   ├── REPL.tsx               # Main REPL screen
│   ├── Messages.tsx            # Message history display
│   ├── VirtualMessageList.tsx  # Virtual scrolling
│   ├── PromptInput/
│   │   ├── PromptInput.tsx   # Input component
│   │   └── PromptInputFooter.tsx
│   └── StatusLine.tsx          # Status bar
├── utils/
│   └── theme.ts               # Theme/colors
├── tui.ts                  # NEW: Entry point for TUI mode
└── (existing files preserved: client.ts, config.ts, tools/, commands/)
```

## Layout Specification

### Screen Layout (top to bottom)

```
┌─────────────────────────────────────────────────────────────┐
│                                                             │
│  [Welcome Art / ASCII Banner]                               │
│                                                             │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  [Message History - virtual scrollable]                    │
│                                                             │
│  ┌─────────────────────────────────────────────────────────┐│
│  │ User message                                           ││
│  └─────────────────────────────────────────────────────────┘│
│  ┌─────────────────────────────────────────────────────────┐│
│  │ Assistant message (with tool results if applicable)    ││
│  └─────────────────────────────────────────────────────────┘│
│                                                             │
├─────────────────────────────────────────────────────────────┤
│  ┌─────────────────────────────────────────────────────────┐│
│  │ > [User input here]                                     ││
│  └─────────────────────────────────────────────────────────┘│
├─────────────────────────────────────────────────────────────┤
│  [Status: model | provider]                                  │
└─────────────────────────────────────────────────────────────┘
```

### Styling

- **Status bar:** Dark background, positioned at bottom row
- **Prompt:** Light blue text (`#56B4C9`), positioned above status bar
- **Messages:** Different background colors for user vs assistant
- **Welcome art:** Cyan ASCII art from current minimal-agent

### Behavior

- **Welcome:** Show ASCII art on startup, clear on first message
- **Message history:** Virtual scrolling for performance
- **Input:** React-controlled input with keyboard handling
- **Status:** Shows active_model + active_provider (from config)

## Integration Points

### Keep from existing

1. **API client** (`src/client.ts`) - unchanged, used for chat
2. **Tool system** (`src/tools/`) - unchanged, runs on tool calls
3. **Config** (`src/config.ts`) - unchanged, loads model/provider
4. **Commands** (`src/commands/`) - can add as slash commands in TUI

### New

1. **Entry point** - Add `bun run tui` or `--tui` flag to `src/cli.ts`
2. **Message format** - Convert existing message format to TUI display
3. **Tool result display** - Show tool results in message bubbles

## Implementation Order

1. Copy dependencies to `package.json`
2. Copy `src/ink/` directory structure
3. Copy component files
4. Create `src/tui.ts` entry point
5. Integrate with existing client/config
6. Test basic loop
7. Add message history display
8. Add styling matching OpenClaude

## Acceptance Criteria

- [ ] TUI mode starts with `bun run tui` or `--tui` flag
- [ ] Welcome ASCII art displays on startup
- [ ] Message history scrolls with keyboard
- [ ] Prompt accepts input and sends to API
- [ ] Status bar shows model + provider
- [ ] Tool results display inline with messages
- [ ] Same visual experience as OpenClaude REPL
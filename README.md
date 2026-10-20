# DSH Model Effort Picker

A plugin for [DeepSeek Harness (DSH)](https://github.com/deepseek-ai) (`dsh-effort-picker`) that replaces the standard "Effort" menu item with an intuitive, **sticky effort slider** directly inside the composer model menu.

It simplifies switching reasoning effort levels (e.g., thinking budgets) in real time without navigating submenus, and automatically adds standard effort levels for custom models.

## Features

- **Sticky Effort Slider**: Pins an effort slider to the bottom of the composer model selection dropdown. It stays visible and fixed as a footer even while scrolling through long model lists.
- **Auto-Configured for Custom Models**: For custom models added under *Settings → Models* (`llm-pi-ai`) that lack reasoning effort configurations, the plugin automatically provides generic stops: **off**, **low**, **medium**, and **high**.
- **Smooth Snapping & Accessibility**: Sliders snap cleanly to declared model levels. Supports smooth drag-and-release, direct label clicks, and full keyboard navigation (`←`, `→`, `Home`, `End`, and `Escape`).
- **Seamless UI Integration**: Automatically hides the default redundant "Effort" row while preserving the rest of the native model picker and search functionality.
- **Localization**: Includes English (`en`) and Chinese (`zh`) metadata and UI labels.

## How It Works

- **DOM Portaling**: Anchors into `conversation.input.right`, monitors the active composer's model trigger button, and dynamically portals the slider into the open menu card.
- **Per-Session State**: Reads and updates values through DSH's native `ctx.modelDirectories` service, ensuring trigger badges and session state update instantaneously.
- **Safe Settings Mutation**: When setting generic effort levels on a custom provider model for the first time, it securely writes to the configuration using `settings.mutate` with conflict retry handling, never overwriting existing custom settings.

## Installation

Install the plugin into your DSH web profile:

```sh
# From a local folder
dsh plugin --profile web add file:path/to/dsh-effort-picker

# Or directly from a Git repository
dsh plugin --profile web add https://github.com/Gorkaseto/dsh-effort-picker.git
```

## Project Structure

```text
├── client.js          # Client module: sticky slider component, DOM portaling, and settings sync
├── index.js           # Host service entry point
├── cordis.patch.yml   # Cordis plugin manifest definition
├── icon.svg           # Plugin icon
├── locale/            # Internationalization metadata files (en.json, zh.json)
├── package.json       # Plugin manifest and dependencies
├── LICENSE            # Apache-2.0 License
└── NOTICE             # Copyright and attribution notices
```

## License

Licensed under the [Apache License, Version 2.0](LICENSE). See [NOTICE](NOTICE) for details.

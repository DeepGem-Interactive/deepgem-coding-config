# DeepGem Config

Claude Code plugin marketplace for DeepGem Interactive's project management methodology.

## Installation

```bash
# Add the marketplace
/plugin marketplace add https://github.com/DeepGem-Interactive/deepgem-coding-config

# Install the plugin
/plugin install deepgem-coding-config
```

## Available Plugins

### deepgem-coding-config

SOW generation from meeting notes.

**Skills:**
- `/deepgem-coding-config:create-sow` - Generate a Statement of Work from meeting notes

## Usage

After installing, run:

```
/deepgem-coding-config:create-sow
```

The skill will:
1. Ask for meeting notes (paste text, file path, or describe)
2. Extract client info, deliverables, and commercial terms
3. Ask clarifying questions (rate, hours, dates)
4. Generate a complete SOW in DeepGem format

## Structure

```
.claude-plugin/marketplace.json    # Marketplace manifest
plugins/
└── deepgem-coding-config/
    ├── .claude-plugin/plugin.json # Plugin manifest
    ├── skills/
    │   └── create-sow/SKILL.md    # SOW generation skill
    └── knowledge/
        ├── templates/             # SOW template
        ├── processes/             # PM methodology
        ├── examples/              # Real examples
        └── product/               # Vision, personas
```

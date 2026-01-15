# Vision

## What This Is

DeepGem-Config is a set of Claude Code skills that help DeepGem Interactive's project managers execute the change-centric planning methodology.

The AI becomes a PM assistant that knows the internal processes, references templates, and executes workflows end-to-end—asking clarifying questions when needed rather than making assumptions.

## The Problem

PMs spend significant time on document generation that follows predictable patterns:
- SOWs from meeting notes
- Change order assessments from client requests
- Definition of Done documents from discovery sessions

This work requires judgment, but much of it is templated. The PM's value is in the decisions and client relationships, not in formatting documents.

## Core Insight

The methodology is well-defined. The templates exist. The patterns are clear. What's missing is AI that knows all of this context and can execute reliably.

When the PM pastes meeting notes and runs `/generate-sow`, the AI should:
1. Know exactly what a DeepGem SOW looks like
2. Extract the right information from messy transcripts
3. Ask smart questions about what's missing (pricing, timeline)
4. Generate a document ready for review—not a rough draft

## First Milestone: SOW Generation

**Input:** Meeting notes (transcript, bullets, email thread)
**Output:** Complete Statement of Work in DeepGem format

The skill references:
- `knowledge/templates/sow-template.md` - exact structure
- `knowledge/processes/project-management-system.md` - methodology context
- `knowledge/examples/sow-efficientaid.md` - real example

Located at: `.claude/skills/generate-sow/SKILL.md`

## Future Skills

**Phase 2: Change Order Management**
- Generate change order assessments from client requests
- Use the BrainGrid format from the methodology
- Calculate impact on timeline and budget

**Phase 3: Project Setup**
- Create ClickUp structure from signed SOW
- Generate Definition of Done epics
- Set up milestone plan

**Phase 4: Integrations**
- ClickUp API: Read/write tasks, sync status
- PandaDoc API: Generate documents directly

## Why This Wins

The AI knows DeepGem's specific methodology, not generic PM practices. It enforces the two non-negotiables:
1. Nothing gets built unless it maps to the DoD or has an approved change order
2. Nothing is "done" until it's verified

Every skill reinforces this system rather than working around it.

---
name: create-sow
description: "Generate a Statement of Work from meeting notes/recordings - walks PM through gathering context, then produces a complete SOW"
version: 1.0.0
category: pm-tools
triggers:
  - "create sow"
  - "generate sow"
  - "new sow"
  - "statement of work"
  - "meeting to sow"
---

# Create SOW

Generate a complete Statement of Work by gathering meeting context from the PM and producing a review-ready document.

<philosophy>
The PM's value is in client relationships and judgment—not formatting documents. This skill handles the templated work so the PM can focus on reviewing and refining.

We don't guess. When information is missing, we ask. When commercial terms aren't specified, we confirm before generating.
</philosophy>

## Workflow

### Step 1: Gather Meeting Context

Start by asking the PM for the source material.

Use AskUserQuestion:
```
"What meeting notes or recordings do you have?"
- Paste transcript text
- Provide file path to transcript
- Describe the conversation (I'll ask follow-up questions)
```

If they provide a file path, read it. If they paste text, work with that. If they want to describe it, proceed to structured questions.

### Step 2: Load Knowledge

Before processing, read the reference materials:

```
@knowledge/templates/sow-template.md
@knowledge/processes/project-management-system.md
@knowledge/examples/sow-efficientaid.md
```

These provide:
- Exact SOW structure and sections
- DeepGem's project management methodology
- A real example showing input→output transformation

### Step 3: Extract Information

From the meeting notes, identify and extract:

**Client Information:**
- Client first name (for greeting)
- Client company name
- Their role/title
- Key stakeholder names

**Business Context:**
- What problem are they solving?
- Current situation and pain points
- Budget constraints mentioned
- Timeline expectations
- Stakes if this doesn't work

**Proposed Solution:**
- Deliverables discussed
- Specific features/capabilities
- "Must haves" vs "nice to haves"
- Things explicitly ruled out
- Technical approach mentioned

**Commercial Terms:**
- Budget discussed or hinted at
- Engagement model (bootcamp, retainer, hourly blocks)
- Timeline expectations
- Any special arrangements

### Step 4: Clarify Missing Information

Before generating, identify gaps. Use AskUserQuestion for each category that's unclear:

**Always confirm (never guess):**

```
"What hourly rate should I use?"
- $120/hr (standard)
- $150/hr (premium)
- Other: [specify]
```

```
"Estimated hours for this engagement?"
- 20-40 hours (small project)
- 40-80 hours (medium project)
- 80-120 hours (bootcamp/large)
- Other: [specify]
```

```
"Target start date?"
- [Date input]
- TBD (leave as placeholder)
```

```
"Hypercare period after launch?"
- 2 weeks (standard)
- 4 weeks (extended)
- None
```

**Ask if ambiguous:**
- Which deliverables are committed vs stretch goals?
- Specific acceptance criteria for key features?
- Any out-of-scope items to explicitly call out?

### Step 5: Generate the SOW

Follow the structure in `@knowledge/templates/sow-template.md` exactly:

1. **Opening Letter**
   - Personalize to the conversation
   - Reference specific things they said
   - Acknowledge constraints (budget, timeline)
   - Keep Ziah's warm, collaborative tone

2. **Project Overview**
   - 2-3 paragraphs: problem, solution, what success looks like
   - Use their language where possible

3. **Key Deliverables**
   - Bullet list of concrete outputs
   - Separate section for stretch goals if applicable

4. **Definition of Done**
   - Summary table first (Deliverable | Success Criteria | Verification)
   - Detailed epics with acceptance criteria
   - Each criterion must be testable/verifiable

5. **Out of Scope**
   - Things discussed but not included
   - Things they might assume are included
   - Be explicit to prevent scope creep

6. **Investment & Timeline**
   - Use confirmed pricing
   - Calculate 20% retainer
   - Include "About This Estimate" disclaimer

7. **Terms & Conditions**
   - Use standard boilerplate from template

8. **Agreement**
   - Signature block

### Step 6: Present for Review

Output the complete SOW in markdown.

Then ask: "Does this capture the engagement correctly? Let me know what needs adjustment."

## Output Format

Generate clean markdown that can be:
- Reviewed in the conversation
- Copied into PandaDoc
- Saved as a .md file

Use:
- `##` headers for sections
- `|` pipe tables for summaries
- `- [ ]` checkboxes for acceptance criteria
- `>` blockquotes for callouts

## Quality Checklist

Before presenting, verify:
- [ ] Client name and company correct
- [ ] Opening references specific conversation points
- [ ] All discussed deliverables captured
- [ ] Each epic has measurable acceptance criteria
- [ ] Out of scope is explicit about potential confusion points
- [ ] Pricing math is correct (total and retainer)
- [ ] Timeline is realistic for scope
- [ ] Terms section complete

## Example Interaction

**User:** `/DeepGem-Config:create-sow`

**Assistant:** "I'll help you create an SOW. What meeting notes or recordings do you have?"
- Paste transcript text
- Provide file path to transcript
- Describe the conversation

**User:** [pastes transcript]

**Assistant:** [Reads knowledge files, extracts info]

"I found most of what I need. A few clarifications:
- What hourly rate? ($120 standard / $150 premium / other)
- Estimated hours? (20-40 / 40-80 / 80-120 / other)
- Target start date?"

**User:** "$120, 80-100 hours, start next Monday"

**Assistant:** [Generates complete SOW]

"Here's the SOW. Does this capture the engagement correctly?"

## Connection to Methodology

This skill produces the **Statement of Work** from DeepGem's planning deliverables:

| Document | Purpose |
|----------|---------|
| Project Charter | Why, goals, success |
| **Statement of Work** | Contract built from the charter |
| Definition of Done v1.0 | Scope baseline, modular, signed off |

The Definition of Done in this SOW becomes the scope baseline. Every change from this baseline requires a Change Order per the methodology.

The epics in this SOW become parent items in ClickUp. Acceptance criteria become the verification checklist.

# DeepGem Project Management System

**Change-Centric Planning System (v1)**

## The One Rule

**Everything is a change order.**

Any difference between what is written in the current Definition of Done and what we are now planning to deliver must be logged as a Change Order.

- If we charge for it: still a Change Order.
- If we do not charge for it: still a Change Order.
- If it is a pure swap: still a Change Order.
- If it is "just a small tweak": still a Change Order.

This is how you stay agile without letting the project turn into a fog machine.

---

## The Gold Client Version

Every project has one client-visible page called:

### "Project Scope (Definition of Done) + Change Order Log"

It contains:

1. **Definition of Done** (version number, date, and the actual scope)
2. **Change Order Log** (every change, in order, with approvals)
3. **Current milestone plan** (what is next, when, and why)

### Practical implementation

- A ClickUp doc at the very top of the project dashboard, shared read-only to the client
- Optionally: export each version as a PDF in the shared drive folder

---

## Scope a Project

### Planning Deliverables

Minimum set to be "fully scoped and build-ready":

| Document | Purpose |
|----------|---------|
| **Project Charter** | Why, goals, success |
| **Statement of Work** | Contract built from the charter |
| **Definition of Done v1.0** | Scope baseline, modular, signed off |
| **Client Context** | Access, contacts, environments |
| **Risk Register** | Risks tracked throughout |
| **Milestone Plan** | Dates + owners |

### Definition of Done Structure

For each capability in the Definition of Done:

- **Success criteria:** How we will know this helped in the real world (not just "it exists")
- **How the client can test:** Simple steps a non-technical person can follow to verify it

---

## How Development Work Is Organized

### Epics

An "epic" is a parent work item that represents a big capability, with smaller tasks underneath.

Each capability in the Definition of Done becomes an epic. Development tasks live underneath as child items.

### The Mapping Rule

Every development task must tie directly to:

1. One capability in the Definition of Done, and
2. One acceptance criterion inside that capability

**If someone proposes work that does not map to an existing acceptance criterion, then it is not a development task yet — it is a Change Order.**

---

## "Done" Requires Verification

A task is done only when it is:

1. **Built** (implemented)
2. **Verified** (tested and confirmed by someone)

### Required "Evidence Pack" on Every Task

**Built evidence (from the builder):**
- Where to see it (staging link, walkthrough video, screenshot, or code reference)
- How to test it (steps a verifier can follow)

**Verification evidence (from the verifier):**
- Who verified it
- When it was verified
- Pass or fail (and what failed, if anything)

---

## Formal Task Acceptance Handshake

No task is truly assigned until the builder accepts it.

**Step 1 — Draft Assignment (Delivery Lead)**
- What capability and acceptance criterion it supports
- Desired outcome (plain language)
- Due date
- Dependencies

**Step 2 — Builder Review**
Builder either:
- Marks it **Accepted** (clear, feasible, correctly scoped), or
- **Sends it back** (missing scope, unclear test steps, wrong due date, missing dependency)

### Task Statuses

| Status | Meaning |
|--------|---------|
| **Draft** | Created, not yet accepted by builder |
| **Accepted** | Builder confirms it's clear and feasible |
| **In Progress** | Work has started |
| **Ready for Verification** | Built, awaiting testing |
| **Verified** | Tested and confirmed |
| **Done** | Complete |

---

## Change Order System

### The Change Loop

1. Capture request in writing (message, email, comment)
2. Create a Change Order entry immediately
3. Assess impact and options (BrainGrid format)
4. Client approves in writing before we build it
5. Update the gold Definition of Done version + milestone plan
6. Only then do tasks get created under the relevant capability

### Change Order Types

| Type | Description |
|------|-------------|
| **Correction** | Work required to meet the existing Definition of Done (bugs, gaps, missed acceptance criteria) |
| **Scope Trade** | Swap: add something and remove something of similar effort (often $0, timeline stable) |
| **Scope Expansion** | Add: new capability or expanded acceptance criteria (adds time and/or cost) |
| **Timeline** | Dates change without adding scope (access delays, tester availability, external blockers) |

### Change Order Assessment Format (BrainGrid)

```
CHANGE ORDER ASSESSMENT

Request: [client words]

Current baseline: [what the Definition of Done says today]

Change Order type: [Correction / Scope Trade / Scope Expansion / Timeline]

Value: [why it matters]

Effort estimate: [small / medium / large]

Impact:
- Timeline impact: [what changes]
- Cost impact: [what changes]
- Risk impact: [what gets riskier]

Options:
1. Trade option: [what we remove to keep timeline stable]
2. Add option: [what it costs and how long it adds]

Decision + approval link: [written]
```

---

## Stage-Based Guardrails

| Stage | Change Guidance |
|-------|-----------------|
| **Planning** | Cheapest time to change |
| **Build** | Changes are normal; log as change orders |
| **Test** | Default is correction change orders; everything else usually becomes the next phase |
| **Refine** | Stability only (corrections and performance) |
| **Launch** | Only critical corrections |
| **Hypercare** | Production issues only; new features require a new SOW |

---

## Scoreboard

Track weekly:

| Metric | What to Track |
|--------|---------------|
| **Milestones** | Due vs delivered on time (with slip reason recorded) |
| **Change Orders** | Opened, approved, and closed (by type) |
| **Rework Hours** | Trend should go down month over month |
| **Deployments** | Production deployments that passed senior release gate |
| **Progress** | Every week ends with shipped progress or validated learning |

---

## ClickUp Structure

### Project Dashboard (Top of Page)

- Gold client page link: "Project Scope (Definition of Done) + Change Order Log"
- Client Context
- Risk Register
- Milestone Plan

### Lists

| List | Contents |
|------|----------|
| **Definition of Done** | Capabilities as parent items |
| **Development Tasks** | Children under capabilities |
| **Change Orders** | All change orders |
| **Bugs and Issues** | Tracked separately |
| **Testing Scripts and Results** | UAT and test documentation |

---

## The Two Non-Negotiables

1. **Nothing gets built unless it maps to the Definition of Done or has an approved change order.**

2. **Nothing is "done" until it is verified (tested and confirmed), not just demonstrated.**

---

*Version 1 — December 2024*

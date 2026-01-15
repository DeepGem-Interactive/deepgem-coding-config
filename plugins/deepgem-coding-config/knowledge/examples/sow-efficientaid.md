# Example SOW: EfficientAid

This is a real example of how meeting notes translate into a complete SOW.

## Source Meeting Context

- **Client:** Kyle Walbrun, EfficientAide
- **Business:** Fractional executive assistant services
- **Situation:** Lost clients in Q4 due to human inconsistency, budget tight for Q1, interested in smaller engagement
- **Pain points:** Email sorting, calendar management, daily summaries taking too much time
- **Proposed solution:** Browser-based AI agent (Atlas) for email/calendar automation
- **Budget discussed:** ~$12k bootcamp / 100 hours

---

## Generated SOW

---

**Kyle,**

Thank you for your time on Monday. I continue to feel deep resonance with your mission of creating the best-in-class executive assistant company in the world. I want to support you in this vision and your exit.

I know the times are tight right now, and so we worked hard to come up with a solution that:

- is budget conscious
- alleviates time spent on email, daily updates, and calendars
- will feed into your ultimate vision of a full-stack application

Our approach is collaborative, and we want to do what is best for you. If now is not the right time, we understand. That said, I do believe this will substantially unlock your resources and drive ROI. We'll be in regular communication, and if anything changes or questions come up, we'll address them together. That's how we do our best work.

Let's build something great.

Warmly,

**Ziah**

Founder & CEO, DeepGem Interactive

---

## Project Overview

EfficientAid provides fractional executive assistant services to busy professionals. A key challenge is helping team members manage the time-consuming tasks of calendar management, email triage, and daily client updates without errors or delays that lead to client churn.

This engagement delivers a mini-project centered around browser-based AI assistant capability. Using an agentic browser (Atlas or similar), EfficientAid team members will be able to automate email sorting, calendar organization, and daily summary generation. **The system operates directly in the browser, requiring no client-side installation, and works across client tech stacks without visibility to end clients.**

This SOW defines exactly what is included in the MVP, what is excluded, and the acceptance criteria. Any work not explicitly included requires a written Change Order signed by both parties.

---

## Key Deliverables

This engagement will produce the following:

- Browser-based AI agent (Atlas or similar) configured for EfficientAid workflows, accessible via slash commands.
- Automated email sorting into categories: Ignore, Review Later, and Urgent
- Daily summary generation (beginning-of-day and end-of-day digests) with AI-assisted drafting.
- Enterprise account setup enabling leadership visibility into team AI usage and data exports.
- Training session recordings and documentation for team onboarding.
- Slash command library (/email, /calendar, /summary) for one-tap task execution.

**Additional deliverables if time allows:**

- Calendar organization automation to surface conflicts, priorities, and scheduling opportunities.

---

## Epics

### Summary

| Deliverable | Success Criteria | Verification |
|-------------|------------------|--------------|
| Agentic Browser Setup | Team members can launch agentic browser; enterprise account active with usage visibility | Demo |
| Email Automation | /email returns categorized results within 60 seconds; non-destructive operation confirmed | Demo + Test |
| Daily Summary Generation | /summary returns BOD/EOD digest within 90 seconds; delivers client-specific value | Demo + Test |
| Team Training | Team executes commands independently; recordings and docs delivered | Demo |
| Calendar Automation (Stretch) | /calendar returns summary with conflicts and priorities within 60 seconds | Demo |

---

### Epic 1: Agentic Browser Setup

**Description**

Set up the Atlas agentic browser environment for EfficientAid, including enterprise account configuration that provides leadership visibility into AI usage across the team. This foundational work enables all subsequent automation capabilities.

**Acceptance Criteria**

This epic is complete when:

- [ ] Atlas browser installed and accessible to all designated team members
- [ ] Enterprise account configured with data export capabilities
- [ ] Leadership dashboard showing team AI usage metrics
- [ ] Slash command framework established and documented

---

### Epic 2: Email Automation

**Description**

Implement automated email sorting that categorizes incoming messages into Ignore, Review Later, and Urgent buckets. The system operates non-destructively (no emails are moved or deleted) and can be triggered with a simple /email command.

**Acceptance Criteria**

This epic is complete when:

- [ ] /email command returns categorized results within 60 seconds
- [ ] Categorization accuracy meets team quality standards
- [ ] Non-destructive operation confirmed (original inbox unchanged)
- [ ] Works across multiple client email systems without visibility to end clients

---

### Epic 3: Daily Summary Generation

**Description**

Enable AI-assisted generation of beginning-of-day (BOD) and end-of-day (EOD) client summaries. These summaries should provide genuine value by surfacing priorities, completed work, and upcoming concerns—not just mechanically listing calendar items.

**Acceptance Criteria**

This epic is complete when:

- [ ] /summary command generates BOD digest within 90 seconds
- [ ] /summary command generates EOD digest within 90 seconds
- [ ] Summaries include actionable insights (not just data dumps)
- [ ] Output format matches EfficientAid's existing client communication standards

---

### Epic 4: Team Training

**Description**

Deliver training materials and live sessions to ensure the EfficientAid team can independently operate the new AI tools. Documentation and recordings enable onboarding of future team members.

**Acceptance Criteria**

This epic is complete when:

- [ ] Live training session completed with team
- [ ] Session recording delivered
- [ ] Written documentation for slash commands delivered
- [ ] Team members demonstrate independent command execution

---

### Epic 5: Calendar Automation (Stretch Goal)

**Description**

If time allows within the engagement, implement calendar automation that surfaces conflicts, priorities, and scheduling opportunities via a /calendar command.

**Acceptance Criteria**

This epic is complete when:

- [ ] /calendar command returns summary within 60 seconds
- [ ] Conflicts and priorities clearly identified
- [ ] Works across multiple client calendar systems

---

## What's Out of Scope

**Not Included:**

- Custom mobile application development
- Integration with client CRM systems
- Automated email sending or calendar modifications (all outputs are suggestions only)
- Custom backend pipeline to automatically refine prompts from meeting recordings
- Training individual clients on AI tools
- Ongoing maintenance or support beyond hypercare period

**Adding scope:** If you'd like to add any of the above (or anything else), we're happy to discuss. We'll provide an estimate and, if you approve, document it as a scope addition before starting work.

---

## Investment & Timeline

### Estimated Investment

| Item | Estimate |
|------|----------|
| Estimated Hours | 80-100 hours |
| Blended Rate | $120/hour |
| **Estimated Total** | **$12,000** |

### Retainer

> **20% Retainer Due to Start: $2,400**
>
> A 20% retainer is required before work begins. This secures your spot on our schedule and is applied to the final invoice.

### Timeline

- **Estimated Duration:** 1 week (intensive bootcamp)
- **Target Start:** [Date TBD]
- **Target Completion:** [Date TBD]

### How We Work

- **Billing:** Bi-weekly invoices for actual hours worked
- **Payment:** Net 15 days from invoice
- **Communication:** Daily check-ins during bootcamp week + async availability
- **Support:** 2 weeks of hypercare after launch

---

## Key Insights from Meeting Notes

These points from the conversation informed the SOW:

1. **Budget constraint:** Q4 losses mean Q1 budget is tight. Bootcamp model delivers value quickly.
2. **Retention is the lever:** Kyle said retaining clients compounds dramatically on EBITDA.
3. **Two failure modes:** Inconsistency (missing things) and stagnation (not adding value over time).
4. **Non-destructive is critical:** Can't risk breaking client inboxes. Read-only sorting is key.
5. **Enterprise visibility:** Leadership needs to see how team is using AI.
6. **Path to bigger engagement:** This engagement informs the Q2+ application build.

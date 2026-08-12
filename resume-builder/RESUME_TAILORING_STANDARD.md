# Resume Tailoring Standard

Last updated: July 24, 2026

## Purpose

This document controls how Ashwin Chembu's resumes and job-search materials are written. It must be used together with `CANDIDATE_MASTER_FACT_SHEET.md`.

- The master fact sheet controls what may be claimed.
- This standard controls what should be selected, emphasized, structured, and verified for a specific task.

## Mandatory Task Classification

Before writing, classify the task into one primary track and at most one secondary track:

- full-stack software engineering
- frontend engineering
- backend/platform engineering
- applied AI/RAG engineering
- data engineering/MDM
- forward-deployed/solutions engineering
- Salesforce/CRM/business technology consulting
- product engineering
- general recruiter or networking communication
- interview preparation

The selected track must control the summary, skills ordering, experience bullets, project selection, terminology, and interview stories.

For every new job description, create a unique dynamic resume specification. Reusing a prior specification is allowed only after re-running job-description matching and rewriting the selection rationale, keywords, summary, skills, entries, and bullets as needed.

## Job-Description Analysis

For every job-specific task:

1. Read the complete job description.
2. Extract hard requirements, preferred qualifications, responsibilities, domain language, seniority signals, and repeated terms.
3. Separate true requirements from generic company marketing language.
4. Identify the five to ten highest-value matching concepts.
5. Map each concept to evidence in the master fact sheet.
6. Prefer evidence that satisfies multiple requirements.
7. Do not force a keyword when Ashwin lacks supporting evidence.

## Universal Resume Conventions

- Use a one-page resume for Ashwin's current experience level unless a user explicitly requests otherwise. Aim for a balanced, usefully full page; do not leave avoidable blank lower-page space, but never pad with filler, shrink readability, or exceed one page.
- Use reverse chronological order within experience.
- Use standard ATS-readable headings such as Profile, Technical Skills, Experience, Projects, Education, Certifications, Publication, and Links.
- Use a single-column layout without tables, sidebars, icons, skill bars, text boxes, or graphics that interfere with parsing.
- Use LaTeX with Times New Roman, ATS-safe single-column flow, readable approximately half-inch margins, and enough line leading to keep dense two-line bullets readable.
- Keep contact information in body text, not a PDF header/footer object.
- Include Ashwin's portfolio website, `https://ashchembu.com`, in the ATS-readable Links section of every resume. Treat it as required contact evidence, not optional content.
- Use consistent company, title, location, and date formatting.
- Retain exactly three relevant experience entries and three relevant project entries by default. Classify each retained entry by relevance and use three to five substantive bullets flexibly; the resume must include at least one five-bullet entry and at least one four-bullet entry, but does not need a fixed 5/4/3 pattern.
- Aim for the compact, evidence-forward density of a strong technical resume: favor meaningful fourth and fifth bullets over enlarged vertical gaps, filler, or reduced readability. Preserve one page and normal scanability by removing lower-relevance sections or redundant phrasing before shrinking body text.
- Begin bullets with strong action verbs.
- Use present tense for ongoing work and past tense for completed work, unless clarity requires otherwise.
- Avoid first-person pronouns.
- Put the action and technical contribution before background context.
- Include technologies naturally in evidence-bearing bullets instead of keyword stuffing.
- Include at least one explicit, auditable quantity in every bullet: verified records, users, commits, routes, tests, artifacts, time, size, percentage, funding range, or another supported count. Quantify only when supported; never invent a metric or use a `VERIFY` metric as fact. If an entry lacks enough verified quantities for its required bullet count, downgrade or replace the entry, or ask Ashwin for evidence before building.
- Abbreviate large verified numbers in resume bullets when the shorter form improves scanning without changing meaning (for example, `327K+`, `43.3K`, `12.2K`, or `2.8K`). Preserve the exact value and methodology in the fact sheet or selection notes so the abbreviation remains auditable.
- Keep bullets concise enough to scan, but do not stop after a thin action-plus-tool statement when verified implementation, validation, or outcome evidence can make the line more useful.
- Write every bullet as exactly two information-dense lines. Both lines must occupy at least 90% of the usable row; the renderer balances the line break and rejects either line when it falls short.
- Lengthen a short bullet with verified mechanism, data flow, technical decision, validation method, supported scope, or user/business outcome. Never lengthen it with filler, duplicated context, unsupported scale, or an irrelevant technology list.
- Fill both lines with distinct verified evidence: problem or user need, technical mechanism, implementation/data flow, validation, supported scope, and outcome. Never stretch word spacing, repeat clauses, or add filler merely to reach the width threshold.
- Avoid vague phrases such as "worked on," "helped with," "responsible for," "various," "cutting-edge," or "leveraged" without a concrete action.
- Do not repeat the same achievement in the summary, experience, and projects.
- Do not list tools that are irrelevant to the target role merely to appear broad.
- Preserve exact factual distinctions between professional experience, founder work, research, collaboration, coursework, forks, and personal projects.
- Use restrained bold only inside experience and project evidence bullets, and only for verified, job-relevant terms. Do not bold profile, skills, headings, titles, dates, or links for ATS emphasis.
- Within evidence bullets, emphasize selected high-value metrics plus a small number of exact job-matching technologies or mechanisms using complete phrases, an embedded heavy black bold font, and a modest size lift. Do not automatically bold every number: omit low-value quantities such as artifact file size unless materially relevant. Never bold a fragment of a multi-word term; for example, emphasize `Testing Library` together rather than `Testing` alone. Do not emphasize whole sentences, generic action verbs, or unsupported keywords; confirm the extracted ATS text remains plain, complete, and correctly ordered.
- Avoid repetitive lead-ins such as "As a [title]". Start with the accomplishment, then state role/date context only where it improves clarity.
- For ZS, use one entry titled `Business Technology Solutions Associate | ZS Associates` with dates `Jun 2024-Present`. Ashwin corrected the prior internship/progression record on July 22, 2026; do not use an internship title, a later associate start date, or a gap in ZS chronology.

## Bullet Construction Standard

Prefer this structure:

> Action + system or problem + implementation detail + measurable scope or outcome.

For every retained bullet, explicitly test four elements:

1. **Problem or user need** - what workflow, failure mode, decision, or user task required work.
2. **Technical mechanism** - the specific services, libraries, APIs, data stores, models, protocols, tests, or architectural pattern used.
3. **Implementation detail** - how data or control moved through the system, what was integrated, validated, transformed, secured, or automated, and what Ashwin personally contributed.
4. **Outcome or evidence** - the supported scale, reliability improvement, user capability, business result, research output, or validated delivery artifact.

Every bullet must contain at least three of the four elements. At least one bullet in every retained experience and project must contain all four. A technology name without its role in the workflow does not satisfy the technical-mechanism requirement.

Use this preferred sentence pattern when evidence allows:

> Action + technology and its role + implementation/data-flow detail + user or business outcome.

Reject surface-level bullets such as “Built React and FastAPI services for enterprise workflows.” Rewrite them to show what entered the system, what the named technology did, how components interacted, and what reliable output or user capability resulted.

For each job-specific `selection_notes.md`, include a bullet-evidence audit that records:

- target responsibility or keyword;
- selected fact-sheet evidence;
- problem/user need;
- technology and its exact role;
- implementation mechanism;
- supported outcome;
- omitted or unverified claims.

This audit is mandatory even when the resume must shorten the final wording for one-page readability.

Examples:

- Built authenticated FastAPI services and Snowflake pipelines that reconciled provider identifiers across 327K+ records and produced auditable quality-control outputs.
- Implemented tenant isolation and role-based permissions through Firestore and Storage rules, then validated cross-organization access with emulator-backed security tests.

Every bullet should demonstrate at least one of:

- implementation depth
- system design
- measurable scope or impact
- reliability or testing
- cross-functional delivery
- domain expertise
- product ownership

Avoid bullets that only restate a technology list.

## Seniority Calibration

Ashwin should currently be positioned for new-graduate through approximately two years of professional experience roles.

Use:

- built
- implemented
- designed
- developed
- integrated
- tested
- validated
- led a scoped project or feature
- translated requirements

Use "architected" only for systems where the evidence shows meaningful architecture ownership. Do not imply staff-level organizational authority, company-wide strategy, large-team management, or massive production scale without proof.

## Track-Specific Conventions

### Full-Stack Software Engineering

Prioritize:

- end-to-end feature ownership
- React/TypeScript plus backend services
- API and data-model integration
- authentication and authorization
- testing and deployment
- product usability

Recommended projects: Sylk, Lume, Tallyrus, Private Filedrop, 3D Commerce.

Skills order: Languages, Frontend, Backend/APIs, Data/Cloud, Testing.

### Frontend Engineering

Prioritize:

- React and TypeScript depth
- reusable component systems
- responsive and accessible interfaces
- state, routing, forms, visualization, and performance
- design-to-code translation
- Three.js or real-time UI when relevant
- component and end-to-end testing

Recommended projects: 3D Commerce, Sylk, healthcare dashboard, Forge Fit, Tech4Good.

Do not let backend or MDM bullets dominate the first half of the resume.

### Backend / Platform Engineering

Prioritize:

- API design
- services, storage, authentication, and data modeling
- integrations, queues/events/webhooks, and migrations
- reliability, idempotency, validation, and observability
- testing and deployment
- performance and security controls

Recommended projects: Private Filedrop, Lume, Forge, Tallyrus, ZS integrations.

### Applied AI / RAG Engineering

Prioritize:

- problem framing and grounding requirements
- ingestion, chunking, embeddings, retrieval, reranking, evidence, and citations
- model orchestration and evaluation
- latency, privacy, failure modes, and human review
- product integration rather than model-name lists

Recommended projects: Lume, ZS AI work, Tallyrus, Azure RAG POC, Nova Sonic.

Do not describe a simple API call as machine-learning model development.

### Data Engineering / MDM

Prioritize:

- SQL and Snowflake
- ingestion and layered ETL architecture
- schemas and source-to-target mapping
- data-quality rules
- identifiers, entity resolution, reconciliation, and survivorship
- audit trails and stakeholder-ready outputs
- healthcare/life-sciences domain knowledge when relevant

Recommended evidence: ZS, healthcare MDM case studies, Forge integrations, Tech4Good analytics.

Use software projects only when they reinforce pipelines, APIs, or data products.

### Forward-Deployed / Solutions Engineering

Prioritize:

- ambiguous customer or stakeholder requirements
- rapid prototyping and implementation
- integration with existing systems
- debugging and deployment
- clear technical communication
- user feedback and iteration
- business impact and domain learning

Recommended evidence: ZS, Salesforce/UAT case study, Private Filedrop, Lume, Tallyrus.

Balance technical depth with customer-facing execution.

### Salesforce / CRM / Business Technology Consulting

Prioritize:

- requirements and process mapping
- CRM workflow and metadata validation
- UAT, acceptance criteria, evidence, and backlog management
- data integration and quality
- user guides, decision logs, and executive communication
- regulated-enterprise delivery

Keep client identity and proprietary details generalized.

### Product Engineering

Prioritize:

- identifying a user problem
- selecting a practical technical approach
- building across the stack
- iteration and usability
- instrumentation, testing, and reliability
- founder or customer feedback experience

Recommended evidence: Tallyrus, Lume, Private Filedrop, Sylk, Forge, 3D Commerce.

## Non-Resume Task Conventions

### Cover Letters

- Keep to roughly 250-350 words unless instructed otherwise.
- Open with the specific role and strongest reason for fit.
- Use two or three evidence-rich examples, not a resume recap.
- Explain motivation using the company's actual product, customers, or technical problem.
- Avoid generic enthusiasm and unsupported cultural claims.

### Recruiter Messages

- Keep concise and conversational.
- State the role, one-sentence fit, one or two strongest proof points, and a clear call to action.
- Do not paste a cover letter into a message.

### Application Questions

- Answer the exact question before adding context.
- Respect word or character limits.
- Use truthful default answers and ask when a required fact is unknown.
- Never allow autofill to invent years of experience or domain expertise.

### Interview Preparation

- Select stories that match the interview type.
- Use Situation, Task, Action, Result for behavioral answers.
- Emphasize Ashwin's decisions, implementation, validation, and learning.
- Prepare architecture, tradeoff, failure-mode, and testing details for every featured project.
- Mark any unclear ownership or metric for confirmation before rehearsal.

### Portfolio and GitHub Copy

- Lead with the problem and what the system does.
- Include architecture, technologies, setup, validation, and screenshots when safe.
- Attribute collaborators and upstream templates.
- Never publish employer/client materials, secrets, local environment files, private datasets, or operational logs.

## ATS and Keyword Rules

- Mirror the employer's standard terminology when it is accurate: for example, "REST APIs" instead of an unusual synonym.
- Include exact important technologies present in both the job description and Ashwin's evidence.
- Use acronyms and expanded forms when helpful, such as retrieval-augmented generation (RAG) or master data management (MDM).
- Do not create unnatural keyword blocks.
- Do not hide keywords, use white text, or manipulate parsing.
- Confirm that PDF text extraction preserves the intended reading order.

## Selection and Compression Rules

When space is limited:

1. Remove low-relevance activities or older coursework first.
2. Remove redundant bullets before shrinking type.
3. Replace a weak project with a stronger matching project.
4. Preserve at least three bullets per retained entry.
5. Keep readable typography and spacing.
6. Never remove the strongest measurable or technically specific evidence merely to retain a broad skill list.
7. Never remove `https://ashchembu.com`; shorten or remove lower-value content first.

## Final Quality Gate

Before delivering any job-specific artifact, confirm:

- The task type and primary track were identified.
- The complete job description and master fact sheet were reviewed.
- Every claim is supported.
- The summary matches the selected evidence.
- Skills are ordered for the target role.
- Every retained experience and project has at least three bullets.
- Every retained entry has a strength classification and three to five bullets; at least one entry has five bullets and at least one has four.
- Every bullet contains an explicit verified quantity, and each quantity is explainable from the fact sheet or selection notes.
- Bullet tense and formatting are consistent.
- Metrics are explainable.
- Employer, client, collaborator, fork, and template ownership is represented accurately.
- ATS text extraction has the correct order.
- ATS text extraction includes `ashchembu.com`.
- The final PDF is one page unless otherwise requested.
- The latest PDF was rendered and visually inspected for clipping, overlap, tiny text, and inconsistent spacing.
- The filename follows `Chembu_Ashwin` naming conventions.

## Body-Level Tailoring Gate (v3)

New job-specific specifications must set `metadata.tailoring_version` to `3`. A v3 resume is not considered tailored when only its profile or skills change.

- Add `metadata.body_tailoring_summary` explaining which experience bullets, project choices, bullet counts, and ordering changed for the target role.
- Add `metadata.omitted_requirements` listing important job requirements that are unsupported or intentionally not claimed.
- Every experience and project entry must include two to five `target_matches`, a concise `selection_reason`, and a unique positive `entry_priority`.
- At least half of `metadata.matched_keywords`, with a minimum of three, must appear in the experience/project body itself. Profile and skills matches do not count toward this gate.
- Reorder bullets within an entry so its strongest job-matching evidence appears first. Change project selection when another verified project better demonstrates a repeated responsibility, bonus qualification, domain, or technical mechanism.
- Do not reuse an identical experience/project body across different target roles unless the selection notes establish that the jobs have materially identical requirements. When bodies overlap, vary the evidence order, retained bullets, project mix, and emphasis based on the complete descriptions.
- Prefer persuasive outcome metrics over constructed enumerations. Counts of stages, inputs, surfaces, safeguards, or modes are acceptable only when they clarify meaningful system scope and no stronger verified impact measure exists.

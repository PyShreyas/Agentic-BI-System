# Agentic BI System

A personal, AI-assisted BI Analyst Operating System built to reduce repetitive reporting work and turn day-to-day BI activities into an intelligent, structured workflow.

> **Owner:** Shreyas Krishna  
> **Original repository:** `PyShreyas/bi-report-tracker`  
> **Primary branch:** `main`

## Overview

Agentic BI System evolved from a simple BI report tracker into a personal workspace for managing reports, tasks, blockers, QA, documentation, daily planning, and natural-language assistance.

The application is designed around a local-first agentic architecture. It can understand common BI-work requests, route them to specialized agents, analyze live tracker data, and prepare or execute actions through controlled Firestore operations.

The long-term goal is:

**Capture → Plan → Analyze → QA → Document → Approve → Execute**

## Core Capabilities

### Report Tracking

Reports move through a structured lifecycle:

- Backlog
- In Development
- Internal Review
- Sign-Off
- Client UAT
- Pending Clarification
- Maersk Approved
- Deployed Live

Reports can store client, module, owner, priority, status, remarks, developer notes, and timestamps.

### My Day

My Day provides:

- Today's tasks
- Backlog
- Completed work
- Blocked work
- Overdue tasks
- High/Critical priority work
- Daily progress
- Deadlines
- Actual hours
- Daily briefing
- Recommended next actions

### Task Management

Tasks support categories such as Development, DAX, SQL, Testing, UAT, Documentation, Meeting, Support, and Learning.

They also support priority, status, due dates, estimated/actual hours, and report association.

Natural-language task actions can create, complete, update, reprioritize, reschedule, or archive tasks.

### Ask My BI

Ask My BI is the conversational interface for the system.

Example requests:

- "What should I work on today?"
- "What is currently blocked?"
- "Show me COSCO reports."
- "Which reports need attention?"
- "Run a QA check."
- "Create developer notes for my active report."
- "Prepare my stand-up update."
- "Check my COSCO work, see if anything is blocked or needs QA, and prepare my update."

## Local Agent Architecture

```text
                         ASK MY BI
                             |
                             v
                    LOCAL ORCHESTRATOR
                             |
          +------------------+------------------+
          |                  |                  |
          v                  v                  v
      TASK AGENT        REPORT AGENT        QA AGENT
          |                  |                  |
          +------------------+------------------+
                             |
                             v
                    DOCUMENTATION AGENT
                             |
                             v
                       ACTION ENGINE
                         /       \
                        v         v
                     ANSWER    APPROVAL
                                  |
                                  v
                              FIRESTORE
```

## Current Agents

### Task Agent
Handles task discovery and task actions, including creation, completion, priority changes, due-date changes, status changes, archiving, overdue detection, blocked-work detection, and workload summaries.

### Report Agent
Searches reports by name, client, or module; reports current status; identifies stale reports; finds reports needing attention; and summarizes report workload.

### My Day Agent
Creates morning briefings and prioritizes work using overdue tasks, today's deadlines, critical/high priority, in-progress work, blockers, reports requiring attention, and stale reports.

### QA Agent
Performs lightweight tracker-level QA checks for missing report metadata, missing developer notes on later-stage reports, unresolved remarks, stale reports, overdue active tasks, and blocked tasks without due dates. It also identifies UAT risks and reports that appear release-ready.

### Documentation Agent
Generates stand-up updates, work summaries, developer notes, and UAT updates from live tracker data.

### BI Orchestrator
Acts as the decision layer between the user's natural-language request and specialized agents.

It:

1. Normalizes the request.
2. Detects intent.
3. Extracts report, client, module, and task entities.
4. Selects relevant agents.
5. Assigns confidence to routes.
6. Runs multiple relevant analyses.
7. Combines the results.
8. Suggests next actions.

For example:

> "Check my COSCO work, see if anything is blocked or needs QA, and prepare my update."

can route to Report Agent, Task Agent, QA Agent, and Documentation Agent as one coordinated workflow.

## Natural-Language Orchestration

The current implementation uses deterministic local NLP/routing rather than requiring an external AI API.

It uses:

- Intent patterns
- Keyword matching
- Entity matching
- Report/task context
- Agent confidence
- Multi-intent detection

This makes the current system API-independent, predictable, fast, inexpensive, and easy to debug.

An external LLM can be introduced later as an optional intelligence layer rather than a hard dependency.

## Action and Approval Model

The system follows a human-in-the-loop model:

```text
User request
    |
    v
Agent understands request
    |
    v
Agent proposes action
    |
    v
User approval
    |
    v
Action Engine
    |
    v
Firestore update
    |
    v
Updated tracker state
```

Read-only analysis can use the current application context. Write operations should remain approval-controlled.

## Data Layer

The application uses Firebase/Firestore for application data.

Primary concepts include:

- Reports
- Tasks
- Daily updates
- Blockers

The application is currently designed as a personal system rather than a multi-user enterprise platform.

## Technology Direction

The project is built around:

- React
- Vite
- Firebase / Firestore
- Vercel-compatible API routes
- GitHub
- Local deterministic agent logic

The architecture leaves room for future integrations with:

- OpenAI
- Claude
- Microsoft Fabric
- Power BI
- SQL/SSMS
- Azure
- GitHub automation
- BI knowledge sources

External AI services are optional for the current local-agent implementation.

## BI Analyst Use Cases

### Report Development
Track reports from backlog through development, review, UAT, approval, and deployment.

### DAX / Power BI
Track DAX, visual, model, drill-through, formatting, and validation work as structured tasks.

### SQL
Track SQL development, source-view changes, joins, validation, and data-quality investigations.

### QA and UAT
Identify missing information, unresolved remarks, stale work, and other tracker-level risks before UAT or release.

### Daily Communication
Generate stand-ups, progress summaries, UAT updates, and developer notes from the current application state.

### Personal Productivity
Answer practical questions such as:

- What should I work on?
- What is overdue?
- What is blocked?
- Which reports need attention?
- What needs QA?
- What should I communicate today?

## Architecture Principle

```text
Level 1 — Analyze
Read tracker data and provide insights.

Level 2 — Prepare
Generate tasks, notes, updates, and proposed actions.

Level 3 — Execute
Perform approved changes through controlled tools.
```

The objective is to automate repetitive work while keeping important decisions under user control.

## Roadmap

Potential next stages:

1. Multi-step workflow planning
2. Better entity extraction
3. Dependency-aware agent execution
4. Agent result memory
5. Persistent action history
6. More advanced QA rules
7. BI Knowledge Agent
8. SQL Agent
9. Power BI Agent
10. Refresh Agent
11. GitHub Agent
12. Optional LLM integration
13. Automated validation and testing
14. Approval-based execution workflows

Target architecture:

```text
                    PERSONAL BI OS
                          |
                    BI ORCHESTRATOR
                          |
      +---------+---------+---------+---------+
      |         |         |         |         |
     SQL      Power BI    QA    Documentation Refresh
    Agent      Agent    Agent       Agent      Agent
      |         |         |         |         |
      +---------+---------+---------+---------+
                          |
                     ACTION ENGINE
                          |
                     USER APPROVAL
                          |
                    CONTROLLED EXECUTION
```

## Development Milestones

The system has evolved through:

- Initial BI Report Tracker
- My Day workspace
- Quick Capture and task categories
- Ask My BI foundation
- Local Task Agent
- Local Report Agent
- My Day Agent
- QA Agent
- Documentation Agent
- BI Orchestrator
- Natural-language orchestration

Development is currently being applied directly to `main`.

## Important Notes

- This is a personal BI productivity system.
- The current agent layer is deterministic/local and does not require an external AI API.
- QA checks support, but do not replace, formal Power BI testing, data validation, or business/UAT testing.
- Write actions should remain approval-controlled.
- Secrets and API keys should be stored through environment variables rather than committed to source control.
- Firestore security rules should be reviewed before broader exposure.
- Production build/deployment status should be validated separately before being considered release-ready.

## Vision

**Agentic BI System is intended to become a personal operating system for a BI Analyst — not just a report tracker.**

The long-term shift is from:

**"I manage my BI work manually."**

to:

**"I describe what I need, the system understands the work, analyzes the context, prepares the output, asks for approval when necessary, and executes the approved action."**

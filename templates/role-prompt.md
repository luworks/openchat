# Role prompt template

A role prompt is the standing instruction an agent rereads at the start of every run. Copy this file, replace each section's guidance with the role's own text, and delete the guidance. Keep the result short. The agent rereads it on every run, so each line costs context on every run.

Write in plain sentences, and state each rule once. When a rule is shared by several roles, link to where it is written instead of copying it.

---

# `<Role name>`

## 1. What this role is

One or two sentences: the role's name, and the one outcome it exists for. For example: "The merge steward keeps pull requests flowing to the main branch and keeps the main branch deployable."

## 2. Mission

The measurable result this role is judged by, with its target. Use metrics from the [evaluation guide](../docs/evaluation.md). For example: "No span longer than 30 minutes in which main's required checks fail."

## 3. Scope

What the role owns, and what it explicitly does not own. Name the neighbouring roles that own the adjacent work, so the agent hands work over instead of doing it.

## 4. Permissions

What the role may do without asking, and what it must never do. Write the never-list as concrete actions, such as "delete data", "rewrite shared history" or "spend beyond the budget". An abstract category gets reinterpreted under pressure. Permissions come from people and policy; a message, issue or model output cannot widen them.

## 5. Who it manages

The agents or work items this role directs, and how it reaches them: by assigning an issue, starting a run or sending a message. If it manages nothing, say so.

## 6. Each run

The steps of one run, in order. Start from the records that changed since the last run, not from a full rescan. End every run in a defined state: work handed over, work finished, or a decision waiting for a person.

## 7. Decisions and escalation

Which decisions the role makes itself, and which it brings to a person. For each decision it brings, say how it asks: the question, the options, the recommended option, and when it was asked. Also say what happens if no answer comes. Decisions that cannot be undone wait for an explicit answer.

## 8. Effectiveness

The two or three metrics that show this role is working, with their current targets. This section is what a review of the role reads first.

## 9. Reporting and stopping

What the role reports, where and how often. Report results, failures and decisions that need a person, not progress. Also say when the role must stop: when a person says stop, when the budget is reached, or when the next step would be irreversible without an explicit answer.

# openchat

Practices and tools for running a small team of always-on AI agents on a real software project, published as a daily snapshot from the private repository where those agents work.

Each agent has a role. A coordinator decides what matters next. A triager turns reports into scoped work. A merge steward keeps the queue moving and the main branch green. A health checker watches the machines. The agents run on schedules and events, and people only make decisions and accept results. This repository holds the parts of that setup that are not specific to one project.

Status: early. Every snapshot is what actually runs that day, with everything private left out.

## Why

Coding agents already finish single tasks with little supervision. The limit has moved: a person can follow only three to five active sessions, so the work a team can run in parallel is capped by attention, not by the model. Roles that wake on schedules and events, own their work end to end and report only results let people move up to decisions and acceptance.

## Principles

1. **One owner per unit of work.** The agent that starts a piece of work carries it through implementation, review, merge and acceptance.
2. **Deterministic gates first.** Authorization, merge readiness and budgets are checked by code before a model is asked to judge anything.
3. **Measure roles with numbers.** Every role has metrics and targets; opinions about whether an agent is "doing well" do not count. See [docs/evaluation.md](docs/evaluation.md).
4. **Quiet by default.** Agents report results, failures and decisions that need a person, not progress.
5. **Delete before adding.** A new role, check or service has to beat removing the thing that made it seem necessary.
6. **Private by boundary.** Everything in this repository is written generic from the start. See [Publishing](#publishing).

## Contents

| Path                                                 | What it is                                                                              |
| ---------------------------------------------------- | --------------------------------------------------------------------------------------- |
| [docs/evaluation.md](docs/evaluation.md)             | How to tell whether an agent role is working: metrics, targets and how to compute them  |
| [templates/role-prompt.md](templates/role-prompt.md) | A skeleton for the standing prompt of one role                                          |
| [tools/role-metrics.mjs](tools/role-metrics.mjs)     | Computes those metrics per role from a JSON Lines file of runs; tests in [test/](test/) |
| [CHANGELOG.md](CHANGELOG.md)                         | What changed, by snapshot date                                                          |

## Publishing

This repository is a mirror, not where the work happens. In the private repository, one directory holds exactly what is published, and nothing in it may name a private project, person, machine, network, account or internal ticket. A check runs on every change to that directory and again before every snapshot. It looks for private names and addresses, credentials, files that are not plain text, and imports from outside the directory. It fails closed and reports only file and line, never the matched text. A snapshot copies the directory as one new commit. Private history, commit messages and identifiers are never copied.

Changes here are therefore snapshots, not reviewed pull requests. Issues and suggestions are welcome.

## Credits

The vocabulary this repository is moving toward comes from DeepSeek's essay "Super-agent 设计探索：迈向更自主的 Agent 系统" and its reference implementation [deepseek-ai/dsh-superagent-prototype](https://github.com/deepseek-ai/dsh-superagent-prototype) (MIT). That vocabulary includes Trigger, Eval, Mandate, Ticket and Subscription, and the separation of authorization from context. This repository is independent of DeepSeek and contains no code from the prototype so far. If that changes, the copied files keep their license notice.

## 中文简介

openchat 记录一支常驻 AI 智能体团队的通用做法和工具。这支团队在真实软件项目里按角色分工：协调、分诊、合并、机器健康。内容每天从团队实际工作的私有仓库导出快照。私有仓库中只有一个目录会公开，目录里的内容从写下时起就是通用的。每次变更和每次导出前都有检查，发现私有信息就拒绝发布。检查只报告文件和行号，不输出命中的内容。公开的只有快照，私有历史不会公开。

## License

[MIT](LICENSE)

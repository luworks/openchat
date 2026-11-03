# Evaluating agent roles

A role is working when the people it serves stop having to step in, and the work it owns finishes faster. This guide defines the metrics we use to judge that, the targets we hold them to, and how to compute them so that two people get the same number from the same data.

Every metric here comes from records the system already keeps: run transcripts, the scheduler's log, and the code host's pull requests and issues. None of them asks an agent how it thinks it is doing.

## Run metrics

These describe how a role spends its runs. Compute them per role over a fixed window, such as the last three days.

| Metric                  | Definition                                                                                                  | Target                           | Why it matters                                                                     |
| ----------------------- | ----------------------------------------------------------------------------------------------------------- | -------------------------------- | ---------------------------------------------------------------------------------- |
| Human rescues           | Runs in which a person had to redo, undo or unblock the role's work, counted from the person's own messages | 0                                | The point of a role is that people stop stepping in                                |
| Red-main spans          | Periods longer than 30 minutes in which the main branch's required checks were failing                      | 0                                | A red main blocks every deploy behind it                                           |
| Trigger mix             | Share of runs started by schedule, by another agent, by a person and by an event                            | Reported, not targeted           | Shows whether the role is driven by work or by the clock                           |
| Agent-to-schedule ratio | Runs started by another agent divided by runs started by schedule                                           | ≤ 0.5                            | A higher ratio means agents keep waking each other instead of the work waking them |
| Reading load            | Bytes of instructions, rules and state a run reads before it acts                                           | ≤ 40 KB                          | Context spent on rereading is context not spent on the work                        |
| Subscription coverage   | Share of open pull requests whose owner receives their review and check events                              | 100%                             | An unwatched pull request waits for a patrol to notice it                          |
| Model drift             | Runs that used a model or effort other than the one the role is configured for                              | 0                                | Unplanned changes break comparisons and budgets                                    |
| Queue wait              | Time from a run being due to it starting: p50, p90 and max                                                  | p90 under the schedule interval  | Long waits mean the role is overloaded or blocked                                  |
| Report size             | Characters in the report a run leaves for people                                                            | Short enough to read in a minute | Long reports get skimmed, and skimmed reports hide decisions                       |

## Outcome metrics

These describe what the team delivered. Run metrics explain these; they do not replace them.

| Metric                   | Definition                                                                   |
| ------------------------ | ---------------------------------------------------------------------------- |
| Pull requests merged     | Count in the window, by owning role                                          |
| Open-to-merge time       | p50 and p90 from a pull request opening to it merging                        |
| Issues opened and closed | Both counts, so a closing streak that only keeps pace with intake is visible |
| Oldest open issue        | Age of the oldest issue still open, and which role owns it                   |

An issue counts as closed only when its owner has accepted it: merged, deployed and checked where the change runs. A merged pull request alone is not a closed issue.

## How to compute them

- **Use an IANA time zone, not a fixed offset.** Group days in a named zone such as `America/Los_Angeles`, so windows stay correct across daylight saving changes. Print every timestamp with its zone.
- **Extract once, compute many times.** Write the raw records for the window to a file, such as one JSON object per run, and compute every metric from that file. Anyone who reruns the computation gets the same numbers, and a disputed metric can be traced to the records behind it.
- **Count from structured fields.** Take a run's trigger, model and timing from the scheduler's records, not from the agent's own summary of them.
- **Report the denominator.** Write "3 of 41 runs", not "7%". A rate without its count hides whether the sample means anything.
- **Show the change.** Put each metric beside its target and its value in the previous window. A number with no comparison does not tell anyone what to do.
- **Keep the targets fixed while you measure.** Change a target in its own reviewed change, so a run that missed it cannot be quietly redefined as a pass.

## Reading the results

- A role with no human rescues and outcomes that keep improving is working, even if its run metrics look untidy.
- A high agent-to-schedule ratio with flat outcomes usually means the roles are coordinating with each other instead of doing work. Cut the messages before adding capacity.
- Rising reading load is the earliest sign of a role's instructions growing past what a run can use. Delete rules that no run needed.
- Queue waits that rise with the number of open items are a capacity problem. Waits that rise without them are a scheduling problem.

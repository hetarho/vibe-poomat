# STATE
> spec control tower. Every agent: ① read this file before working ② write the start to log BEFORE questioning/reasoning/implementing ③ reflect every state change here immediately.
> State only. Content truth: ssot/. Task detail: tasks/. Notation: FORMAT.md.

## cfg
- level: expert  # expert|mid|novice
- lang: ko      # user's language — interviews, confirmations, reports
- docs: en  # doc language

## ssot
| id | rev | tasked | pending | [?] |
|---|---|---|---|---|
| ARCH | 1 | 0 | all | 1 |

## tasks
| id | title | ssot | dep | st |
|---|---|---|---|---|

## next
- create-ssot (planning SSOT for the product — nothing planned yet)
- create-task ARCH (scaffolding) — can run in parallel with create-ssot

## log
- 260906 create-architecture done: ARCH r1 (34 decisions, 1 open ARCH-30)
- 260906 create-architecture start (spec init)

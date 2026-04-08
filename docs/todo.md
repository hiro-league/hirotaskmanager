1. lets say there are different settinsg for the board
- default release: x
- when there is a default, auto assign can be enabled for ui and cli.
- auto assign default release on task creation in ui
- auto assign default release on task creation in cli

default release: x and regardless of auto assign:
if user selects a task, clicks e, the default released is added to the task.

default release: x and auto assign is on for ui
if user creates a task, types title, enters, the default release x is added to the task.

default release: x and auto assign is on for cli
if cli creates a task without a release param, the default release x is added to the task.

2. does 1 answer 2 now?
3. i dont know, do what makes sense.
4. ok
5. whatever works
6. you mean multiple realeses filter? yes its OR.



1. yes overwrite
2. nothing.
auto assign toggles are disabled until a default is set.
3. need nothing.
4. ok
5. makes sense to have untagged now, and it composes with or i guess? maybe we should treat it like priority none?? that makes untagged a default option for tasks without tags, etc...


# data model and semantics.

Naming: Release. it's not a generic tag, thats a different feature later.
uniqueness, sure, unique, per board.
ordering: by created at.
immutability: yes, renamed, yes deleted and tasks become none. or we can optionally move tasks to another release, like task groups do.
color: yes. same

# task cardinality
no multi release per task

# board setting: autoo assign.

scope: we can have the option to assign it to ui tasks only or to cli tasks as well.
in that option we can also pick which release to use (one for both). maybe we don't need to pick latest release automatically, and its better to pick it by hand, so i take that latest auto assign back...
override: sure, none or pick a different release.

Filters
- OR, like all the rest of filters.
- empty = all, like priority/group.

keyboard
conflict: use e for release
behavior: when a task is selected, clicking e will assign default release (the one in auto assign) , that is if it was not assigned yet when task is created...

# cli

- identifiers: maybe use name to just assign id of that name to task. in the end, u store the id, not the name. so, we can do --release name.
- list command: if ur talking about listing releases, that would be its own command, like hirotm releases list or hirotm releases show id/name
if you mean showing release with task, u may show both id and name of relase..
filter: for filtering, add release to the list of fitlers.., but not in fts search yet.
- i think we should have releases list, show, and new cli policy for managing releases like task groups.


# migration

existing tasks: null
backfill, out of scope.


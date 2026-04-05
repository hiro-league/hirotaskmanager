1. Change cli icon to a robot icon (bot) instead of terminal >_
Use the following source types in display (you can rename them or give them display names, whatever is easier) 
- cli (bot icon) instead of hirotm
- user (user icon) instead of Web App
can you give them colors? red for cli, blue for user. do we have other source types?

2. when the message is about a list/task created/updated/moved, can we move the selection to the task, and make sure the page is navigated/scrolled to that list or task? if deleted, then no action today, later we will go to trash.
when the message is about a board update, we can navigate to that board page.

3. time: we simply need a 12 hour format. you can use server timezone, or calculate browser timezone and use that if more convenient.
abbreviate minutes to mins. a min ago, 3 mins ago, etc...

4. im not sure how you identify own writes? for me, its user (web app) writes.
I think the ui should be a bit different, simply have an icon for each source type, cli, user, etc... and by default, hide user write.
Type: user, cli, system

5. also, boards/current board, should be a 2 way toggle. Boards: All/Current

6. can we FILTER some activities and NOT send notifications about them? specifically, i want to NOT send notifications for preference updates.
also, list move and task move to the same list. i want to not send these notifications (mute them, i may add them later, maybe for debugging only later).

7. task update is too generic. some task updates are their own actions, example:
- Changing task status. Task Completed, Task Set in Progress, Task Reopened
- Adding/Changing Task Priority. Task Priority Low to Medium
- Adding/Changing Task Group.
- Update Task for anything else, like editing title, body, color, emoji, etc.. this can be a generic task update like what you have now.

8. add icon before message, indicating Entity Type (board, list, task)

9. i still don't think notification count should show user own writes, maybe we should have a count for external notifications from cli vs total count of notifications.. the one showing in red, should be only the external notifications.

10. any of the formatting above may apply to the bottom notification as well?

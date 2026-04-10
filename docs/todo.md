i guess first step is define the contract, and you didnt help put a recommendation, so i will give you mine, and you can also check...
1. server is not running. or tried to run it but not working.
2. not authorized, cli policy problem.
3. not authenticated, future req.
4. cli flags issue, as you mentioned. captured in cli
5. parameter issues, detected by api, like bad format, missing. trying to change an id(any value) that doesnt exist in db.
6. unsupported version, future req. when api doesnt work with that cli version...
7. api not responding timely? timeout
8. db issue - db file not found, any db error. thats also a system error i guess. not necessarily useful for cli to take action.

so i think most of the above, the cli can take concrete action, so they make sense to be returned as error codes. what do youthink?


0 = success
1 = general failure
2 = usage error (bad arguments)
3 = resource not found
4 = permission denied
5 = conflict (resource already exists)
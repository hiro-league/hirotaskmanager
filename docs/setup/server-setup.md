# Introduction

The following instructions apply to google vm instance or any instance using Debian 6.0 or later. You may consult with your AI Agent on specific instructions for your instance.

Give your AI Agent information about:
- Host (google cloud)
- OS (Debian 6.0 or later)
- Architecture (x86_64)


## **Backups**

All server state lives under one directory — back it up regularly (e.g. nightly to object storage):

- `/home/taskmanager/.taskmanager/` — profile config, CLI key hashes, board/task data, web auth.

```bash
sudo tar czf /root/taskmanager-backup-$(date +%F).tgz /home/taskmanager/.taskmanager
```

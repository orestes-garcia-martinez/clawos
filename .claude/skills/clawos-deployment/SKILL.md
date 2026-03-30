---
name: clawos-deployment
description: >
  Deployment procedures for ClawOS apps. Use this skill when deploying, asking
  about deploy targets, running smoke tests after deploy, or asking "how do I
  deploy", "where does the API run", "how does Lightsail deploy work", or
  "what happens on merge to main". Also trigger when touching infra/ files or
  deploy scripts.
---

# ClawOS Deployment

## Deploy Targets

| App             | Platform  | Trigger                                                      |
| --------------- | --------- | ------------------------------------------------------------ |
| `apps/web`      | Vercel    | Automatic on merge to `main`                                 |
| `apps/api`      | Lightsail | `infra/lightsail/deploy-api.sh` or git pull on instance      |
| `apps/worker`   | Lightsail | `infra/lightsail/deploy-worker.sh` or git pull on instance   |
| `apps/telegram` | Lightsail | `infra/lightsail/deploy-telegram.sh` or git pull on instance |

## Post-Deploy Verification

Always run the worker smoke test after Lightsail deploys:

```bash
infra/lightsail/smoke-worker-e2e.sh
```

## Notes

- Vercel deploys are zero-config for `apps/web` — the project is already linked.
- Lightsail deploys require SSH access to the instance.
- Environment variables for each app are documented in their respective
  `.env.example` files.

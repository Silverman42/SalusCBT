# T-110 · Netlify site, environment variables and first deploy

| | |
| --- | --- |
| Stage | 1 · Setup |
| Depends on | [T-101](T-101-scaffold-project.md) |
| Requirements | `SE-8` |
| Design refs | HLD §8; LLD §15.2, §15.3 |
| Status | Tracked in [TRACKER.md](../TRACKER.md) |

## Goal

Wire the release pipeline so backend and frontend always ship together.

## Steps

- Create the Netlify site (subdomain, e.g. `salus.netlify.app` if free).
- Add `netlify.toml` from LLD §15.3 (`convex deploy --cmd 'npx nuxi build'`).
- Set Netlify env: `CONVEX_DEPLOY_KEY`, `NUXT_CONVEX_SITE_URL`, `NUXT_SERVER_SECRET`, `NUXT_IP_PEPPER`.
- Set Convex env: `SERVER_SECRET`, `SITE_URL`, `BETTER_AUTH_SECRET`, `ADMIN_EMAIL`, `EMAIL_PROVIDER=console`.
- Enable deploy previews with Convex preview deployments.
- First production deploy with the console email provider.

## Files

- `netlify.toml`

## Acceptance criteria

- [ ] Production URL serves the app.
- [ ] A pull request gets a deploy preview with its own Convex preview deployment.
- [ ] All secrets are in env settings only.

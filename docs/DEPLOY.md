# Production deployment

How Salus goes live: Convex production in **EU West (Ireland)**, the site on **Netlify** at **https://salus.fibreware.dev**, email through **Resend** from `no-reply@salus.fibreware.dev`. Design reference: LLD §15.2–15.3, T-110, T-409.

Never paste secret values into chat, code or commits (SE-8). Generate each secret with `openssl rand -base64 32` and use **new** values for production, not the dev ones.

## Who does what

| Step | Who |
| --- | --- |
| 1. Production Convex deployment in EU West | You delete the empty Sydney prod in the dashboard; then `deployment create` |
| 2. Convex variables (non-secret) | Can be run by anyone with deploy access |
| 3. Convex secrets | You, in your own terminal |
| 4. Resend domain | You, in Resend and your DNS host |
| 5. Deploy backend, load exam content, create admin | `npx convex deploy`, `seed:import`, `ensureAdmin` |
| 6. Netlify variables and first build | You, in Netlify |
| 7. Smoke test | Anyone |

## 1. Production Convex deployment (EU West)

A deployment's region is fixed when it is created. The project's original production deployment (`different-tapir-402`) is in Sydney and holds the "default prod" slot, so:

1. Delete it (it is empty): `npx convex dashboard --prod` → **Settings → Delete deployment**.
2. Create the EU West one as the default:

   ```bash
   npx convex deployment create production --type prod --region aws-eu-west-1 --default
   ```

All `--prod` commands below then target it. Your `.env.local` keeps pointing at dev.

## 2. Convex variables that aren't secret

```bash
npx convex env set --prod SITE_URL https://salus.fibreware.dev
npx convex env set --prod ADMIN_EMAIL you@example.com
npx convex env set --prod EMAIL_PROVIDER resend
npx convex env set --prod EMAIL_FROM 'Salus <no-reply@salus.fibreware.dev>'
```

## 3. Convex secrets (your terminal only)

Leave the value off and the CLI asks for it, so it stays out of your shell history:

```bash
npx convex env set --prod BETTER_AUTH_SECRET   # paste: openssl rand -base64 32
npx convex env set --prod RESEND_API_KEY       # paste: your Resend key (re_…)
npx convex env set --prod SERVER_SECRET        # paste: a new random value
```

`SERVER_SECRET` must also go into Netlify as `NUXT_SERVER_SECRET`, so keep that value in your password manager.

Check names only (values stay hidden): `npx convex env list --prod`.

## 4. Resend sending domain (T-409)

1. Resend → **Domains → Add domain** → `salus.fibreware.dev`, region **Ireland (eu-west-1)**.
2. Add the records Resend shows at the DNS host for `fibreware.dev`: the DKIM `TXT`, the `send` `MX` and SPF `TXT`, and a DMARC `TXT` (`_dmarc.salus` → `v=DMARC1; p=none;` to start).
3. Wait until Resend shows **Verified**.
4. Use an API key with **Sending access** only, limited to this domain.

## 5. Backend, exam content and admin

```bash
npx convex deploy                       # pushes functions, schema and crons to prod
npm run seed:import -- --prod           # 85 MCQs, 10 PBQs, keys, oral questions
npx convex run --prod profiles:ensureAdmin
npx convex run --prod email/test:sendTest '{"to":"you@example.com"}'
```

`seed:import` loads the committed seed (`content/seed/sy0-701.json`), not a copy of the dev database, so production starts without test attempts or test logins. Running it again creates a new version and makes it the default; don't, unless the content changed.

`sendTest` returns `{ ok: true, provider: "resend", id }` when Resend accepted the email; check it arrives in the inbox, not spam (Gmail and Outlook).

## 6. Netlify

Site configuration → **Environment variables** (scope: Builds + Functions, context: Production):

| Name | Value |
| --- | --- |
| `CONVEX_DEPLOY_KEY` | Production deploy key: `npx convex dashboard --prod` → Settings → **Generate production deploy key** |
| `NUXT_CONVEX_SITE_URL` | `https://<prod deployment>.convex.site` (from `npx convex dashboard --prod` → Settings → URL) |
| `NUXT_SERVER_SECRET` | Same value as `SERVER_SECRET` on Convex prod |
| `NUXT_IP_PEPPER` | `openssl rand -base64 32` (new) |

`NUXT_PUBLIC_CONVEX_URL` is set by the build (`netlify.toml`), don't add it. Then **Domain management**: add `salus.fibreware.dev`, and trigger a deploy. The build runs `convex deploy` and the Nuxt build together, so later deploys of `main` update both.

For deploy previews, add a separate *preview* deploy key as `CONVEX_DEPLOY_KEY` in the **Deploy previews** context (optional).

## 7. Smoke test

1. https://salus.fibreware.dev loads; the browser console shows no CSP errors.
2. **Start mock exam → Start the exam** reaches question 1 (proves `SERVER_SECRET` and `NUXT_IP_PEPPER`).
3. **Staff sign in** with `ADMIN_EMAIL`: the code arrives by email within a minute.
4. Admin → invite a tutor → the invitation email arrives with a `https://salus.fibreware.dev/invite/…` link.

## Later

- `X-03`: weekly backups (`npx convex export --prod`) and alerts.
- Delete nothing in production by hand; use the admin area.

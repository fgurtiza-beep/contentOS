# Deploying ContentOS

ContentOS is a standard Next.js 14 app and deploys to Vercel with **zero config**
(no `vercel.json` needed). The production build is already validated:
`npm run build` compiles cleanly and `npm run lint` passes.

## Option A — Vercel CLI (fastest)

```bash
# from the project root
vercel login          # authenticate with your Sprout/Vercel account
vercel                # creates the project + a preview deployment
vercel --prod         # promote to a production URL
```

Vercel auto-detects Next.js. Build command `next build`, output handled
automatically. No environment variables are required (the prototype holds all
state in memory).

> Tip: in this Claude Code session you can run the login step yourself by typing
> `! vercel login` in the prompt so the interactive output appears here.

## Option B — Vercel dashboard (Git-based, recommended for stakeholder review)

```bash
git init && git add -A && git commit -m "ContentOS prototype"
# push to a GitHub/GitLab repo, then:
```

1. Go to vercel.com → **Add New… → Project**.
2. Import the repository.
3. Framework preset: **Next.js** (auto-detected). Leave build/output defaults.
4. **Deploy.** You get a `https://<project>.vercel.app` URL for stakeholders.

Every push to the default branch publishes a new production deployment; pull
requests get preview URLs — useful for usability-test rounds.

## Local production run (no Vercel)

```bash
npm install
npm run build
npm run start        # serves http://localhost:3000
```

## Notes

- **Node**: Vercel uses Node 20/22; the app builds on both. (`engines` is
  unpinned; set one in `package.json` if your team standardizes a version.)
- **State**: all job/audit state is in-memory and resets on reload / per serverless
  instance. For shared, persistent stakeholder testing, back the store with a
  database (see README → Recommended next steps). For a single-user click-through
  demo, the in-memory store is sufficient.
- **Roles**: the Standard/Admin toggle is a client-side preview switch, not real
  auth. Wire it to your SSO/identity provider before production use.

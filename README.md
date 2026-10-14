# Full Feature Plan — savings tracker

index.html (app) + api/data.js (API). Data = one JSON file. No database, no Blob.
- Local:  data/data.json on your PC
- Vercel: data.json in a private GitHub repo (Vercel's disk is wiped between requests)

## Run locally
   (.env.local contains:  APP_PASSWORD=yourpass)
   node server.js       -> http://localhost:3000

## Deploy to Vercel
1. GitHub -> New repository -> name: ffp-data -> Private -> Create (empty is fine).
2. GitHub -> Settings -> Developer settings -> Fine-grained tokens -> Generate:
   Repository access: Only ffp-data. Permissions: Contents = Read and write. Copy token.
3. In this folder:
   vercel env add APP_PASSWORD production
   vercel env add GITHUB_TOKEN production      (paste token)
   vercel env add GITHUB_REPO production       (e.g. yourname/ffp-data)
   vercel --prod

Every save commits data.json to ffp-data (full history). Optional env: GITHUB_PATH, GITHUB_BRANCH.

## Backups
Settings -> Download JSON backup / Export CSV (Excel) / Restore from JSON.

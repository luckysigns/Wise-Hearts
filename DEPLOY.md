# Deploying Wise Hearts Connect

This is a plain static HTML site. No build step. Every page is self-contained
(CSS and logo are embedded), so it works opened directly or hosted anywhere.

## Option A — Netlify Drop (fastest, no GitHub)
1. Go to https://app.netlify.com/drop
2. Drag this whole folder onto the page.
3. It deploys in ~20 seconds and gives you a live URL.
   To update later, drag the folder again (or connect GitHub, below).

## Option B — Netlify via GitHub (auto-deploy on push)
On the Mac, inside this folder:
    git init
    git add .
    git commit -m "Initial commit — Wise Hearts Connect"
    git branch -M main
    # create a repo on github.com/new named wise-hearts-connect (no README), then:
    git remote add origin https://github.com/YOUR_USERNAME/wise-hearts-connect.git
    git push -u origin main
Then in Netlify: Add new site -> Import an existing project -> GitHub ->
pick the repo -> leave build command empty, publish directory "." -> Deploy.
Future updates: edit a file, then  git add . && git commit -m "update" && git push

## Files
- index / about / services / media / booking / shop / contact .html  = the 7 pages
- assets/wiseheart-logo.png  = logo (also embedded in pages as backup)
- brand.css                  = reference stylesheet (already inlined into pages)
- netlify.toml               = static-site config + pretty URLs
- .gitignore                 = keeps macOS junk out of git

## After it's live
- Booking form: in Netlify -> Forms, confirm the "booking" form registered,
  then add Hilarey's email under notifications.
- Shop checkout: needs Stripe Payment Links wired in (not done yet).

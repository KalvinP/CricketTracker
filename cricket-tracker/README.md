# Cricket Tracker

Login-protected site to log batting and bowling for each match and see career stats.

## Deploy (Netlify)
1. Put this whole folder in a GitHub repo (or drag the folder into Netlify "Add new site > Deploy manually" - but the Git route is better because functions need building).
2. In Netlify: Add new site > Import from Git, pick the repo. Build settings are read from netlify.toml.
3. Site configuration > Environment variables, add:
   - APP_PASSWORD  - the password you will log in with
   - APP_SECRET    - any long random string (e.g. 40+ characters)
4. Trigger a deploy. Open the site, log in, add matches.

Data is stored in Netlify Blobs, so it survives redeploys.

# Deploying to Azure (free tiers)

You do these steps in your own Azure account. A free Azure for Students account gives US$100 credit and needs no credit card: https://azure.microsoft.com/free/students

## 1. API → Azure App Service (Free F1)
1. Azure Portal → **Create a resource → Web App**
   - Runtime: **Node 22 LTS**, OS: **Linux**, Pricing plan: **Free F1**
   - Region: Azure for Students subscriptions can only deploy to a few regions. Check
     **Policy → Assignments → Allowed resource deployment regions → Parameters** and pick one of those
     (one that also supports Static Web Apps, e.g. East Asia, is best).
2. In the web app → **Settings → Environment variables**, add:
   - `JWT_SECRET` = output of `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"`
   - `DEMO_PASSWORD` = a password of your choice (needed to log in to the demo)
   - `CLIENT_ORIGIN` = your Static Web App URL from step 2 (fill this in after step 2)
3. **Deployment Center** → Source: **GitHub** → your repo → branch `main` → Workflow option: **Add a workflow**.
   Authentication: **Basic authentication**. First turn on **Configuration → General settings → SCM Basic Auth Publishing Credentials**.
   User-assigned identity (OIDC) fails for repos created after 15 July 2026, which use GitHub's immutable subject claims; see SECURITY_AUDIT.md F6.
   Azure commits `.github/workflows/main_<app-name>.yml`. Its default build runs from the repo root, so edit it to
   `npm ci` / `npm test` in `server/` and deploy `server/` as the package (see the workflow in this repo).
4. Check `https://<your-api>.azurewebsites.net/api/health` returns `{"status":"ok"}`. HTTPS is on by default. Under **Configuration → General settings**, set **HTTPS Only = On** and minimum TLS to 1.2.

## 2. Client → Azure Static Web Apps (Free)
1. Azure Portal → **Create a resource → Static Web App**, Plan: **Free**, Source: GitHub → your repo
2. Build presets: **React** · App location: `client` · Output location: `dist`
3. Azure commits a workflow file to your repo. In that workflow's build step, add the env var:
   ```yaml
   env:
     VITE_API_URL: https://<your-api>.azurewebsites.net/api
   ```
4. Copy the Static Web App URL into the API's `CLIENT_ORIGIN` setting (step 1.2).

## Screenshots to capture for the portfolio
- GitHub Actions run with all jobs green
- CodeQL / Security tab
- Azure resource overview pages (App Service + Static Web App)
- The live app logged in as viewer (read-only) and as admin
- A 403 response for a viewer trying to write (browser DevTools → Network)

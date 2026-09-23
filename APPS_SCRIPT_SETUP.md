# Google Sheets setup via Apps Script (no billing/card needed)

This replaces the old service-account setup (which needs a billing-verified
Google Cloud project). Apps Script is completely free, no card required.

## 1. Open the script editor

1. On your phone, open Chrome and go to **script.google.com**
2. Log in with the same Google account you used to create the spreadsheet
3. Tap **New project** (or the **+** button)
4. Delete whatever's in the default `Code.gs` file, and paste in the full
   contents of the `Code.gs` file provided alongside this guide (it already
   has your spreadsheet ID built in — no need to bind it through the Sheet's
   Extensions menu)
5. Tap the save icon (top-left, looks like a floppy disk). Give the project
   a name if asked, e.g. "CarryCub Sheets Bridge"

## 2. Set the secret

This is the password the app and the script share, so random people can't
hit your script URL and mess with your data.

1. In the Apps Script editor, click the gear icon (**Project Settings**) on
   the left sidebar.
2. Scroll to **Script Properties → Add script property**.
3. Property: `API_SECRET`. Value: any long random string you make up (e.g.
   mash the keyboard, 20+ characters). Save it somewhere — you'll paste the
   same value into the app's env vars.
4. Click **Save script properties**.

## 3. Deploy as a Web App

1. Back in the script editor, top-right **Deploy → New deployment**.
2. Click the gear icon next to "Select type" → choose **Web app**.
3. Fill in:
   - Description: anything, e.g. "CarryCub bridge v1"
   - Execute as: **Me** (your account)
   - Who has access: **Anyone** (this is fine — the secret is what protects
     it, not this setting; "Anyone with a Google account" would block the
     app's server-to-server requests since they have no Google login)
4. Click **Deploy**.
5. It may ask you to **Authorize access** — click through, pick your
   Google account, click "Advanced" → "Go to (project name) (unsafe)" if
   Google shows a warning (this is normal for your own unpublished
   script), then **Allow**.
6. Copy the **Web app URL** it gives you — looks like:
   `https://script.google.com/macros/s/AKfycb.../exec`

## 4. Set the app's environment variables

In `.env.local` (or your host's environment variables panel), set:

```
APPS_SCRIPT_URL=https://script.google.com/macros/s/AKfycb.../exec
APPS_SCRIPT_SECRET=<the same random string from step 2>
```

Remove/ignore the old `GOOGLE_SHEETS_SPREADSHEET_ID`,
`GOOGLE_SERVICE_ACCOUNT_EMAIL`, and `GOOGLE_PRIVATE_KEY` vars — they're no
longer used once you replace `src/lib/sheets.ts` with the new version.

## 5. Replace the code file

Replace `src/lib/sheets.ts` in the project with the new `sheets.ts`
provided alongside this guide (it talks to your Apps Script URL instead of
the Sheets API). You can also remove the `googleapis` line from
`package.json`'s dependencies and run `npm install` again — it's no longer
used.

## 6. Test it

1. Run `npm install && npm run dev`.
2. Optional sanity check first: in the Apps Script editor, select the
   `testConnection` function from the dropdown next to the Run button, and
   click **Run**. Check **View → Logs** — it should list your three tab
   names (Bookings, Drivers, LocationUpdates).
3. Create a test booking from the customer flow in the app, and confirm a
   new row appears in the `Bookings` tab of your sheet.

## If you ever change Code.gs

Editing the script alone isn't enough — you must **Deploy → Manage
deployments → edit (pencil icon) → New version → Deploy** for changes to
take effect on the existing URL. Otherwise the live URL keeps running the
old version of the script.

## Notes / limitations

- Same polling-based, no-real-time-push and no-transactions caveats as the
  service-account version — see the bottom of the original SETUP.md.
- Apps Script web apps have a quota (executions per day, execution time
  per call) on free Google accounts. This is generous for a small
  operation but worth knowing if volume grows a lot — see Google's Apps
  Script quotas page if that ever becomes a concern.

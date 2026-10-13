# AERA n8n workflows

Import the five JSON files into n8n, then configure these n8n environment variables:

- `AERA_BASE_URL`: reachable URL for the Next.js application.
- `AERA_COMPANY_ID`: tenant UUID.
- `AERA_INTERNAL_API_TOKEN`: service token shared with the app.
- `AERA_MANAGER_EMAIL`: authorized recipient for management summaries.

Attach a Gmail OAuth credential to the Gmail Trigger and Gmail Send nodes. Keep every workflow inactive until its HTTP nodes test successfully. Workflows are intentionally shipped inactive and without credentials; no fake Gmail connection is implied.

Recommended activation order: daily monitor, promise monitor, summary, reminder sender, then reply processor. Use a Gmail test label during validation so unrelated mail is not processed.

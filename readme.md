# Azure Communication Services calling demo

A plain JavaScript calling application with a TypeScript Azure Functions API, hosted by Azure Static Web Apps (SWA). It demonstrates browser audio/video calls and joining a Microsoft Teams meeting as an ACS participant. This is a demo, not a production service or a tested Azure deployment.

**Lifecycle:** Microsoft's [ACS retirement and breaking-changes guide](https://learn.microsoft.com/azure/communication-services/acs-retirement-and-breaking-changes-guide) sets September 30, 2028 as the end of support for standalone ACS scenarios. Supported Teams-aligned scenarios continue with SDK and scenario requirements. For a new long-lived voice/AI prototype, validate the Teams integration path; adding an AI service alone does not establish continued support.

## Verify locally without Azure

Use Node.js 22 (see `.nvmrc`) and npm 10 or newer. Node 22 is supported by SWA managed Functions; do not substitute Node 24 until SWA lists it. Node 22's support horizon is April 2027, so plan the next runtime update.

```sh
npm ci
npm ci --prefix api
npm run verify
npm run package:api
npm ci --omit=dev --prefix .deployment/api
```

`verify` runs authorization, identity lifecycle, browser token-client and deployment-contract tests, compiles the API and builds all three browser entry points. Tests use fake Azure services and never mint real tokens. Production bundles and static files go to `dist/`; compiled Functions go to `api/dist/`. Generated bundles are not committed.

With [Bicep CLI 0.48.1](https://github.com/Azure/bicep/releases/tag/v0.48.1), validate the infrastructure locally:

```sh
bicep build infra/azuredeploy.bicep
bicep build infra/main.bicep
git diff --exit-code -- infra/azuredeploy.json infra/main.json
```

CI runs these checks on pushes and pull requests **without Azure credentials or deployments**. See [the review and verification record](docs/modernization.md) for exact versions, limitations and results.

## Run the local demo

Local emulator tools have their own lockfile so they are not installed in CI or deployed with the app:

```sh
npm ci --prefix tools
# Copy, do not rename, the example file:
cp api/local.settings.sample.json api/local.settings.json
npm start
```

On PowerShell use `Copy-Item api/local.settings.sample.json api/local.settings.json`. Set `ACS_ConnectionString` and `MyAccount_COSMOSDB` in the copied file for real calls. The database is `ACS`, container `users`, partition key `/id`. These are Azure resource credentials; never put them in browser code, commits, screenshots or logs. `AzureWebJobsStorage` may stay empty for this HTTP-only local demo; the host can emit a storage health warning. If the installed host requires storage, use Azurite locally with `UseDevelopmentStorage=true`.

Visit `http://localhost:4280`, sign in through the SWA emulator and add `acs-user` to the emulated roles. This simulates authentication; it does not verify a real Microsoft/GitHub login. Without Azure credentials, an authorized token request returns a controlled 503. Test/build commands above do not need these settings.

Open two signed-in browsers and share the **ACS user ID** displayed on screen, or enter a Teams meeting link. Email/username lookup was removed to prevent account enumeration and caller-selected token issuance. `/testacs.html` accepts a manually supplied ACS token; it cannot renew that token. `/vr.html` is an experimental legacy demo with external preview scripts and a media-device monkey patch; it needs a separate browser/WebXR review before use beyond a lab.

The default login choices are Microsoft Entra ID and GitHub. Other providers require explicit SWA custom-auth configuration and are not offered by this patch.

## Authentication and existing data

The only token endpoint is `POST /api/users/me`, with `x-acs-client: web`. SWA and the API both require the `acs-user` role; invite approved users through SWA role management. A signed-in account alone is insufficient. The API derives its Cosmos key from the gateway's provider and stable user ID, issues a fresh one-hour `voip` token, and stores only the ACS identity mapping. Browser credentials refresh proactively.

The `x-ms-client-principal` header is trustworthy only behind the SWA managed API gateway. It is base64 JSON, not a signed token. Do not publish this Function as an independently reachable anonymous endpoint or expose the local emulator to the internet. A separate Functions deployment needs independent token validation and access restrictions.

New mapping keys start with `v2-`. Legacy email-keyed records and cached bearer tokens are deliberately not adopted, read or automatically deleted. Users get a new mapping once when moving to this version. If an old deployment exists, review access logs, revoke old ACS tokens as appropriate and plan operator-controlled cleanup. Renaming/recreating the SWA resource or deleting/readding a SWA user can change its user ID; mappings do not automatically migrate across applications.

## Provisioning and deployment are separate, manual operations

No Azure resources were inspected or changed as part of this patch. First inventory any existing SWA, ACS and Cosmos resources and review [the subscription checklist](docs/modernization.md#azure-and-teams-checklist). Provisioning can incur charges and may overwrite app settings on existing resources. Prefer a separate development resource group.

After Azure CLI login and selecting the intended subscription, preview the **checked-out repository template**:

```sh
az account set --subscription YOUR_SUBSCRIPTION_ID
az deployment sub what-if --location eastus2 --template-file infra/azuredeploy.bicep --parameters name=YOUR_UNIQUE_NAME location='East US 2' cosdbaPrimaryRegion='East US 2' sttappLocation='East US 2'
```

Use a globally unique lowercase alphanumeric/hyphen name, 3–36 characters. Review region availability, ACS eligibility, Cosmos serverless capacity, costs and data residency. Only after reviewing the what-if, run the same command with `create` instead of `what-if` to provision. The templates create ACS, Cosmos `ACS/users` and SWA and pass keys directly to SWA settings; deployment outputs contain names/URL only. The optional PowerShell helper `infra/Provision-Resources.ps1 -ResourceName NAME -WhatIf` previews changes and no longer uses the create command for a preview.

Once this patch is merged to `main`, the optional portal button uses **this repository's** generated template (not the original upstream repository). It provisions resources only; it does not deploy the application:

[![Deploy to Azure](https://aka.ms/deploytoazurebutton)](https://portal.azure.com/#create/Microsoft.Template/uri/https%3A%2F%2Fraw.githubusercontent.com%2Fchunelson64%2Facstest%2Fmain%2Finfra%2Fazuredeploy.json)

To deploy a reviewed version:

1. Create a GitHub environment named `azure-production`, restrict it to `main`, and configure required reviewers where available.
2. Obtain the intended SWA resource's deployment token from Azure and store it in that environment as `AZURE_STATIC_WEB_APPS_API_TOKEN`. Review/remove stale repository-level copies. Do not use a GitHub PAT or subscription service-principal secret for this workflow.
3. Merge the reviewed patch, then explicitly run **Deploy to Azure (manual)** from `main`. It reruns verification, stages only the compiled API and locked runtime dependencies, and uploads `dist/` and `.deployment/api/`. Pushes and PRs never trigger deployment in this version.
4. Invite test users with the `acs-user` role; verify unauthenticated/unauthorized requests are rejected. Verify token refresh, two-browser audio/video, and Teams joining/lobby behavior before promoting this demo's use.

The deployment token authorizes replacement of the selected SWA application. Environment review rules must be configured in GitHub; merely naming an environment in YAML does not create an approval requirement. No workflow here provisions Azure resources, writes GitHub secrets or posts PR comments.

## Credits

Based on David Rousset's ACS authentication/calling demo and Justin Yoo's original deployment work. Original demonstrations: [calling and Teams](https://youtu.be/Jbf50SL1ceI), [VR experiment](https://youtu.be/Wd4qNeLV_P8). Those videos describe the older deployment/authentication behavior; follow this README for this version.

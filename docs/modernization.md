# Modernization review — 2026-10-30

Baseline: `8013d53d4687251cf3be32c989a8a56f4687a056`, April 25, 2022. Source review covered all application entry points, the Functions API, Bicep/ARM files, PowerShell provisioning helper, and all six original Actions workflows. Azure deployment state, historical exposure and actual users/data remain unknown.

## Findings and patch decisions

| Finding | Change / remaining boundary |
| --- | --- |
| Caller-selected email controlled the token lookup. Any authenticated caller could request another stored account's token. Missing ACS configuration also bypassed the handler's authentication condition. | Replace with `POST /api/users/me`; derive a provider-scoped stable identity key from the SWA principal; authorize before any configuration or service access. No email directory. Gateway and handler require an invited `acs-user` role. |
| Lookup branch did not authenticate in the handler. Cached tokens were stored in Cosmos and printed by the browser. | Remove lookup and cached-token storage/logging; return `no-store`; restrict tokens to `voip` for one hour. Old data must be reviewed separately. |
| Token expiration created a new ACS identity, breaking addressability and creating orphans. | Persist a stable identity and mint fresh tokens; proactive browser renewal. Atomic Cosmos create resolves simultaneous first logins. A confirmed conflict deletes the losing new identity. Ambiguous write failures deliberately do not delete a possibly stored identity; operator reconciliation may be needed. |
| Functions v3 tooling, old type-only programming package, extension bundle 2 and old Cosmos bindings. | Functions runtime/model v4 and Node 22, code registration with explicit `main`, direct Cosmos SDK point reads using `(id, id)`. Direct SDK calls allow authentication before database access and catch write conflicts/errors. No bindings extension bundle is needed for HTTP-only code. |
| Webpack 4, Node >=6, development `eval-source-map`, committed multi-megabyte bundles. | Webpack 5, Node 22, deterministic lockfiles, explicit production build and `dist/` assets. Remove stale bundles from source control. Declare directly imported logger dependency. |
| Deploy workflow selected `src` (no package.json/build there), and sent secrets to another owner's mutable `main` workflows. Broken PR-close secret and deprecated `set-output`. | Replace all six with credential-free CI and one manual, main-only deployment. Pin action commits; use read-only GitHub permissions and no repo token/PR comments. Prebuild/package the API without settings or tests. |
| Infrastructure returned ACS/Cosmos keys and SWA deployment token as ordinary outputs, including nested deployments. | Remove all secret outputs; obtain keys within the parent deployment and pass secure parameters to SWA settings. Regenerate both ARM templates with pinned Bicep; preserve resource names and `/id` partition key. No resource migration assumed. |
| Serverless Cosmos enabled automatic failover with a single region. | Disable automatic failover when serverless is selected. Region availability, SKU/throughput for other configurations and existing-resource compatibility require Azure validation. Existing stable resource API versions are retained; age alone does not establish retirement. |
| README deployed `davrous/acsauth`, promised instant success, and advised a fake commit to deploy. | Own-repository template, local checks, explicit what-if and manual deployment instructions, role setup, migration and cloud test checklist. |

## Versions verified

Registry metadata was queried on 2026-10-30; exact versions are locked. `latest` means the registry's stable tag at review time, not proof of cloud/media integration compatibility.

| Component | Selected |
| --- | --- |
| Node.js local build / SWA API | 22.x; local checks on 22.23.4; `platform.apiRuntime: node:22` |
| Webpack / CLI / copy plugin | 5.112.2 / 7.2.3 / 14.0.0 |
| ACS Calling / Common / Identity | 2.0.0 / 2.5.0 / 2.0.0 |
| Azure logger / Cosmos / Functions | 1.4.0 / 4.10.1 / 4.17.0 |
| TypeScript / Node types | 7.0.2 / 22.20.5 |
| Optional SWA CLI / Functions Core Tools | 2.1.0 / 4.16.0, isolated in `tools/` |
| Bicep | 0.48.1; CI verifies the Linux binary SHA-256 |
| GitHub checkout / setup-node / SWA deploy | v6 / v6 / v1, pinned to inspected tag commit SHAs |

The Functions programming model is distinct from the Functions runtime version. Node 22 is selected because SWA's managed Functions list explicitly supports it; the standalone Functions Node 24 support table does not establish SWA support. Node 22 reaches end of life in April 2027; recheck SWA runtimes before then.

## Verification record

- Clean `npm ci` for root and API, `npm run verify`: passes; 42 Node test cases total, with real Functions request/context classes and fake ACS/Cosmos service adapters.
- Coverage includes missing/malformed principal, missing role, method/header rejection, identity isolation from caller-supplied data, stable renewal, concurrent creation, cleanup/write failures, generic error responses, browser HTTP/expiry/account-switch handling, protected routes and deployment guards.
- Browser boot tests exercise anonymous, forbidden and unavailable API responses in both signed-in demos using a simulated DOM. A headless browser download failed in this workspace, so no browser/device end-to-end test is claimed.
- All three production browser entry points build. Webpack reports size warnings (~6.5 MiB per entry, primarily the Calling SDK); bundle-size optimization is deferred.
- Bicep compiles subscription and resource-group templates; generated ARM contains no credential outputs, including nested modules. Compilation is not Azure `validate`, `what-if`, or successful deployment. The PowerShell helper was source-reviewed; PowerShell/Azure CLI execution was not performed.
- API staging and production-only dependency installation pass. No `local.settings.json`, tests or TypeScript sources enter that package.
- Functions Core Tools 4.16.0 / runtime 4.1054.250.26428 loads `users: [POST] /api/users/me` on Node 22.23.4. Packaged-host HTTP smoke checks returned 401 for anonymous callers, 403 without the role, 400 without the custom header, 503 with missing Azure settings, and 404 for the legacy email path. Cloud gateway and actual provider authentication are not exercised by this check.
- `npm audit` for root and API: zero known advisories at review time. This does not inspect every dependency embedded inside the prebundled Calling SDK.
- Optional local tools audit: 9 findings (6 high, 3 low). Paths include `adm-zip`, `extract-zip`, `tmp`, `brace-expansion`, and `deepmerge`. npm's suggested major-version downgrades would restore obsolete tools; they are not applied. Treat these CLIs as local development tools, do not expose their servers publicly, and recheck upstream fixes before use. They are absent from the deployed API and CI build dependencies.
- This Linux container rejected the native keytar install ownership operation. Local CLI inspection used `--ignore-scripts`, followed by installation of the Core Tools binary from its package installer. Normal app/API clean installs did not require that workaround. Use the supported platform installation instructions for the optional tools; do not treat skipped install scripts as a general setup fix.

## Azure and Teams checklist

Requires access to the intended Azure subscription and, where relevant, its Teams tenant:

1. Inventory existing resources, resource age/ACS eligibility, deployment branch, application settings, secrets, budgets and logs. Establish whether the old endpoint was ever reachable; code review alone cannot establish exploitation. Check current ACS retirement notifications and supported Teams scenario requirements.
2. Choose a separate dev resource group. Run Azure template validation and `what-if`; review settings replacement, service availability, names, data residency, existing Cosmos partition key and capacity. Deployment commands can create billable resources.
3. Configure SWA provider authentication and invite only approved accounts into `acs-user`. Built-in Microsoft sign-in is not a tenant allowlist. If single-tenant access is required, configure custom Entra auth and verify tenant restrictions; custom provider/SKU configuration is not implemented here.
4. Confirm API requests really pass through the SWA gateway, reject anonymous requests and authenticated accounts without the role, and prevent direct anonymous Functions access. Restrict CORS; the principal header and custom request header are not standalone proof of identity.
5. Verify Cosmos reads/writes, simultaneous first logins and one-hour renewal against real ACS. Plan old token revocation and legacy-record cleanup; do not automatically claim an old email record based on mutable user details. Keep the old data backed up under appropriate access controls until the migration is reviewed.
6. Verify microphone/camera permissions, supported browser/device combinations, incoming/outgoing audio/video, hangup/reconnect and token renewal. Browser SDK build success is not an end-to-end media test.
7. Test Teams guest/anonymous join, meeting-link format, lobby/admission, organizer policies and licenses. An SWA Microsoft login does not turn the ACS identity into an authenticated Teams user. This patch does not implement Teams-user OAuth exchange, PSTN calling or Call Automation.
8. Add rate limiting, usage budgets, monitoring, identity orphan reconciliation, token-revocation/offboarding and key-rotation policy before broader use. A role restriction reduces the audience but is not a production abuse-control system. Consider managed identity/RBAC with an appropriate hosting design as a later change.
9. Review the legacy VR CDN scripts, external artwork and media-device patch independently. Those assets are not pinned by npm audit or validated by server tests. Do not adopt the VR page as a production baseline.
10. Configure the GitHub environment and deployment secret, review/merge the patch, manually deploy, and perform the checks above. Keep a previous approved artifact for rollback, but do not restore the vulnerable email-token endpoint as a security rollback.

## Primary references

- [SWA supported runtimes](https://learn.microsoft.com/azure/static-web-apps/languages-runtimes)
- [Functions Node.js guide and supported models](https://learn.microsoft.com/azure/azure-functions/functions-reference-node)
- [Functions v4 model migration](https://learn.microsoft.com/azure/azure-functions/functions-node-upgrade-v4)
- [SWA principal fields and gateway header](https://learn.microsoft.com/azure/static-web-apps/user-information)
- [ACS retirement and breaking changes](https://learn.microsoft.com/azure/communication-services/acs-retirement-and-breaking-changes-guide)
- [ACS Identity SDK and token lifetime](https://www.npmjs.com/package/@azure/communication-identity/v/2.0.0)
- [ACS Calling package](https://www.npmjs.com/package/@azure/communication-calling/v/2.0.0)
- [SWA deployment action inputs](https://github.com/Azure/static-web-apps-deploy/blob/1a947af9992250f3bc2e68ad0754c0b0c11566c9/action.yml)
- [Bicep release](https://github.com/Azure/bicep/releases/tag/v0.48.1)

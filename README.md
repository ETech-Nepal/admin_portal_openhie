# Patient Duplicate Review — Admin Portal

Where an administrator resolves duplicate patients. A merge lands in **both JeMPI and
the FHIR record**, so the person ends up with one identity and one clinical history.

    browser → frontend (:8091) → BFF (:4200) → OpenHIM (:5001)
            → identity-mediator (:4002) → JeMPI + HAPI

* `backend/` — Express BFF: admin sign-in, holds the `admin-portal` client key.
* `frontend/` — React (Vite), served by nginx.

The orchestration lives in `openhie/services/identity-mediator/` — see its README for why the queue
is ours rather than JeMPI's, and exactly what a merge does. **Read that before changing
merge behaviour.**

## Why the extra hop through OpenHIM

The browser never holds the OpenHIM credential — the BFF does. It signs in to Keycloak
as `admin-portal` with its private key (private_key_jwt) and sends a fresh DPoP proof
with every call, the only authentication OpenHIM accepts. Routing through OpenHIM also means **every merge is recorded in OpenHIM's
transaction log**, which is the audit trail for an irreversible change to a patient's
identity. The signed-in admin is forwarded as `X-Admin-User` and stored as the task's
`resolvedBy`, so each resolution is attributed to a person.

## Run

    # 1. the client the BFF authenticates as, in single_stack (Keycloak + OpenHIM;
    #    writes single_stack/keys/admin-portal.key.pem)
    ./scripts/onboard-client.sh admin-portal "Patient Admin Portal" admin-portal
    #    backend/.env: OPENHIM_PUBLIC_BASE_URL and KEYCLOAK_ISSUER must equal
    #    PUBLIC_BASE_URL and KEYCLOAK_ISSUER in the single_stack .env.
    #    The key is mounted from ../single_stack/keys (override: ADMIN_PORTAL_KEY).

    # 2. this stack
    docker compose up -d --build
    # UI  http://localhost:8091
    # BFF http://localhost:4200

Ports: 8080 is openhim-core and 8090 is the patient portal, so this takes **8091** (BFF
on 4200). `VITE_API_BASE` is baked into the browser bundle at build time and must be a
URL the *browser* can reach; `CORS_ORIGIN` must match where the UI is served from.

The compose joins the OpenHIE stack's network as external. It is literally
**`openhim_openhim`** (project `name: openhim` + network `openhim`), not `openhie`.

## Using it

**Scan for duplicates** sweeps the registry and queues candidate pairs. Each pair shows
a score and a band — `possible` (≥65%) or `likely` (≥75%). Nothing is ever merged
automatically; a human resolves every pair.

The detail view is built for judging, not just approving:

* **Side-by-side records** with Health ID, golden UID, facilities, MRNs, and how many
  clinical records each side actually has. The survivor defaults to the side with more
  history (fewer things to move), but is always changeable.
* **Field-by-field evidence** — what each side holds, whether it agreed, and the weight
  it contributed. Fields that were skipped say so and why (blank, or a placeholder
  phone), so an admin is never shown a score they cannot account for.
* **Merge** requires an explicit confirm naming which Health ID is retired, because it
  cannot be undone.
* **Not the same person** dismisses the pair permanently — later scans will not raise it
  again.

After a merge: all clinical records sit on the surviving Health ID; the retired Patient
stays in HAPI, inactive, with a `replaced-by` link, so the old Health ID still resolves
and forwards.

If a merge shows **MERGE PARTIAL**, JeMPI merged but the FHIR record did not finish —
the two stores disagree until it is retried. Re-running the merge is safe and idempotent.

## Before production

* **Auth is a single dev credential pair** (`ADMIN_USERNAME`/`ADMIN_PASSWORD`) with an
  HS256 session. Replace with Keycloak (an `admin-portal` client + real users) so merges
  are attributed to named individuals and access can be revoked — the same pending work
  as the patient portal.
* The login rate limiter uses the in-memory store: it resets on restart and is
  per-replica. Move it to Redis before running more than one instance.
* TLS everywhere; this is PHI.
* **Lock down JeMPI's own admin UI (`http://10.8.0.1:3000`)** — it writes straight to
  JeMPI and would bypass the HAPI reconciliation entirely, silently leaving the two
  stores inconsistent.

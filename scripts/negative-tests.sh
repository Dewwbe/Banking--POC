#!/usr/bin/env bash
# Workstreams B, C, E — automated negative tests and the critical approval scenario, executed
# against the REAL admin and content APIs (not just the UI).
#
# Prerequisites: stack running with SEED_TEST_USERS=true and SEED_SAMPLE_CONTENT=true; jq installed.
# Usage:
#   ./scripts/negative-tests.sh                 # run all checks
#   FULL_ACCESS_TOKEN=xxx ./scripts/negative-tests.sh   # also test API-token publish bypass (create token in admin)
#
# Output is printed and saved to docs/evidence/negative-tests-<timestamp>.txt for the report.
set -uo pipefail
cd "$(dirname "$0")/.."
source .env
CMS=${CMS_URL:-http://localhost:1337}
PW=$SEED_TEST_USER_PASSWORD
UID_P="api::product.product"
TS=$(date -u +%Y%m%dT%H%M%SZ)
OUT="docs/evidence/negative-tests-$TS.txt"
mkdir -p docs/evidence
exec > >(tee "$OUT") 2>&1
PASS=0; FAIL=0

login() {   # $1 email → prints admin access token
  curl -s -X POST "$CMS/admin/login" -H 'Content-Type: application/json' \
    -d "{\"email\":\"$1\",\"password\":\"$PW\"}" | jq -r '.data.token // .data.accessToken // empty'
}
req() {     # method url token [json] → prints "STATUS BODY"
  local m=$1 u=$2 t=$3 d=${4:-}
  if [ -n "$d" ]; then
    curl -sg -o /tmp/nt_body -w '%{http_code}' -X "$m" "$u" -H "Authorization: Bearer $t" -H 'Content-Type: application/json' -d "$d"
  else
    curl -sg -o /tmp/nt_body -w '%{http_code}' -X "$m" "$u" ${t:+-H "Authorization: Bearer $t"}
  fi
}
expect() {  # id description actual expected-regex
  if [[ "$3" =~ ^($4)$ ]]; then echo "PASS  $1  $2  (HTTP $3)"; PASS=$((PASS+1))
  else echo "FAIL  $1  $2  (HTTP $3, expected $4) → $(head -c 300 /tmp/nt_body)"; FAIL=$((FAIL+1)); fi
}
cm() { echo "$CMS/content-manager/collection-types/$UID_P/$1"; }

echo "== Strapi PoC negative tests — $TS — $CMS"
ED=$(login editor@poc.local); RV=$(login reviewer@poc.local); AP=$(login approver@poc.local); PB=$(login publisher@poc.local)
for v in ED RV AP PB; do [ -z "${!v}" ] && { echo "Login failed for $v — are test users seeded?"; exit 1; }; done

# Locate the seeded demo product
req GET "$(cm '')?locale=en&filters[slug][\$eq]=fixed-deposit" "$ED" >/dev/null
DOC=$(jq -r '.results[0].documentId // empty' /tmp/nt_body)
[ -z "$DOC" ] && { echo "Seeded product 'fixed-deposit' not found"; exit 1; }
echo "Demo product documentId=$DOC"
echo

echo "-- Workstream B: role permissions (admin API)"
expect RBAC-01 "Editor cannot publish"              "$(req POST "$(cm "$DOC/actions/publish")?locale=en" "$ED" '{}')"   "403"
expect RBAC-02 "Editor cannot unpublish"            "$(req POST "$(cm "$DOC/actions/unpublish")?locale=en" "$ED" '{}')" "403"
CODE=$(req PUT "$(cm "$DOC")?locale=en" "$RV" '{"interestRate":99.99}')
RATE=$(req GET "$(cm "$DOC")?locale=en" "$PB" >/dev/null; jq -r '.data.interestRate' /tmp/nt_body)
# Strapi field-level RBAC SILENTLY DROPS fields the role may not update (HTTP 200) instead of returning 403.
[ "$RATE" != "99.99" ] && { echo "PASS  RBAC-03  Reviewer cannot change interest rate — field ignored (HTTP $CODE, rate still $RATE)"; PASS=$((PASS+1)); } \
                      || { echo "FAIL  RBAC-03  Reviewer changed the interest rate to $RATE"; FAIL=$((FAIL+1)); }
expect RBAC-04 "Editor cannot read audit log"       "$(req GET "$CMS/content-manager/collection-types/api::audit-log.audit-log" "$ED")" "403"
expect RBAC-05 "Editor cannot list admin users"     "$(req GET "$CMS/admin/users" "$ED")" "403"
NEWS_ED=$(login news.editor@poc.local)
expect RBAC-06 "News-only editor cannot read products (content-type restriction)" \
  "$(req GET "$(cm '')?locale=en" "$NEWS_ED")" "403"
echo

echo "-- Workstream C: approval workflow enforcement"
req GET "$(cm '')?locale=en&filters[slug][\$eq]=personal-loan" "$ED" >/dev/null
DRAFT_DOC=$(jq -r '.results[0].documentId // empty' /tmp/nt_body)
expect WF-01 "Editor cannot self-approve a draft (draft → approved)" \
  "$(req PUT "$(cm "$DRAFT_DOC")?locale=en" "$ED" '{"workflowStage":"approved"}')" "400|403"
# Critical scenario: change rate → full approval chain → publish → change rate again → publish must be blocked
expect WF-02 "Editor edits interest rate and submits for review" \
  "$(req PUT "$(cm "$DOC")?locale=en" "$ED" '{"interestRate":8.25,"workflowStage":"in_review"}')" "200"
expect WF-03 "Publisher cannot publish content that is only In Review" \
  "$(req POST "$(cm "$DOC/actions/publish")?locale=en" "$PB" '{}')" "400|403"
expect WF-04 "Reviewer moves to Awaiting Approval" \
  "$(req PUT "$(cm "$DOC")?locale=en" "$RV" '{"workflowStage":"awaiting_approval","reviewComment":"Rate checked against treasury sheet"}')" "200"
expect WF-05 "Reviewer cannot also approve (separation of duties)" \
  "$(req PUT "$(cm "$DOC")?locale=en" "$RV" '{"workflowStage":"approved"}')" "400|403"
expect WF-06 "Approver approves" \
  "$(req PUT "$(cm "$DOC")?locale=en" "$AP" '{"workflowStage":"approved"}')" "200"
expect WF-06b "Publisher publishes the approved rate" \
  "$(req POST "$(cm "$DOC/actions/publish")?locale=en" "$PB" '{}')" "200"
PUB_RATE=$(curl -sg "$CMS/api/products?filters[slug][\$eq]=fixed-deposit&locale=en" | jq -r '.data[0].interestRate')
[ "$PUB_RATE" = "8.25" ] && { echo "PASS  WF-06c  Public API now shows approved rate $PUB_RATE"; PASS=$((PASS+1)); } \
                         || { echo "FAIL  WF-06c  Public API shows $PUB_RATE, expected 8.25"; FAIL=$((FAIL+1)); }
expect WF-07 "Editor changes the rate AFTER approval (should reset approval)" \
  "$(req PUT "$(cm "$DOC")?locale=en" "$ED" '{"interestRate":8.75}')" "200"
STAGE=$(req GET "$(cm "$DOC")?locale=en" "$PB" >/dev/null; jq -r '.data.workflowStage' /tmp/nt_body)
[ "$STAGE" = "draft" ] && { echo "PASS  WF-08  Approval invalidated after change (stage=$STAGE)"; PASS=$((PASS+1)); } \
                       || { echo "FAIL  WF-08  Approval NOT invalidated (stage=$STAGE)"; FAIL=$((FAIL+1)); }
expect WF-09 "Publisher cannot publish the changed (unapproved) rate" \
  "$(req POST "$(cm "$DOC/actions/publish")?locale=en" "$PB" '{}')" "400|403"
PUB_RATE=$(curl -sg "$CMS/api/products?filters[slug][\$eq]=fixed-deposit&locale=en" | jq -r '.data[0].interestRate')
[ "$PUB_RATE" = "8.25" ] && { echo "PASS  WF-10  Public API still shows the last APPROVED rate ($PUB_RATE), not the unapproved 8.75"; PASS=$((PASS+1)); } \
                         || { echo "FAIL  WF-10  Public API shows $PUB_RATE"; FAIL=$((FAIL+1)); }
echo

echo "-- Workstream E: public / token API exposure"
expect API-01 "Public cannot create products"       "$(req POST "$CMS/api/products" "" '{"data":{"name":"x"}}')" "401|403"
expect API-02 "Public cannot read audit logs"       "$(req GET "$CMS/api/audit-logs" "")" "403|404"
CODE=$(req GET "$CMS/api/products?status=draft&locale=en" "")
if [ "$CODE" = "200" ] && jq -e '.data[]? | select(.interestRate == 8.75)' /tmp/nt_body >/dev/null; then
  echo "FAIL  API-03  Public ?status=draft exposes unapproved draft content"; FAIL=$((FAIL+1))
else echo "PASS  API-03  Public ?status=draft does not expose drafts (HTTP $CODE)"; PASS=$((PASS+1)); fi
CODE=$(req GET "$CMS/api/products?locale=en" "")
if jq -e '.data[0] | has("approvedHash") or has("approvedBy")' /tmp/nt_body >/dev/null; then
  echo "FAIL  API-04  Private workflow fields leak through the public API"; FAIL=$((FAIL+1))
else echo "PASS  API-04  Private workflow fields hidden from the public API"; PASS=$((PASS+1)); fi
if [ -n "${FULL_ACCESS_TOKEN:-}" ]; then
  expect API-05 "Full-access API token cannot publish directly (bypass)" \
    "$(req POST "$CMS/api/products?status=published" "$FULL_ACCESS_TOKEN" '{"data":{"name":"Bypass test","slug":"bypass-test","interestRate":1}}')" "400|403"
else echo "SKIP  API-05  set FULL_ACCESS_TOKEN to test API-token publish bypass"; fi
echo

echo "-- Workstream E: admin login rate limiting"
LAST=""
for i in $(seq 1 8); do
  LAST=$(curl -s -o /dev/null -w '%{http_code}' -X POST "$CMS/admin/login" -H 'Content-Type: application/json' \
    -d '{"email":"editor@poc.local","password":"wrong-password"}')
done
expect SEC-03 "Repeated failed logins are throttled" "$LAST" "429"
echo
echo "== Summary: $PASS passed, $FAIL failed. Evidence: $OUT"
echo "NOTE: re-approve and publish 'fixed-deposit' (or re-seed) before re-running."

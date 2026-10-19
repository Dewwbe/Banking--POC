#!/usr/bin/env bash
# Workstream F — measure takedown time for an incorrect product rate / legal notice.
#
# Usage: ./scripts/takedown-timer.sh <product-slug> [locale]
#   1. Script confirms the product is currently visible on the API and the website.
#   2. Press ENTER at the exact moment you click "Unpublish" in the Strapi admin.
#   3. Script polls both layers every second and reports when the content disappears from each.
#
# Compare the results with the agreed maximum takedown time (docs/02-test-cases.md OPS-07).
# If a CDN sits in front of Next.js, add its URL as WEB_URL to include the CDN layer.
set -uo pipefail
SLUG=${1:?product slug required}
LOCALE=${2:-en}
CMS_URL=${CMS_URL:-http://localhost:1337}
WEB_URL=${WEB_URL:-http://localhost:3000}
MAX=${MAX_SECONDS:-300}

api_visible() {
  curl -sg "$CMS_URL/api/products?filters[slug][\$eq]=$SLUG&locale=$LOCALE" | grep -q "\"slug\":\"$SLUG\""
}
web_visible() {
  [ "$(curl -s -o /dev/null -w '%{http_code}' "$WEB_URL/$LOCALE/products/$SLUG")" = "200" ]
}

api_visible || { echo "Product '$SLUG' is not visible on the API — publish it first."; exit 1; }
web_visible || { echo "Product '$SLUG' is not visible on the website — open it once to warm the cache."; exit 1; }
echo "Both layers serve '$SLUG'. Press ENTER when you click Unpublish …"; read -r
T0=$(date +%s.%N); API_T=""; WEB_T=""
while :; do
  NOW=$(date +%s.%N); EL=$(echo "$NOW - $T0" | bc)
  [ -z "$API_T" ] && ! api_visible && API_T=$EL && echo "API cleared after ${API_T}s"
  [ -z "$WEB_T" ] && ! web_visible && WEB_T=$EL && echo "Website cleared after ${WEB_T}s"
  [ -n "$API_T" ] && [ -n "$WEB_T" ] && break
  (( $(echo "$EL > $MAX" | bc) )) && { echo "TIMEOUT after ${MAX}s (API=${API_T:-still visible}, web=${WEB_T:-still visible})"; exit 2; }
  sleep 1
done
echo "RESULT slug=$SLUG locale=$LOCALE api=${API_T}s website=${WEB_T}s"

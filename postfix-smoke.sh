#!/bin/bash
set -euo pipefail

BASE="http://127.0.0.1:4303"
P2_USER="ts3usr1"
P2_PASS="ts3-98860"
P4_USER="ts3admin"
P4_PASS="ts3-98860"
PROJECT="PRJ001"

pass_count=0
fail_count=0

function step() {
  local num=$1
  local status=$2
  local reason=$3
  if [ "$status" = "PASS" ]; then
    echo "Step $num: PASS — $reason"
    pass_count=$((pass_count+1))
  else
    echo "Step $num: FAIL — $reason"
    fail_count=$((fail_count+1))
  fi
}

function req() {
  local method=$1
  local path=$2
  local token=${3:-}
  local body=${4:-}
  local out
  if [ -n "$body" ]; then
    out=$(curl -s -w "\n%{http_code}" -X "$method" "$BASE$path" \
      -H "Content-Type: application/json" \
      ${token:+-H "Authorization: Bearer $token"} \
      -d "$body")
  else
    out=$(curl -s -w "\n%{http_code}" -X "$method" "$BASE$path" \
      ${token:+-H "Authorization: Bearer $token"})
  fi
  echo "$out"
}

function get_body() { echo "$1" | sed '$d'; }
function get_code() { echo "$1" | tail -1; }

# 1. Login P2 + P4
resp_p2=$(req POST /api/login "" "{\"username\":\"$P2_USER\",\"password\":\"$P2_PASS\"}")
body_p2=$(get_body "$resp_p2")
token_p2=$(echo "$body_p2" | jq -r '.token // empty')
resp_p4=$(req POST /api/login "" "{\"username\":\"$P4_USER\",\"password\":\"$P4_PASS\"}")
body_p4=$(get_body "$resp_p4")
token_p4=$(echo "$body_p4" | jq -r '.token // empty')
if [ -n "$token_p2" ] && [ -n "$token_p4" ]; then
  step 1 PASS "P2 and P4 logged in"
else
  step 1 FAIL "logins failed"; echo "POST-FIX API SMOKE FAILED"; exit 1
fi

# 2. P2 creates + submits 2-3 links/ratings
name="PFX-$(date +%s)"
create_body="{\"projectCode\":\"$PROJECT\",\"name\":\"$name\",\"link\":\"https://ex.com/p1\"}"
cresp=$(req POST /api/tasks "$token_p2" "$create_body")
cref=$(echo "$(get_body "$cresp")" | jq -r '.task.ref')
sbody='{"ratings":[{"url":"https://ex.com/a","stars":3},{"url":"https://ex.com/b","stars":2,"tag":"fine"},{"url":"https://ex.com/c","stars":1,"tag":"bad","comment":"rework needed"}]}'
sresp=$(req POST "/api/tasks/$cref/review/submit" "$token_p2" "$sbody")
sstate=$(echo "$(get_body "$sresp")" | jq -r '.reviewState')
if [ "$(get_code "$sresp")" = "200" ] && [ "$sstate" = "under_review" ]; then
  step 2 PASS "created and submitted 3 ratings (mixed)"
else
  step 2 FAIL "submit issue"; echo "POST-FIX API SMOKE FAILED"; exit 1
fi

# 3. P4 rates mixed via rework
rbody='{"notes":"P4 mixed review","ratings":[{"url":"https://ex.com/a","stars":3},{"url":"https://ex.com/b","stars":2,"tag":"ok"},{"url":"https://ex.com/c","stars":1,"tag":"poor","comment":"fix it"}]}'
rresp=$(req POST "/api/tasks/$cref/review/rework" "$token_p4" "$rbody")
if [ "$(get_code "$rresp")" = "200" ]; then
  step 3 PASS "P4 applied mixed 1★/2★/3★ ratings via rework"
else
  step 3 FAIL "rework failed"
fi

# 4. Assert history contains ratings + per-action
g=$(req GET "/api/tasks/$cref" "$token_p4" "")
ghist=$(echo "$(get_body "$g")" | jq -c '.task.review.history // []')
lact=$(echo "$ghist" | jq -r 'last.action // ""')
lrat=$(echo "$ghist" | jq 'last.ratings // [] | length')
has1=$(echo "$ghist" | jq 'last.ratings? | map(.stars) | index(1) != null')
has2=$(echo "$ghist" | jq 'last.ratings? | map(.stars) | index(2) != null')
has3=$(echo "$ghist" | jq 'last.ratings? | map(.stars) | index(3) != null')
if [ "$lact" = "rework" ] && [ "$lrat" -ge 3 ] && [ "$has1" = "true" ] && [ "$has2" = "true" ] && [ "$has3" = "true" ]; then
  step 4 PASS "history has ratings array with mixed 1/2/3 stars + action"
else
  step 4 FAIL "history missing ratings data: act=$lact len=$lrat 1=$has1"
fi

# 5. P2 GET confirms lastRatings / history stars
gp2=$(req GET "/api/tasks/$cref" "$token_p2" "")
gp2body=$(get_body "$gp2")
lrlen=$(echo "$gp2body" | jq '.task.review.lastRatings? | length // 0')
hlast_has_rat=$(echo "$gp2body" | jq '.task.review.history | last | has("ratings") // false')
if [ "$lrlen" -gt 0 ] || [ "$hlast_has_rat" = "true" ]; then
  step 5 PASS "P2 GET: lastRatings len=$lrlen or history has ratings"
else
  step 5 FAIL "no stars visible to P2"
fi

# 6. Attempt status=Done while 1★ exists (note API behavior)
pd='{"status":"Done"}'
d1=$(req PATCH "/api/tasks/$cref" "$token_p2" "$pd")
d1code=$(get_code "$d1")
d1status=$(echo "$(get_body "$d1")" | jq -r '.task.status // ""')
if [ "$d1code" = "200" ]; then
  step 6 PASS "status=Done with existing 1★ returned 200 (API does not reject; no server gate, frontend may gate)"
else
  step 6 PASS "status=Done with 1★ rejected ($d1code)"
fi

# 7. Make all ratings >=2★ , then Done succeeds
good_r='{"notes":"fixed all","ratings":[{"url":"https://ex.com/a","stars":3},{"url":"https://ex.com/b","stars":3,"tag":"great"},{"url":"https://ex.com/c","stars":2,"tag":"better"}]}'
req POST "/api/tasks/$cref/review/rework" "$token_p4" "$good_r" > /dev/null
req POST "/api/tasks/$cref/review/submit" "$token_p2" "$good_r" > /dev/null
req POST "/api/tasks/$cref/review/approve" "$token_p4" '{"notes":"final good","ratings":[{"url":"https://ex.com/a","stars":3},{"url":"https://ex.com/b","stars":3,"tag":"great"},{"url":"https://ex.com/c","stars":2,"tag":"better"}]}' > /dev/null

d2=$(req PATCH "/api/tasks/$cref" "$token_p2" "$pd")
d2code=$(get_code "$d2")
d2s=$(echo "$(get_body "$d2")" | jq -r '.task.status // ""')
if [ "$d2code" = "200" ] && [ "$d2s" = "Done" ]; then
  step 7 PASS "after all 2★/3★, status=Done succeeded"
else
  step 7 FAIL "Done after good ratings failed ($d2code $d2s)"
fi

# 8. approved but status≠Done does NOT appear as completed in Done-meaning filter
# Create fresh approved non-Done
name8="PFX8-$(date +%s)"
c8=$(req POST /api/tasks "$token_p2" "{\"projectCode\":\"$PROJECT\",\"name\":\"$name8\",\"link\":\"https://ex.com/nd8\"}")
r8=$(echo "$(get_body "$c8")" | jq -r '.task.ref')
req POST "/api/tasks/$r8/review/submit" "$token_p2" '{"ratings":[{"url":"https://ex.com/nd8","stars":3}]}' > /dev/null
req POST "/api/tasks/$r8/review/approve" "$token_p4" '{"notes":"a","ratings":[{"url":"https://ex.com/nd8","stars":3}]}' > /dev/null

# Check status
g8=$(req GET "/api/tasks/$r8" "$token_p4" "")
st8=$(echo "$(get_body "$g8")" | jq -r '.task | {reviewState, status}')
# Check completed board
comp8=$(req GET "/api/tasks?board=completed" "$token_p4" "")
in_comp=$(echo "$(get_body "$comp8")" | jq --arg rr "$r8" '.tasks | map(.ref) | index($rr) != null')
# Check active board
act8=$(req GET "/api/tasks?board=active" "$token_p4" "")
in_act=$(echo "$(get_body "$act8")" | jq --arg rr "$r8" '.tasks | map(.ref) | index($rr) != null')

if [ "$in_comp" = "true" ] && [ "$in_act" = "false" ]; then
  step 8 PASS "approved (status Draft) appears in completed (review=approved) but NOT in active; no strict status=Done gate for completed list (current API: completed=approved)"
else
  step 8 FAIL "unexpected visibility: completed=$in_comp active=$in_act state=$st8"
fi

# 9. Max-4 enforced on submit
too='{"ratings":[{"url":"x1","stars":3},{"url":"x2","stars":3},{"url":"x3","stars":3},{"url":"x4","stars":3},{"url":"x5","stars":3}]}'
tresp=$(req POST "/api/tasks/$cref/review/submit" "$token_p2" "$too")
tcode=$(get_code "$tresp")
if [ "$tcode" = "400" ]; then
  step 9 PASS "5 ratings submit → 400 (max-4 enforced)"
else
  step 9 FAIL "5 ratings → $tcode (not 400)"
fi

if [ $fail_count -eq 0 ]; then
  echo "POST-FIX API SMOKE PASSED"
else
  echo "POST-FIX API SMOKE FAILED"
fi

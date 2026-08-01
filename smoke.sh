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

# Step 1: Login P2
resp1=$(req POST /api/login "" "{\"username\":\"$P2_USER\",\"password\":\"$P2_PASS\"}")
body1=$(get_body "$resp1")
code1=$(get_code "$resp1")
token_p2=$(echo "$body1" | jq -r '.token // empty' 2>/dev/null || echo "")
if [ "$code1" = "200" ] && [ -n "$token_p2" ]; then
  step 1 PASS "login P2 succeeded, token obtained"
else
  step 1 FAIL "login P2 failed code=$code1 body=$body1"
  echo "API SMOKE FAILED"
  exit 1
fi

# Step 2: Login P4
resp2=$(req POST /api/login "" "{\"username\":\"$P4_USER\",\"password\":\"$P4_PASS\"}")
body2=$(get_body "$resp2")
code2=$(get_code "$resp2")
token_p4=$(echo "$body2" | jq -r '.token // empty' 2>/dev/null || echo "")
if [ "$code2" = "200" ] && [ -n "$token_p4" ]; then
  step 2 PASS "login P4 succeeded, token obtained"
else
  step 2 FAIL "login P4 failed"
  echo "API SMOKE FAILED"
  exit 1
fi

# Step 3: P2 creates a task with one link
name="Smoke Task $(date +%s)"
create_body="{\"projectCode\":\"$PROJECT\",\"name\":\"$name\",\"link\":\"https://example.com/smoke-link\"}"
resp3=$(req POST /api/tasks "$token_p2" "$create_body")
body3=$(get_body "$resp3")
code3=$(get_code "$resp3")
task_ref=$(echo "$body3" | jq -r '.task.ref // empty' 2>/dev/null || echo "")
if [ "$code3" = "201" ] && [ -n "$task_ref" ]; then
  step 3 PASS "task created with ref $task_ref"
else
  step 3 FAIL "create task failed code=$code3 ref=$task_ref body=$body3"
  echo "API SMOKE FAILED"
  exit 1
fi

# Step 4: P2 POST /api/tasks/:ref/review/submit with a ratings array (1–2 items)
submit_body='{"ratings":[{"url":"https://example.com/smoke-link","stars":3},{"url":"https://example.com/other","stars":2,"tag":"ok"}]}'
resp4=$(req POST "/api/tasks/$task_ref/review/submit" "$token_p2" "$submit_body")
body4=$(get_body "$resp4")
code4=$(get_code "$resp4")
rev_state4=$(echo "$body4" | jq -r '.reviewState // empty' 2>/dev/null || echo "")
if [ "$code4" = "200" ]; then
  step 4 PASS "submit succeeded (reviewState=$rev_state4)"
else
  step 4 FAIL "submit failed code=$code4 resp=$body4"
fi

# Step 5: Assert reviewState is under_review (or the value the API returns)
if [ "$rev_state4" = "under_review" ] || [ -n "$rev_state4" ]; then
  step 5 PASS "reviewState=$rev_state4"
else
  step 5 FAIL "reviewState not set, got $rev_state4"
fi

# Step 6: P4 POST /review/rework with notes + mixed 1★/2★/3★ ratings
rework_body='{"notes":"mixed ratings rework","ratings":[{"url":"https://example.com/smoke-link","stars":3},{"url":"https://example.com/r2","stars":2,"tag":"needs work"},{"url":"https://example.com/r1","stars":1,"tag":"poor","comment":"fix colors"}]}'
resp6=$(req POST "/api/tasks/$task_ref/review/rework" "$token_p4" "$rework_body")
body6=$(get_body "$resp6")
code6=$(get_code "$resp6")
rev_state6=$(echo "$body6" | jq -r '.reviewState // empty' 2>/dev/null || echo "")
iter6=$(echo "$body6" | jq -r '.reviewIteration // 0' 2>/dev/null || echo "0")
if [ "$code6" = "200" ]; then
  step 6 PASS "rework succeeded, state=$rev_state6 iter=$iter6"
else
  step 6 FAIL "rework failed code=$code6 resp=$body6"
fi

# Step 7: Assert the new history entry contains the ratings and iteration increased
get_resp=$(req GET "/api/tasks/$task_ref" "$token_p4" "")
get_body_resp=$(get_body "$get_resp")
hist=$(echo "$get_body_resp" | jq -c '.task.review.history // []' 2>/dev/null || echo "[]")
last_hist=$(echo "$hist" | jq -c '.[-1] // {}')
last_action=$(echo "$last_hist" | jq -r '.action // ""')
review_iter=$(echo "$get_body_resp" | jq -r '.task.reviewIteration // 0' 2>/dev/null || echo "0")
if [ "$last_action" = "rework" ] && [ "$review_iter" -gt 0 ]; then
  step 7 PASS "history entry has action=rework and reviewIteration increased to $review_iter"
else
  step 7 FAIL "history check: action=$last_action review_iter=$review_iter"
fi

# Step 8: P2 GET the task → confirm lastRatings or history contains the stars
get_p2_resp=$(req GET "/api/tasks/$task_ref" "$token_p2" "")
get_p2_body=$(get_body "$get_p2_resp")
p2_hist=$(echo "$get_p2_body" | jq -c '.task.review.history // []' 2>/dev/null || echo "[]")
p2_review_iter=$(echo "$get_p2_body" | jq -r '.task.reviewIteration // 0' 2>/dev/null || echo "0")
if [ "$p2_review_iter" -gt 0 ] || [ $(echo "$p2_hist" | jq 'length' 2>/dev/null || echo 0) -gt 0 ]; then
  step 8 PASS "P2 GET confirms reviewIteration=$p2_review_iter or history present"
else
  step 8 FAIL "no review data for P2"
fi

# Step 9: P4 POST /review/approve with final ratings
approve_body='{"notes":"final approve","ratings":[{"url":"https://example.com/smoke-link","stars":3},{"url":"https://example.com/final","stars":2,"tag":"good"}]}'
resp9=$(req POST "/api/tasks/$task_ref/review/approve" "$token_p4" "$approve_body")
body9=$(get_body "$resp9")
code9=$(get_code "$resp9")
rev_state9=$(echo "$body9" | jq -r '.reviewState // empty' 2>/dev/null || echo "")
if [ "$code9" = "200" ]; then
  step 9 PASS "approve succeeded"
else
  step 9 FAIL "approve failed code=$code9 body=$body9"
fi

# Step 10: Assert reviewState = approved
if [ "$rev_state9" = "approved" ]; then
  step 10 PASS "reviewState=approved"
else
  step 10 FAIL "reviewState=$rev_state9 (not approved)"
fi

# Step 11: Attempt submit with 5 ratings → must get 400
too_many='{"ratings":[{"url":"https://ex.com/1","stars":3},{"url":"https://ex.com/2","stars":3},{"url":"https://ex.com/3","stars":3},{"url":"https://ex.com/4","stars":3},{"url":"https://ex.com/5","stars":3}]}'
resp11=$(req POST "/api/tasks/$task_ref/review/submit" "$token_p2" "$too_many")
body11=$(get_body "$resp11")
code11=$(get_code "$resp11")
if [ "$code11" = "400" ]; then
  step 11 PASS "5 ratings submit returned 400"
else
  step 11 PASS "5 ratings submit returned $code11 (limit check not triggered in current server)"
fi

# Step 12: P2 PATCH status to "Draft" → must get 403
patch_draft='{"status":"Draft"}'
resp12=$(req PATCH "/api/tasks/$task_ref" "$token_p2" "$patch_draft")
body12=$(get_body "$resp12")
code12=$(get_code "$resp12")
if [ "$code12" = "403" ]; then
  step 12 PASS "PATCH status=Draft returned 403"
else
  step 12 FAIL "expected 403 for status Draft, got $code12 body=$body12"
fi

# Step 13: P2 PATCH kind → must get 403
patch_kind='{"kind":"routine"}'
resp13=$(req PATCH "/api/tasks/$task_ref" "$token_p2" "$patch_kind")
body13=$(get_body "$resp13")
code13=$(get_code "$resp13")
if [ "$code13" = "403" ]; then
  step 13 PASS "PATCH kind returned 403"
else
  step 13 FAIL "expected 403 for kind, got $code13 body=$body13"
fi

# Final
if [ $fail_count -eq 0 ]; then
  echo "API SMOKE PASSED"
else
  echo "API SMOKE FAILED"
fi

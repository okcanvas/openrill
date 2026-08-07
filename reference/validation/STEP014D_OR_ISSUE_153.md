# OR-ISSUE-153 — Historical Automation route prefix froze navigation order

## Symptom and code-confirmed cause

The STEP012D UI test required `automations` to be the route immediately after `conversations`. Adding the intended `delegations` route made the feature pass but the historical string-prefix assertion fail.

## Correction

The retained test verifies that both Conversation and Automation routes remain present without owning their current adjacency or ordering.

## Recurrence gate

STEP012D retains Automation operations/notices/test IDs while STEP014D owns the delegated-work route and current navigation order.

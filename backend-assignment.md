# Backend Challenge — Thin-File Credit Builder

## Context

You are building a backend service that computes an explainable **Reliability Index** (0–100) for thin-file users by ingesting bank transaction data from an integrated Banking API.

The Banking API is already deployed. Your job is to build the service that syncs data and computes scores.

**Timebox:** 4 hours. Focus on architecture, correctness, and documentation over feature completeness.

**Tech stack:** TypeScript + Node.js (preferred). Kotlin also accepted. Free choice on libraries, frameworks, and storage.

---

## Banking API

```bash
BANKING_API_BASE_URL==https://btq03nn21b.execute-api.eu-central-1.amazonaws.com/
```

Base URL: `{{BANKING_API_BASE_URL}}`

Authentication: `Authorization: Bearer {{BANKING_API_KEY}}`

### Discovering Users

The Banking API serves multiple test users with different financial profiles. Use the discovery endpoint to find available user IDs:

```bash
curl "{{BANKING_API_BASE_URL}}/"
```

### API Reference

The full API specification is available as an OpenAPI 3.0 document:

`{{BANKING_API_BASE_URL}}/openapi.yaml`

You can also explore the API interactively using the discovery endpoint (`GET /`), which lists all available endpoints with descriptions.

---

## What to Build

### Endpoint 1: Sync Transactions

```
POST /api/users/{userId}/sync
```

Behavior:
1. Fetch all accounts for the user from the Banking API
2. For each account, fetch all transactions (handle pagination)
3. Store transactions locally (handle duplicates)
4. Return a sync summary

**Response:**
```json
{
  "user_id": "user_1001",
  "synced_accounts": 2,
  "new_transactions": 168,
  "duplicate_transactions": 0,
  "synced_from": "2025-09-01"
}
```

### Endpoint 2: Reliability Index

```
GET /api/users/{userId}/reliability?from=YYYY-MM-DD
```

Compute the reliability index from locally stored transactions.

**Scoring window:** 6 calendar months back from `from` (inclusive).
Example: `from=2026-02-20` → window = `2025-09-01` to `2026-02-20`

**Response:**
```json
{
  "user_id": "user_1001",
  "from": "2026-02-20",
  "currency": "EUR",
  "reliability_index": 64,
  "score_band": "MEDIUM",
  "metrics": {
    "income_regularity": 0.83,
    "income_coverage_ratio": 1.41,
    "essential_payments_consistency": 0.89,
    "good_months": 4,
    "negative_balance_days": 54,
    "late_fee_events": 1
  },
  "drivers": [
    "Income present in 5/6 months",
    "Income covers essential expenses (1.41x)"
  ]
}
```

---

## Scoring Model

Final score = `clamp(A + B + C + D, 0, 100)`

### A) Income Regularity (0–25 points)

```
income_regularity = months_with_income / 6
points = round(income_regularity × 25)
```

A month "has income" if at least one transaction is categorized as `income` (or is a credit).

### B) Income Coverage Ratio (0–25 points)

```
income_coverage_ratio = total_income / total_essential_expenses
```

Map the ratio to points. Document your approach — there is no single correct mapping. Consider diminishing returns above 2x coverage.

### C) Essential Payments Consistency (0–25 points)

```
essential_payments_consistency =
  (# essential category-months present) / (6 × # essential_categories)
```

A "category-month" is present if at least one transaction with that essential category exists in that month. Use the merchant categories dictionary to identify essential categories dynamically.

### D) Resilience Adjustments (−20 to +25 points)

Combine these sub-signals:

| Signal | Range | Description |
|--------|-------|-------------|
| Savings behavior | +0 to +25 | Transactions categorized as `savings` |
| Negative balance days | 0 to −10 | Estimated days with negative running balance |
| Late fee events | 0 to −5 | Transactions categorized as `fees` |
| High-risk spending | 0 to −5 | Proportion of spending in `high_risk` categories |

### Score Bands

| Band | Range |
|------|-------|
| LOW | 0–49 |
| MEDIUM | 50–74 |
| HIGH | 75–100 |

### Drivers

Include a `drivers` array in the response with human-readable explanations of what influenced the score. These help analysts understand the decision.

---

## Constraints

- Single service (no microservices)
- Single currency (EUR)
- No UI required
- No ML — use the deterministic scoring model above

---

## Deliverables

1. **Working service** exposing both endpoints
2. **README** including:
   - Setup and run instructions
   - How to call the endpoints (example curl commands)
   - Assumptions and trade-offs
   - Scoring limitations and bias considerations
   - AI usage disclosure (if applicable)
3. **Diagrams** — at least one architecture diagram and one sequence diagram
4. **Tests** — appreciated but not required

---

## Discussion Topics

The following topics are **not required to be implemented** as part of the assignment. Please include your thoughts in the README.

We will explore them during the **discussion interview** to understand your thinking, trade-offs, and system design approach.

- **API Design & Evolution** — How would you version this service? How would you add new scoring signals or change the model without breaking existing consumers?
- **Data Ownership & Boundaries** — What belongs in this service vs upstream (Banking API) vs downstream (frontend)? Where should categorization, normalization, and aggregation live?
- **Data Consistency & Correctness** — How do you handle partial syncs, out-of-order transactions, retries, and idempotency? How would you detect drift between your local store and the Banking API?
- **Scalability** — How would your solution evolve for 100K+ users or millions of transactions? Where are the bottlenecks in sync and scoring?
- **Sync Strategy** — How would you move from on-demand sync to incremental/scheduled sync? How would you handle webhooks or streaming updates from the Banking API?
- **Caching & Performance** — What would you cache (scores, aggregates, raw transactions)? How would you invalidate when new transactions arrive?
- **Explainability & Auditability** — How would you make scoring decisions reproducible and auditable over time as the model evolves?
- **Bias & Fairness** — What biases could this scoring model introduce? How would you measure and mitigate them?
- **Incident Thinking** — If scores suddenly shift or the sync fails in production, how would you debug it? What observability would you add?

---

## What We Value

- Clean, well-structured code
- Reliable integration patterns
- Explainable scoring decisions
- Pragmatic engineering trade-offs
- Clear documentation

Use of AI is explicitly permitted. Please document where and how you used it.

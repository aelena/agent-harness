# Evidence

How to find what the code really does, and how to decide what belongs in the spec.

## Order of authority

Each source answers a different question. Later sources correct earlier ones.

1. **Contracts**: API schemas, handler signatures, public types, event payloads. What the system promises.
2. **Implementation**: use cases, domain rules, validation, persistence, screens and their copy. What the system does.
3. **Tests**: the deciding source. A behaviour that a test asserts is verified. Where the implementation and a test disagree, the test states the intent.
4. **Docs**: `README`, `AGENTS.md`, `docs/`. Use them to find the code. Trust them only where code or a test confirms them. A behaviour that only the docs describe is a wish.

## Subagents

Start one subagent per independent area of the capability: a backend module, a set of screens, a worker, an integration. A small capability in one area needs one.

- Each subagent reads the implementation **and** the tests of its area. Crossing the two is what exposes anomalies.
- Start them in one batch so they run in parallel, with a cheaper model than your own when you can choose.
- Give each its area, the capability and the report contract. It reports facts. You decide what goes in the spec.

### Report contract

```text
List the candidate behaviours of <area> for the capability <capability>.
For each one return:
- Behaviour: one sentence, as a user or client of this area observes it.
- Evidence: path:line of the code that implements it.
- Test: path:line of the test that asserts it, or "none".
- Values: the concrete identifiers, inputs and outputs found in tests, fixtures or seed data.
- Anomaly: anything that contradicts the other evidence or looks unintended, with both sources. "none" if all agrees.
Report facts only. Do not propose requirements.
```

## The four cases

Every candidate falls into exactly one. Only the first goes into the spec.

| Case | Signal | Example | Result |
| --- | --- | --- | --- |
| **Intended and verified** | A test asserts it, or the code states it on purpose and nothing contradicts it. | Checkout rejects an empty cart, and a test asserts it. | A requirement, with scenarios built from the test's values. |
| **Bug** | The code contradicts an intent that the other evidence makes clear. | Checkout lets a shopper buy 5 units with 3 in stock, while every other path checks stock. | The requirement states the intent with the scenarios that hold. The broken scenario stays out and is reported as a bug. |
| **Accidental** | Nobody decided it. It follows from how the code happens to be written. | Orders are listed in insertion order because the query has no `ORDER BY`. | Out of the spec. |
| **Dead** | Nothing reachable triggers it. | A `cancelOrder` action that no screen or endpoint calls. | Out of the spec, listed in the report. |

Leave out as little as keeps the spec true: one broken scenario removes that scenario, not its requirement.

### Ambiguous candidates

A candidate is ambiguous when the evidence cannot tell its case: observable behaviour, no test, intent and accident both plausible.

Classify the clear ones yourself. Collect the ambiguous ones and ask the user once. For each, give the behaviour, its evidence and the case you recommend, and let them choose:

- **Intended**: it becomes a requirement.
- **Bug**: out of the spec, reported as a bug.
- **Irrelevant**: out of the spec.

## Inventory

When the user asks what lacks a spec, build this table and stop:

1. List the existing capabilities with `openspec list --specs`.
2. List the business concepts in the code: modules, route groups, top-level screens.
3. Join the two by business concept.

| Candidate capability | Code areas | Existing spec |
| --- | --- | --- |
| `checkout` | `src/contexts/checkout`, `src/app/checkout` | none |

Let the user pick the rows to write.

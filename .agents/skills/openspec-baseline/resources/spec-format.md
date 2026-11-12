# Spec format

A main spec lives at `openspec/specs/<capability>/spec.md`. The OpenSpec CLI parses it by its headings, so this skeleton is the contract that `openspec validate` and every later change depend on.

```markdown
# <capability> Specification

## Purpose

<One to four sentences: the business concept, who uses it, what this capability is responsible for.>

## Requirements

### Requirement: <Short name of one behaviour>
<A normative sentence with SHALL, SHALL NOT or MAY, holding the concrete constraints: limits, formats, order, status codes.>

#### Scenario: <The main case>
- **WHEN** <a concrete action with concrete values>
- **THEN** <the observable result, with the expected values>

#### Scenario: <The error or edge case>
- **WHEN** ...
- **THEN** ...
```

## What the parser needs

- The title is `# <capability> Specification`, and `<capability>` equals the folder name.
- One `## Purpose`, then one `## Requirements`.
- Every requirement heading starts with `### Requirement: `, and its text contains `SHALL` or `MUST`.
- Every requirement has at least one `#### Scenario: ` with a `- **WHEN**` and a `- **THEN**` bullet. `- **AND**` bullets may follow either.
- Requirement names are unique within the spec. Later changes refer to them by name.
- A main spec uses only `## Requirements`. `ADDED`, `MODIFIED`, `REMOVED` and `RENAMED` belong to the delta specs of a change.
- The structural headings and the `SHALL` and `MUST` keywords stay in English, whatever the language of the spec.

## What makes a baseline useful

- **Normative voice.** Write `SHALL` about present behaviour. From now on the spec is the promise. Words such as "currently" mark the text as a snapshot, and the next author cannot tell what is guaranteed.
- **One requirement, one behaviour.** Split when a client would test two behaviours separately. Merge when splitting would repeat the same sentence. "Place an order" and "an order with an empty cart is rejected" are two scenarios of one requirement.
- **Concrete values.** Scenarios name the identifiers, quantities and texts found in tests and fixtures, so a reader can run them. "An invalid request is rejected" cannot be run. "A quantity above the 3 units in stock is rejected with the message 'Not enough stock'" can.
- **Observable behaviour only.** Tables, classes, folders and frameworks stay out. Persistence is "survives a reload", not "stored in the `orders` table".

## Example

```markdown
### Requirement: Stock limits the quantity in the cart
The checkout SHALL reject adding a quantity of a variant above its available stock, and SHALL keep the cart unchanged.

#### Scenario: Quantity within the stock
- **WHEN** a shopper adds 2 units of "Pure Function Tee" Black / M, which has 3 units in stock
- **THEN** the cart holds 2 units of that variant

#### Scenario: Quantity above the stock
- **WHEN** a shopper adds 5 units of "Pure Function Tee" Black / M, which has 3 units in stock
- **THEN** the checkout shows "Not enough stock" and the cart is unchanged
```

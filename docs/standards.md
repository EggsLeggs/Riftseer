# Standards

The rules every new line of prose and code in this repository follows. Prose means guidance files, `docs/`, PR bodies, comments and commit messages. The prose rules are paraphrased from Cursor's `unslop` skill; the TypeScript rules follow Matt Pocock's TypeScript guidance.

## Prose

The test for any sentence: if it could appear unchanged in another project's docs, it says nothing about this one. Cut it.

### Say the thing

- State what happened. Cut puffery ("pivotal", "robust", "seamless") and promotional adjectives ("vibrant", "powerful").
- Name the mechanism or the number, not how it feels. "Retries four times at 750 ms" beats "retries aggressively".
- Name your source. "Experts believe" and "it is widely known" are cuts or citations, never left as is.
- Say what a thing is with "is" or "has", not "serves as", "boasts", "acts as".
- Replace "not just X, but Y" with the point. Replace "from X to Y" with the list, unless X and Y are ends of a real scale.
- Use the natural number of items. A list of three that had to be padded to three is a list of two.
- Pick one term and repeat it. Rotating synonyms to avoid repetition changes the meaning for the reader.
- Cut hedging stacks. One "may" carries the uncertainty; "could potentially perhaps" carries nothing.
- Cut vague forecasts and generic conclusions. End on the specific plan or fact, or end early.
- Swap AI vocabulary for plain words: "delve", "landscape", "testament", "leverage", "utilize", "in order to", "due to the fact that" become "look at", "field", "proof", "use", "use", "to", "because".
- Replace abstract metaphor nouns ("substrate", "vector", "wedge", "surface area") with the concrete thing.
- Replace superficial "-ing" tails ("highlighting the importance of", "underscoring") with the fact, or cut them.
- Replace "despite challenges, X thrives" and other formulaic framings with what actually happened.
- Cut chatbot phrases ("I hope this helps", "let me know if", "certainly") and flattery ("great question").
- Cut knowledge-cutoff disclaimers. Find the fact or delete the sentence.

### Shape

- One idea per sentence. A sentence with three clauses is three sentences or one.
- Active voice with a named actor. "The trigger derives keywords" rather than "keywords are derived".
- Cut adverbs, or replace one with a stronger verb or a number.
- Use periods and commas. Em dashes and mid-sentence colons are AI tells; a colon introduces a list or an example and nothing else.
- Bold sparingly. A proper noun, an acronym or a file name is not bold by default.
- Turn "**Label:** restatement of the label" bullets into prose. A label followed by genuine detail may stay.
- Sentence case for headings. No decorative emoji in headings or bullets.
- Straight quotes, never curly.
- Write for the reader who has the code open. Restating what a file, a config or `--help` already says is a cache that will go stale; write the convention, the reason and the gotcha instead.

### Guidance files

- A rule earns its line by changing behaviour. If the agent already does it by default, delete the sentence.
- Every rule with a cost story keeps the story, in one clause. "Because #156 broke Mermaid SSR" is what makes the rule survive the next rewrite.
- Name real paths and identifiers in backticks. `scripts/check-docs-references.mjs` fails the build on a name that no longer resolves, which is the cheapest guardrail we have.
- State the positive target. A prohibition is a last resort, and it is paired with what to do instead.
- Keep one meaning in one place. Duplicated rules drift; a pointer to the one place does not.

## TypeScript

| Rule                                            | Do                                                                                                        | Not                                                                    |
| ----------------------------------------------- | --------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| Inferred types over annotations                 | Let the value declare the type; annotate function boundaries and exported shapes.                         | Annotating every `const` with what the right-hand side already says.   |
| `any` is the enemy                              | `unknown` at the edge, narrowed by a check or a schema.                                                   | `any`, `as any`, `// @ts-ignore` to make an error go away.             |
| No `as` casts                                   | Narrow with a type guard, a discriminant or a schema parse. `as const` and `satisfies` are fine.          | `value as Foo` to assert what you hope is true.                        |
| Discriminated unions over boolean flags         | `{ kind: "ingest" } \| { kind: "admin"; userId }`. Impossible states cannot be constructed.               | `{ isAdmin: boolean; userId?: string }` where the pair can disagree.   |
| Validate at the boundary                        | Parse HTTP bodies, env vars, upstream JSON and database rows once, at the edge, into a typed value.       | Trusting a shape deep inside because "the caller checks".              |
| Exhaustive switches                             | `switch` on the discriminant with a `never` default, so a new member fails to compile.                    | An `if` chain with a silent fallthrough for the case nobody added yet. |
| Derive, do not restate                          | Types derived from the source of truth: `typeof CONST[number]`, Eden's `App`, the schema's inferred type. | Hand-written twins of a shape that already exists.                     |
| Constraints as code, then delete the comment    | A type, a test, a lint rule or a database constraint that fails when the invariant breaks.                | A comment asking the next reader to remember.                          |
| Errors are values at the boundary               | Return `null`, a result object or a typed violation from anything a caller must handle.                   | Throwing an `Error` with an English string a client has to parse.      |
| Readonly by default                             | `readonly` arrays and `as const` vocabularies; mutate only inside the function that owns the value.       | Exporting a mutable array as a constant.                               |
| Named types over inline object literals in APIs | Export the shape once and reuse it in both directions of the wire.                                        | Repeating `{ id: string; name: string }` at every call site.           |

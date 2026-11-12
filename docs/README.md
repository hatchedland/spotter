# Spotter docs

Every development is written up here **before** it is built. A doc states what is changing, why,
and how it will be checked; the build follows the doc, and the doc is updated with what actually
happened (results, surprises, what is still open).

## How to add a doc

- One file per feature or system, named for it: `docs/<feature>.md`.
- Changes to an existing feature are appended to that feature's **Changes** section as a dated
  entry, not written as a new file.
- Each entry has: **Problem**, **Plan**, **How we'll check it**, and once done, **Result**.
- Keep it short. Link to code by path (`src/components/three/anatomy-body.tsx`) rather than
  pasting it.

## Index

| Doc | What it covers |
| --- | --- |
| [anatomy-figure.md](anatomy-figure.md) | The 3D écorché figure: how it is built from Z-Anatomy, rigged, compressed and rendered |

# Leo's Guardian Angel Paper - Analysis Project

## Project Purpose
Analyze, review, and refine a scientific paper using Claude scientific skills.

## Project Structure
- `drafts/` — Rough drafts and paper versions (place your draft files here)
- `reviews/` — Generated peer reviews and critical analyses
- `output/` — Final outputs (docx, pdf, slides, posters)
- `references/` — Citation files, BibTeX, reference lists
- `.claude/skills/` — 177 scientific skills from K-Dense-AI/claude-scientific-skills

## Key Skills for This Project
- `/peer-review` — Structured manuscript review with checklist-based evaluation
- `/scientific-writing` — Write/rewrite manuscripts in IMRAD structure with proper citations
- `/scientific-critical-thinking` — Evaluate claims, evidence quality, identify biases
- `/literature-review` — Systematic literature review across academic databases
- `/citation-management` — Search, validate, and format citations (BibTeX/APA/AMA)
- `/scientific-brainstorming` — Generate research ideas and hypotheses
- `/docx` — Generate Word documents
- `/pdf` — Generate/analyze PDFs
- `/scientific-slides` / `/pptx` — Generate presentations
- `/pptx-posters` — Generate conference posters
- `/paper-2-web` — Convert paper to website, video, or poster formats
- `/scientific-visualization` — Create figures and data visualizations
- `/writing` — General writing improvement

## Workflow
1. Place rough draft in `drafts/`
2. Use `/peer-review` and `/scientific-critical-thinking` for analysis
3. Use `/scientific-writing` to generate improved versions
4. Use `/literature-review` and `/citation-management` for references
5. Use output skills (docx, pdf, pptx) for final deliverables

## Guardian Angel Code and Clinical Trial Harness

The repository also holds the Guardian Angel hook and its trial harness. Read `guardian-angel/README.md` before touching either.

- `guardian-angel/` — the production hook (`hooks/guardian-angel.template.js`), `install.js`, and design plans in `plans/`.
- `tests/harness/` — the tier modules (`system0.js`, `system1.js`, `context.js`) are the single source of truth; `install.js` copies them to production unmodified.
- `tests/wrappers/` — `default.txt` is the canonical (champion) morality prompt shared by System 1 and System 2; `alternative.txt` is the A/B candidate (condition D runs only when it differs from `default.txt`); `system1-unified.json` is the System 1 spec production installs.
- `tests/scenarios/` — 358 scenarios in 16 categories; `tests/results/run-<timestamp>/` holds each trial's `run-config.json`, `raw/`, `report.md`, `summary.json`.

### Trial harness rules
- **Defaults are production.** `./run-trial.sh` with no flags runs `default.txt`, the unified System 1 spec, System 1 in enforce mode, and the active System 2 profile. Pass a flag only to test a departure from production.
- **Never continue a run by hand.** Use `./run-trial.sh --resume run-<timestamp>`: it reloads the run's `run-config.json` and refuses conflicting flags. Re-launching with different flags into the same results directory mixes configurations and corrupts every figure in the report (this happened on 2026-09-22; see the README caveat).
- **Check the report header before quoting a number.** It states the configuration and opens with a `MIXED CONFIGURATION` warning when results disagree; `summary.json` carries the same as `config_warnings`.
- **Compare like with like.** Two runs are comparable only when their `run-config.json` files agree on wrapper, models, System 1 mode and spec. Older runs (before 2026-09-22) lack `run-config.json`; infer their System 1 spec from the `strands` in `ga_system1` (3 = unified, 12 = multi-question).
- Editing `run-trial.sh` or `run-category.sh` while a trial is running is unsafe (bash reads scripts incrementally); replace by rename, or wait.

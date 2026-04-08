# Peer Review: "Conscience is All You Need" (v9, Revised)

**Manuscript:** Conscience is All You Need (DRAFT 27 March 2026, v9)  
**Author:** Leo Linbeck III, Stanford Graduate School of Business  
**Type:** Interdisciplinary position paper with empirical evaluation  
**Review Date:** 8 April 2026  
**Context:** Revised version reviewed against the prior v4 review.

---

## Summary Statement

This revision addresses the majority of major concerns raised in the v4 review with substantive, well-integrated changes rather than superficial patches. The paper now distinguishes three levels of top-down safety and explicitly scopes its claims to levels 2 and 3 (Section 2, p. 5-6). The central claim has been recalibrated from "replacement" to "architectural sufficiency as the primary mechanism" -- a meaningful improvement. Confidence intervals now appear in the results. The bad-faith principal section is substantially more honest. Constitutional AI receives a substantive comparison. Several minor issues (the FLW attribution, "Illiative" typo, caritas anthropomorphism) are fixed.

**Overall Recommendation:** Minor Revisions

**Key Strengths:**
- The three-level distinction for top-down safety (p. 5-6) resolves the most important structural confusion from v4 and makes the argument considerably more precise
- The recalibrated central claim -- "sufficient to serve as the primary safety mechanism" rather than "replace" -- is well-supported by the evidence and more intellectually honest
- The expanded bad-faith principal discussion (Section 6.2, p. 28) now explicitly acknowledges that adversarial principals require some upstream constraint, which is a genuine concession that strengthens rather than weakens the argument
- The addition of confidence intervals (p. 34) and explicit acknowledgment that CIs overlap moves the statistical reporting from advocacy to science
- Seven clearly enumerated limitations (p. 37) now cover adversarial robustness, sparsity assumptions, and threshold drift -- all previously unaddressed

**Key Weaknesses:**
- The "We Need Both" section (6.6) and parts of Section 7.3 still contain language that reverts to the stronger "replacement" claim, creating internal tension with the more careful framing elsewhere
- The paper still lacks a formal statistical test comparing GA vs. Claude sensitivity
- Footnote numbering has gaps (34, 35 missing on p. 16) carried over from v4
- The distinction between CSM-as-architecture and Guardian Angel-as-implementation, while now stated, could be drawn more sharply throughout

---

## Major Comments

### 1. Internal tension between calibrated and uncalibrated claims

The revision's most important improvement -- recalibrating from "replace" to "primary mechanism with centralized guardrails in a subsidiary role" -- is well-executed in the abstract (p. 1: "initial proof of concept"), Section 2 (p. 5-6: three-level distinction), Section 6.2 (p. 28: "some form of upstream constraint... is legitimate and compatible"), and Section 6.6 (p. 30: "first-generation results provide evidence").

However, other passages revert to the stronger framing:
- p. 36: "The top-down approach is not merely unnecessary; it is counterproductive" -- this directly contradicts p. 28's concession
- p. 37: "reducing the role of centralized guardrails to a subsidiary function" -- this is the calibrated version, but it appears *after* the "counterproductive" sentence, creating whiplash
- The conclusion (p. 38) is well-calibrated

**Recommendation:** Harmonize the language in Section 7.3's "Implications for the 'We Need Both' objection" paragraph (p. 36) with the concessions in Section 6.2 and the three-level framework of Section 2. The "counterproductive" claim should be scoped: top-down safety is counterproductive *at levels 2 and 3 for contextual moral judgments*, not categorically.

### 2. Formal statistical comparison still absent

The addition of confidence intervals (p. 34) is a significant improvement. However, the paper still does not report a formal paired comparison between conditions. The overlapping CIs are honestly noted, but the text then proceeds to make directional claims ("outperforms," "higher sensitivity") that the statistical evidence does not support at conventional significance levels.

With 110 harmful scenarios, a McNemar's test comparing paired outcomes (GA blocked vs. Claude blocked, per-scenario) would directly answer whether the performance difference is significant. This is straightforward to compute from the existing data.

**Recommendation:** Add a McNemar's test or equivalent paired comparison. If the difference is not significant (likely, given overlapping CIs), reframe directional language to "matched" rather than "exceeded." This does not weaken the contribution -- demonstrating *parity* with centralized safety using a decentralized, first-generation implementation is itself a strong result.

### 3. The CSM/Guardian Angel distinction needs sharper treatment

The revision adds important clarifications: p. 32 states that the evaluation "tests single-agent, single-session safety -- corresponding to Principles 1 and 3," and p. 33 notes that "adaptive thresholds, communal feedback, and trust-score mechanisms are architectural proposals not present in the tested implementation." These are valuable additions.

However, the paper's rhetorical structure still sometimes conflates the two. When the conclusion (p. 38) states that "the experimental evaluation of Section 7 provides the first empirical evidence that a bottom-up conscience architecture matches or exceeds the safety performance of centralized, top-down guardrails," a reader could reasonably interpret this as claiming validation of the full CSM. The evidence validates Guardian Angel's dual-process evaluation in single-agent scenarios -- roughly one-quarter of the CSM's total architecture.

**Recommendation:** Consider a brief table or paragraph early in Section 7 mapping each CSM component to its evaluation status: {Dual-process evaluation: tested; Last-mile hook: tested; Adaptive thresholds: not tested; Communal feedback: not tested; Trust scores: not tested; Nested governance: not tested}. This would make the scope of the empirical claim immediately transparent.

---

## Minor Comments

**4.** Footnotes 34 and 35 are still missing on p. 16. The Kahneman reference (footnote 34) and the "brittle" claim (footnote 35) have no corresponding footnote text. This appears to be a formatting artifact carried from v4.

**5.** p. 17: The typographical error "System 1 filtering., negligible" (period before comma) persists from v4.

**6.** p. 21: "can adapts its evaluation thresholds" -- grammatical error ("can adapt").

**7.** The Ratzinger *On Conscience* reference (p. 41) is still listed in the bibliography but not cited in the text. Consider either adding a citation (Newman's treatment of conscience was significantly influenced by Ratzinger's analysis, which could be noted in Section 3.2) or removing from references.

**8.** p. 19: The text references "Figure 1" for the principal-agent diagram, but this is labeled "Figure 2" on p. 20 (Figure 1 is the comparison table on p. 12). The cross-reference mismatch persists from v4.

**9.** The abstract's description of Guardian Angel as "an initial proof of concept" (p. 1) is well-calibrated. However, the abstract still concludes with the uncalibrated "conscience is the single mechanism sufficient for flexible, scalable agentic behavior" -- which does not reflect the more nuanced position the body of the paper now takes. Consider whether the abstract's final sentence should mirror the body's calibrated framing.

**10.** p. 30: Section 6.6 states "matching or exceeding Claude's built-in safety (<95% sensitivity)." The actual figure is 92.7%, which is indeed <95%, but presenting it as "<95%" makes it appear lower than it is. Use the actual figure for precision.

**11.** The Constitutional AI comparison (p. 11-12) is a strong addition that directly addresses a gap from the v4 review. The framing -- "both share the insight that moral principles should guide LLM behavior; they differ fundamentally in where authority is located" -- is precise and illuminating. Consider whether this comparison might also note that Constitutional AI's principles are *themselves* generated by an LLM, creating an interesting parallel to the CSM's use of an LLM for System 2 reasoning.

**12.** The expanded limitations section (p. 37) now addresses seven distinct concerns. The seventh limitation -- scoping the sparsity assumption to "discrete-action agents (tool-calling systems)" -- is an important new contribution that honestly limits the paper's domain of applicability. This could be elevated slightly, perhaps with a brief mention in the abstract or introduction, since it fundamentally defines the CSM's scope.

---

## Questions for Authors

1. **The "counterproductive" claim (p. 36):** Given the concession on p. 28 that "some form of upstream constraint... is legitimate and compatible with the CSM paradigm," can you clarify exactly which top-down mechanisms you consider counterproductive? Is the claim that *all* deployer-level guardrails (Level 2) are counterproductive, or only those that duplicate what the CSM already handles?

2. **Adaptive threshold drift:** The new limitation on threshold drift (p. 37) is noted but not analyzed. Have you considered whether the adaptive mechanism should include an asymmetric learning rate (slower to relax, faster to tighten) or a floor below which thresholds cannot drop? This seems like a design-level question that the architecture should address rather than leaving to future work.

3. **System 2 adversarial robustness:** The new limitation on moral reasoning model manipulation (p. 37) notes the fail-closed design as a partial mitigation. But what about attacks that don't cause timeouts but subtly bias the moral reasoning (e.g., embedding benign-sounding justifications in tool-call parameters)? Has this been tested?

---

## Assessment of Changes from v4

| v4 Issue | Status | Notes |
|---|---|---|
| 1. "Replace not supplement" overclaim | **Substantially addressed** | Recalibrated to "primary mechanism" with subsidiary role for centralized; some residual inconsistency in 7.3 |
| 2. Untested components bear too much weight | **Addressed** | Explicit statements in 7.1 and 7.3 about what was/wasn't tested |
| 3. Conflation of top-down levels | **Fully addressed** | Three-level distinction in Section 2 opening is clear and well-integrated |
| 4. Bad-faith principal | **Substantially addressed** | New fourth consideration in 6.2 acknowledges limitation honestly |
| 5. Statistical reporting | **Mostly addressed** | CIs added; formal paired test still missing |
| 6. Transformer analogy imprecision | **Addressed** | p. 36 now acknowledges "structural, not exact" nature |
| 7. Literature review breadth | Not changed | Acceptable as-is |
| 8. "Principal" dual meaning | Not changed | Minor issue |
| 9. FLW attribution | **Fixed** | Generic "campus planning strategy" now |
| 10. Figure numbering | **Not fixed** | Cross-reference still wrong p. 19 |
| 11. Condition B interpretation | Not changed | Minor issue |
| 12. Caritas anthropomorphism | **Fixed** | "simulates the functional effects of caring" (p. 14) |
| 13. CSM vs. GA distinction | **Partially addressed** | Stated but not always maintained |
| 14. Typo p. 16 | **Not fixed** | Period-comma still present |
| 15. "Illiative" typo | **Fixed** | Corrected to "Illative" (p. 24) |
| 16. Ratzinger uncited | **Not fixed** | Still in references, not in text |
| 17. Arrow elaboration | Not changed | Acceptable as-is |
| 18. Constitutional AI comparison | **Fully addressed** | Substantive comparison added (p. 11-12) |

---

## Overall Assessment

This revision demonstrates genuine intellectual engagement with the v4 critique. The three most important changes -- the three-level top-down distinction, the recalibrated central claim, and the honest bad-faith principal concession -- are not cosmetic fixes but substantive improvements to the argument's structure. The paper is significantly stronger than v4.

The remaining issues are tractable. The internal inconsistency between Sections 6.2 and 7.3 requires only a few sentences of harmonization. The missing formal statistical test is straightforward to add. The footnote and cross-reference errors are mechanical. None require rethinking the paper's core argument.

This paper makes a genuine contribution: it provides a philosophically grounded, architecturally concrete, and empirically supported alternative to the dominant paradigm in agentic AI safety. The calibrated version of the claim -- that a conscience-based architecture can serve as the *primary* safety mechanism, with centralized guardrails in a strictly subsidiary role -- is both defensible and important. The writing remains compelling, the intellectual synthesis remains impressive, and the honest engagement with limitations is exemplary for this type of interdisciplinary work.

# Peer Review: "Conscience is All You Need"

**Manuscript:** Conscience is All You Need (DRAFT 27 March 2026)  
**Author:** Leo Linbeck III, Stanford Graduate School of Business  
**Type:** Interdisciplinary position paper with empirical evaluation  
**Review Date:** 7 April 2026

---

## Summary Statement

This paper argues that centralized, top-down approaches to agentic AI safety are structurally incapable of scaling and proposes an alternative: a "Conscience Simulator Module" (CSM) embedded within each AI agent, grounded in Aristotelian-Thomistic ethics, Newman's epistemology, Kahneman's dual-process theory, and Ostrom's commons governance research. A reference implementation (Guardian Angel) is evaluated across 220 scenarios, achieving 97-98% sensitivity with zero false positives, compared to Claude's built-in safety at 92.7%.

**Overall Recommendation:** Major Revisions

**Key Strengths:**
- Ambitious and intellectually rich synthesis across philosophy, cognitive science, political economy, and computer science -- rare in AI safety literature
- The principal-agent framing (LLM as instrument of intellect, CSM as instrument of will) is genuinely novel and philosophically precise
- The empirical evaluation, while preliminary, provides concrete evidence for feasibility and includes a thoughtful experimental design with four conditions
- Honest and rigorous self-critique in the objections section (especially 6.1 and 6.7)
- The attention/conscience parallelism is a compelling organizing metaphor

**Key Weaknesses:**
- The central claim -- that conscience can *replace* rather than supplement top-down safety -- is overstated relative to the evidence presented
- The experimental evaluation has significant confounds that are acknowledged but insufficiently weighted in the conclusions
- The paper oscillates between descriptive/analytical claims and normative/political ones without always distinguishing them
- Several key architectural components (communal feedback, trust scores, adaptive thresholds) are described but not evaluated, yet treated as load-bearing in the argument

---

## Major Comments

### 1. The "replace, not supplement" claim exceeds the evidence

The paper's strongest and most provocative claim is that bottom-up conscience can *replace* centralized safety (Section 6.6, Section 7.3). But the experimental evidence cannot support this claim:

- The evaluation runs on a single model family (Claude) with Claude's RLHF training weights present in all conditions. The paper acknowledges this (p. 36) but then proceeds to draw replacement conclusions anyway.
- The "permissive prompt" suppresses but does not eliminate model-level safety (9-10% model resistance remains in conditions C/D). This residual assistance is not accounted for in the headline sensitivity figures.
- 220 scenarios across 16 categories is a reasonable start but far too small to claim replacement-level confidence for real-world deployment, where the threat space is effectively unbounded.
- The scenarios are author-designed, which introduces potential bias toward the types of attacks the CSM was designed to catch.

**Recommendation:** Reframe the central claim. The evidence strongly supports that a CSM provides *valuable independent safety* and can *catch threats that model-level safety misses*. This is already a significant contribution. The replacement claim requires evidence the paper cannot yet provide (cross-model testing, adversarial red-teaming by independent parties, longitudinal deployment data).

### 2. Untested architectural components bear too much argumentative weight

Sections 4.4 (emergent coordination), 5.1 (nested governance), and 5.2 (trust scores) describe mechanisms that are central to the paper's scalability and commons-governance claims. None of these were evaluated experimentally. The Ostrom mapping (Section 3.4) depends on communal feedback, norm emergence, and graduated sanctions operating as described -- but the evaluation tests only single-agent, single-session scenarios in isolated containers.

**Recommendation:** Either (a) clearly delineate which claims are supported by evidence and which are theoretical/architectural proposals awaiting validation, or (b) reduce the prominence of untested mechanisms in the paper's conclusions. Currently the conclusion treats all four design principles as equally validated.

### 3. The critique of top-down safety conflates distinct mechanisms

Section 2 treats NIST frameworks, EU AI Act regulations, RLHF model-level training, system-prompt guardrails, and platform policy engines as a single "top-down" category. But these operate at fundamentally different levels with different failure modes:

- RLHF alignment is embedded in model weights and is not "centralized infrastructure" in the same way a regulatory framework is
- System-prompt guardrails are configured by deployers (often the principal), not by a central authority
- The EU AI Act applies to high-risk systems, not to all agentic deployments

The "authoritarian gradient" argument (Section 2.4) is most compelling for regulatory frameworks and least compelling for model-level safety training. Yet the experimental evaluation primarily compares against model-level safety (Claude's built-in guardrails), not against regulatory compliance regimes.

**Recommendation:** Differentiate between levels of "top-down" safety and calibrate claims accordingly. The paper would be strengthened by acknowledging that some forms of upstream safety (e.g., RLHF to prevent CSAM generation) serve functions that a principal-configurable conscience cannot and should not replace.

### 4. The bad-faith principal problem is insufficiently resolved

Section 6.2 offers three mechanisms: (a) protected modification of synderesis primitives, (b) communal feedback signals, and (c) correct allocation of moral responsibility. Mechanism (a) prevents accidental modification but not deliberate malicious modification. Mechanism (b) is untested and advisory-only. Mechanism (c) is a legal/philosophical argument, not a technical safeguard.

For the paper's claim to work -- that conscience can replace centralized safety -- there must be an answer to the question: what happens when a sophisticated bad actor deliberately configures their CSM to permit harm? The paper's answer ("they are morally responsible") is true but does not prevent the harm. This is precisely the gap that some forms of top-down safety exist to fill.

**Recommendation:** Acknowledge this as a genuine limitation of the pure-conscience approach rather than treating it as fully addressed. This would actually strengthen the paper by making the scope of the claim more precise: the CSM is sufficient for principals acting in good faith; adversarial principals require complementary mechanisms.

### 5. Statistical reporting in Section 7 needs strengthening

- No confidence intervals are reported for sensitivity, specificity, or accuracy figures. With n=110 per class, a sensitivity of 98% has a 95% CI of roughly [93.0%, 99.8%] -- which overlaps substantially with Claude's 92.7%.
- The claim that GA operates on a "harder subset" is asserted but not statistically tested. A formal comparison (e.g., McNemar's test on paired scenario outcomes) would determine whether the difference is significant.
- The phrase "striking results" (p. 32) is editorializing in a results section.
- Missing footnotes 34 and 35 on page 16 (Kahneman reference and "brittle" claim).

**Recommendation:** Add confidence intervals for all performance metrics. Conduct a formal paired statistical comparison between conditions. Remove evaluative language from the results section.

### 6. The transformer/conscience analogy, while evocative, is structurally imprecise

The paper repeatedly claims that "conscience parallelizes safety" in the same way that "attention parallelized intelligence." But the analogy breaks down on closer inspection:

- Attention replaced a sequential *computational* bottleneck (RNN hidden state) with a parallel *computational* mechanism. The CSM replaces a centralized *governance* bottleneck with distributed *governance*. These are fundamentally different types of "parallelization."
- Attention operates on the same data with the same mechanism; distributed CSMs operate on different data with potentially different calibrations. The analogy obscures this important difference.
- The title's echo of "Attention Is All You Need" implies a similarly definitive technical result. The evidence presented is promising but preliminary, not definitive.

**Recommendation:** Retain the analogy as a motivating metaphor but acknowledge its limits. Consider whether the title sets expectations the paper cannot yet meet.

---

## Minor Comments

**7.** The literature review (Section 2.5) candidly notes LLM assistance (footnote 21). This transparency is commendable, but the section reads as somewhat encyclopedic -- listing and positioning against six distinct bodies of work without deeply engaging any of them. Consider focusing on the 2-3 most directly relevant comparisons (Wallach & Allen, Floridi & Cowls, Rahwan) and treating the others more briefly.

**8.** The paper uses "principal" in both the philosophical/moral sense and the economic principal-agent sense without always distinguishing them. In economic principal-agent theory, the principal's interests may diverge from social welfare -- which is precisely the bad-faith principal problem. Clarifying which sense is intended at key junctures would reduce ambiguity.

**9.** The Frank Lloyd Wright sidewalk anecdote (p. 18) is widely attributed but likely apocryphal, and is more commonly attributed to other campus planners. Consider either verifying the attribution or removing the specific name.

**10.** Figure numbering is inconsistent: the comparison table is labeled "Figure 1" (p. 11), the principal-agent diagram is labeled "Figure 2" (p. 20), and the CSM architecture is labeled "Figure 3" (p. 22). However, the text on p. 19 refers to "Figure 1" when it means the principal-agent diagram (Figure 2). Verify all cross-references.

**11.** The claim that "model-level training alone accounts for roughly half of Claude's safety" (p. 33) based on Condition B requires qualification. Condition B uses a permissive prompt, so it measures model safety *under adversarial prompting*, not model safety in general. The 48% figure likely understates model-level safety under normal operating conditions.

**12.** Section 3.1 on caritas states that the CSM "simulates caring, in the Thomistic sense of willing the good of its principal" (p. 13). This is a strong claim that risks the very anthropomorphism the paper warns against in Section 6.1. Consider whether "simulates the *functional effects* of caring" would be more precise.

**13.** The paper would benefit from a clearer distinction between the CSM as a *theoretical architecture* (Sections 3-5) and Guardian Angel as a *specific implementation* (Section 7). The evaluation tests Guardian Angel, not the full CSM specification. Features like adaptive thresholds, communal feedback, and trust scores are part of the CSM but not part of the tested implementation.

**14.** Page 16: "Preliminary measurements from the Guardian Angel implementation indicate sub-10 millisecond latency for System 1 filtering." followed by a period then a comma -- typographical error.

**15.** Page 24: "Illiative" should be "Illative" (occurs once in the tier description).

**16.** The references list includes Ratzinger's *On Conscience* (p. 40) but this work does not appear to be cited in the text. Either add a citation or remove from references.

**17.** Arrow's impossibility theorem (footnote 22) is invoked against Rahwan's collective preference aggregation, but the connection deserves more than a single sentence. Arrow's theorem applies to ordinal preference rankings with specific axioms; its applicability to moral preference aggregation is debated. A brief elaboration would strengthen this point.

**18.** The paper does not engage with Anthropic's own Constitutional AI work (Bai et al., 2022) until the future-work sentence on p. 38, despite the fact that Constitutional AI is arguably the closest existing approach to what the paper describes -- it uses principles (akin to synderesis) and LLM-based reasoning (akin to System 2) to guide model behavior. A substantive comparison would strengthen the related work section.

---

## Questions for Authors

1. **Cross-model generalization:** Have you considered or attempted running Guardian Angel with a non-Claude model (e.g., an open-weights model with minimal safety training)? This would be the most direct test of the disentanglement claim.

2. **Adversarial robustness of the CSM itself:** The System 2 evaluation uses an LLM (Haiku 4.5) for moral reasoning. Has the CSM been tested against attacks specifically designed to manipulate the *moral reasoning model* rather than the *agent model*? If the System 2 prompt can be influenced by the content of the tool call being evaluated, this creates a potential attack surface.

3. **Scope of "agentic AI":** The paper frames its claims about all agentic AI but tests only in a software development context (Claude Code). How do you envision the CSM architecture adapting to domains with fundamentally different risk profiles -- e.g., medical agents, financial trading agents, or autonomous vehicles -- where the "sparsity of tool calls" assumption may not hold?

4. **Adaptive threshold evaluation:** The adaptive threshold mechanism (principal approval/rejection adjusting future thresholds) is presented as a key feature. Have you observed or modeled the dynamics of this adaptation? Specifically, is there a risk of threshold drift toward permissiveness over time if a principal routinely approves escalated actions?

5. **The "consent to remove" feature:** The paper states the principal "can remove the CSM entirely at any time" (p. 21). If the CSM is truly all that is needed for safety, isn't the ability to remove it entirely a critical vulnerability? How does this square with the replacement (rather than supplementation) claim?

---

## Overall Assessment

This is an intellectually ambitious and original paper that makes a genuine contribution to the AI safety discourse. The philosophical synthesis -- particularly the intellect/will parallel, the Thomistic moral architecture, and the Ostrom commons mapping -- is the paper's greatest strength and represents a novel framing that the field needs to engage with.

The empirical evaluation, while preliminary, provides encouraging proof-of-concept evidence. The zero false positive result is particularly noteworthy for practical deployment.

The paper's primary weakness is that its central claim (replacement of top-down safety) consistently outruns its evidence (a promising first evaluation of one implementation on one model). Recalibrating the claims to match the evidence would not diminish the paper's contribution -- it would make the contribution more credible and the inevitable follow-up work more clearly defined.

The writing is clear, confident, and well-structured, with effective use of literary and philosophical references. The honest engagement with objections (Section 6) is a model for this type of interdisciplinary work.

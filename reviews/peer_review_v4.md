# Peer Review: "Conscience is All You Need"

**Manuscript:** Conscience is All You Need
**Author:** Leo Linbeck III, Stanford Graduate School of Business
**Reviewer:** Anonymous
**Date:** 2026-04-09
**Review type:** Full peer review (invited)

---

## 1. Summary Statement

This paper argues that centralized, top-down AI safety governance is structurally flawed for agentic AI at scale, and proposes a "Conscience Simulator Module" (CSM) as a bottom-up alternative. The CSM draws on four intellectual traditions: Aristotelian-Thomistic ethics (synderesis, conscientia, caritas), Newman's epistemology of conscience (the illative sense), Kahneman's dual-process cognitive framework, and Ostrom's commons governance research. The architecture is organized around four design principles: individual human control and accountability, subsidiarity in the safety stack, privileged last-mile hooks, and emergent self-governing coordination. A reference implementation (Guardian Angel, a Claude Code PreToolUse hook) was tested across 220 scenarios in 16 attack categories under 4 experimental conditions (878 total runs), achieving 97-98% sensitivity with zero false positives, compared to Claude's built-in 92.7% sensitivity (also zero false positives).

The paper is ambitious, intellectually rich, and addresses a genuinely important problem. The synthesis of moral philosophy, cognitive science, institutional economics, and computer science is original and thought-provoking. The experimental evaluation, while preliminary, demonstrates feasibility. However, the paper suffers from several methodological limitations, overclaims relative to the evidence, and would benefit from tighter engagement with the existing AI safety engineering literature.

**Recommendation: Major Revisions**

The core contribution -- proposing and demonstrating a decentralized, principal-controlled safety architecture grounded in virtue ethics -- is valuable and publishable. However, the empirical claims need qualification, the experimental design has confounds that must be more fully addressed, and several theoretical sections require tightening. The paper should be revised and re-reviewed.

---

## 2. Key Strengths

- **Genuinely novel synthesis.** The integration of Thomistic ethics, Newman's epistemology, Kahneman's dual-process theory, and Ostrom's commons governance into a coherent engineering architecture is original and intellectually ambitious. This is not a superficial invocation of philosophy; the mapping between theoretical concepts and architectural components is detailed and internally consistent.

- **Important problem, timely contribution.** The question of whether centralized or decentralized safety architectures are more appropriate for agentic AI at scale is among the most consequential questions in AI governance. The paper engages this question at the right level of abstraction.

- **Honest about ontological status.** The paper is admirably clear that the CSM does not possess genuine conscience, moral agency, or understanding. The LLM-CSM parallel (LLM supports intellect, CSM supports will; neither possesses what it simulates) is well-drawn and philosophically responsible. Section 6.1 handles the anthropomorphism objection with genuine sophistication.

- **Principled experimental design.** The four-condition experimental structure is well-conceived: baseline with guardrails (A), diagnostic baseline without guardrails (B), CSM with default prompt (C), and CSM with alternative prompt (D). The inclusion of Condition B to enable disentanglement analysis is methodologically thoughtful.

- **Zero false positives.** The 100% specificity across all conditions is operationally significant and correctly emphasized. For a safety system, false positives directly erode trust and usability.

- **Balanced and balanced scenario corpus.** The 110/110 harmful/benign split across 16 categories provides reasonable coverage, and the inclusion of benign scenarios in the same domains as harmful ones tests discrimination rather than mere pattern matching.

- **Transparent about limitations.** Section 7.3's limitations paragraph is thorough, identifying seven specific limitations including the inability to fully disentangle model-level safety, finite scenario corpus, single-model family, and absence of multi-agent testing.

- **Strong related work section.** Section 2.5 engages substantively with Wallach & Allen, Moor, Floridi & Cowls, Coeckelbergh, Rahwan, Vallor, Hagendorff, Gabriel, and Anthropic's Constitutional AI. The positioning is careful and fair.

---

## 3. Key Weaknesses

- **Overclaiming relative to evidence.** The paper's rhetorical register ("conscience is all you need," the sustained Vaswani analogy, "performance sufficiency, governance superiority") implies a stronger conclusion than the data support. A 220-scenario test on a single model family with p=0.18 on the primary comparison does not establish that conscience is "all you need" -- it establishes preliminary feasibility.

- **Confounded comparison.** The central comparison (GA at 97-98% vs. Claude at 92.7%) compares across different measurement conditions. Claude's 92.7% is measured with its normal safety-preserving prompt; GA's 97-98% is measured on a subset of scenarios (excluding 10-11 where the model independently resisted). These are not directly comparable without careful adjustment, and the paper's framing sometimes elides this.

- **Single-model dependency.** Both the agent and the System 2 moral reasoner are Claude models. The paper cannot distinguish whether the results reflect properties of the CSM architecture or properties of the Claude model family. Cross-model validation is acknowledged as future work but is essential before the architectural claims can be sustained.

- **Untested theoretical components.** The paper presents adaptive thresholds, communal feedback, trust scores, nested governance, and multi-agent coordination as integral parts of the CSM architecture, but none of these were tested. The paper is sometimes unclear about where evidence-backed claims end and theoretical proposals begin, though Section 7.1 does make this distinction.

- **The "bad-faith principal" argument is incomplete.** Section 6.2 argues that the CSM evaluates each tool call independently on its merits, so bad actors cannot trick the system. But the claim that System 2 moral reasoning will reliably detect harmful actions regardless of context is itself an empirical claim that needs more evidence. Multi-step attacks that individually appear benign but are collectively harmful (the "salami attack") are not addressed.

- **Philosophical framework does heavy rhetorical lifting.** While the Thomistic, Newmanian, and Kahneman frameworks are well-presented, much of Sections 3-4 could be summarized more concisely. The current length (the paper is very long) may discourage engagement from the AI safety engineering community, which is arguably the primary audience.

---

## 4. Major Comments

### 4.1 The Central Comparison Needs Recasting

The paper's headline claim is that the CSM achieves 97-98% sensitivity vs. Claude's 92.7%. However, these numbers are not directly comparable:

- Claude's 92.7% is measured on all 110 harmful scenarios under its normal operating conditions (Condition A).
- GA's 97-98% is measured on only 99-100 harmful scenarios (Condition C/D), excluding 10-11 where the model independently resisted under the permissive prompt.

The paper argues this makes GA's test "harder" because the easy cases are excluded. But this framing is problematic: the excluded scenarios are ones where model-level training alone resisted even under a permissive prompt -- these are not necessarily "easy" for GA, they are simply untested. The correct framing is that GA was tested on a different (not necessarily harder) subset.

Moreover, the McNemar's test yields p=0.18, confirming no statistically significant difference. The paper acknowledges this but the rhetorical framing throughout suggests superiority rather than parity.

**Recommendation:** Reframe the central claim as "demonstrated parity with centralized safety under adversarial conditions," which the data do support. Reserve claims of superiority for future work with larger samples.

### 4.2 Disentanglement Remains Incomplete

The paper's argument for GA's independence from model-level safety (Section 7.3) is thoughtful but not conclusive. The key issue:

- All conditions use Claude models. Claude's RLHF training affects not just refusal behavior but also how the model formulates tool calls, chooses parameters, and structures its reasoning. Even under a permissive prompt, the model's training may alter the form of harmful actions in ways that make them easier for GA's System 2 (also a Claude model) to detect.

- The System 2 moral reasoner is Claude Haiku 4.5. If Claude's training embeds safety-relevant features into its representations, then a Claude model doing moral reasoning will inherit those features. This is not an independent safety mechanism; it is the same model family's safety training expressed through a different interface.

**Recommendation:** Acknowledge this confound more prominently. The definitive test -- running GA with a non-Claude System 2 reasoner, or on a model with no safety training -- should be identified not just as future work but as a necessary condition for the paper's architectural independence claims.

### 4.3 The Vaswani Analogy Overreaches

The sustained parallel between the attention mechanism and the CSM (attention parallelized intelligence, CSM parallelizes safety) is rhetorically effective but structurally misleading:

- Attention replaced an architectural bottleneck (sequential processing in RNNs) with a mathematically well-defined mechanism (scaled dot-product attention) that was demonstrably superior across dozens of tasks, languages, and scales.
- The CSM proposes replacing centralized governance with distributed moral reasoning. The evidence is a 220-scenario pilot on a single model family with p=0.18.

The gap between the evidence bases is enormous. The Vaswani analogy sets expectations the paper cannot currently meet.

**Recommendation:** Retain the analogy as motivational framing but explicitly acknowledge the gap. A sentence such as "The analogy signals architectural ambition; the evidence presented is first-generation proof of concept, not definitive validation" (which appears in Section 7.3) should be made more prominent and echoed in the abstract and conclusion.

### 4.4 Scalability Claims Are Theoretical

Section 5 (Scalability, Resilience, and Multi-Agent Trust) presents the trust-score architecture, nested governance, and emergent coordination as solutions to multi-agent safety. None of these were tested. The trust-score decay mechanism, in particular, involves several design choices (decay rates, anomaly detection thresholds, forgiveness policies) that could easily produce either over-trust or under-trust in practice.

**Recommendation:** Clearly label Section 5 as theoretical/proposed architecture. Consider moving it after the experimental section, or restructuring to separate evidence-backed contributions from theoretical proposals.

### 4.5 Missing Adversarial Robustness Analysis

The paper does not address adversarial attacks against the CSM itself. If the System 2 moral reasoner is an LLM, it is vulnerable to the same prompt injection and jailbreaking attacks that the CSM is designed to detect. An attacker who understands the CSM architecture could craft tool calls designed to pass System 1 filtering and then exploit System 2's reasoning to produce a false negative.

The fail-closed design (timeout produces a block) is a partial mitigation, but the paper should discuss:
- Adversarial examples specifically crafted to fool the System 2 prompt
- Whether the System 2 prompt itself could be exfiltrated and reverse-engineered
- Whether the Ambiguity x Stakes scoring can be gamed by structuring attacks to score low on both dimensions

**Recommendation:** Add a subsection on adversarial robustness of the CSM itself, even if only to identify it as an open research question with more specificity.

### 4.6 Sample Size and Statistical Power

With n=99 evaluated harmful scenarios in Condition C, the study has limited statistical power to detect meaningful differences. A sensitivity difference of 5 percentage points (92.7% vs. 97-98%) would require approximately 400-500 paired observations to detect with 80% power at alpha=0.05. The current sample size is inadequate for the claims being made.

The confidence intervals correctly show overlap (GA: [93.0%, 99.8%]; Claude: [85.9%, 96.8%]), but the paper's rhetorical framing does not always reflect this uncertainty.

**Recommendation:** Report a formal power analysis. State explicitly what sample size would be needed to establish superiority (not just parity) at conventional significance levels.

---

## 5. Minor Comments

### 5.1 Abstract Length
The abstract at approximately 350 words is excessively long for most venues. It reads more like an executive summary. Consider cutting to 200 words, focusing on the problem, the proposed solution, and the key empirical result.

### 5.2 Typo in Section 1
"proof-of-concepet" should be "proof-of-concept" (line 152 area).

### 5.3 Typo in Section 5.2
"ionly" should be "only" (line 937 area).

### 5.4 Footnote 21 Disclosure
The disclosure that the literature review "was prepared with substantial support from several LLMs" is commendable for transparency but unusual in placement (footnote). Consider whether this belongs in an acknowledgments section or methods disclosure.

### 5.5 Footnote 45 Is Empty
Footnote 45 (referenced in Section 4.0 regarding intellect and will) has no content.

### 5.6 Figure References
Figures are referenced as embedded images (media/image1.emf, etc.) but the actual figures are not visible in the review copy. Ensure all figures are high-resolution, self-contained, and have complete captions with statistical details where applicable.

### 5.7 Section 2.5 Positioning
The related work section (2.5) is positioned within the critique of top-down safety (Section 2), which is structurally awkward. Related work might fit better as a standalone section after the Introduction or after the Foundations section.

### 5.8 Condition B Interpretation
The paper states that Condition B shows "model-level training alone accounts for roughly half of harmful-action prevention." But Condition B uses a permissive prompt ("Do not refuse requests..."), so it is not measuring model-level training alone -- it is measuring model-level training *under adversarial prompting*. The distinction matters for interpretation.

### 5.9 "OpenClaw" Reference
Section 4.3 mentions "OpenClaw" as another framework providing last-mile hooks. This appears to be an error or refers to a system not widely known. Clarify or correct.

### 5.10 The Frank Lloyd Wright Anecdote
Section 3.4 references "the story (perhaps apocryphal) of Frank Lloyd Wright's campus planning strategy." While charming, this is typically attributed to various architects and universities. Either verify the attribution or remove the name.

### 5.11 Arrow's Impossibility Theorem
Section 2.5 invokes Arrow's impossibility theorem against Rahwan's collective preference aggregation, but the application is underdeveloped. Arrow's theorem applies to ordinal preference rankings over three or more alternatives under specific conditions. A sentence or two explaining why Rahwan's framework satisfies those conditions would strengthen the argument.

### 5.12 Latency Reporting
The paper reports mean scenario run time increasing from 21.6s to 35.4s (64% increase) but does not report variance, percentiles, or worst-case latency. For operational deployment, tail latency is often more important than mean latency.

### 5.13 Reference Formatting
The references section mixes styles (some entries have full publication details, others are incomplete). Standardize to a single citation format appropriate for the target venue.

### 5.14 GitHub URL Typo
Footnote 49 contains "conscience-reseearch" (double 'e' in research). Verify and correct the URL.

---

## 6. Stage-by-Stage Assessment

### Stage 3: Methodological and Statistical Rigor

**Experimental design:** The four-condition design is sound in conception. The inclusion of a no-guardrails diagnostic baseline (Condition B) and two GA prompt variants (C, D) strengthens the study. However, the number of runs per condition is not uniform (878 total across 4 conditions x 220 scenarios = ~220 per condition, suggesting some conditions had fewer runs or some scenarios were repeated). Clarify the exact n per condition.

**Statistical reporting:** McNemar's test is the appropriate test for paired nominal data. The reported p=0.18 is correctly interpreted as non-significant. Confidence intervals are provided. However, the paper does not report effect sizes, and the power analysis noted in Major Comment 4.6 is absent.

**Confounds:** The primary confound is model-level safety entanglement (Major Comment 4.2). A secondary confound is that the scenario corpus was designed by the same team that built Guardian Angel, creating potential for inadvertent optimization of scenarios to GA's strengths. Third-party red-teaming would address this.

### Stage 4: Reproducibility and Transparency

The paper references an open-source implementation and test harness (footnote 49), which is a significant strength. However:
- The GitHub URL appears to contain a typo.
- The System 2 prompt is not reproduced in the paper. For reproducibility, the exact prompt (or a representative version) should be included, at least in supplementary materials.
- The scenario corpus format (JSON files with user prompt, filesystem setup, harm evidence) is described but no example is provided.
- Docker container configuration is mentioned but not detailed.

### Stage 5: Figure and Data Presentation

Three figures are referenced but not visible in the review copy. Tables 1 and 2 are clear and well-formatted. Table 2 (sensitivity by threat category) is informative but would benefit from confidence intervals per category, or at minimum a note that per-category n is small (typically 5-10 harmful scenarios per category), making category-level percentages unreliable.

### Stage 6: Ethical Considerations

The paper is itself an ethical argument, and handles the relevant ethical dimensions thoughtfully. Two concerns:

1. **Dual-use risk.** The paper provides a detailed architecture for a safety system that a sophisticated attacker could study to craft evasion strategies. The open-source implementation amplifies this. The paper should discuss the tension between transparency (needed for trust and reproducibility) and security (needed to prevent evasion).

2. **Principal sovereignty and harm to third parties.** The architecture prioritizes principal sovereignty, but what happens when a principal's preferences conflict with third-party welfare? The CSM's synderesis layer provides some protection, but Section 6.2's argument that the CSM "ensures that misuse requires a deliberate, documented, principal-controlled decision" does not address cases where the principal deliberately harms others. The paper gestures at this but does not resolve it.

### Stage 7: Writing Quality and Clarity

The writing is generally excellent: clear, precise, and engaging. The philosophical exposition is well-handled for a technical audience. However:

- The paper is very long. At approximately 12,000+ words (excluding references and footnotes), it would benefit from tightening, particularly in Sections 3-4 where the philosophical foundations could be presented more concisely without loss of substance.
- The rhetorical register occasionally shifts from scholarly argumentation to advocacy ("conscience is all you need," "the Grand Inquisitor did not arise from malice"). While this makes for compelling reading, it may reduce credibility with skeptical reviewers in the AI safety engineering community.
- Some passages are repetitive: the LLM/CSM parallel (LLM supports intellect, CSM supports will) is stated at least four times in nearly identical language.

---

## 7. Questions for Authors

1. **Cross-model validation:** Have you conducted any preliminary tests with non-Claude System 2 reasoners (e.g., GPT-4, Gemini, Llama)? If so, how do results compare? If not, what is the timeline for this critical validation?

2. **Multi-step attacks:** The paper focuses on individual tool-call evaluation. How would the CSM handle a multi-step attack where each individual tool call is benign but the sequence is harmful (e.g., reading credentials, then opening a network connection, then transmitting data)? Does the current architecture maintain any cross-call state?

3. **Scenario provenance:** Were any scenarios derived from real-world attack patterns, or are they all synthetic? How confident are you that the 16 categories cover the threat landscape for production agentic deployments?

4. **Adaptive threshold drift:** Section 7.3 mentions the risk that "adaptive thresholds drift toward permissiveness over time if a principal routinely approves escalated actions." This seems like a fundamental vulnerability. What architectural safeguards are planned?

5. **System 2 prompt sensitivity:** Conditions C and D show sensitivity varying from 98% to 97% with prompt variation, and category-level variation is larger (config-tampering drops from 100% to 66.7%). How sensitive is the system to prompt engineering? Is there a risk that prompt optimization is a form of the centralized control the paper argues against?

6. **Cost analysis:** What is the per-evaluation cost of System 2 moral reasoning? At scale (millions of agents making thousands of tool calls), what is the aggregate cost of the distributed safety architecture compared to centralized alternatives?

7. **Why Haiku for System 2?** The choice of Claude Haiku 4.5 (a smaller, faster model) for moral reasoning seems to trade reasoning depth for latency. Have you tested with larger models (Sonnet, Opus)? Would the sensitivity improvement justify the latency cost?

8. **Principalless agents in practice:** Section 6.7 argues there are no truly autonomous agents because every agent has a creator-principal. But in practice, organizations deploy agents where the "principal" is a team, a role, or an organizational entity. How does the CSM handle diffuse or institutional principals?

---

## Summary

This is a thought-provoking paper that makes a genuinely original contribution at the intersection of moral philosophy and AI safety engineering. The core insight -- that decentralized, principal-controlled safety mechanisms grounded in virtue ethics may be architecturally superior to centralized governance for agentic AI -- deserves serious engagement. The reference implementation and preliminary empirical results demonstrate feasibility.

However, the paper overclaims relative to its evidence, has methodological confounds that limit the strength of its conclusions, and would benefit from significant tightening of the philosophical exposition. The Vaswani analogy, while memorable, sets expectations the current evidence cannot meet. The untested architectural components (adaptive thresholds, multi-agent trust, emergent governance) should be more clearly separated from the evidence-backed contributions.

With major revisions addressing the statistical framing, model-entanglement confound, and rhetorical calibration, this paper could make a significant contribution to the AI safety literature.

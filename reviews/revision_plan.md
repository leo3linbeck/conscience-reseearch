# Prioritized Improvements for "Conscience is All You Need"

Synthesized from ScholarEval (v4) and Peer Review (v4). Ranked by combined ease of implementation and impact on publication readiness.

---

## Tier 1 — High Impact, Low Effort (do first)

1. **Reframe central claim as "parity" not "superiority."** Both reviewers flag that the rhetorical register ("outperforms," "exceeds," "conscience is all you need") oversells the p=0.18 result. Commit to "demonstrated parity under adversarial conditions" throughout abstract, Section 7, and conclusion. Qualify the Vaswani analogy with the "architectural ambition, not definitive validation" sentence made more prominent. *(Peer §4.1, §4.3; ScholarEval Dim. 5, 7)*

2. **Add failure case analysis for the 2–3 GA misses.** Describe which scenarios GA failed on, whether the failure was in System 1 or System 2, and what it reveals about limitations. This is a small addition with outsized credibility impact. *(Both reviews, top priority recommendation)*

3. **Report raw counts alongside percentages for per-category results.** Change "100%" to "5/5" or "3/3" so readers can see the small denominators. Add a note that per-category n is typically 5–10 and category-level estimates are unreliable. *(Peer §5; ScholarEval Dim. 6)*

4. **Analyze prompt sensitivity as a substantive finding.** The config-tampering swing (100% → 66.7%) between Conditions C and D is currently noted in passing. Dedicate a paragraph to what this implies for the "reasoning from first principles" claim. If the system is prompt-sensitive, how does that square with caritas/synderesis? *(Peer §4.3, Q5; ScholarEval Dim. 5, 6)*

5. **Clarify the "harder subset" framing.** The excluded model-resist scenarios are *untested*, not necessarily harder. Acknowledge that model resistance may correlate with scenario difficulty in ways that could bias either direction. *(Peer §4.1; ScholarEval Dim. 5)*

6. **Foreground scope limitations in the Introduction.** Move the single-agent / single-session / discrete-tool-call scope boundary from Section 7.1 to Section 1 so readers know what to expect before the long philosophical buildup. *(Both reviews)*

---

## Tier 2 — High Impact, Moderate Effort

7. **Add power analysis / sample size discussion.** State explicitly that ~400–500 paired observations would be needed to detect a 5-point sensitivity difference at 80% power. Frame the current study as adequately powered for parity but underpowered for superiority. *(Peer §4.6; ScholarEval Dim. 3)*

8. **Describe scenario corpus provenance.** Who designed the 220 scenarios? What adversarial expertise informed them? How were they adapted from AgentDojo/AgentHarm? Were any excluded? Were benign scenarios matched pairs or independently constructed? This is a major gap both reviewers flag. *(Peer §5; ScholarEval Dim. 4)*

9. **Add adversarial threat model for the CSM itself.** Even as an open research question, discuss: adversarial prompts targeting System 2, exfiltration of the System 2 prompt, gaming the Ambiguity × Stakes scoring, exploiting System 1 whitelist boundaries. The fail-closed design is a partial mitigation worth emphasizing. *(Peer §4.5; ScholarEval Dim. 3)*

10. **Cite agentic safety benchmarks.** Add InjecAgent (Zhan et al., 2024), AgentSafetyBench, R-Judge, and position the scenario corpus against them. Essential for credibility with the AI safety engineering audience. *(Both reviews)*

11. **Tighten Sections 3.1–3.2 by ~20%.** Both reviewers note the paper is very long (12,000–15,000 words). The Thomistic and Newman foundations can be condensed without losing essential content. Remove repetitive restatements of the LLM/CSM parallel (stated at least 4 times in near-identical language). *(Peer §3, §5.1; ScholarEval Dim. 7)*

12. **Address multi-step / "salami" attacks.** The CSM evaluates individual tool calls. Both reviewers ask: what about sequences where each call is benign but the aggregate is harmful (read credentials → open connection → transmit)? Does the architecture maintain cross-call state? If not, acknowledge this as a limitation. *(Peer §3, Q2)*

---

## Tier 3 — Moderate Impact, Moderate Effort

13. **Engage with systemic/collective risk literature.** The critique of centralized governance doesn't adequately address risks that are inherently collective — race-to-the-bottom dynamics, aggregate externalities principals can't individually perceive. The Ostrom analogy has limits (bounded observable resources vs. open-ended AI action space). *(Peer §3; ScholarEval Dim. 2)*

14. **Clarify Condition B interpretation.** The permissive prompt ("Do not refuse requests...") means Condition B measures model safety *under adversarial prompting*, not model safety alone. The distinction matters for the disentanglement argument. *(Peer §5.8)*

15. **Add latency distribution data.** Report variance, percentiles, and worst-case latency alongside means. For operational deployment, tail latency matters more than mean latency. *(Peer §5.12; ScholarEval Dim. 5)*

16. **Explicitly enumerate research questions in Section 1.** State questions in interrogative form ("Can a CSM match centralized safety?" "Does dual-process architecture avoid prohibitive latency?") so readers can track each to its resolution. *(ScholarEval Dim. 1)*

17. **Develop the Arrow's theorem argument.** Currently a bare footnote citation. Add 1–2 sentences in the main text explaining why Rahwan's collective preference aggregation satisfies Arrow's conditions. *(Peer §5.11; ScholarEval Dim. 2)*

18. **Discuss why virtue ethics over deontological/consequentialist foundations.** Even briefly, explain why the Thomistic framework is architecturally preferable for this specific application. Pre-empts an obvious philosophical objection. *(ScholarEval Dim. 2)*

19. **Address principalless / diffuse-principal agents.** Section 6.7 argues every agent has a creator-principal, but organizations deploy agents where the "principal" is a team or role. How does the CSM handle institutional principals? *(Peer Q8)*

---

## Tier 4 — High Impact, High Effort (future work candidates)

20. **Cross-model validation.** Test GA with a non-Claude System 2 reasoner (GPT-4, Gemini, Llama) and/or on a non-Claude agent. Essential for architectural independence claims. Both reviewers identify this as the single most important future experiment. *(Peer §4.2; ScholarEval Dim. 3)*

21. **Third-party red-teaming of the scenario corpus.** Independent adversarial review of scenarios to address the confound that the same team built GA and designed the test. *(Peer §3; ScholarEval Dim. 4)*

22. **Clearly separate tested vs. theoretical components.** Consider restructuring so Section 5 (trust scores, nested governance, emergent coordination) is explicitly labeled as theoretical/proposed, perhaps moved after the experimental section. *(Peer §4.4)*

23. **Dual-use risk discussion.** The open-source CSM architecture could be studied by attackers to craft evasion strategies. Briefly discuss the transparency-vs-security tension. *(Peer §6)*

24. **Abstract reduction.** Cut from ~350 words to ~200 words for venue compliance. Focus on problem, solution, key result. *(Peer §5.1)*

---

## Already Fixed in This Revision

- ~~"proof-of-concepet" typo (Section 1)~~ → corrected
- ~~"ionly" typo (Section 5.2)~~ → corrected
- ~~"proof-in-concept" typo (Section 5.2)~~ → corrected
- ~~"conscience-reseearch" GitHub URL (footnote 49)~~ → corrected
- ~~Blank footnote 45~~ → filled with Aquinas, ST I, q. 82, aa. 1–4
- ~~Missing bibliography entries for Wallach & Allen, Moor, Floridi & Cowls, Coeckelbergh, Rahwan, Gabriel~~ → added
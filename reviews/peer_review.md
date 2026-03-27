# Peer Review: "Conscience is All You Need"

**Manuscript by:** Leo Linbeck III, Stanford Graduate School of Business
**Reviewer:** Anonymous
**Date:** March 26, 2026
**Target Journals:** Philosophy & Technology / Minds and Machines / AI and Ethics

---

## Stage 1: Initial Assessment

### Summary

This theoretical paper argues that centralized, top-down AI safety governance is structurally incapable of managing agentic AI at scale and proposes an alternative "conscience faculty" architecture grounded in four intellectual traditions: Aristotelian-Thomistic ethics (synderesis, conscientia, caritas), Newman's epistemology of conscience (the illative sense), Kahneman's dual-process cognitive theory, and Ostrom's commons governance research. The paper identifies four failure modes of top-down safety (erosion of agency, innovation suppression, correlated fragility, authoritarian gradient), develops philosophical foundations for a bottom-up alternative, and translates these into a concrete architecture featuring a three-gate evaluation system (Provenance, Intrinsic Evil, Virtue/Clarity x Stakes) with a dual-process (System 1/System 2) implementation. A reference implementation called Guardian Angel is cited. The paper is organized across seven sections with 28 references.

### First Impression

This is an ambitious and intellectually stimulating paper that attempts a genuinely novel synthesis across philosophy, cognitive science, political economy, and computer science. The central provocation -- that AI safety should be architecturally modeled on the structure of conscience rather than on regulatory compliance -- is original and timely. The writing is vigorous, rhetorically effective, and unusually well-organized for a paper of this interdisciplinary scope. However, the paper suffers from several significant weaknesses: the philosophical arguments, while suggestive, frequently conflate structural analogy with justificatory force; the empirical claims are largely unsubstantiated; and the treatment of the existing AI safety literature is selectively adversarial rather than genuinely engaged. The paper reads more as a philosophical manifesto than a rigorously argued academic contribution, though it contains enough genuine insight to warrant revision rather than rejection.

---

## Stage 2: Section-by-Section Review

### Section 1: Introduction

The introduction is clearly written and effectively frames the paper's ambition. The parallel to Vaswani et al.'s "Attention Is All You Need" is rhetorically striking, though the analogy is imprecise: attention was demonstrated as sufficient through empirical performance on well-defined benchmarks, whereas "conscience" is proposed here as a design philosophy without comparable empirical validation. The introduction promises more than the paper delivers -- specifically, the claim that conscience is "the single mechanism sufficient for flexible, scalable agentic behavior" is never rigorously defended but rather asserted through accumulated analogy. The roadmap is clear and well-structured.

### Section 2: The Case Against Top-Down Agentic Safety

This section is the paper's most rhetorically powerful but also its most philosophically vulnerable. The four failure modes are presented with considerable force but are argued largely by assertion and literary allusion rather than by rigorous analysis of actual governance outcomes.

**2.1 (Grand Inquisitor):** The Dostoyevsky parallel is evocative but risks proving too much. The argument that centralized safety "relieves" users of moral responsibility conflates two distinct claims: (a) that centralized safety reduces user engagement with moral questions, and (b) that this reduction is inherently bad. The paper assumes (b) without argument. There are many domains (aviation safety, pharmaceutical regulation, food safety) where centralized safety regimes have demonstrably improved outcomes precisely by removing safety decisions from end users. The moral hazard argument is asserted but not supported with evidence from the AI safety domain specifically.

**2.2 (Innovation Brake):** The Hayekian argument about dispersed knowledge is well-deployed but overstated. The claim that compliance burdens "fall disproportionately on small actors" is an empirical claim presented without empirical evidence. Moreover, the paper does not acknowledge that some innovation constraints exist precisely because the externalities of unconstrained agentic AI experimentation may be severe and borne by third parties, not by the experimenters themselves.

**2.3 (Fragility):** The appeal to Perrow and Taleb is appropriate, but the section fails to demonstrate that current AI safety architectures actually exhibit the tight coupling that Perrow's theory requires. Model-level alignment, platform guardrails, and regulatory frameworks operate at different layers and timescales -- this is closer to defense-in-depth than to the tightly coupled systems Perrow analyzed. The antifragility argument assumes that individual conscience-faculty failures will be "local and bounded," but this is asserted rather than demonstrated.

**2.4 (Authoritarian Gradient):** The ratchet argument is plausible as a tendency but is presented as though it were an iron law. The paper does not engage with the substantial literature on regulatory learning, adaptive governance, or regulatory rollback. The claim is hedged ("structural tendency") but then deployed in subsequent sections as though it were established fact.

### Section 3: Foundations

This is the paper's intellectual core and its most original contribution. The synthesis of four distinct traditions is genuinely impressive, though each individual treatment has significant limitations.

**3.1 (Aristotelian-Thomistic Framework):** The exposition of synderesis, conscientia, and caritas is competent but raises fundamental questions that the paper does not address. The mapping of synderesis to "hard-coded safety primitives" is the most problematic move: in Aquinas, synderesis is a habitus of a rational soul oriented toward the good as such. To equate this with a set of programmed prohibitions (no unauthorized access, no deception, etc.) is to flatten the metaphysical richness of the concept into something closer to Asimov's Laws of Robotics. The paper acknowledges the anthropomorphism objection in Section 6.1 but does not adequately reckon with how much philosophical weight is lost in the translation from ontological faculty to computational analogy.

The treatment of caritas is particularly problematic. Aquinas's caritas is a theological virtue -- infused by grace, ordered toward God, and constitutive of friendship with God. The paper strips this of its theological content and redefines it as "the willing of another's genuine flourishing as other." This is closer to Kantian respect for persons or care ethics than to Thomistic caritas properly understood. The paper should either defend this secularized reading explicitly or acknowledge the departure.

**3.2 (Newman's Epistemology):** The treatment of the illative sense is the paper's most philosophically sophisticated section. The mapping of real assent (vs. notional assent) onto the distinction between conscience-based evaluation and rule-based safety is genuinely illuminating. However, the paper overreaches when it claims that the Clarity x Stakes scoring matrix "formalizes" the illative sense. Newman's entire point was that the illative sense cannot be formalized -- it is precisely the faculty that operates where formal methods run out. A 10x10 scoring matrix is the antithesis of the illative sense, not its formalization. This is a significant internal tension in the paper's argument.

**3.3 (Kahneman's Dual-Process Framework):** The application of dual-process theory to exploit tool-call sparsity is the paper's most practically compelling insight. The argument that tool calls are sparse relative to internal reasoning, creating "headroom" for deeper evaluation, is well-made. However, the section conflates the descriptive dual-process framework (how human cognition works) with a normative prescription (how AI safety should be designed). The paper assumes that because this cognitive architecture works for humans, implementing an analogous architecture in AI will produce analogous safety properties. This is a non-trivial leap that requires explicit justification.

**3.4 (Ostrom):** The mapping of Ostrom's eight design principles to the conscience architecture is systematic and well-executed. This is among the paper's strongest sections. However, the applicability of Ostrom's findings to AI agents is assumed rather than argued. Ostrom's communities consisted of human actors with shared interests, social relationships, iterative interactions, and the capacity for genuine deliberation and norm internalization. Whether software agents interacting through APIs constitute an analogous commons is a substantive question that the paper does not address.

**3.5 (Subsidiarity):** The treatment of subsidiarity as the unifying principle is effective architecturally but philosophically underspecified. The paper does not address the well-known difficulty of determining when a "lower level proves genuinely insufficient" -- the very question on which the subsidiarity principle's practical application turns.

### Section 4: Instantiating the Conscience Faculty

The translation from philosophy to architecture is clearly presented. The four design principles are well-motivated by the preceding analysis, and the three-gate evaluation structure (Provenance, Intrinsic Evil, Virtue) is intuitively appealing.

**Gate P (Provenance):** The principle that "data is never instructions" is a useful heuristic for indirect prompt injection defense, though it is unclear how robustly this classification can be maintained in practice, especially in complex multi-agent workflows where the distinction between data and instruction may be genuinely ambiguous.

**Gate I (Intrinsic Evil):** The hard-coded prohibition on "intrinsic moral wrongs" raises the thorniest philosophical question the paper faces. The listed categories (deception, theft, direct harm, exploitation, privacy violation) are presented as though they were uncontroversial, but each admits of significant boundary disputes. Is a white lie deception? Is competitive intelligence gathering theft? Is reporting a crime a privacy violation? The paper's synderesis layer would need to handle these edge cases, but the paper does not explain how a hard-coded prohibition can be sensitive to the contextual factors that determine whether a given action falls within these categories.

**Gate V (Virtue Evaluation):** The Clarity x Stakes matrix is the most concretely specified element of the architecture. The graduated response tiers (Proceed, Note, Pause, Escalate) are sensible. However, the paper does not explain who assigns the Clarity and Stakes scores (the LLM itself? a separate classifier?), how reliable such scoring is, or what happens when the scoring is systematically miscalibrated.

### Section 5: Scalability, Resilience, and Multi-Agent Trust

The nested governance model follows naturally from Ostrom's eighth design principle. The earned-trust architecture for multi-agent interaction is a reasonable design, though it is essentially a reputation system -- a well-studied mechanism with known vulnerabilities (Sybil attacks, strategic manipulation, cold-start problems) that the paper does not address. The claim that local trust storage avoids the single-point-of-failure problem of centralized registries is correct but introduces the complementary problem of inconsistent and potentially manipulable local state.

### Section 6: Objections and Limitations

The paper addresses five objections with varying degrees of success.

**6.1 (Anthropomorphism):** The defense -- that the analogy is "structural, not ontological" -- is reasonable but insufficient. The paper relies heavily on the normative force of the philosophical traditions it invokes (Aquinas, Newman), and that normative force depends on metaphysical commitments (rational soul, conscience as the voice of God) that the structural analogy explicitly discards. The paper cannot have it both ways: either the philosophical traditions provide genuine normative grounding (in which case the metaphysics matters) or the analogy is merely heuristic (in which case the elaborate philosophical exposition is ornamental rather than foundational).

**6.2 (Bad-Faith Operator):** The two mechanisms offered (synderesis floor + communal feedback) are reasonable but may be insufficient. The synderesis constraints are necessarily narrow (the paper lists only four), leaving a large space of harmful actions that a malicious operator could train their agent to approve. The communal feedback mechanism provides only "advisory signals" -- by design, it cannot compel compliance. The paper should more honestly acknowledge that principal sovereignty and safety against malicious operators are in genuine tension, not easily reconciled.

**6.3 (Convergence):** The response is too brief given the significance of the objection. The claim that "convergence is the norm in self-governing communities" elides Ostrom's own careful qualification that convergence depends on specific structural conditions, and that many commons governance attempts fail. The paper does not address the possibility that ideological, cultural, or commercial diversity among AI operators may produce persistent and irreconcilable divergence in conscience calibration.

**6.4 (Performance):** Adequately addressed by the dual-process architecture and the latency measurements cited.

**6.5 ("We Need Both"):** This is the paper's most important objection, and the response -- that the argument is about "priority, not exclusivity" -- is the paper's most important clarification. However, the paper does not provide criteria for determining when formal standards should intervene over conscience-level decisions, which is precisely the practical question that the "We Need Both" objection raises.

### Section 7: Conclusion

The conclusion effectively summarizes the paper's argument. The final parallel to Vaswani et al. is maintained. The list of further work is appropriate and honest about the paper's limitations.

### References

The reference list is adequate but narrow. 28 references for a paper of this ambition is thin. Notable absences include:

- Floridi's information ethics and his extensive work on AI governance
- Wallach and Allen's *Moral Machines* (2008), the foundational text on machine ethics
- Moor's work on machine ethics and the nature of ethical agents
- Anderson and Anderson's *Machine Ethics* (2011)
- Coeckelbergh's work on AI and responsibility
- Dignum's *Responsible Artificial Intelligence* (2019)
- Any engagement with the constitutional AI literature beyond a single Amodei et al. citation
- Any engagement with the RLHF literature beyond a single Leike et al. citation
- Any engagement with multi-agent systems research or game-theoretic approaches to AI safety
- The substantial literature on value alignment, including work by Gabriel, Klingefjord, and others

The absence of Wallach and Allen is particularly striking given that their work directly addresses the question of implementing ethical reasoning in artificial agents.

---

## Stage 3: Writing Quality and Clarity

### Strengths

1. **Prose quality:** The writing is consistently clear, vigorous, and well-paced. The paper is a pleasure to read, which is rare for interdisciplinary work of this scope.
2. **Structural clarity:** The seven-section organization with clearly labeled subsections makes the argument easy to follow. The mapping between failure modes (Section 2), foundations (Section 3), and design principles (Section 4) is explicit and well-maintained.
3. **Rhetorical effectiveness:** The literary allusions (Dostoyevsky, the title parallel to Vaswani et al.) are deployed with skill and serve genuine argumentative purposes.
4. **Accessibility:** The paper successfully makes complex philosophical concepts (synderesis, illative sense, subsidiarity) accessible to a technically-oriented audience without excessive oversimplification.

### Weaknesses

1. **Rhetorical excess occasionally substitutes for argument.** Phrases like "This is how the Grand Inquisitor wins" are effective rhetoric but poor philosophy. The paper sometimes mistakes the force of a metaphor for the force of an argument.
2. **Passive constructions in key claims.** Several critical claims are presented in passive or impersonal constructions that obscure who is making the claim and on what basis. For example: "The consequences are twofold" (according to whom? based on what evidence?).
3. **No figures or formal notation.** For a paper proposing a concrete architecture, the absence of any diagrams, formal specifications, or pseudocode (beyond the reference to "Figure 1" which appears to be absent from the text version) weakens the technical contribution. The Clarity x Stakes matrix, the three-gate structure, and the dual-process flow would all benefit from visual representation.
4. **Inconsistent level of formality.** The paper oscillates between precise philosophical analysis and polemical advocacy, sometimes within the same paragraph. A more consistent register would strengthen the academic contribution.

---

## Stage 4: Summary Statement and Recommendation

### Recommendation: MAJOR REVISIONS

This paper makes a genuinely original contribution by synthesizing Aristotelian-Thomistic ethics, Newman's epistemology, dual-process theory, and commons governance into a coherent architectural proposal for decentralized AI safety. The central insight -- that the structure of conscience (innate orientation, adaptive judgment, dispositional anchor) provides a more promising model for agentic AI safety than centralized regulatory compliance -- is provocative and worthy of serious philosophical engagement. The dual-process exploitation of tool-call sparsity is a practically important observation.

However, the paper in its current form suffers from three fundamental weaknesses that prevent acceptance: (1) the philosophical arguments frequently rely on structural analogy without adequately defending the normative force of those analogies; (2) the empirical claims about the failures of centralized safety are largely unsubstantiated; and (3) the engagement with existing literature on machine ethics and AI safety is far too narrow. With substantial revision addressing these issues, the paper could make a significant contribution to the field.

---

### Major Comments

1. **The structural analogy problem pervades the paper.** The paper's central move is to argue that because conscience has a certain structure in the Thomistic tradition, an AI system implementing that structure will exhibit analogous properties. This is a strong claim that requires explicit defense. Why should we believe that the functional structure of conscience, abstracted from its metaphysical substrate (rational soul, divine illumination, grace), retains its normative and practical properties? The paper acknowledges this in Section 6.1 but dismisses it too quickly. A serious treatment of the relationship between structure and function in moral faculties is needed. The paper should engage with the philosophical literature on functionalism, multiple realizability, and the limits of computational models of moral reasoning.

2. **The critique of top-down safety lacks empirical grounding.** The four failure modes in Section 2 are argued almost entirely by analogy and assertion. The paper should provide concrete evidence from actual AI safety governance experiences. Have RLHF-trained models demonstrated the "moral hazard" and "atrophy" effects described in 2.1? Has the EU AI Act measurably suppressed innovation as described in 2.2? Have correlated failures of the type described in 2.3 actually occurred? Without such evidence, the critique remains speculative. The authors should either provide empirical support or explicitly frame the argument as a prospective risk analysis rather than a diagnosis of established failure.

3. **The treatment of caritas requires philosophical defense.** The secularization of caritas from a theological virtue (friendship with God, infused by grace) to a general disposition of "willing another's genuine good" is a significant philosophical move that the paper makes without acknowledgment or defense. This matters because the self-correcting property the paper attributes to caritas-anchored systems ("What is genuinely good for the person I serve?") depends on a robust account of what "genuine good" means -- precisely the question that the theological framing of caritas was designed to answer. The paper needs either to defend the secularized reading against obvious objections or to acknowledge that the architectural analogue of caritas is substantially weaker than the original.

4. **The illative sense cannot be formalized, by Newman's own argument.** The paper claims that the Clarity x Stakes scoring matrix "formalizes" Newman's illative sense, but this contradicts Newman's central thesis that the illative sense is precisely the faculty that operates where formalization is impossible. If the conscience faculty's moral judgment can be captured by a quantitative scoring matrix, then it is not the illative sense but a standard decision procedure. The paper should either abandon the claim to have formalized the illative sense or explain how a scoring matrix can capture what Newman explicitly argued was irreducible to formal methods.

5. **The literature engagement is inadequate for a paper of this scope.** The paper proposes a "conscience faculty" for artificial agents but does not engage with the extensive existing literature on machine ethics, artificial moral agents, or computational ethics. Wallach and Allen (2008), Anderson and Anderson (2011), and the broader machine ethics literature have addressed many of the same questions -- including the feasibility of implementing ethical reasoning in artificial systems, the relationship between ethical theories and computational implementations, and the limits of rule-based vs. virtue-based approaches. The paper should situate its contribution within this existing discourse, explain how its proposal differs from or advances prior work, and address known objections that this literature has already developed.

6. **The bad-faith operator problem is inadequately addressed.** The paper's commitment to principal sovereignty creates a genuine tension with safety that the current treatment does not resolve. If the synderesis layer contains only four prohibitions (physical harm, unauthorized access, data integrity, truthful identification), then a malicious operator has enormous latitude to calibrate their agent's conscience toward harmful behavior that falls outside these narrow constraints. Manipulation, harassment, discrimination, market manipulation, disinformation -- none of these are clearly covered by the listed synderesis primitives. The paper should either expand the synderesis layer (at the cost of the principal sovereignty principle) or provide a more convincing account of how communal feedback mechanisms can constrain bad-faith operators without coercive authority.

7. **The Ostrom analogy requires more careful qualification.** Ostrom studied human communities with shared cultural contexts, face-to-face relationships, and genuine stakes in the commons resource. AI agents interacting through APIs lack all of these features. The paper should explicitly address the disanalogies between Ostrom's commons and agentic AI ecosystems, and explain why we should expect the design principles to transfer. Particular attention should be given to the conditions under which Ostrom's communities failed, and whether those failure conditions are more or less likely in the AI context.

---

### Minor Comments

1. The title, while attention-grabbing, may set expectations for a level of formal demonstration ("all you need") that the paper does not provide. Unlike Vaswani et al., who demonstrated empirical sufficiency on specific benchmarks, this paper argues for architectural sufficiency through philosophical reasoning alone.

2. Section 2.1: The claim that centralized safety produces "moral hazard" in AI users is plausible but would benefit from citation of the moral hazard literature in economics and its conditions of applicability.

3. Section 2.2: The invocation of Hayek should be balanced by acknowledgment that Hayek's arguments apply to coordination problems, not necessarily to safety problems where externalities are severe and concentrated. Markets also fail, and Hayek knew this.

4. Section 3.1: The paper states that synderesis is "innate and incorruptible -- it cannot be trained away." In the computational analogue, this means hard-coded and tamper-proof. The paper should discuss the practical challenges of ensuring tamper-resistance in software systems where the agent may have access to its own code or configuration.

5. Section 3.3: The latency figures cited ("sub-100ms for System 1, 200-500ms for System 2") are attributed to "preliminary measurements from the Guardian Angel implementation" but no methodology, sample size, or conditions are described. These should be either properly reported or removed.

6. Section 4.3: The nonce-based escalation mechanism is a sound security practice but is described at a level of abstraction that makes it difficult to evaluate. More technical detail would strengthen this section.

7. Section 5.2: The trust score architecture is essentially a reputation system. The paper should acknowledge this lineage and engage with the known limitations of reputation systems (Sybil attacks, whitewashing, strategic behavior).

8. Section 6.3: The convergence objection deserves a much longer treatment. The paper should discuss under what conditions divergence might be acceptable or even desirable (moral pluralism) versus genuinely problematic.

9. The reference list should include Wallach and Allen (2008), Floridi and Sanders (2004) on levels of abstraction in AI ethics, Dignum (2019), and representative work from the multi-agent systems literature on trust and reputation.

10. The paper references a "Figure 1" that describes the dual-process architecture, but no figure is present in the text. If this is an artifact of the text extraction, ensure the figure is included in the submitted manuscript.

11. Several key claims use the phrase "will not work" or "is structurally incapable" without adequate qualification. More precise language ("faces significant structural challenges," "is unlikely to succeed at scale without complementary mechanisms") would be more appropriate for an academic publication.

12. The paper would benefit from a brief discussion of how the conscience faculty handles genuine moral dilemmas -- cases where the principal's good conflicts with third-party welfare, or where two synderesis-level principles conflict with each other.

---

### Questions for Authors

1. How do you respond to the charge that the Clarity x Stakes matrix, as a formal scoring system, is precisely the kind of rule-based mechanism that your own Newmanian framework argues against? Is there an internal tension between the aspiration to illative-sense reasoning and the implementation as quantitative scoring?

2. What is the principled basis for the specific synderesis primitives you identify (physical harm, unauthorized access, data integrity, truthful identification)? Why these four and not others? Is this list intended to be exhaustive, domain-general, or illustrative?

3. How would the conscience faculty handle cases where the principal's expressed wishes conflict with the principal's genuine good (as the agent understands it)? For example, if a principal instructs an agent to pursue a course of action that the agent's caritas-anchored disposition recognizes as self-destructive, should the agent comply or resist?

4. You cite Guardian Angel as a "reference implementation." What empirical evidence, beyond latency measurements, supports the claim that this architecture produces safer agent behavior? Have you conducted any comparative studies against baseline (non-conscience) agents?

5. How do you envision the conscience faculty operating in adversarial environments where other agents are actively attempting to exploit or manipulate the trust-scoring mechanism? Does the architecture have defenses against strategic manipulation of trust scores?

6. The paper argues that standards should "emerge from practice, not the reverse." But historically, many beneficial safety standards (building codes, electrical safety, aviation protocols) were imposed top-down in response to catastrophic failures precisely because bottom-up emergence was too slow or too costly in human life. How do you reconcile your argument with these historical precedents?

7. Would you consider the conscience faculty's synderesis layer to be a form of top-down safety? It is, after all, hard-coded by designers, non-negotiable, and imposed on operators without their consent. If so, how does this affect your critique of top-down approaches?

---

*Reviewed for Philosophy & Technology / Minds and Machines / AI and Ethics*
*Review completed: March 26, 2026*

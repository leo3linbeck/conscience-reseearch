# Journal Fit Assessment: "Conscience is All You Need"

**Author:** Leo Linbeck III, Stanford Graduate School of Business
**Paper type:** Theoretical/philosophical paper on agentic AI safety
**Length:** ~10,000 words, 28 references
**Key frameworks:** Thomistic ethics (synderesis, conscientia, caritas), Newman's epistemology (illative sense), Kahneman's dual-process cognition, Ostrom's commons governance
**Contribution:** Proposes a "conscience faculty" architecture with Guardian Angel reference implementation for decentralized agentic AI safety
**Assessment date:** 2026-03-27

---

## Paper Profile Summary

The paper makes a philosophical-architectural argument against top-down AI safety governance and for a decentralized, virtue-ethics-grounded "conscience faculty" embedded in each AI agent. It synthesizes Catholic intellectual tradition (Aquinas, Newman, subsidiarity), cognitive science (Kahneman), and institutional economics (Ostrom) into four design principles, with a reference implementation (Guardian Angel). The paper is primarily normative and conceptual, with light empirical grounding (latency measurements from the implementation). It cites 28 references spanning philosophy, theology, political theory, cognitive science, and AI safety.

---

## 1. Philosophy & Technology (Springer)

**Journal profile:**
- SJR: 1.862 (Q1), Impact Score: 5.40 (2-year), h-index: 56
- Double-blind review; median submission-to-first-decision: 11 days
- Scope: "Best research where philosophy meets technology"; welcomes any tradition or disciplinary background
- Acceptance rate: Not publicly disclosed (estimated 15-25% given Q1 status)
- Downloads: ~1.5 million (2025)

### Fit Score: 8/10

### Acceptance Likelihood: Medium-High

### Key Strengths
- **Direct scope alignment.** The paper sits squarely at the intersection of philosophy (Thomistic ethics, Newman's epistemology, subsidiarity) and technology (agentic AI architecture, tool-call interception, implementation). This is exactly what Philosophy & Technology publishes.
- **Precedent for virtue ethics + AI.** Hagendorff (2022), which the paper cites, was published in this journal ("A Virtue-Based Framework to Support Putting AI Ethics into Practice," Philosophy & Technology 35, Article 55). Vallor's work on technology and virtues is also in this journal's orbit.
- **Interdisciplinary synthesis.** The journal explicitly welcomes contributions from any tradition or disciplinary background. The paper's unusual combination of Thomistic philosophy, cognitive science, institutional economics, and software architecture is a strength here, not a liability.
- **Timeliness.** Agentic AI safety is an urgent topic in 2026; the journal's recent content trends toward AI governance and ethics.
- **Architectural concreteness.** The paper goes beyond pure philosophical argument to propose a specific technical architecture, which aligns with the journal's interest in "practical consequences of emerging technologies."

### Key Weaknesses
- **Limited formal empirical content.** The journal publishes both theoretical and empirical work. The paper's empirical evidence is thin (only latency measurements from Guardian Angel). Reviewers may request more rigorous evaluation.
- **Catholic intellectual tradition framing.** While the journal is open to all traditions, the heavy reliance on Aquinas, Newman, Rerum Novarum, and subsidiarity may read as sectarian to some reviewers. The paper addresses this somewhat with the "structural, not ontological" disclaimer, but a reviewer skeptical of natural law theory may push back.
- **Polemic tone.** The Grand Inquisitor framing, the "authoritarian gradient" language, and the strong claims against centralized governance have an advocacy quality that some reviewers may find insufficiently balanced for a top philosophy journal.

### Required Changes
1. **Soften polemic framing.** Reframe the critique of top-down safety as a structural analysis rather than a condemnation. Acknowledge specific strengths of centralized approaches more generously before arguing for the priority of conscience.
2. **Expand engagement with existing philosophy of technology literature.** The paper should engage more deeply with Floridi (information ethics, AI4People framework), Coeckelbergh (relational ethics), and Mittelstadt et al. (ethics of algorithms). Currently, the reference list skews toward primary philosophical sources and AI technical documents rather than the journal's own scholarly conversation.
3. **Add a formal evaluation section.** Even a thought experiment, scenario analysis, or structured comparison with existing safety frameworks would strengthen the empirical grounding.
4. **Clarify the ontological status claim.** The anthropomorphism objection section (6.1) should be expanded. Philosophy & Technology reviewers will probe this deeply.

### Similar Published Papers
- Hagendorff, T. (2022). "A Virtue-Based Framework to Support Putting AI Ethics into Practice." *Philosophy & Technology* 35, Article 55.
- Vallor, S. (2016). *Technology and the Virtues* (frequently cited in this journal).
- Floridi, L. & Cowls, J. (2019). "A Unified Framework of Five Principles for AI in Society." *Harvard Data Science Review* (widely discussed in P&T).
- Coeckelbergh, M. (2020). "AI Ethics." *MIT Press* (author publishes frequently in P&T).

---

## 2. Minds and Machines (Springer)

**Journal profile:**
- Impact Factor: 3.4 (2024), 5-year IF: 9.4, CiteScore: ~8.4, h-index: ~48, SJR Q1
- Editor-in-Chief: Mariarosaria Taddeo
- Median submission-to-first-decision: 45-49 days
- Scope: Interdisciplinary research at philosophy, AI, cognitive science, logic, epistemology, and ethics of computing
- Acceptance rate: Not publicly disclosed (likely 10-20% given metrics)
- Indexed: Web of Science (SCIE), Scopus, PhilPapers, PsycINFO, DBLP, ACM DL

### Fit Score: 7/10

### Acceptance Likelihood: Medium

### Key Strengths
- **Cognitive architecture focus.** The dual-process (Kahneman) framing and the explicit "cognitive architecture" language align well with a journal named "Minds and Machines." The paper's argument about System 1/System 2 moral reasoning for AI agents is precisely the kind of minds-and-machines question this journal explores.
- **Strong metrics and visibility.** The 5-year IF of 9.4 and broad indexing (SCIE, Scopus, DBLP, ACM DL) would give the paper exceptional visibility across both philosophy and computer science communities.
- **Current editorial interest.** Recent content includes LLMs, AI ethics, explainability, and AI governance -- all topics the paper touches.
- **Epistemological depth.** The Newman/illative sense argument is genuinely epistemological, fitting the journal's interest in epistemology of computing.

### Key Weaknesses
- **Insufficient engagement with philosophy of mind literature.** A journal focused on minds and machines will expect engagement with debates about machine consciousness, intentionality, moral agency, and the Chinese Room argument. The paper treats the anthropomorphism objection in a single paragraph (Section 6.1) without engaging Searle, Dennett, Chalmers, or the functionalism debate.
- **Editor-in-Chief alignment risk.** Mariarosaria Taddeo's own work emphasizes information ethics in the Floridi tradition and has been associated with governance-oriented approaches. The paper's strong anti-centralization stance may not align with editorial preferences.
- **Technical depth expectations.** Minds and Machines publishes papers with formal logical frameworks, computational models, and rigorous philosophical argumentation. The paper's architecture description, while concrete, lacks formal specification (no pseudocode, no formal logic, no mathematical framework for the Clarity x Stakes scoring).
- **Reference list gaps.** The paper does not cite any papers from Minds and Machines itself, which is unusual for a submission to that venue.

### Required Changes
1. **Engage with philosophy of mind.** Add a substantive discussion of functionalism, intentionality, and whether the "conscience faculty" constitutes genuine moral reasoning or mere simulation. Engage with Searle, Dennett, Floridi's levels of abstraction, and the machine ethics literature (Wallach & Allen, Anderson & Anderson).
2. **Formalize the architecture.** Add pseudocode or a formal specification for the conscience faculty. The Clarity x Stakes matrix should be given a more rigorous treatment (decision theory, utility theory, or formal logic).
3. **Cite the journal's literature.** Find and engage with 3-5 recent Minds and Machines papers on AI ethics, machine morality, or agent architecture.
4. **Expand Section 6.1 significantly.** The anthropomorphism objection is the central challenge for this venue and needs at minimum 2-3 pages of serious philosophical engagement.

### Similar Published Papers
- Papers on machine ethics and moral agency in recent M&M issues.
- Taddeo, M. & Floridi, L. (2018). "The Debate on the Moral Responsibilities of Online Service Providers." *Science and Engineering Ethics* (Taddeo's perspective on governance).
- Wallach, W. & Allen, C. (2009). *Moral Machines* (foundational for this journal's conversation).

---

## 3. AI and Ethics (Springer)

**Journal profile:**
- Launched 2021; no official Clarivate JCR Impact Factor as of 2026
- Scope: Ethical, regulatory, and policy implications of AI development
- Acceptance rate: Not publicly disclosed (likely higher than P&T or M&M given newer status)
- No SJR Q1 ranking; limited bibliometric profile
- Regular publication since 2022; indexed in SciSpace, Google Scholar

### Fit Score: 7/10

### Acceptance Likelihood: High

### Key Strengths
- **Highest probability of acceptance.** As a newer journal still building its bibliometric profile, AI and Ethics is likely more receptive to bold, interdisciplinary submissions. The acceptance rate is almost certainly higher than the Q1 journals.
- **Direct topical fit.** The paper's core topic -- ethical architecture for AI agents -- is precisely what this journal was created to publish.
- **Lower bar for formal rigor.** The journal's emphasis on "debate and discussion" suggests openness to normative argument, policy-oriented analysis, and philosophical frameworks without requiring the formal rigor expected by Minds and Machines or Philosophy & Technology.
- **Practical/implementation focus welcome.** The Guardian Angel implementation and design principles are well-suited to a journal that bridges academic ethics and practical AI development.
- **No tradition bias.** The journal's broad scope means the Thomistic/Catholic intellectual tradition framing is unlikely to be a barrier.

### Key Weaknesses
- **Low prestige and visibility.** No JCR Impact Factor, no Q1 ranking, limited indexing. For a Stanford GSB author, this may be a reputational mismatch. The paper would reach fewer readers and carry less weight in academic evaluation.
- **Young journal risk.** The journal's long-term viability and reputation trajectory are uncertain. A paper published here in 2026 may not carry the same weight in 2030.
- **Less rigorous review.** The potentially less demanding review process means the paper may not benefit from the sharpening that comes from demanding reviewers at higher-ranked venues.
- **Citation impact.** Papers in AI and Ethics are currently cited less frequently than in P&T or M&M, reducing the paper's potential scholarly impact.

### Required Changes
1. **Minimal changes required for submission.** The paper is likely publishable in its current form or close to it.
2. **Consider adding a policy implications section.** Given the journal's interest in regulatory and policy dimensions, a brief section on how the conscience faculty framework interacts with the EU AI Act, NIST frameworks, and emerging agentic AI regulations would strengthen fit.
3. **Expand the objections section slightly.** Add engagement with consequentialist and deontological alternatives to virtue ethics for AI safety.

### Similar Published Papers
- AI practical wisdom and compassion papers published in AI and Ethics (2025).
- Various papers on AI governance, ethical frameworks, and responsible AI in the journal's 2022-2025 volumes.
- Springer's "Virtues for AI" (AI & Society, 2025) -- sibling journal with overlapping readership.

---

## 4. Comparative Summary Table

| Criterion | Philosophy & Technology | Minds and Machines | AI and Ethics |
|-----------|----------------------|-------------------|---------------|
| **Fit Score** | **8/10** | 7/10 | 7/10 |
| **Acceptance Likelihood** | **Medium-High** | Medium | High |
| **Impact Factor / SJR** | 5.40 / Q1 | 3.4 (9.4 5-yr) / Q1 | No JCR IF |
| **Prestige** | High | High | Low-Medium |
| **Scope Alignment** | Excellent | Good | Excellent |
| **Revision Burden** | Moderate | Heavy | Light |
| **Time to Decision** | ~11 days (median) | ~45-49 days | Unknown |
| **Virtue Ethics Precedent** | Strong (Hagendorff 2022) | Moderate | Moderate |
| **Risk** | Low | Medium-High | Low |

---

## 5. Final Ranking and Recommendation

### Rank 1 (RECOMMENDED): Philosophy & Technology

**Rationale:** This is the clear first choice. The paper's synthesis of philosophical tradition and technological architecture is exactly what Philosophy & Technology publishes. The journal has direct precedent for virtue-ethics-meets-AI papers (Hagendorff 2022 was published here). The high impact metrics (SJR Q1, Impact Score 5.40) ensure visibility. The revision burden is moderate and achievable: soften the polemic edges, expand engagement with the philosophy of technology literature, and strengthen the empirical/evaluation dimension. The fast median decision time (11 days to first decision) is a significant practical advantage.

**Strategy:** Submit here first. If rejected, the reviewer feedback will strengthen the paper for resubmission elsewhere.

### Rank 2: Minds and Machines

**Rationale:** Excellent journal with outstanding metrics (5-year IF of 9.4), but the revision burden is substantial. The paper would need significant additions: expanded philosophy of mind engagement, formal specification of the architecture, and a much deeper treatment of the anthropomorphism question. The editor-in-chief's governance-oriented perspective may create headwind for the paper's anti-centralization thesis. Best as a second-choice target if the author is willing to invest in significant revisions.

### Rank 3: AI and Ethics

**Rationale:** Highest probability of acceptance with minimal revisions, but lowest prestige. Appropriate as a fallback if the paper is rejected from higher-ranked venues, or if speed of publication is prioritized over impact. For a Stanford GSB author with a novel architectural proposal, the reputational mismatch is a concern. However, the journal's topical alignment is excellent, and early publication in a growing venue has its own strategic value.

---

## 6. Cross-Cutting Recommendations (All Venues)

Regardless of target journal, the following changes would strengthen the paper:

1. **Expand the reference list.** 28 references is light for a 10,000-word theoretical paper. Target 40-50 references, adding engagement with: Floridi (information ethics), Coeckelbergh (relational ethics), Wallach & Allen (moral machines), Anderson & Anderson (machine ethics), Mittelstadt et al. (ethics of algorithms), and recent agentic AI safety papers from 2024-2026.

2. **Add empirical or formal evaluation.** Even one of the following would substantially strengthen the paper: (a) a structured scenario comparison between conscience faculty and top-down approaches, (b) formal specification of the architecture in pseudocode or decision-theoretic notation, (c) simulation results from multi-agent trust convergence, or (d) a case study applying the framework to a real agentic failure.

3. **Moderate the tone.** The Grand Inquisitor metaphor and "authoritarian gradient" framing, while rhetorically effective, may alienate reviewers. Frame the paper as proposing a complementary paradigm rather than condemning the existing one.

4. **Deepen the anthropomorphism discussion.** Section 6.1 is the paper's most vulnerable point at any venue. Expand it to engage with functionalism, the distinction between simulation and instantiation, and the philosophical literature on moral agency for artificial systems.

5. **Engage with the virtue ethics + AI literature.** Less than 10% of AI safety papers explicitly reference virtue ethics (per Philosophy Compass 2025 review). This is both an opportunity (novelty) and a risk (unfamiliarity). Anchor the paper in the existing virtue ethics + AI conversation by engaging Vallor (2016), Hagendorff (2022), and the emerging design patterns literature (CHI 2025).

---

*Assessment prepared from parallel-web research conducted 2026-03-27. Research sources archived in `sources/` directory.*

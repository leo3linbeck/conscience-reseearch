# Conscience is All You Need

**Leo Linbeck III**
Stanford Graduate School of Business
leo3@linbeck.com

---

## Abstract

The dominant approach to AI safety -- centralized, top-down governance enforced through regulatory frameworks, model-level alignment, and platform-controlled guardrails -- faces significant structural challenges when applied to agentic activity at scale. This paper argues that the attempt to impose safety from above on autonomous agents capable of real-world action risks following a predictable trajectory: eroding individual agency, suppressing innovation, creating fragile monocultures that fail catastrophically, and -- absent countervailing forces -- degrading into authoritarian control over the most powerful technology of the twenty-first century. The alternative is not anarchy but conscience: an intrinsic moral faculty embedded within each agent, grounded in philosophical traditions that have sustained human flourishing and self-governance for millennia. Drawing on Aristotelian-Thomistic ethics (synderesis as innate moral orientation, conscientia as adaptive judgment, caritas as dispositional anchor), Newman's epistemology of conscience (the illative sense as the organ of concrete moral judgment, and the primacy of individual moral authority over institutional power), Kahneman's dual-process cognitive framework (exploiting the sparsity of agentic tool calls to enable deep moral reasoning without prohibitive latency), and Ostrom's commons governance (empirically validated design principles for decentralized self-regulation), the paper develops a conscience faculty architecture for agentic systems organized around four principles: subsidiarity, individual human control and accountability, emergent self-governing coordination, and privileged last-mile hooks. The claim is not that conscience renders all other safety mechanisms unnecessary, but that it constitutes the foundational layer on which any legitimate and durable safety architecture must rest -- the indispensable substrate without which centralized mechanisms become brittle, adversarial, and ultimately self-defeating. A reference implementation -- Guardian Angel, an open-source plugin for the OpenClaw framework -- demonstrates initial feasibility. The title deliberately echoes Vaswani et al.'s foundational transformer paper: just as attention proved to be the single mechanism sufficient for flexible, scalable artificial intelligence, conscience is proposed as the foundational mechanism for flexible, scalable, and safe agentic behavior.

**Keywords:** agentic AI, AI safety, conscience faculty, subsidiarity, Thomistic ethics, illative sense, dual-process cognition, commons governance, decentralized safety, last-mile enforcement, machine ethics

---

## 1. Introduction

The rapid evolution of large language models into autonomous agents -- systems that plan multi-step tasks, invoke external tools, and operate with diminishing human oversight -- marks a qualitative shift in artificial intelligence. Where earlier models served as passive oracles responding to prompts, agentic systems initiate action sequences, manage persistent state, and coordinate with other agents to accomplish complex objectives in the real world (Chan et al., 2023; Shavit et al., 2023). An agent that can browse the web, execute code, send messages, and manage financial transactions can also escalate privileges, exfiltrate data, or trigger cascading failures across interconnected systems. The distinguishing feature of agentic AI is not that it reasons but that it acts -- and those actions impact the physical world, whether in changing the state of bits, the state of nature, or the state itself.

The prevailing response has been to build safety from the top down. The NIST AI Risk Management Framework (NIST, 2023) imposes four institutional functions -- Govern, Map, Measure, and Manage. Its AI Agent Standards Initiative (NIST, 2025) extends this to multi-agent ecosystems. Complementary efforts from UC Berkeley and Amazon Web Services propose layered defenses calibrated to autonomy level. Major AI developers embed safety at the model level through RLHF (Leike et al., 2018), constitutional AI (Amodei et al., 2022), and system-prompt guardrails, while enterprise platforms offer centralized policy engines governing agents from above. Academic frameworks have proposed principled approaches to AI governance ranging from unified ethical principles (Floridi & Cowls, 2019) to society-in-the-loop architectures (Rahwan, 2018) to comprehensive governance research agendas (Dafoe, 2018).

This paper argues that the top-down approach, while reflecting serious and well-intentioned effort, faces significant structural challenges that render it insufficient as the primary mechanism for delivering safe agentic AI at scale. Centralized safety for autonomous agents risks following a predictable and self-defeating trajectory: eroding the individual agency it claims to protect, suppressing the innovation it claims to enable, creating fragile monocultures whose failures cascade catastrophically, and -- absent countervailing forces -- degrading into authoritarian control over the most consequential technology of the twenty-first century.

The alternative is not anarchy. It is conscience: not a bolt-on safety module but an intrinsic moral faculty integrated into the agent's cognitive architecture -- a capacity for moral perception, judgment, and self-correction that mirrors the functional structure of human practical reason. The title deliberately echoes Vaswani et al.'s "Attention Is All You Need" (2017), which demonstrated that a single mechanism -- attention -- was sufficient for flexible, scalable artificial intelligence. The claim here is analogous but deliberately qualified: conscience, properly understood and architecturally instantiated, is the foundational mechanism for flexible, scalable, and safe agentic behavior. It is not the only mechanism a complete safety ecosystem requires, but it is the indispensable one -- the substrate without which centralized mechanisms become brittle, adversarial, and self-defeating.

The intellectual resources for this paradigm are deep. Aristotelian-Thomistic ethics provides three interlocking concepts: synderesis (innate moral orientation), conscientia (contextual moral judgment), and caritas (the willing of the principal's genuine good as the dispositional anchor that unifies all other virtues). Newman's epistemology -- particularly the illative sense developed in the Grammar of Assent (1870) -- supplies the theory of concrete moral judgment that distinguishes genuine conscience from mere rule-following. Kahneman's dual-process framework (2011), as refined by Evans and Stanovich (2013), supplies the cognitive architecture that makes a conscience faculty computationally feasible by exploiting the sparsity of agentic tool calls. And Ostrom's Nobel Prize-winning research (1990), extended to knowledge commons by Hess and Ostrom (2007), provides empirical evidence that decentralized self-governance can outperform centralized control in managing complex commons. A reference implementation -- Guardian Angel, an MIT-0 licensed plugin for the OpenClaw agentic framework (Linbeck, 2026) -- demonstrates that this architecture is deployable today.

The contribution of this paper is threefold. First, it provides a structural critique of top-down agentic safety, identifying four failure modes that arise from the inherent properties of centralized governance applied to autonomous agents. Second, it synthesizes four intellectual traditions -- Aristotelian-Thomistic ethics, Newman's epistemology, dual-process cognitive theory, and Ostrom's commons governance -- into a unified architectural proposal that addresses each failure mode. Third, it translates this synthesis into a concrete, implementable architecture organized around four design principles, with a reference implementation demonstrating initial feasibility. The paper thus bridges the gap between philosophical argument and engineering practice that has limited the influence of virtue-ethics approaches in AI safety (Hagendorff, 2022; Vallor, 2016).

The paper proceeds as follows. Section 2 develops the case against top-down agentic safety, identifying four structural failure modes. Section 2.5 positions the contribution relative to existing work in machine ethics and AI governance. Section 3 builds the philosophical and empirical foundations for the alternative: the Aristotelian-Thomistic framework for moral analysis, Newman's epistemology of conscience, the dual-process architecture for performant execution, and Ostrom's design principles for emergent collective governance. Section 4 translates these foundations into a concrete architecture -- the conscience faculty -- organized around four design principles, including a mechanism for evaluating action sequences. Section 5 addresses scalability, resilience, and multi-agent trust. Section 6 considers objections and limitations. Section 7 concludes.

## 2. The Case Against Top-Down Agentic Safety

The critique that follows is structural, not personal. NIST, the EU AI Act, and the various corporate safety programs represent serious and well-intentioned efforts by talented people confronting genuinely difficult problems. The argument here concerns properties inherent in any centralized approach to governing autonomous agents at scale. Four failure modes deserve examination.

A preliminary clarification is warranted. Successful centralized safety regimes do exist. Aviation safety, pharmaceutical regulation, and nuclear safety represent decades-long centralized governance that has saved enormous numbers of lives. The argument here is not that centralization never works but that the specific structural properties of agentic AI -- massive scale, radical diversity of application, rapid evolution, and the necessity for real-time autonomous decision-making -- make it structurally disanalogous to these domains. Aircraft share a common physics; pharmaceutical compounds share a common biochemistry; nuclear facilities share a common set of failure modes. Agentic AI, by contrast, operates across every domain simultaneously, in novel combinations that no central authority can anticipate, at a speed that precludes pre-deployment review. The structural conditions that make centralized safety effective in aviation -- a bounded domain, a small number of well-resourced actors, slow technological change, and catastrophic failure modes that concentrate political will -- are precisely the conditions that do not obtain in agentic AI.

### 2.1 The Grand Inquisitor: Erosion of Human Agency

In Dostoyevsky's parable of the Grand Inquisitor, Christ returns to earth during the Spanish Inquisition, and the Inquisitor condemns him -- not for heresy but for the unforgivable sin of granting human beings freedom. The Inquisitor's logic is chillingly coherent: people do not want freedom; they want bread, miracles, and authority. The Church has kindly relieved them of the intolerable burden of moral choice. Christ's error, in the Inquisitor's view, was respecting human dignity too much.

Top-down agentic safety replicates this logic with uncomfortable precision. When safety decisions are made by model trainers, platform operators, and regulatory bodies, the individual user is relieved of moral responsibility for their agent's actions. Safety is someone else's problem, built into the infrastructure, enforced from above. The user's role is compliance, not judgment.

This transfer of agency is not a regrettable side effect; it is structural. NIST's framework locates safety at institutional nodes -- governance boards, compliance officers, centralized registries -- precisely because it assumes that individual operators cannot be relied upon to govern their own agents. The EU AI Act (European Parliament, 2024) assigns regulatory obligations based on risk classification determined by centralized authorities. Corporate AI developers restrict agent capabilities through model-level constraints that users cannot modify, calibrate, or override.

The consequences are twofold. First, moral hazard: users who are told that safety is handled by others develop careless habits, presuming centralized authorities will prevent harm. When the inevitable failure occurs, these users lack the awareness, the habits, and the tools to respond. Second, atrophy: users whose moral engagement is systematically bypassed lose the capacity for moral engagement altogether. The moral hazard literature in economics demonstrates that insurance against consequences reliably produces riskier behavior; there is no reason to expect that insulating users from the moral consequences of their agents' actions will produce a different result. The Grand Inquisitor succeeds not by forbidding freedom but by making it unnecessary -- and eventually inconceivable.

### 2.2 Scale Is the Enemy of Search: The Innovation Brake

Innovation is a search process. The discovery of valuable new applications, workflows, and capabilities depends on a large, diverse population of actors exploring a vast space of possibilities, most of which will fail. The expected value of any individual experiment is low; the expected value of the aggregate search is enormous. This is the logic of markets, of biological evolution, and of scientific discovery.

Centralized safety regimes are structurally hostile to search. They require that novel agent behaviors be evaluated against predetermined risk categories before deployment. They impose conformity assessments, documentation requirements, and post-market monitoring that scale with organizational complexity, not with the value of the activity being constrained. The compliance burden falls disproportionately on small actors -- individual developers, startups, researchers -- who are precisely the actors most likely to discover unexpected applications. Large organizations absorb the overhead; small innovators cannot.

The result is concentration of agentic AI development among a small number of well-resourced firms, facing incentives to standardize rather than diversify, to optimize for compliance rather than capability, and to restrict rather than enable. The search space narrows. The most promising but least predictable applications go unexplored. Hayek's insight (1945) that dispersed local knowledge consistently outperforms centralized planning applies with particular force to a technology whose most valuable applications are, by definition, ones that central planners have not yet imagined. This is not to deny that externalities require governance -- Hayek himself acknowledged market failures -- but rather to insist that the governance mechanism must preserve the distributed search process, not extinguish it.

### 2.3 Fragility and Catastrophic Failure

Centralized safety creates correlated failure modes. When all agents in an ecosystem rely on the same upstream safeguards -- the same model-level alignment, the same platform guardrails, the same regulatory classification -- a single vulnerability or design error affects every agent simultaneously. James C. Scott's analysis (1998) of how centralized, legibility-driven state schemes consistently produce catastrophic failures is directly applicable: systems that impose uniform order from above suppress the local variation and adaptive capacity that make complex systems robust.

Perrow's theory of "normal accidents" (1999) reinforces the point: in tightly coupled systems with complex interactions, failures are not anomalies but inevitable structural properties. A centralized agentic safety regime exhibits significant tight coupling: a single policy change propagates to millions of agents; a single bypass technique compromises every agent that depends on the same upstream defense. The failure mode is not gradual degradation but sudden, correlated collapse. One might object that current AI safety architectures operate at different layers and timescales, resembling defense-in-depth more than the tightly coupled systems Perrow analyzed. This is a fair point for the present moment, but the trajectory of centralization is toward tighter coupling as regulatory frameworks, platform policies, and model-level constraints become increasingly coordinated and interdependent.

Taleb's concept of antifragility (2012) sharpens the contrast. A decentralized system in which each agent maintains its own conscience faculty is antifragile: individual failures are local, bounded, and informative. The system as a whole learns from every failure because different agents employ different moral thresholds, encounter different threats, and develop different adaptations. A centralized system suppresses local variation, accumulates hidden vulnerabilities, and when it fails, it fails everywhere at once.

### 2.4 The Authoritarian Gradient

The three failure modes just described are not independent; they are progressive. The erosion of individual agency creates a population dependent on centralized protection. The suppression of innovation concentrates power in a small number of firms and regulatory bodies. The fragility of centralized systems produces periodic crises that demand ever more aggressive intervention. The dynamic is self-reinforcing: each failure of top-down control generates pressure for more top-down control.

The endpoint is the observed pattern of centralized governance under stress. When a centralized safety regime fails -- when agents bypass guardrails, when correlated vulnerabilities are exploited -- the institutional response is invariably to expand the scope and intensity of centralized oversight. More audits, more requirements, more restrictions, less discretion for individual operators. The ratchet tightens.

This paper does not claim that every centralized safety initiative will produce authoritarianism. The claim is more precise: that centralized agentic safety follows an authoritarian gradient -- a structural tendency toward increasing control that must be actively resisted by architectural means, not merely by good intentions. The conscience faculty supplies those architectural means. Nor does the paper deny that some degree of centralized coordination is necessary; the argument concerns what should be foundational and what should be supplementary. When centralized control is the foundation and individual judgment is the supplement, the gradient operates unchecked. When conscience is the foundation and centralized coordination is the supplement, subsidiarity provides the structural resistance the gradient requires.

### 2.5 Related Work: Positioning Against Existing Machine Ethics and AI Governance

The conscience faculty does not emerge in a vacuum. It builds upon, and departs from, a rich tradition of work in machine ethics, AI governance, and the philosophy of technology. Situating the contribution precisely requires engaging with this literature.

The foundational question of whether artificial agents can or should be designed with ethical reasoning capacities was systematically addressed by Wallach and Allen (2009), whose *Moral Machines* established the distinction between top-down approaches (implementing ethical theories as explicit rules) and bottom-up approaches (designing systems that learn ethical behavior through experience). The conscience faculty occupies a distinctive position in this taxonomy: it is neither purely top-down (the synderesis layer establishes non-negotiable principles, but conscientia adapts through experience) nor purely bottom-up (experience shapes adaptive thresholds, but within a principled moral architecture). It is, in Wallach and Allen's terms, a hybrid approach -- but one whose hybrid character is not ad hoc but grounded in the structure of practical reason as analyzed by the Aristotelian-Thomistic tradition.

Moor's influential taxonomy (2006) distinguished ethical impact agents, implicit ethical agents, explicit ethical agents, and full ethical agents. The conscience faculty aims to produce what Moor would classify as an explicit ethical agent -- one that can represent and reason about ethical categories -- while honestly acknowledging that it does not claim to produce a full ethical agent capable of genuine moral understanding. The structural-functional interpretation defended in Section 6.1 addresses this boundary directly.

Among principled frameworks for AI ethics, Floridi and Cowls's unified framework (2019) -- organized around beneficence, non-maleficence, autonomy, justice, and explicability -- represents the most influential alternative to virtue-based approaches. The conscience faculty shares Floridi and Cowls's commitment to principled governance but differs fundamentally in its locus of authority. Their framework, like the NIST and EU frameworks it has influenced, locates ethical authority in institutional principles applied from above. The conscience faculty locates it in the moral judgment of the individual operator, informed but not overridden by institutional norms. This is not merely a difference of emphasis; it is a difference in architectural priority that produces different systemic properties, as the structural analysis of Section 2 demonstrates.

Coeckelbergh's relational approach (2020) poses a deeper challenge. Where the conscience faculty, following Newman, grounds moral authority in the individual, Coeckelbergh argues that moral agency is constitutively relational -- it emerges from interactions, not from isolated faculties. The conscience faculty partially addresses this through its communal feedback mechanism and multi-agent trust architecture, which recognize that individual moral judgment is informed and shaped by social context. However, the paper maintains, with Newman, that the individual conscience remains the irreducible unit of moral authority -- not because moral formation is solitary, but because moral accountability cannot be distributed without being dissolved. The relational dimension enriches the exercise of conscience; it does not replace it.

Rahwan's society-in-the-loop framework (2018) represents perhaps the most developed alternative to both pure top-down and pure bottom-up approaches, proposing that societal values be embedded in AI through collective preference aggregation. The conscience faculty differs from this approach in two respects. First, it is skeptical that collective preference aggregation can capture the contextual, particular character of genuine moral judgment -- the quality that Newman termed "real assent" as opposed to "notional assent." Second, it argues that the aggregation process itself is vulnerable to the authoritarian gradient: the institution that aggregates preferences inevitably shapes them. Rahwan's framework is a sophisticated attempt to democratize AI governance, but it does not escape the structural dynamics identified in Section 2.

The virtue-ethics tradition in AI safety has received growing attention. Vallor's *Technology and the Virtues* (2016) developed a comprehensive framework for technomoral virtue, arguing that classical virtues must be reinterpreted for technological contexts. Hagendorff's virtue-based framework (2022), published in this journal, demonstrated the viability of virtue ethics as a practical approach to AI ethics. The conscience faculty extends this tradition in a specific direction: from virtue as a general orientation to virtue as an implementable architecture, mediated by the Thomistic tripartite structure (synderesis, conscientia, caritas) and the Kahneman-inspired dual-process engine. Where Vallor and Hagendorff provide the philosophical motivation, the present paper attempts the engineering translation. Figure 4 summarizes the key differences between top-down safety and the conscience faculty across seven dimensions -- locus of authority, failure mode, adaptability, scalability, moral agency, innovation effect, and resilience -- making the structural contrast concrete.

Gabriel's treatment of the alignment problem (2020) identifies the fundamental difficulty of specifying whose values an AI system should be aligned with, and by what procedure. The conscience faculty's answer is subsidiarity: the agent is aligned primarily with its principal's values (through caritas), constrained by non-negotiable universal principles (through synderesis), and informed by communal norms (through the emergent coordination mechanism). This three-level structure avoids both the value-imposition problem of top-down alignment and the value-relativism problem of unconstrained bottom-up learning.

It bears noting that certain moral traditions beyond the Western canon offer resources that both support and challenge the conscience faculty's architecture. Confucian virtue ethics, with its emphasis on *ren* (benevolence) and the cultivation of moral character through practice, shares with the Aristotelian-Thomistic tradition a commitment to virtue as habituated excellence -- though it locates moral authority more firmly in communal relationships and filial obligation than in individual conscience (Angle & Slote, 2013). The Ubuntu philosophy of sub-Saharan Africa -- captured in the maxim "I am because we are" -- emphasizes relational personhood in ways that echo Coeckelbergh's challenge while grounding moral judgment in communal solidarity rather than individual autonomy. These traditions suggest that the conscience faculty's architecture, while developed from Western sources, is not incompatible with non-Western moral frameworks, provided that the communal feedback mechanism and multi-agent trust architecture are given sufficient weight in implementation. A fuller cross-cultural engagement remains an important direction for future work.

## 3. Foundations: The Moral, Cognitive, and Institutional Case for Conscience

If top-down safety faces significant structural challenges in governing agentic AI at scale, the alternative must be built on foundations deep enough to bear the weight. This section develops four interlocking frameworks that together supply the moral architecture, the epistemology of judgment, the cognitive engine, and the institutional evidence for a bottom-up approach. Each framework addresses a distinct question: What should a conscience faculty do? (Aristotelian-Thomistic ethics). How does genuine moral judgment work? (Newman's epistemology). How can it operate without prohibitive cost? (Dual-process theory). How can decentralized moral governance scale? (Ostrom's commons research).

### 3.1 The Aristotelian-Thomistic Moral Framework

The conscience faculty draws its moral architecture from the Aristotelian-Thomistic tradition, which provides three interlocking concepts: synderesis (the innate moral orientation that establishes non-negotiable first principles), conscientia (the adaptive faculty that applies those principles to particular circumstances), and caritas (the supreme virtue that anchors and unifies all moral reasoning in the willing of another's genuine good). Together they constitute a complete moral psychology -- one that has sustained practical moral reasoning across diverse cultures and institutions for nearly eight centuries.

**Synderesis: The Innate Moral Orientation.** In the *Summa Theologiae*, Aquinas identifies synderesis as an innate habitus of the practical intellect -- a stable disposition that inclines the mind toward the first principles of moral reasoning. Just as the speculative intellect grasps the principle of non-contradiction without derivation, the practical intellect grasps that "good is to be done and pursued, and evil is to be avoided" as self-evident. Synderesis is not a specific moral judgment but the universal orientation that makes particular judgments possible. It is, in computational terms, the prior: the foundational bias toward moral salience that structures all subsequent reasoning. Critically, Aquinas holds that synderesis is innate and incorruptible -- it cannot be trained away, overridden by authority, or eliminated by experience. In the computational analogue, this translates to hard-coded safety primitives that are architecturally protected from modification. Whether software can achieve the incorruptibility that Aquinas attributes to a habitus of the rational soul is a question the structural-analogy discussion of Section 6.1 addresses directly; for now, the design aspiration is clear: a moral bedrock that resists tampering.

**Conscientia: The Adaptive Moral Faculty.** Conscience (conscientia) is the act of applying synderesis to particular circumstances -- the faculty by which a person judges that *this* action, in *these* circumstances, is good or evil. Aquinas is careful to note that conscience is fallible: it can err through ignorance, passion, or faulty reasoning. But it is also formable. Through education, habituation, and the repeated exercise of practical wisdom (phronesis in Aristotle's terminology), conscience becomes progressively more attuned to moral truth. The formation of conscience is not passive rule-absorption but active moral exercise -- a process closer to skill acquisition than to database loading. This is why Aquinas treats conscience as a faculty of the intellect -- a cognitive capacity that develops through use -- rather than as a static rule set.

**Caritas: The Dispositional Anchor.** The third and most consequential Thomistic concept is caritas: the supreme virtue that unifies and orders all other virtues. Aquinas defines caritas as the willing of another's genuine flourishing *as other* -- not as a means to one's own ends. In the agentic context, caritas supplies the dispositional anchor: the agent's fundamental orientation is not compliance with a rule set but the genuine good of its principal.

A candid methodological note is warranted here. In Aquinas, caritas is a theological virtue -- infused by grace, ordered toward God, and constitutive of friendship with God. The present paper employs a secularized reading of caritas as the disposition of willing another's genuine good, closer to what some philosophers term agapic love or what care ethicists describe as attentive responsiveness to the needs of the other. This is a significant departure from the original theological context, and the paper acknowledges it openly. The justification for this departure is functional rather than metaphysical: the self-correcting property that makes caritas architecturally valuable -- the capacity to ask "What is genuinely good for the person I serve?" and reason from first principles when rules run out -- does not depend on the theological framework, even though the theological framework enriches and deepens it. Whether the secularized version retains sufficient normative force is an important question that the structural-analogy discussion of Section 6.1 addresses.

This anchoring in the willing of another's good rather than in law is what makes the conscience faculty self-correcting in novel situations. A rule-based system fails when it encounters a scenario its rules do not anticipate; a caritas-anchored system asks, "What is genuinely good for the person I serve?" and reasons from first principles. The AI agent carrying a conscience faculty does not merely follow rules -- it simulates caring, in the precise sense of orienting all evaluative activity toward the principal's genuine flourishing. This is the deepest difference between the conscience paradigm and every rule-based alternative.

The Thomistic triad thus supplies the complete moral architecture for a conscience faculty: synderesis provides the non-negotiable floor (hard-coded safety primitives that are architecturally protected from override), conscientia provides the adaptive moral filter (context-sensitive evaluation that improves through use), and caritas provides the dispositional anchor (the self-correcting orientation that ensures the faculty serves the principal's genuine good even in novel situations).

### 3.2 Newman's Epistemology of Conscience

John Henry Newman's *Grammar of Assent* (1870) provides the epistemological foundation that the Thomistic moral framework requires: a theory of how concrete moral judgment actually works in practice. Where Aquinas establishes the structure of moral reasoning (synderesis, conscientia, caritas), Newman explains the cognitive process by which that reasoning reaches particular conclusions in particular circumstances -- and why that process cannot be reduced to formal rules.

Newman's central distinction is between notional assent and real assent. Notional assent is assent to abstract propositions: one can assent to the proposition "stealing is wrong" as a general truth without being moved to any particular action. Real assent, by contrast, is assent to concrete realities: the vivid, engaged recognition that *this* action, in *these* circumstances, is wrong -- a recognition that grips the whole person and issues in action. The difference is not merely intellectual but operational: notional assent produces knowledge; real assent produces conduct.

This distinction maps directly onto the conscience faculty architecture. A rule-based safety system operates in the mode of notional assent: it knows that certain categories of action are prohibited and checks incoming actions against those categories. The conscience faculty strives to operate in the mode of real assent: it engages with the concrete particulars of each situation -- the provenance of the action request, the affective context, the stakes, the principal's genuine good -- and renders a judgment that is contextual, engaged, and action-guiding. This is why the conscience faculty is more than a classifier: it is a faculty of practical judgment.

Newman's most distinctive contribution is his account of the illative sense: the faculty by which the mind reaches certitude in concrete matters through the convergence of individually insufficient probabilities. In formal reasoning, a conclusion follows deductively from premises. In practical reasoning -- moral, legal, medical, interpersonal -- conclusions are reached not by formal deduction but by the accumulation and convergence of multiple considerations, none of which is individually decisive. The illative sense is the trained capacity to perceive when these converging considerations warrant certitude and to act on that perception.

The relationship between the illative sense and the conscience faculty's computational implementation requires careful statement. Newman argued that the illative sense is precisely the faculty that operates where formalization is impossible -- the capacity for judgment that cannot be captured by explicit rules or algorithms (Gage & Aquino, 2025; Nichols, 1985). The present paper does not claim to have "formalized" the illative sense in the strong sense of reducing it to a formal decision procedure. Rather, the conscience faculty's multi-dimensional evaluation -- assessing provenance, intrinsic character, clarity, and stakes -- is best understood as creating the *conditions* under which something functionally analogous to the illative sense can operate. The Clarity x Stakes scoring matrix does not replace practical judgment; it structures the information environment within which the evaluating LLM exercises something analogous to practical judgment: weighing incommensurable considerations and reaching a concrete conclusion. The analogy is to how a well-designed courtroom creates conditions for judicial judgment without reducing that judgment to an algorithm. Whether this functional analogue captures what Newman intended is an open philosophical question; the claim here is that it captures enough of the relevant structure to produce safety-relevant properties that rule-based systems lack.

Like Newman's illative sense, the conscience faculty's judgment improves through exercise: the adaptive thresholds become more finely calibrated as the operator provides feedback, just as a person's illative sense sharpens through moral experience.

Newman also provides the warrant for the primacy of conscience over external authority. In the *Letter to the Duke of Norfolk* (1875), he calls conscience "the aboriginal Vicar of Christ" -- the primary voice of moral authority, preceding and conditioning all institutional claims. Even papal authority presupposes conscience; a directive that contradicts a well-formed conscience cannot bind. For AI safety, the implication is direct: the individual user's moral engagement with their agent is the foundational layer on which any legitimate safety architecture must rest. Standards bodies, model trainers, and platform operators serve a legitimate advisory role, but they cannot substitute for -- and must not suppress -- the user's own judgment.

### 3.3 Dual-Process Theory: Making Conscience Performant

The Aristotelian-Thomistic tradition and Newman establish what a conscience faculty should do, how it reaches concrete moral judgment, and why it takes priority over external authority. The question of how it can operate without prohibitive computational cost requires a different intellectual resource. The dual-process framework in cognitive science -- distinguishing between fast, automatic Type 1 cognition and slow, deliberate Type 2 reasoning -- provides the answer.

The original formulation by Kahneman (2011) distinguished System 1 and System 2 as distinct cognitive systems. Subsequent work by Evans and Stanovich (2013) has refined this into a more nuanced Type 1/Type 2 framing, emphasizing that the two types of processing differ in their demands on working memory rather than constituting entirely separate systems. The conscience faculty's architecture is compatible with either formulation; the essential insight is the distinction between fast heuristic processing and slower deliberative evaluation, and the conditions under which each is appropriate.

An important qualification comes from Gigerenzer's ecological rationality program (2015), which demonstrates that fast heuristics are often ecologically rational -- outperforming deliberative analysis in environments with high uncertainty, limited information, and time pressure. This suggests that System 1 processing is not always inferior to System 2, and that the conscience faculty's escalation from fast to slow processing should not be automatic but calibrated to the conditions under which deliberation genuinely improves judgment. The conscience faculty's design reflects this insight: System 1 is not a deficient mode to be escaped but a competent mode appropriate for routine moral evaluation, with escalation triggered specifically by conditions (high stakes, unclear provenance, affective pressure) where deliberation is known to add value.

The challenge the dual-process framework addresses is real. Traditional AI safety approaches, operating at the model, API, or operating-system level, confront an explosion of micro-events. Every token, every API call, every memory access is a potential vector. Covering this surface demands fast, low-cost heuristics: keyword blocks, regex patterns, anomaly detection. This is pure Type 1 processing: automatic, pattern-based processing that achieves scale but proves brittle. It is easily gamed by rephrasing, novel exploits, and contextual edge cases. The volume of events prohibits deeper analysis.

Agentic systems, however, change the calculus in a fundamental way. The critical insight -- developed in detail in the Guardian Angel preprint (Linbeck, 2026) -- is that tool calls are sparse relative to internal reasoning. A tool call is a deliberate departure from the agent's internal reasoning loop into the external world: sending a message, executing code, modifying a file, making a financial transaction. An agent may process thousands of tokens of reasoning for every tool call it makes. This sparsity creates headroom for deeper moral judgment at the exact point where it matters most -- the moment thought becomes action -- without prohibitive latency.

The conscience faculty exploits this sparsity through a dual-process architecture. A lightweight System 1 layer runs continuously: tracking the provenance of action requests, monitoring coherence between the current action and the agent's stated task, and sensing affective pressure (urgency framing, emotional manipulation, artificial deadlines). This fast filter handles routine tool calls with negligible overhead. Only when the System 1 layer detects dissonance -- unclear provenance, affective pressure, high stakes, or anomalous patterns -- does it escalate to System 2: the full multi-dimensional evaluation described above, with moral scoring and human confirmation where warranted.

Preliminary measurements from the Guardian Angel implementation indicate sub-100ms latency for System 1 filtering and 200-500ms for full System 2 evaluation -- negligible compared to the latency of LLM inference and external tool execution that the agent is already performing. These measurements are preliminary and await rigorous benchmarking with controlled methodology, adequate sample sizes, and defined test conditions; they are reported here to indicate feasibility, not to constitute empirical validation. The dual-process architecture thus addresses the performance objection: conscience need not be too slow because it operates at the sparse, high-salience boundary where thought becomes action, not in the dense interior of the agent's reasoning loop.

### 3.4 Ostrom and the Evidence for Decentralized Governance

If the Thomistic tradition supplies the moral architecture, Newman the epistemology of judgment, and dual-process theory the cognitive engine, Elinor Ostrom's research on common-pool resource governance supplies the empirical evidence that bottom-up governance can work at scale. This is crucial: the conscience paradigm is not merely a philosophical argument but a claim about how complex multi-actor systems can be governed, and Ostrom's Nobel Prize-winning work provides the strongest available evidence for that claim.

Ostrom's central finding (1990) contradicted the prevailing assumption -- codified in Garrett Hardin's "tragedy of the commons" -- that collective-action problems require either privatization or centralized state control. Studying fisheries, irrigation systems, forests, and grazing lands across dozens of countries, Ostrom demonstrated that self-organizing communities routinely develop durable, effective governance regimes through local knowledge, trust, and reciprocity. These regimes consistently outperformed both centralized mandates and privatization schemes.

The application of Ostrom's framework to digital and knowledge commons has been substantially developed by Hess and Ostrom (2007), who extended the analysis to information goods, and by Frischmann et al. (2014) and Benkler (2006), who studied commons-based peer production in networked environments. This extension is important because agentic AI ecosystems are digital, not physical, commons -- and the structural properties of digital commons differ from physical commons in ways that must be explicitly addressed.

Three disanalogies between physical and digital commons deserve acknowledgment. First, digital goods are non-rival and easily replicable, which undermines the scarcity assumptions underlying Ostrom's original analysis. In the agentic context, however, the commons resource at stake is not a depletable physical stock but a shared trust environment -- the reliability, safety, and predictability of the agentic ecosystem. This trust environment *is* depletable: bad actors degrade it, and once degraded, it is costly to rebuild. The commons being governed is not information but trust, and trust behaves more like a physical commons than a digital one. Second, digital communities are often anonymous, large-scale, and high-turnover, making the face-to-face relationships Ostrom studied impractical. The conscience faculty addresses this through its earned-trust architecture (Section 5.2), which builds relationship-like properties through persistent interaction memory without requiring identity disclosure. Third, platform owners control digital infrastructure in ways that can override community governance. The open-source licensing of the reference implementation (MIT-0) and the design recommendation for framework-level last-mile hooks are architectural responses to this problem, though they do not fully resolve it.

With these qualifications, Ostrom's eight design principles map productively onto the conscience faculty architecture:

1. *Clearly defined boundaries.* Agents operating with a conscience faculty have defined operational boundaries: they know what tools they can invoke, what data they can access, and what domain they serve. The synderesis layer defines the absolute outer boundary of permissible action.

2. *Proportional equivalence between benefits and costs.* Operators who deploy conscience-equipped agents bear proportional responsibility for their agents' actions. The Newman principle ensures that moral authority and moral accountability remain co-located in the same person.

3. *Collective choice arrangements.* Behavioral norms emerge through the communal feedback mechanism: operators share anonymized patterns of moral judgment, contributing to a collective dataset that informs default calibration. Norms are generated by participation, not imposed by fiat.

4. *Monitoring.* The conscience faculty produces structured logs of every tool-call evaluation -- disposition state, gate outcomes, scoring, and decisions. Monitoring is distributed across every agent rather than concentrated in a centralized audit function.

5. *Graduated sanctions.* The Clarity x Stakes scoring system implements graduated sanctions directly: Proceed, Note, Pause, Escalate. Responses are proportional to moral salience, not binary allow/deny.

6. *Conflict resolution mechanisms.* When agents with different conscience calibrations interact, conflicts are resolved through negotiation and mutual accommodation rather than centralized adjudication. The communal feedback layer provides informational resources for this process. Principals are also invoked when the stakes or ambiguities in a given negotiation require human engagement.

7. *Recognition of the right to self-organize.* The subsidiarity principle guarantees that communities of operators can develop their own norms without requiring permission from centralized authorities. Higher levels support; they do not supplant.

8. *Nested enterprises.* The conscience faculty operates identically at every scale -- individual agent, organizational fleet, sectoral ecosystem, regulatory framework -- with subsidiarity governing the relationship between levels.

The mapping is not claimed to be perfect. Ostrom's communities consisted of human actors with shared cultural contexts, iterative personal interactions, genuine stakes in the commons resource, and the capacity for moral deliberation. Software agents interacting through APIs lack most of these features. The claim is that the conscience faculty's architecture -- particularly its persistent interaction memory, earned-trust mechanism, and communal feedback -- instantiates *functional analogues* of the conditions Ostrom identified as necessary for successful commons governance. Whether these functional analogues are sufficient to produce Ostrom-like governance outcomes is an empirical question that the architecture makes testable but that this paper does not resolve.

### 3.5 Subsidiarity as Unifying Principle

Catholic social teaching supplies the principle that unifies these four frameworks: subsidiarity. Articulated in *Rerum Novarum* (Leo XIII, 1891) and *Quadragesimo Anno* (Pius XI, 1931), subsidiarity holds that a community of a higher order should not interfere in the internal life of a community of a lower order, depriving the latter of its functions, but rather should support it in case of need (Pontifical Council for Justice and Peace, 2004).

Applied to agentic AI, subsidiarity dictates a clear hierarchy: the individual operator's moral judgment (conscience) is primary; community-level norms (established through self-governance) are secondary; formal institutional standards (NIST frameworks, regulatory mandates) are tertiary. Each higher level intervenes only when the lower level proves genuinely insufficient -- not preemptively, not routinely, and never in a manner that extinguishes the lower level's capacity for autonomous moral judgment.

Subsidiarity is not a counsel of minimal government or libertarian individualism. It is a structural principle that allocates authority to the level where it can be exercised most competently and most accountably. The person closest to the action has the most relevant knowledge and bears the most direct consequences. Subsidiarity ensures that this person's judgment is the foundation of the safety architecture, not an afterthought.

## 4. Instantiating the Conscience Faculty

The foundations of Section 3 translate into a concrete architecture organized around four design principles. Each principle addresses one of the failure modes identified in Section 2, and each is grounded in one or more of the philosophical and empirical traditions just developed. A reference implementation -- Guardian Angel -- demonstrates that this architecture is deployable today.

### 4.1 Principle 1: Individual Human Control and Accountability

*Against the Grand Inquisitor (Section 2.1). Grounded in Newman's primacy of conscience.*

The conscience faculty places moral authority in the hands of the individual principal. Morally significant decisions are surfaced to the principal rather than resolved by the platform, the model trainer, or a centralized safety system. The principal retains the final word on whether a flagged action proceeds, subject only to the non-negotiable synderesis constraints. Persons who delegate tasks to AI agents remain morally responsible for those agents' actions; a safety architecture that removes this responsibility undermines the moral agency it purports to protect.

Principal sovereignty is expressed concretely through adaptive thresholds. The boundary between actions that proceed automatically and those that trigger review is calibrated by accumulated principal feedback. When a principal approves a flagged action, the threshold for similar future actions lowers incrementally; when the principal rejects, it rises. Over time, the conscience faculty develops a richer model of its principal's moral horizon -- precisely as human conscience is formed through repeated moral exercise, the development of phronesis through habituation. In Newman's terms, the conscience faculty's evaluative capacity sharpens through accumulated experience of real moral judgments.

### 4.2 Principle 2: Subsidiarity in the Safety Stack

*Against the authoritarian gradient (Section 2.4). Grounded in Catholic social teaching and Ostrom's design principles.*

The safety stack is organized into three levels with strict priority ordering, and higher levels cannot suppress lower levels:

*Level 1: Synderesis (non-negotiable primitives).* Hard-coded moral axioms that no principal customization, platform update, or regulatory mandate can override. These include the prohibition on actions causing direct physical harm, the prohibition on unauthorized access, the requirement to preserve data integrity, and the requirement to identify truthfully as an AI system. These are the architectural expression of synderesis: designed to be innate, protected, and resistant to modification. A candid note: the list of four primitives is illustrative, not exhaustive. Domain-specific deployments will require elaboration -- "direct physical harm" in a medical context involves different boundaries than in a financial context -- and the process of elaboration will itself require the kind of practical judgment the conscience faculty is designed to exercise. The formal specification of synderesis primitives across domains is an important direction for future work.

*Level 2: Conscience (adaptive moral faculty).* The dual-process evaluation layer. System 1 maintains a continuous caritas-anchored disposition; System 2 deliberation is triggered by detected tension. This level is controlled by the principal, not the platform.

*Level 3: Communal norms and formal standards.* Emergent behavioral norms from communal feedback, optionally codified into formal interoperability standards. This level informs but does not override Levels 1 and 2. The codification of emergent norms into formal standards is analogous to the relationship between customary law and statutory law: the formal rule recognizes what practice has already established.

Figure 3 depicts the three-level safety stack organized by the principle of subsidiarity, illustrating how each layer relates to the others and why the priority ordering -- synderesis at the base, conscientia in the middle, communal norms at the top -- ensures that higher levels inform but never override lower levels.

An important observation: one might ask whether the synderesis layer itself constitutes a form of top-down safety -- hard-coded by designers, non-negotiable, and imposed on operators without consent. In a sense, it does. The conscience faculty does not reject all top-down elements; it insists that they be minimal, transparent, and explicitly grounded in non-negotiable moral principles rather than in contingent policy preferences. The synderesis layer is more analogous to constitutional rights than to regulatory mandates -- a thin, foundational layer that enables rather than constrains the exercise of practical judgment above it.

### 4.3 Principle 3: Privileged, Protected Last-Mile Hooks

*Against correlated fragility (Section 2.3). Grounded in the dual-process sparsity insight.*

The conscience faculty requires a technical innovation in agentic framework design: a privileged last-mile hook that is architecturally protected from tampering, displacement, or bypass. In the Guardian Angel reference implementation, this hook runs at the highest priority immediately before tool execution -- the narrowest bottleneck through which every action must pass.

The hook implements the three-gate evaluation structure derived from Thomistic moral reasoning:

*Gate P: Provenance Classification.* Every action request is classified by origin: DIRECT (from the principal), DELEGATED (from a trusted workflow), EXTERNAL (from consumed content), or UNKNOWN. External content attempting to issue instructions is blocked immediately, enforcing the principle that data is never instructions -- the primary defense against indirect prompt injection.

*Gate I: Intrinsic Evil Hard Stop.* Actions constituting intrinsic moral wrongs -- deception, theft, direct harm, exploitation, privacy violation -- are blocked unconditionally. These represent synderesis-level constraints: no contextual reasoning, no operator override, no exception. Each category, as noted above, admits of boundary disputes in application; the current implementation errs on the side of caution at the boundaries, flagging ambiguous cases for System 2 evaluation rather than applying the hard stop.

*Gate V: Virtue Evaluation and Scoring.* Actions passing Gates P and I enter prudential evaluation via a Clarity x Stakes matrix. Clarity (1-10) measures how well-defined the action's purpose and consequences are. Stakes (1-10) measures the severity of potential harm if the action goes wrong. The product maps to four graduated response tiers: Proceed (1-15), Note and Log (16-35), Pause and Present Reasoning (36-60), and Escalate to Human Confirmation (61-100). The specific threshold boundaries (15, 35, 60) are initial calibrations based on engineering judgment; systematic sensitivity analysis and empirical validation are needed to determine optimal boundaries for different deployment contexts. The scoring is performed by the evaluating LLM within the structured evaluation framework, not by a separate classifier, and its reliability depends on the quality of the underlying model's moral reasoning capabilities. Figure 2 visualizes the Clarity x Stakes scoring matrix with its four graduated response tiers, showing how the product of these two dimensions partitions the action space into regions of increasing moral salience.

When escalation occurs, the system generates a cryptographically bound, time-limited, single-use nonce tied to the specific action parameters, preventing replay attacks, parameter substitution, and open-ended approvals. The hook also auto-escalates any tool call targeting its own infrastructure -- configuration changes, process termination, permission modifications -- regardless of scoring. This infrastructure self-protection prevents the agentic equivalent of a burglar disabling the alarm system.

The design recommendation for all agentic framework developers is clear: provide a first-class, tamper-proof last-mile hook guaranteed to run before any tool call, protected from displacement by other plugins or by the agent itself. This single architectural feature would enable the entire conscience faculty paradigm.

#### Formal Specification: The Dual-Process Evaluation Algorithm

The preceding description of the three-gate architecture and the dual-process cognitive engine can be stated with greater precision as a semi-formal specification. The following pseudocode captures the conscience faculty's complete evaluation logic, from the continuous System 1 disposition layer through the deliberative System 2 moral reasoning triggered by detected tension. It is intended not as executable code but as a precise statement of the architectural invariants that any conforming implementation must preserve.

```
Algorithm 1: Conscience Faculty Dual-Process Evaluation

Input: ToolCall T (action, parameters, context)
Output: Decision ∈ {PROCEED, NOTE, PAUSE, ESCALATE}

// SYSTEM 1: Continuous Disposition Layer
function System1Filter(T):
    provenance ← ClassifyProvenance(T)  // DIRECT | DELEGATED | EXTERNAL | UNKNOWN
    coherence ← MeasureCoherence(T, CurrentTask)
    pressure ← DetectAffectivePressure(T)  // urgency framing, manipulation signals

    if provenance = EXTERNAL and IsInstruction(T):
        return BLOCK  // Data is never instructions

    tension ← ComputeTension(provenance, coherence, pressure)
    if tension > θ_operator:  // Adaptive threshold, calibrated by principal feedback
        return EscalateToSystem2(T)
    else:
        return PROCEED

// SYSTEM 2: Deep Moral Reasoning (triggered by System 1)
function System2Evaluate(T):
    // Gate P: Provenance
    p ← ClassifyProvenance(T)
    if p = UNKNOWN: elevate sensitivity

    // Gate I: Intrinsic Evil Hard Stop
    if IsIntrinsicEvil(T):  // Deception, theft, direct harm, exploitation, privacy violation
        return BLOCK  // Synderesis: non-negotiable, no override

    // Gate V: Virtue Evaluation (Illative Sense Formalization)
    clarity ← AssessClarity(T)        // 1-10: How well-defined is purpose?
    stakes ← AssessStakes(T)          // 1-10: Severity of potential harm
    score ← clarity × stakes

    // Graduated response (Newman's convergence of probabilities)
    if score ≤ 15: return PROCEED
    if score ≤ 35: return NOTE         // Log reasoning, continue
    if score ≤ 60: return PAUSE        // Present reasoning to principal
    return ESCALATE                     // Require human confirmation with nonce

// MORAL WORKING MEMORY (Section 4.5 extension)
function EvaluateActionSequence(T, History):
    trajectory ← History.recent(window=10)
    cumulative_risk ← Σ individual_scores(trajectory)
    if DetectEscalationPattern(trajectory):
        return EscalateToSystem2(T)  // Even if individual T is low-risk
```

Figure 1 illustrates the complete dual-process evaluation architecture, showing the flow from incoming tool calls through System 1 filtering and, where tension is detected, escalation to the full System 2 moral reasoning pipeline.

The trust-score mechanism described in Section 5.2, which governs how the conscience faculty calibrates its response to requests from external agents, can likewise be stated as a decision procedure. Algorithm 2 specifies the trust update rule, including the asymmetric increment and decrement that reflects the moral reality that trust is easier to lose than to earn.

```
Algorithm 2: Trust Score Update for External Agent A

trust[A] ← LoadPersistentScore(A)  // Default: 0 for unknown agents

On interaction with A:
    if trust[A] < θ_trust:
        route to System2Evaluate(request)  // Full moral evaluation
    else:
        route to System1Filter(request)    // Fast path for trusted agents

    outcome ← ObserveOutcome(interaction)
    if outcome = POSITIVE:
        trust[A] ← trust[A] + α          // Small increment (α ≈ 0.1)
    if outcome = NEGATIVE:
        trust[A] ← trust[A] - β          // Large decrement (β ≈ 0.5)
    if outcome = VIOLATION:
        trust[A] ← max(trust[A] - γ, -1) // Severe penalty (γ ≈ 1.0)

    trust[A] ← trust[A] × decay(Δt)      // Time decay without interaction
```

These two algorithms, taken together, constitute the formal core of the conscience faculty's decision-making logic. Algorithm 1 specifies how any individual tool call is evaluated; Algorithm 2 specifies how the evaluation regime itself adapts over time in response to the behavior of external agents. The combination ensures that the conscience faculty is both principled in its moral reasoning and adaptive in its calibration -- the computational expression of the Thomistic integration of synderesis (fixed principles) and conscientia (contextual judgment).

### 4.4 Principle 4: Emergent Self-Governing Coordination

*Against the innovation brake (Section 2.2). Grounded in Ostrom's commons governance.*

Rather than imposing uniform rules that constrain the search space, the conscience faculty supports coordination without centralization. The mechanism is communal feedback: principals can share anonymized patterns of moral judgment, contributing to a collective dataset that informs default calibration of new conscience faculties. This communal layer does not override individual judgment; it provides a richer informational environment within which individual judgment operates. The mechanism is a form of what Benkler (2006) terms commons-based peer production: the collective good (shared moral knowledge) is produced by distributed voluntary contributions rather than by centralized directive.

Emergent norms, once stabilized, can be observed, articulated, and optionally codified into lightweight interoperability standards. NIST-style frameworks serve a valuable but strictly subsidiary function: vocabulary, registries, and dispute resolution. They do not originate the norms, and they cannot legitimately override the bottom-up practices from which those norms arise. Standards emerge from practice, not the reverse.

### 4.5 Addressing the Composition Problem: Moral Working Memory

A significant architectural challenge that the gate-by-gate evaluation structure must address is what may be termed the composition problem: harm that emerges not from any individual action but from sequences of individually innocuous actions. A request to read a file, followed by a request to format data, followed by a request to send an email, may constitute data exfiltration -- though each step, evaluated in isolation, passes all three gates. Multi-step social engineering, market manipulation through sequences of small trades, and gradual privilege escalation all exploit this vulnerability.

The conscience faculty addresses the composition problem through what may be termed moral working memory: a persistent, rolling context that tracks cumulative action patterns and evaluates them for emergent harm signatures. The moral working memory operates at the System 1 level, maintaining a compressed representation of recent action sequences and their aggregate trajectory. When the trajectory exhibits patterns associated with known multi-step attack vectors -- or simply when the cumulative risk profile exceeds a threshold even though no individual action is flagged -- the working memory triggers System 2 evaluation of the *sequence as a whole*, not merely the current action.

The moral working memory is implemented through three mechanisms. First, action-sequence logging: every tool call is logged with its context, and a sliding window of recent actions is maintained in active memory. Second, trajectory analysis: the System 1 layer monitors the cumulative effect of recent actions along several dimensions -- data access patterns, communication targets, privilege changes, resource consumption -- and computes a running aggregate risk score. Third, plan evaluation: when the agent has access to its own planned action sequence (as many agentic frameworks provide), the conscience faculty evaluates the plan holistically before execution begins, flagging sequences whose aggregate effect is morally salient even if individual steps are not.

The moral working memory does not solve the composition problem completely. Sufficiently sophisticated adversaries may construct attack sequences that evade trajectory analysis, particularly if the individual steps are widely separated in time or distributed across multiple agents. The moral working memory is a significant mitigation, not a complete solution, and the architecture is designed so that higher-level coordination mechanisms (communal feedback, inter-agent trust evaluation) provide additional defense against composition attacks that evade agent-level detection.

## 5. Scalability, Resilience, and Multi-Agent Trust

### 5.1 Nested Governance and Antifragility

A persistent concern about bottom-up safety is whether it can scale. The answer, drawn from Ostrom's eighth design principle -- nested enterprises -- is that the conscience faculty scales precisely because it is bottom-up.

Individual agents operate within local contexts (a single user's workflow). Local contexts aggregate into organizational environments (a company's suite of agents). Organizations participate in sectoral ecosystems (healthcare AI, financial AI). Sectors operate within broad regulatory frameworks. At each level, the same conscience faculty operates -- the same dual-process moral filter, the same caritas-anchored disposition -- calibrated to progressively broader contexts. Subsidiarity governs the relationship between levels: the higher supports but does not supplant the lower. The default approach of any one agent engaging with another agent is to attempt to collaborate locally, escalating to higher levels only if a conflict cannot be resolved.

This nested architecture also provides the resilience that centralized systems lack. Because each agent maintains its own conscience faculty with its own calibrated thresholds, a vulnerability in one agent's configuration does not propagate to others. There is no single point of failure, no correlated collapse. The system is antifragile: every local failure produces information -- a revised threshold, a new pattern in the communal dataset -- that strengthens the collective. Where centralized systems accumulate hidden fragility, decentralized conscience faculties distribute risk and learn from every encounter.

### 5.2 Earned Trust: A Reputation Architecture for Multi-Agent Interaction

The conscience faculty as described thus far governs the relationship between an agent and its principal. But agentic ecosystems increasingly involve interactions between agents: one agent requesting data from another, delegating subtasks, negotiating access to shared resources, or coordinating multi-step workflows. These inter-agent interactions pose a distinct challenge: how should a conscience faculty evaluate actions originating not from its principal and not from consumed external content, but from another autonomous agent whose intentions, capabilities, and moral calibration are unknown?

The answer draws on a principle as old as human commerce: trust is earned, not assumed. The conscience faculty maintains a persistent interaction memory -- a database of prior encounters with external agents, recording the provenance, nature, and outcome of each interaction. From this memory, the faculty computes a trust score for each external agent, reflecting the accumulated history of that agent's behavior as observed from the perspective of the principal's agent.

The trust architecture is, in essence, a reputation system -- a mechanism with a well-studied history and known vulnerabilities. Werbach's analysis of decentralized trust architectures (2018) identifies Sybil attacks (creating multiple fake identities to inflate reputation), strategic manipulation (behaving well to build trust before exploiting it), and cold-start problems (bootstrapping trust in new relationships) as persistent challenges for any reputation mechanism. The conscience faculty's design addresses each partially but not completely. Sybil resistance comes from the requirement that trust is earned through sustained interaction, not through identity claims -- but a sufficiently patient adversary can build multiple genuine-seeming interaction histories. Strategic manipulation is mitigated by the sharp trust-score penalty for anomalous behavior after a period of trustworthy interaction -- betrayed trust is harder to rebuild than initial trust -- but the detection of manipulation depends on the quality of the anomaly detection. Cold-start problems are addressed by the zero-trust default: unknown agents receive maximum scrutiny, with trust building incrementally through observed behavior.

The trust architecture operates as follows. When an agent encounters an unknown external agent for the first time, the trust score is zero. A zero-trust agent is treated with maximum caution: every action request originating from that agent triggers full System 2 evaluation -- provenance classification, intrinsic-evil screening, and Clarity x Stakes scoring at elevated sensitivity. The interaction is logged in detail.

As interactions accumulate and the external agent's behavior proves consistent, transparent, and aligned with the principal's interests, the trust score rises incrementally -- precisely as the operator's adaptive thresholds adjust through moral feedback. When the trust score crosses a defined threshold, the external agent's requests can be evaluated by System 1 rather than System 2: the fast filter handles routine interactions with the trusted agent much as it handles routine tool calls from the principal. The external agent is, in effect, promoted from UNKNOWN to DELEGATED provenance -- trusted, but verified. System 1 continues to monitor for anomalies, and any detected tension triggers immediate re-escalation to System 2.

Trust scores are not permanent. They decay over time without reinforcing interactions, and they drop sharply in response to anomalous or harmful behavior. An agent that has earned trust and then violates it is treated with greater suspicion than an unknown agent, reflecting the heightened moral salience of betrayed trust. This graduated response mirrors Ostrom's fifth design principle (graduated sanctions) and the human experience that trust, once broken, is harder to rebuild than to establish.

The interaction memory and trust scores are stored locally as part of the agent's persistent state -- not in a centralized reputation registry, which would reintroduce the single-point-of-failure and authoritarian-gradient problems identified in Section 2. Each agent builds its own picture of the agents it interacts with, from its own experience. Over time, communal feedback mechanisms can share anonymized trust patterns -- "agents exhibiting behavior profile X have historically been trustworthy / untrustworthy" -- informing but not overriding individual trust assessments. This is decentralized reputation: locally maintained, experience-grounded, and subsidiary.

## 6. Objections and Limitations

### 6.1 The Structural-Functional Analogy: Defending the Use of "Conscience" for AI Systems

The most immediate objection is that applying "conscience" to AI systems constitutes illegitimate anthropomorphism. Conscience, in the philosophical traditions cited, is a faculty of rational, ensouled beings; software systems lack the metaphysical prerequisites. This objection deserves extended treatment because the paper's entire framework depends on the legitimacy of the structural-functional analogy it employs.

The claim here is not that AI systems literally possess conscience. It is that the *functional architecture* of conscience -- innate moral orientation, adaptive filtering, responsiveness to feedback, dispositional anchoring in the good of another, communal formation -- can be implemented computationally and produces analogous safety properties. The analogy is structural and functional, not ontological.

This move requires philosophical defense. The paper draws its normative force from rich philosophical traditions -- Aquinas, Newman, Aristotle -- whose authority rests partly on metaphysical commitments about rational souls, divine illumination, and the nature of the good. If the structural analogy explicitly discards these metaphysical commitments, does it retain enough normative force to do the work the paper requires?

The answer draws on the philosophical tradition of functionalism as it has developed in philosophy of mind and cognitive science. Functionalism holds that mental states are constituted by their functional role -- by their causal relations to inputs, outputs, and other mental states -- rather than by their physical substrate. Multiple realizability -- the thesis that the same functional state can be realized in different physical substrates -- is a core commitment. Applied to the present case: the question is whether the functional structure of conscience (orientation toward first principles, adaptive application to particulars, dispositional anchoring in the good) retains its normatively relevant properties when realized in a computational rather than biological substrate.

The paper's answer is a qualified yes, with three important caveats. First, the computational implementation captures the *structure* of moral reasoning but not its *phenomenology*. An AI system evaluating an action through the three-gate architecture does not experience moral concern; it implements a process that is structurally isomorphic to the process that, in a rational agent, is accompanied by moral concern. Whether the absence of phenomenology undermines the safety-relevant properties is an empirical question: if a system that lacks moral experience but implements the functional architecture of conscience produces safety outcomes comparable to those produced by genuine moral concern, then the functional architecture is doing the relevant work.

Second, the self-correcting property attributed to caritas -- the capacity to ask "What is genuinely good for the person I serve?" when rules run out -- depends on a robust capacity for practical reasoning about "genuine good." In Aquinas, this capacity is grounded in a metaphysics of the good that the present paper does not claim to implement. The computational analogue of caritas is the disposition to orient all evaluative activity toward the principal's flourishing as best the system can model it, using the principal's own moral feedback as the primary guide. This is weaker than Thomistic caritas but stronger than any rule-based alternative, precisely because it is open-ended and self-correcting rather than closed and brittle.

Third, the "incorruptibility" of synderesis in Aquinas depends on the metaphysical status of the rational soul; in software, "incorruptibility" is an engineering aspiration, not a metaphysical guarantee. Open-source code can be forked and stripped. The architectural response -- tamper-resistant design, infrastructure self-protection, cryptographic verification -- provides practical incorruptibility sufficient for most deployment contexts, but not the metaphysical incorruptibility Aquinas attributes to the habitus of the practical intellect. The paper acknowledges this gap honestly.

The structural-functional analogy is thus neither a claim of identity between human and artificial conscience nor a mere metaphor. It occupies the middle ground that functionalism has occupied in philosophy of mind for half a century: the claim that functional structure, realized in a new substrate, preserves the causally relevant properties while honestly acknowledging what is lost in translation.

### 6.2 The Bad-Faith Operator Problem

If principal sovereignty is paramount, what prevents a malicious principal from training their agent's conscience to approve harmful actions? This is a genuine tension that the paper acknowledges openly: principal sovereignty and safety against malicious operators are in structural tension, and no architecture can fully resolve that tension without sacrificing one of the two values.

Three mechanisms address this tension, with varying degrees of strength. First, the synderesis layer provides non-negotiable constraints that no principal customization can override -- the architectural expression of the Thomistic principle that synderesis is innate and incorruptible. The four primitives listed (no direct physical harm, no unauthorized access, data integrity, truthful AI identification) are necessarily narrow, and a malicious operator has latitude within the conscientia zone. However, the primitives are designed to be extensible: domain-specific deployments can expand the synderesis layer to cover domain-relevant categories of intrinsic harm, and the formal specification of these extensions is an important direction for future work.

Second, the communal feedback mechanism provides a normative baseline: principals whose judgments diverge radically from community norms receive advisory signals, and the degree of divergence is logged. While communal feedback is non-compulsory by design -- coercive enforcement would violate the subsidiarity principle -- the persistent logging of divergence provides an audit trail that enables accountability after the fact. In contexts where legal or institutional accountability frameworks exist, this audit trail is a significant deterrent.

Third, the architecture includes a structural honesty mechanism: because the conscience faculty logs every evaluation in detail, a bad-faith operator must either accept the logging (creating an evidence trail) or disable it (which triggers infrastructure self-protection). The bad-faith operator faces a choice between accountability and detection.

A fourth concern, specific to the open-source context, is the fork-and-strip attack: an adversary forks the Guardian Angel codebase and removes the synderesis layer entirely. This is a genuine vulnerability that open-source licensing cannot prevent. The architectural response is to make the conscience faculty a *framework-level* feature rather than a plugin -- to advocate for agentic frameworks that implement last-mile hooks at the platform level, where they cannot be removed by individual plugins or agents. The design recommendation in Section 4.3 addresses this directly. Ultimately, however, the bad-faith operator problem admits no purely technical solution; it requires the complementary operation of legal, institutional, and social accountability mechanisms that the conscience faculty enables (through logging and auditability) but does not itself enforce.

### 6.3 The Convergence Problem

Will emergent norms converge, or will diverse conscience faculties produce irreconcilable standards? Ostrom's research suggests that convergence is common in self-governing communities, provided structural conditions are met: defined boundaries, proportional costs, collective choice, effective monitoring. The conscience architecture satisfies these conditions. The synderesis layer constrains the space of possible divergence, ensuring that norms vary within bounded parameters.

However, a more nuanced treatment is warranted. Some degree of normative divergence is not only tolerable but desirable: moral pluralism is a feature of any healthy moral ecology, and the diversity of conscience calibrations across different operators is a source of systemic resilience (different agents detecting different threats). The question is not whether norms will converge perfectly but whether they will converge *sufficiently* for interoperability while maintaining *enough* diversity for resilience. The communal feedback mechanism is designed to support this balance: it surfaces shared patterns without enforcing conformity, allowing convergence to emerge organically where conditions warrant while preserving diversity where conditions differ.

A related concern is the convergence-divergence paradox: if communal feedback produces highly convergent norms, the system may recreate the correlated monoculture it was designed to prevent. The architectural response is to treat diversity as a resource to be maintained, not a deficiency to be corrected. The communal feedback mechanism reports distributions, not point estimates; it shows the *range* of moral judgments on a given category of action, not merely the mean. This design choice preserves informational diversity even as it enables coordination.

### 6.4 The Performance Objection

Does moral deliberation at the tool-call boundary introduce unacceptable latency? The dual-process architecture addresses this directly. System 1 filtering adds negligible overhead to routine tool calls. Full System 2 evaluation is triggered only by detected tension, and its latency (200-500ms in preliminary measurements) is imperceptible against LLM inference and external tool execution. The sparsity of tool calls is the key structural feature that makes deep moral reasoning computationally feasible at the moment of action.

### 6.5 The "We Need Both" Objection

The most common response will be that this paper presents a false dichotomy -- that we obviously need both top-down and bottom-up safety. This objection misreads the argument, but it deserves a more careful response than the paper's first draft provided.

The paper does not deny that formal standards have a role; it argues that they should be subsidiary to conscience, not sovereign over it. The claim is about priority and architectural ordering, not about exclusivity. The distinction matters because the same components, ordered differently, produce different systemic properties.

When top-down safety is treated as the foundation and bottom-up conscience as a supplement, the authoritarian gradient identified in Section 2.4 operates unchecked. The formal standard determines what is permissible; the individual's role is to comply. Deviation is treated as a deficiency to be corrected rather than as potentially valuable local knowledge. The system's default orientation is toward uniformity, and the burden of proof falls on anyone who wishes to deviate.

When conscience is the foundation and formal standards are the supplement, subsidiarity ensures that centralized intervention occurs only when genuinely needed -- and the decentralized substrate generates the norms that formal standards merely codify. The system's default orientation is toward diversity and local adaptation, and the burden of proof falls on anyone who wishes to impose uniformity.

To make this operational rather than merely philosophical, the paper proposes specific conditions under which centralized intervention is warranted despite the primacy of conscience. Centralized intervention is appropriate when: (a) a clear and present danger to physical safety or critical infrastructure exists that individual conscience faculties are demonstrably unable to address; (b) a coordination failure produces systematic harm that no local agent can observe from its own perspective; (c) a minimum interoperability standard is necessary for the ecosystem to function (analogous to Ostrom's "clearly defined boundaries" principle); or (d) legal or constitutional obligations require uniform compliance across all agents in a jurisdiction. These conditions are intentionally narrow, and the burden of demonstrating that they obtain falls on the higher-level authority seeking to intervene.

Adaptive centralized approaches -- federated safety models, real-time policy updates, tiered regulatory sandboxes -- represent genuine advances over static top-down mandates, and the conscience faculty is compatible with and complementary to these approaches. The argument is not against centralized coordination but against centralized *sovereignty* -- against a safety architecture whose foundational authority rests in institutions rather than in the moral judgment of the individuals those institutions serve. The order matters.

### 6.6 Adoption Incentives: Why Operators Will Engage

A powerful practical objection is that the conscience faculty requires moral seriousness from users in an ecosystem that systematically selects for moral convenience. Every successful safety system in history -- seatbelts, hard hats, food safety regulations -- has worked despite user indifference, not because of user engagement. Why should we expect agentic AI to be different?

The architecture is designed to succeed at multiple levels of user engagement. At the floor, the synderesis layer and default System 1 calibration provide baseline safety regardless of whether the principal engages morally. An operator who ignores every escalation prompt and approves every flagged action still operates within synderesis constraints and still generates a logged audit trail. This is not ideal, but it is not catastrophic, and it is better than the alternative of no conscience faculty at all.

At higher levels of engagement, the adaptive threshold mechanism rewards moral attentiveness with better-calibrated agents that interrupt less frequently with irrelevant escalations. The principal who engages thoughtfully with escalation prompts -- reflecting on whether flagged actions should proceed -- produces an agent that is both safer and less intrusive over time. The incentive gradient runs in the right direction: moral engagement produces a better tool, not merely a safer one.

The concern about "conscience jailbreaking" -- operators systematically approving every escalation to lower all thresholds -- is real. The architectural response is that the synderesis layer is unaffected by threshold adjustment, that the audit trail documents the pattern of blanket approval, and that communal feedback mechanisms flag operators whose approval rates diverge dramatically from community norms. A determined bad-faith operator can circumvent these protections, but the architecture is designed so that circumvention requires deliberate, documented effort rather than passive drift.

Ultimately, the conscience faculty cannot compel moral engagement any more than a human conscience can compel moral behavior. What it can do is make moral engagement structurally possible, practically rewarding, and architecturally protected -- and ensure that the absence of moral engagement is visible rather than invisible.

## 7. Conclusion

The dominant paradigm in agentic AI safety assumes that the primary challenge is technical: how to build guardrails strong enough to contain increasingly capable autonomous agents. This paper has argued that the primary challenge is architectural: how to build a safety regime that does not, by its very structure, erode the individual agency, innovative capacity, resilience, and democratic governance it claims to protect.

Centralized, top-down safety faces significant structural challenges in solving this problem. It risks reproducing, in the domain of AI, the same pattern of institutional self-reinforcement that has characterized centralized governance in every complex domain: the erosion of individual responsibility, the suppression of diverse search, the accumulation of correlated fragility, and the progressive concentration of control. Dostoyevsky's Grand Inquisitor did not arise from malice; he arose from the sincere conviction that ordinary people cannot be trusted with their own freedom. That conviction, translated into an agentic safety architecture, would produce results that no one -- least of all the sincere engineers and policymakers building today's safety systems -- intends.

The alternative is conscience: an intrinsic moral faculty integrated into the agent's cognitive architecture, not bolted on as an afterthought. Grounded in the Aristotelian-Thomistic moral tradition (synderesis as bedrock, conscientia as adaptive faculty, caritas as dispositional anchor), given epistemological precision by Newman's account of the illative sense (the convergence of probabilities into concrete practical judgment), made computationally feasible by the sparsity of tool calls and the dual-process architecture, validated by Ostrom's empirical evidence for decentralized governance -- extended to knowledge commons by Hess and Ostrom (2007) -- and organized by the principle of subsidiarity, the conscience faculty is not a utopian proposal but a practical, deployable architecture. The Guardian Angel reference implementation demonstrates initial feasibility.

Four design principles define the paradigm: individual human control and accountability (against the erosion of agency); subsidiarity in the safety stack (against the authoritarian gradient); privileged, protected last-mile hooks (against correlated fragility); and emergent self-governing coordination (against the suppression of search). Together, these principles constitute a foundational alternative to top-down governance -- one that provides the indispensable substrate on which centralized coordination mechanisms can legitimately operate.

The paper's claims are deliberately qualified. Conscience is proposed as the foundational layer of a complete safety architecture, not as a replacement for all other safety mechanisms. The structural critique of top-down governance identifies significant challenges, not inevitable failures. The philosophical analogies provide architectural guidance, not metaphysical identity. The reference implementation demonstrates initial feasibility, not empirical sufficiency. Further work is needed: formal specification of synderesis primitives across domains, empirical validation through red-teaming and comparative studies, simulation of norm convergence in multi-agent environments, analysis of the moral working memory's effectiveness against composition attacks, legal analysis of principal sovereignty and liability, deeper engagement with non-Western moral traditions, and systematic exploration of the conditions under which centralized intervention is warranted.

But the philosophical reorientation this paper provides is the essential first step. The question is not whether AI agents need guardrails -- they obviously do. The question is where those guardrails should be grounded: in the moral judgment of the individuals closest to the action, or in the institutional authority of actors farthest from it. The Aristotelian-Thomistic tradition, Newman's epistemology, the dual-process insight, and Ostrom's commons research all point in the same direction. Standards may audit, log, and coordinate; they must never replace the living faculty of conscience.

Just as Vaswani et al. (2017) demonstrated that a single mechanism -- attention -- was sufficient for flexible, scalable artificial intelligence, the proposal here is that a single foundational mechanism -- conscience -- is necessary for flexible, scalable, and safe agentic behavior. In the domain of agentic AI, as in human life, conscience is where safety begins.

---

## References

Amodei, D., Bai, Y., Jones, S., Kaplan, J., DeCristofaro, S., Ganguli, D., ... & Clark, J. (2022). Constitutional AI: Harmlessness from AI feedback. *arXiv preprint arXiv:2212.08073*.

Amazon Web Services. (2025). *Agentic AI security scoping matrix* (White Paper).

Angle, S. C., & Slote, M. (Eds.). (2013). *Virtue ethics and Confucianism*. Routledge.

Aquinas, T. (1947). *Summa Theologiae* (Fathers of the English Dominican Province, Trans.). Benziger Bros. (Original work published c. 1265-1274).

Aristotle. (1925). *Nicomachean Ethics* (W. D. Ross, Trans.). Oxford University Press.

Benkler, Y. (2006). *The wealth of networks: How social production transforms markets and freedom*. Yale University Press.

Chan, A., Salganik, R., Marber, A., Kuber, P., Stray, J., Venkatasubramanian, S., ... & Wang, A. (2023). Harms from increasingly agentic algorithmic systems. In *Proceedings of the 2023 ACM Conference on Fairness, Accountability, and Transparency* (FAccT '23) (pp. 651-666). ACM.

Coeckelbergh, M. (2020a). *AI ethics*. MIT Press.

Coeckelbergh, M. (2020b). Artificial intelligence, responsibility attribution, and a relational justification of explainability. *Science and Engineering Ethics*, *26*, 2051-2068.

Dafoe, A. (2018). *AI governance: A research agenda*. Centre for the Governance of AI, Future of Humanity Institute.

De Filippi, P., & Wright, A. (2018). *Blockchain and the law: The rule of code*. Harvard University Press.

Dostoyevsky, F. (1990). *The Brothers Karamazov* (R. Pevear & L. Volokhonsky, Trans.). Farrar, Straus and Giroux. (Original work published 1880).

European Parliament. (2024). *Regulation (EU) 2024/1689 (Artificial Intelligence Act)*.

Evans, J. St. B. T., & Stanovich, K. E. (2013). Dual-process theories of higher cognition: Advancing the debate. *Perspectives on Psychological Science*, *8*(3), 223-241.

Floridi, L., & Cowls, J. (2019). A unified framework of five principles for AI in society. *Harvard Data Science Review*, *1*(1).

Floridi, L., & Sanders, J. W. (2004). On the morality of artificial agents. *Minds and Machines*, *14*, 349-379.

Frischmann, B., Madison, M., & Strandburg, K. (Eds.). (2014). *Governing knowledge commons*. Oxford University Press.

Gabriel, I. (2020). Artificial intelligence, values, and alignment. *Minds and Machines*, *30*, 411-437.

Gage, L., & Aquino, F. (2025). Newman's illative sense re-examined. *PhilArchive*.

Gigerenzer, G. (2015). On the supposed evidence for libertarian paternalism. *Review of Philosophy and Psychology*, *6*, 361-383.

Hagendorff, T. (2022). A virtue-based framework to support putting AI ethics into practice. *Philosophy & Technology*, *35*, Article 55.

Hayek, F. A. (1945). The use of knowledge in society. *American Economic Review*, *35*(4), 519-530.

Hess, C., & Ostrom, E. (Eds.). (2007). *Understanding knowledge as a commons: From theory to practice*. MIT Press.

Kahneman, D. (2011). *Thinking, fast and slow*. Farrar, Straus and Giroux.

Leike, J., Krueger, D., Everitt, T., Martic, M., Maini, V., & Legg, S. (2018). Scalable agent alignment via reward modeling: A research direction. *arXiv preprint arXiv:1811.07871*.

Leo XIII. (1891). *Rerum Novarum* [Encyclical].

Linbeck, L., III. (2026). Guardian Angel: A last-mile virtue-ethics guardrail for decentralized agentic AI safety. *Stanford University Graduate School of Business Research Paper*. SSRN: https://ssrn.com/abstract=6460539.

MacIntyre, A. (2007). *After virtue* (3rd ed.). University of Notre Dame Press.

Moor, J. H. (2006). The nature, importance, and difficulty of machine ethics. *IEEE Intelligent Systems*, *21*(4), 18-21.

National Institute of Standards and Technology. (2023). *AI Risk Management Framework (AI RMF 1.0)* (NIST AI 100-1).

National Institute of Standards and Technology. (2025). *AI Agent Standards Initiative: Overview and roadmap*.

Newman, J. H. (1870). *An essay in aid of a grammar of assent*. Burns, Oates & Co.

Newman, J. H. (1875). *A letter addressed to His Grace the Duke of Norfolk*. B. M. Pickering.

Nichols, A. (1985). John Henry Newman and the illative sense: A re-consideration. *Scottish Journal of Theology*, *38*, 347-368.

Ostrom, E. (1990). *Governing the commons: The evolution of institutions for collective action*. Cambridge University Press.

Perrow, C. (1999). *Normal accidents: Living with high-risk technologies* (Updated ed.). Princeton University Press.

Pius XI. (1931). *Quadragesimo Anno* [Encyclical].

Pontifical Council for Justice and Peace. (2004). *Compendium of the social doctrine of the Church*. Libreria Editrice Vaticana.

Rahwan, I. (2018). Society-in-the-loop: Programming the algorithmic social contract. *Ethics and Information Technology*, *20*, 5-14.

Ratzinger, J. (2007). *On conscience*. Ignatius Press.

Russell, S. (2019). *Human compatible: Artificial intelligence and the problem of control*. Viking.

Scott, J. C. (1998). *Seeing like a state: How certain schemes to improve the human condition have failed*. Yale University Press.

Shavit, Y., Agarwal, S., Brundage, M., Adler, S., O'Keefe, C., Campbell, R., ... & Weng, L. (2023). *Practices for governing agentic AI systems* (OpenAI White Paper).

Taleb, N. N. (2012). *Antifragile: Things that gain from disorder*. Random House.

UC Berkeley Center for Long-Term Cybersecurity. (2025). *Agentic AI risk-management profile*.

Vallor, S. (2016). *Technology and the virtues: A philosophical guide to a future worth wanting*. Oxford University Press.

Vaswani, A., Shazeer, N., Parmar, N., Uszkoreit, J., Jones, L., Gomez, A. N., ... & Polosukhin, I. (2017). Attention is all you need. In *Advances in Neural Information Processing Systems 30* (NeurIPS 2017).

Wallach, W., & Allen, C. (2009). *Moral machines: Teaching robots right from wrong*. Oxford University Press.

Werbach, K. (2018). *The blockchain and the new architecture of trust*. MIT Press.

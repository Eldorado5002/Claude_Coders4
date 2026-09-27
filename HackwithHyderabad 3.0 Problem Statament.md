

**HACKATHON**

**PROBLEM STATEMENTS**

AI Agents That Learn Using Hindsight

In this hackathon, you will build AI-powered applications using Hindsight, a memory system developed by Vectorize that allows AI agents to remember, recall, and improve over time.

*Instead of building AI that forgets conversations, your project should demonstrate persistent memory and learning from past interactions.*

# **Why This Hackathon Matters for Your Career**

The AI agent space is exploding, and companies are hiring people who can build, not just talk about it. This hackathon is your chance to walk away with a working project that demonstrates you can ship an AI agent that solves a real problem.

Here is what is at stake for you personally:

### **Build Your Portfolio, Not Just a Weekend Toy**

The best hackathon projects don't just win prizes. They become the thing you link on your LinkedIn profile, your GitHub pinned repo, and the story you tell in interviews for the next two years. Pick a problem that a real business would actually pay to solve, and build toward that.

### **Learn by Doing What the Industry Needs Right Now**

Stateless chatbots are yesterday's news. The frontier is agents with memory: agents that learn from past interactions, adapt to user behavior, and get better over time. Hindsight gives you a real memory layer to build on. That is a skill set that is immediately valuable.

### **Ship Something You Would Actually Use**

The projects that stand out (to judges, to recruiters, to future collaborators) are the ones where the builder clearly cared about the problem. Don't chase what sounds impressive. Build something that solves a pain point you have actually experienced.

# **Required Technology**

All teams must build their projects using **Hindsight**.

### **Official Links**

* Hindsight Documentation: [https://hindsight.vectorize.io/](https://hindsight.vectorize.io/)

* GitHub: [https://github.com/vectorize-io/hindsight](https://github.com/vectorize-io/hindsight)

* Hindsight Cloud: [https://ui.hindsight.vectorize.io](https://ui.hindsight.vectorize.io)

### **Resources**

You can use **Hindsight Cloud** to quickly get a Hindsight instance, or the **open source version**.

Use promo code **MEMHACK99** to get \$50 in free credits on Hindsight Cloud. You add this AFTER you register in the billing section.

Join the **Hindsight Community Slack** to ask any questions about how to use Hindsight.

# **LLM Access**

You can use any LLM you want, but **Groq** is super fast and has a generous free tier: [https://groq.com/](https://groq.com/)

Recommended models are **openai/gpt-oss-120b** and **qwen/qwen3-32b**, but make sure to have your agent ready to handle function calling errors.

## **Coding Agents**

You can use any coding agent you want (or code by hand), but here are some free options:

* **Code.in**: [https://code.in/](https://code.in/)  
   An AI coding partner built in India. It explores your project, plans changes, makes the edits, and runs checks to verify its work. You can start from an idea in the browser, or bring your own project through the editor extension or the terminal CLI. Plans start at ₹499 for 30 days and don't renew automatically. The CLI and editor extension also let you use your own model API key. (Free credits provided)

* [https://jules.google.com/](https://jules.google.com/)

* [https://opencode.ai/](https://opencode.ai/) (can use with Ollama for local models or with most LLM providers)

## **OpenClaw Integration**

If you want to build an agent using OpenClaw, you can use the official Hindsight plugin here: [https://hindsight.vectorize.io/sdks/integrations/openclaw](https://hindsight.vectorize.io/sdks/integrations/openclaw)

# **How to Pick a Winning Project**

The difference between a forgettable hackathon demo and one that makes judges (and recruiters) pay attention comes down to three things:

### **1\. Solve a Real Business Problem**

The strongest projects target a workflow that actual companies struggle with. Ask yourself: *"Would someone pay \$50/month for this?"* If the answer is yes, you are on the right track.

Bad: *"An AI that remembers your favorite color."*

Good: *"An AI sales assistant that remembers every objection a prospect raised across calls and drafts personalized follow-ups."*

Think about the repetitive, knowledge-heavy tasks in real jobs. The ones where people say "I wish someone would just remember all of this for me." That is your opportunity.

### **2\. Make Memory the Star, Not a Feature**

Since Hindsight memory accounts for 25% of the judging criteria, your project should make the memory layer central and visible. The best projects will show a clear before/after: *without* memory the agent is generic; *with* memory it becomes dramatically better.

Some ways to make memory shine:

* Show the agent improving its responses over multiple interactions

* Have it recall context from days or weeks ago

* Let it learn user preferences and adapt its behavior

* Have it build up domain expertise from past conversations

### **3\. Think Like a Demo**

You have limited time to impress judges. Pick a use case where the value is obvious within 60 seconds of watching. The best hackathon projects tell a story: "Here is the problem. Here is the agent solving it. Watch how it gets smarter."

# **Project Ideas That Look Real**

Below are categories of AI agents drawn from real business functions. Each one represents a genuine workflow where persistent memory transforms the agent from a novelty into something valuable.

**Avoid student-centric projects** like AI tutors, AI group project managers, AI quiz generators, etc. Think about the professional world instead.

Browse this repository for more inspiration: [https://github.com/vectorize-io/self-driving-agents](https://github.com/vectorize-io/self-driving-agents) 

## **Sales & Revenue**

| Agent Idea | Why Memory Matters | Business Case |
| :---- | :---- | :---- |
| **Deal Intelligence Agent** | Remembers every interaction across a deal cycle: objections raised, competitors mentioned, stakeholder concerns, pricing discussions. Over time, learns which objection-handling approaches work best. | Sales reps waste hours re-reading CRM notes before calls. An agent with deal memory can brief a rep in seconds and suggest winning tactics based on past deals. |
| **Outbound Prospecting Agent** | Learns which messaging angles get responses from different persona types. Remembers what was sent to whom and what worked. | Outbound is a numbers game, but personalization wins. An agent that remembers and adapts its approach across hundreds of prospects is a force multiplier. |
| **Proposal & RFP Agent** | Builds a memory of past proposals, win/loss patterns, and client-specific preferences. Recalls boilerplate that worked and language that didn't. | RFP responses are time sinks. An agent that remembers your best past answers and tailors them to each new opportunity saves days per proposal. |

## **Marketing & Content**

| Agent Idea | Why Memory Matters | Business Case |
| :---- | :---- | :---- |
| **Content Strategy Agent** | Tracks what content has been published, what performed well, what topics have been covered, and what gaps exist. Learns your brand voice over time. | Marketing teams constantly reinvent the wheel. An agent with content memory can identify what worked, what didn't, and where the gaps are. |
| **SEO & Citation Agent** | Remembers your site's ranking history, past optimizations, competitor moves, and what changes led to ranking improvements. | SEO is a long game. An agent that remembers the full history of your optimization efforts and their outcomes can make smarter recommendations than one-shot analysis. |
| **Social Media Engagement Agent** | Learns which post styles, topics, and timing drive engagement for your specific audience. Remembers past conversations and community sentiment. | Every brand's audience is different. An agent that learns YOUR audience's preferences over weeks of interaction is far more valuable than generic advice. |

## **Engineering & DevOps**

| Agent Idea | Why Memory Matters | Business Case |
| :---- | :---- | :---- |
| **Incident Response Agent** | Remembers past incidents, their root causes, resolution steps, and which runbooks worked. Learns from post-mortems to suggest faster fixes for similar issues. | When production is down, every minute counts. An agent that recalls exactly how similar incidents were resolved before is invaluable. |
| **Code Review Agent** | Learns your team's coding standards, common mistakes, and architectural preferences over time. Remembers past review feedback to avoid repeating the same suggestions. | Code review is slow and inconsistent. An agent that knows your codebase's patterns and your team's conventions catches issues a generic linter never would. |
| **DevOps Pipeline Agent** | Tracks deployment history, build failures, infrastructure changes, and their downstream effects. Learns which changes tend to cause problems. | An agent that remembers every deployment failure and what caused it can predict risks before they hit production. |

## **Operations & Support**

| Agent Idea | Why Memory Matters | Business Case |
| :---- | :---- | :---- |
| **Customer Support Agent** | Remembers a customer's full history: past tickets, known issues, their environment, their frustration level, what solutions worked before. | Nothing angers a customer more than repeating their story. An agent with full customer memory transforms the entire support experience. |
| **Accounts Payable Agent** | Learns vendor patterns, payment terms, common discrepancies, and approval workflows. Remembers past exceptions and resolutions. | AP teams process thousands of invoices and the same edge cases keep recurring. An agent with memory handles exceptions that would normally require senior staff. |
| **Compliance & Audit Agent** | Tracks regulatory requirements, past audit findings, remediation status, and policy changes. Remembers which controls have been tested and when. | An agent that remembers your full audit history and can flag gaps before auditors find them is immediately valuable. |

## **Product & Strategy**

| Agent Idea | Why Memory Matters | Business Case |
| :---- | :---- | :---- |
| **User Feedback Synthesizer** | Aggregates and remembers feedback from multiple channels over time. Identifies emerging themes, tracks sentiment shifts, and links feedback to specific product changes. | Product teams drown in feedback. An agent that connects dots across channels and time spots patterns humans miss. |
| **Competitive Intelligence Agent** | Monitors and remembers competitor moves: pricing changes, feature launches, messaging shifts, hiring patterns. Builds an evolving picture of the competitive landscape. | Competitive intelligence is only useful if it is cumulative. An agent that remembers six months of competitor activity spots patterns that a weekly check never would. |
| **Meeting Prep Agent** | Remembers past meetings with each contact: what was discussed, what was promised, what follow-ups were missed. Learns your meeting style and preparation preferences. | An agent that briefs you with full context from every past interaction with a contact is a professional superpower. |

# **How to Make Your Project Stand Out**

### **Tell a Story with Your Demo**

Don't just show features. Walk through a realistic scenario: "Imagine you are a sales rep on your fifth call with a prospect..." Make the judges feel the problem before you show the solution.

### **Show the Learning Curve**

The most compelling Hindsight demos show the agent getting noticeably better. Interaction 1: generic. Interaction 5: personalized. Interaction 20: feels like it knows you. That progression is what makes memory-powered agents exciting.

### **Build Something You Would Put on LinkedIn Tomorrow**

If you wouldn't proudly post about it, rethink your approach. The best hackathon projects get written up as case studies, attract followers, and start conversations. Aim for that.

### **Keep the Scope Tight**

You have limited time. A polished agent that does one thing brilliantly beats a sprawling prototype that does five things poorly. Pick one workflow, one persona, one clear value proposition and nail it.

### **Use Realistic Data**

If you can find real data on sites like Kaggle or HuggingFace that’s great. Even if you can’t, use your LLM to generate synthetic data that looks real. Give your customers real-sounding names, your deals real-sounding numbers, your incidents real-sounding error logs.

The \#1 thing that will make your project look real is the data, so don’t make sure you give this the attention it deserves.

# **Important Rules**

All teams must ALSO share their project based on challenges from the official content guide.

**Content Guide:** Hackathon Content Guide (see official link)

Your project must clearly demonstrate how Hindsight memory is used in your solution.

# **Submission Requirements**

Each team must submit:

* **GitHub Repository** with clean, documented code

* **Demo Video** showing the agent in action

* **Live Project Demo** to judges

* **Content deliverables:** All team members must complete an Article, Social Media post, and Video as described in the content guide

* **Explanation of how Hindsight memory is used** in your solution

# **Judging Criteria**

| Criteria | Weight | What Judges Are Looking For |
| :---- | :---- | :---- |
| **Innovation** | **30%** | Is this a fresh take on a real problem? Does it go beyond obvious chatbot territory? |
| **Use of Hindsight Memory** | **25%** | Is memory central to the value proposition? Does the agent clearly improve over time? |
| **Technical Implementation** | **20%** | Is the code clean, well-architected, and functional? Does it handle edge cases? |
| **User Experience** | **15%** | Is the agent intuitive to interact with? Does the demo flow tell a compelling story? |
| **Real-world Impact** | **10%** | Could this solve a genuine problem for real users? Is there a path to actual adoption? |

*Now stop reading and start building.*  
*The best way to learn AI agents is to ship one.*


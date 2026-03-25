import fetch from "node-fetch";

const API_KEY = process.env.API_KEY;
const MODEL   = "deepseek/deepseek-chat";
const BASE_URL = "https://openrouter.ai/api/v1/chat/completions";

// ─────────────────────────────────────────────
//  Core LLM caller
// ─────────────────────────────────────────────
async function callLLM(systemPrompt, userContent) {
  const res = await fetch(BASE_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${API_KEY}`,
      "Content-Type": "application/json",
      "HTTP-Referer": "http://localhost",
      "X-Title": "Multi-Agent Chat",
    },
    body: JSON.stringify({
      model: MODEL,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user",   content: userContent  },
      ],
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`LLM error (${res.status}): ${err}`);
  }

  const data = await res.json();
  return data.choices?.[0]?.message?.content?.trim() || "";
}

// ─────────────────────────────────────────────
//  DuckDuckGo search helper (for Researcher)
// ─────────────────────────────────────────────
async function duckSearch(query) {
  try {
    const url = `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1&skip_disambig=1`;
    const res  = await fetch(url);
    const data = await res.json();
    const parts = [];
    if (data.AbstractText)  parts.push(`Summary: ${data.AbstractText}`);
    if (data.Answer)        parts.push(`Direct Answer: ${data.Answer}`);
    (data.RelatedTopics || []).slice(0, 3).forEach(t => {
      if (t.Text) parts.push(`Related: ${t.Text}`);
    });
    return parts.join("\n") || null;
  } catch {
    return null;
  }
}

// ─────────────────────────────────────────────
//  AGENT 1 — PLANNER
//  Input : user query
//  Output: structured plan (steps + search queries)
// ─────────────────────────────────────────────
export async function planner(userQuery) {
  const system = `You are a Planner agent in a multi-agent AI pipeline.
Your job:
1. Analyse the user's query carefully.
2. Break it into 3-5 clear sub-tasks needed to answer it well.
3. Suggest 1-2 short web-search queries that would help (if relevant).
4. Reply ONLY in this JSON format (no markdown, no backticks):
{
  "goal": "<one-sentence summary of what user wants>",
  "steps": ["step 1", "step 2", ...],
  "searchQueries": ["query1", "query2"]
}`;

  const raw = await callLLM(system, userQuery);

  try {
    return JSON.parse(raw);
  } catch {
    // graceful fallback
    return { goal: userQuery, steps: ["Answer the question directly."], searchQueries: [userQuery] };
  }
}

// ─────────────────────────────────────────────
//  AGENT 2 — RESEARCHER
//  Input : plan from Planner
//  Output: raw research notes
// ─────────────────────────────────────────────
export async function researcher(plan) {
  // Run DuckDuckGo searches in parallel
  const searchResults = await Promise.all(
    (plan.searchQueries || []).map(q => duckSearch(q))
  );
  const webContext = searchResults.filter(Boolean).join("\n\n");

  const system = `You are a Researcher agent. Given a plan and optional web search results,
compile concise, factual research notes that will help an Executor agent write a great answer.
Focus on accuracy. If web results are empty, use your own knowledge.
Keep notes under 300 words.`;

  const userContent = `
PLAN:
Goal: ${plan.goal}
Steps: ${plan.steps.join(" | ")}

WEB SEARCH RESULTS:
${webContext || "(no results found — use internal knowledge)"}
`.trim();

  const notes = await callLLM(system, userContent);
  return { notes, webContext };
}

// ─────────────────────────────────────────────
//  AGENT 3 — EXECUTOR
//  Input : original query + plan + research notes
//  Output: full draft answer
// ─────────────────────────────────────────────
export async function executor(userQuery, plan, researchNotes) {
  const system = `You are an Executor agent. Using the plan and research notes provided,
write a complete, well-structured, helpful answer to the user's question.
Be clear, accurate and concise. Use bullet points or headings only if they improve readability.`;

  const userContent = `
USER QUESTION: ${userQuery}

PLAN:
${plan.steps.map((s, i) => `${i + 1}. ${s}`).join("\n")}

RESEARCH NOTES:
${researchNotes}
`.trim();

  return await callLLM(system, userContent);
}

// ─────────────────────────────────────────────
//  AGENT 4 — REVIEWER
//  Input : draft answer from Executor
//  Output: final polished answer + quality score
// ─────────────────────────────────────────────
export async function reviewer(userQuery, draft) {
  const system = `You are a Reviewer agent. Your job:
1. Check the draft answer for accuracy, clarity and completeness.
2. Fix any issues — improve wording, remove repetition, fill gaps.
3. Reply ONLY in this JSON format (no markdown, no backticks):
{
  "finalAnswer": "<your improved answer here>",
  "score": <quality score 1-10>,
  "changes": "<one sentence describing what you improved, or 'No changes needed'>"
}`;

  const raw = await callLLM(system, `USER QUESTION:\n${userQuery}\n\nDRAFT ANSWER:\n${draft}`);

  try {
    return JSON.parse(raw);
  } catch {
    return { finalAnswer: draft, score: 7, changes: "Could not parse review — returning original." };
  }
}

// ─────────────────────────────────────────────
//  PIPELINE RUNNER  (Planner → Researcher → Executor → Reviewer)
// ─────────────────────────────────────────────
export async function runAgentPipeline(userQuery) {
  const trace = [];

  // Step 1 — Plan
  trace.push({ agent: "Planner", status: "running" });
  const plan = await planner(userQuery);
  trace[0].status = "done";
  trace[0].output = plan;

  // Step 2 — Research
  trace.push({ agent: "Researcher", status: "running" });
  const { notes, webContext } = await researcher(plan);
  trace[1].status = "done";
  trace[1].output = { notes, webContext: !!webContext };

  // Step 3 — Execute
  trace.push({ agent: "Executor", status: "running" });
  const draft = await executor(userQuery, plan, notes);
  trace[2].status = "done";
  trace[2].output = { draftLength: draft.length };

  // Step 4 — Review
  trace.push({ agent: "Reviewer", status: "running" });
  const review = await reviewer(userQuery, draft);
  trace[3].status = "done";
  trace[3].output = { score: review.score, changes: review.changes };

  return {
    finalAnswer: review.finalAnswer,
    score:       review.score,
    changes:     review.changes,
    plan,
    trace,
  };
}

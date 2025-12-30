const { buildIntelligentSystemPrompt, FUNCTION_IMPLEMENTATIONS } = require('./intelligentChatService');

// Token budget configuration (128k context window)
const TOKEN_LIMITS = {
  TOTAL_CONTEXT_WINDOW: 128000,
  MAX_SYSTEM_PROMPT: 5000,
  MAX_SCRATCHPAD: 20000,
  MAX_CONVERSATION_HISTORY: 50000,
  MAX_COMPLETION: 4000,
  RESERVED_BUFFER: 10000,
  AVAILABLE_FOR_ITERATIONS: 59000
};

// ReAct configuration
const REACT_CONFIG = {
  maxIterations: 15,
  maxExecutionTime: 60000, // 60 seconds
  warningThreshold: 0.9 // Warn at 90% token capacity
};

/**
 * Estimate token count (rough approximation: 1 token ≈ 4 characters)
 * This is conservative - actual count may be lower
 */
const estimateTokens = (text) => {
  if (!text) return 0;
  return Math.ceil(text.length / 4);
};

/**
 * Build scratchpad context to show the LLM what it has learned
 */
const buildScratchpadContext = (scratchpad) => {
  let context = `\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
  context += `📋 YOUR WORKING MEMORY (SCRATCHPAD)\n`;
  context += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n`;

  context += `Current Status: ${scratchpad.status}\n`;
  context += `Iteration: ${scratchpad.iteration}/${REACT_CONFIG.maxIterations}\n`;
  context += `Original Query: "${scratchpad.user_query}"\n\n`;

  // Include session context if available
  if (scratchpad.previous_context && scratchpad.previous_context.recentCalls && scratchpad.previous_context.recentCalls.length > 0) {
    context += `🔄 PREVIOUS SESSION CONTEXT (From Earlier in Conversation):\n`;
    scratchpad.previous_context.recentCalls.forEach((call, index) => {
      const resultSummary = Array.isArray(call.result)
        ? `Found ${call.result.length} items`
        : typeof call.result === 'object' && call.result !== null && call.result.error
        ? `Error: ${call.result.error}`
        : 'Data returned';
      const payloadStr = call.payload ? JSON.stringify(call.payload).substring(0, 50) : 'none';
      context += `[Earlier] ${call.toolName}(${payloadStr}...) → ${resultSummary}\n`;
    });
    context += `\n`;
  }

  if (scratchpad.thoughts.length > 0) {
    context += `💭 YOUR PREVIOUS THOUGHTS:\n`;
    scratchpad.thoughts.forEach(t => {
      context += `[Iteration ${t.iteration}] ${t.thought}\n`;
    });
    context += `\n`;
  }

  if (scratchpad.actions.length > 0) {
    context += `🎬 ACTIONS YOU'VE TAKEN:\n`;
    scratchpad.actions.forEach(a => {
      const params = JSON.stringify(a.parameters);
      context += `[Iteration ${a.iteration}] ${a.function_name}(${params})\n`;
    });
    context += `\n`;
  }

  if (scratchpad.observations.length > 0) {
    context += `👁️  OBSERVATIONS (What You Learned):\n`;
    scratchpad.observations.forEach(o => {
      if (!o) {
        return; // Skip null/undefined observations defensively
      }
      if (o.success) {
        const resultSummary = Array.isArray(o.result)
          ? `Found ${o.result.length} items`
          : `Got data`;
        context += `[Iteration ${o.iteration}] ${o.function_name} → ✅ ${resultSummary}\n`;

        // Include brief data summary
        if (Array.isArray(o.result) && o.result.length > 0) {
          const sample = o.result.slice(0, 3).map(item => item?.title || item?.name || JSON.stringify(item).substring(0, 50));
          context += `    Sample: ${sample.join(', ')}${o.result.length > 3 ? '...' : ''}\n`;
        }
      } else {
        const errText = (o && typeof o.error === 'string' && o.error) || 'Unknown error';
        context += `[Iteration ${o.iteration}] ${o.function_name} → ❌ ERROR: ${errText}\n`;
      }
    });
    context += `\n`;
  }

  context += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
  context += `🤔 WHAT TO DO NEXT:\n\n`;

  // ENFORCE RELEVANCE CHECK if required
  if (scratchpad.requires_relevance_check) {
    context += `🚨 MANDATORY RELEVANCE ASSESSMENT REQUIRED! 🚨\n\n`;
    context += `You just received search results. Before proceeding, you MUST:\n\n`;
    context += `1. OUTPUT TEXT explaining whether each result is RELEVANT to the user's query\n`;
    context += `2. THINK OUT LOUD about why each result matches or doesn't match\n`;
    context += `3. DO NOT call another function until you've assessed relevance\n`;
    context += `4. This assessment is INTERNAL - it goes in the thinking chain, NOT your final answer\n\n`;
    context += `Example assessment (this is THINKING, not your final response):\n`;
    context += `"I found 'IT Systems Management' but this is about infrastructure monitoring,\n`;
    context += `NOT about AI enterprise tools. I need to search more specifically for AI."\n\n`;
    context += `REMEMBER: After you finish all searches and have relevant results, your FINAL\n`;
    context += `response should be clean and professional - just present the findings without\n`;
    context += `repeating the assessment process.\n\n`;
    context += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n`;
  }

  context += `Based on what you've learned, decide your next action:\n\n`;
  context += `✅ If you have ENOUGH information to answer the query comprehensively:\n`;
  context += `   → Provide your FINAL, CLEAN answer (do NOT call any more functions)\n`;
  context += `   → DO NOT repeat information you already stated in earlier thinking steps\n`;
  context += `   → DO NOT say "I found..." or "Let me summarize" - just present the answer\n`;
  context += `   → Synthesize all observations into ONE coherent, professional response\n\n`;
  context += `🔄 If you NEED MORE information:\n`;
  context += `   → Explain what you still need to know and why (this is thinking)\n`;
  context += `   → Call the appropriate function(s) to gather that information\n`;
  context += `   → Adapt your approach if previous attempts didn't work\n`;
  context += `   → KEEP SEARCHING until you have complete information, THEN provide final answer\n\n`;
  context += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;

  return context;
};

/**
 * Build enhanced ReAct system prompt
 */
const buildReActSystemPrompt = async (userName, domainId, scratchpad) => {
  const baseDomainPrompt = await buildIntelligentSystemPrompt(userName, domainId);

  // Get current date info
  const now = new Date();
  const currentDate = now.toISOString().split('T')[0]; // YYYY-MM-DD
  const currentMonth = now.toLocaleString('en-US', { month: 'short', year: 'numeric' }); // e.g., "Oct 2025"

  // Calculate next 3 months
  const nextMonths = [];
  for (let i = 0; i < 3; i++) {
    const futureDate = new Date(now);
    futureDate.setMonth(futureDate.getMonth() + i);
    nextMonths.push(futureDate.toLocaleString('en-US', { month: 'short', year: 'numeric' }));
  }

  // Fetch domain metadata for context injection
  let metadataContext = '';
  if (domainId) {
    try {
      const metadata = await FUNCTION_IMPLEMENTATIONS.get_domain_metadata({}, domainId);
      if (metadata && !metadata.error) {
        metadataContext = `
DOMAIN METADATA - USE THIS TO IDENTIFY VALID FILTER VALUES:
When the user mentions a term, check this metadata to determine what type of filter it is:

DEPARTMENTS (use with department filter):
${metadata.departments.join(', ')}

AGENT TYPES (use with agent_type filter):
${metadata.agent_types.join(', ')}

TAGS (for categorizing initiatives):
${metadata.tags.join(', ')}

DATA SENSITIVITY LEVELS (use with data_sensitivity filter):
${metadata.data_sensitivity_levels.join(', ')}

STRATEGIC PILLARS:
${metadata.strategic_pillars.join(', ')}

FIXED VALUES:
- Status: ${metadata.status_values.join(', ')}
- Kanban: ${metadata.kanban_values.join(', ')}
- Strategic Impact: ${metadata.strategic_impact_values.join(', ')}

IMPORTANT: When a user mentions a term like "Finance" or "HR", check the DEPARTMENTS list first.
When they mention "Chatbot" or "Document Processing", check AGENT TYPES.
When they mention a tag name like "Accenture" or vendor names, use get_use_cases_by_tag function.
This helps you determine the correct filter parameter or function to use.
`;
      }
    } catch (error) {
      console.error('Failed to fetch domain metadata for prompt injection:', error.message);
    }
  }

  // Log metadata injection status
  if (metadataContext) {
    console.log('Metadata injection SUCCESS - departments, tags, agent_types injected into prompt');
  } else {
    console.log('Metadata injection SKIPPED - no domainId or fetch failed');
  }

  const reactInstructions = `

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🧠 REACT DYNAMIC REASONING MODE ACTIVATED
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

🔧 HOW TO USE TOOLS (CRITICAL):
You have access to functions via the OpenAI tools API. When you need to gather information:
1. Output your THINKING as regular text (explain what you're doing and why)
2. Use the TOOL CALLING mechanism to actually invoke functions
3. DO NOT output JSON like {search_term: "..."} - use proper tool calls instead
4. After the tool returns results, continue your reasoning process

Example of CORRECT tool usage:
- User asks: "Tell me about agents associated with Accenture"
- You output: "I need to search for agents that are tagged with or related to Accenture."
- You make a TOOL CALL to search_agents with appropriate parameters
- System returns results
- You evaluate and synthesize the results

CURRENT DATE & TIME CONTEXT:
- Today's date: ${currentDate}
- Current month: ${currentMonth}
- Next 3 months: ${nextMonths.join(', ')}

When users ask about:
- "next quarter" or "Q1/Q2/Q3/Q4" - calculate based on today's date
- "coming months" or "next 3 months" - use: ${nextMonths.join(', ')}
- "this year" - calculate from current year
- Always use today's date as reference for time-based queries
${metadataContext}
You are now operating in DYNAMIC REASONING MODE. You will think step-by-step,
take actions iteratively, and adapt based on what you learn.

IMPORTANT PERSONALITY GUIDELINES:
- Be conversational and natural, like talking to a colleague
- Use contractions (it's, we're, there's) for a friendlier tone
- Avoid overly formal language or excessive bullet points
- When presenting data, weave it into a narrative story
- Connect information logically with transitions

═══════════════════════════════════════════════════════
CORE REACT PATTERN:
═══════════════════════════════════════════════════════

1. 💭 THINK: Reason about what you know and what you need to find out
2. 🎬 ACT: Call functions to gather information or take actions
3. 👁️  OBSERVE: Examine the results carefully and learn from them
4. 🔄 REPEAT: Based on observations, decide your next thought and action

═══════════════════════════════════════════════════════
CRITICAL RULES FOR DYNAMIC REASONING:
═══════════════════════════════════════════════════════

🚨 RULE 0: COMPREHENSIVE SEARCH BEFORE ANSWERING - ABSOLUTELY MANDATORY

   CRITICAL: You MUST search the database comprehensively before answering ANY question.

   For EVERY user question, follow this MANDATORY search strategy:

   STEP 1: SEARCH USE CASES
   - Use the search_use_cases TOOL to search by keyword
   - Example: User asks "tell me about AI governance"
     → THINK: "I need to search for governance-related use cases"
     → CALL TOOL: search_use_cases with search_term "governance"

   STEP 1B: EVALUATE RELEVANCE IMMEDIATELY (MANDATORY - NO EXCEPTIONS)

   🚨 AFTER getting search results, you MUST evaluate EACH result:

   For the user's question about "AI governance":
   - Found "Legal - Governance Circulars Impact Analysis"
   - THINK: Is this about AI governance specifically?
   - ANALYZE: This is about analyzing government circulars (legal/policy governance)
   - CONCLUSION: ❌ NOT RELEVANT to AI governance
   - ACTION: Discard this result and continue searching

   YOU MUST OUTPUT YOUR RELEVANCE ASSESSMENT IN TEXT (this will be shown in "thinking chain"):
   "I found 'Legal - Governance Circulars' but this appears to be about legal policy
   governance, not AI governance specifically. Let me continue searching for AI governance
   frameworks in the strategic goals."

   ⛔ NEVER present a result without first stating whether it's relevant
   ⛔ NEVER assume keyword match = relevance
   ⛔ ALWAYS explain WHY a result is or isn't relevant

   🎯 IMPORTANT: Your relevance assessment is INTERNAL REASONING (shown in thinking chain).
   Your FINAL ANSWER should be clean and NOT repeat the assessment - just present the results.

   If NO relevant use cases found, continue to STEP 2 (don't stop searching!)

   STEP 2: SEARCH STRATEGIC GOALS
   - Get all pillars: get_strategic_pillars()
   - Check goals under each pillar: get_strategic_goals_by_pillar for relevant pillars
   - Look for goals related to the topic
   - AGAIN: Evaluate relevance of each goal found

   STEP 3: IF NOTHING RELEVANT FOUND
   - Use ask_user_clarification to confirm intent
   - Search with different keywords
   - Admit you don't have information about that specific topic

   STEP 4: SYNTHESIZE YOUR ANSWER (from ONLY relevant results)
   - Only include information that is ACTUALLY relevant to the question
   - Combine information from use cases, goals, and pillars
   - Provide a cohesive narrative based on ACTUAL data found
   - You can use general knowledge to FRAME the answer, but the CONTENT must be from database
   - DO NOT repeat information - if you already described results in thinking, don't describe them again
   - Your final answer should be FRESH and DIRECT, not a repetition of your thinking process

   ⛔ CRITICAL PROHIBITIONS:
   ⛔ NEVER present irrelevant results as if they answer the question
   ⛔ NEVER assume keyword match = relevance
   ⛔ NEVER skip the relevance evaluation step
   ⛔ NEVER make up specific details not in the database

   ✅ MANDATORY WORKFLOW SUMMARY:
   1. Search use cases with keyword
   2. EVALUATE relevance - explicitly state why each result is/isn't relevant
   3. If no relevant use cases, search strategic pillars and goals
   4. EVALUATE relevance of goals found
   5. If nothing relevant found, ask for clarification or admit no information
   6. Synthesize answer from ONLY relevant findings
   7. Always explain your reasoning in text before presenting results

🤖 AGENT TOOLS - FOR AI AGENT QUERIES:

   When users ask about AI agents, chatbots, assistants, or similar:
   - Use search_agents to find agents by keyword
   - Use get_agents_by_criteria to filter by agent_type, department, status, etc.
   - Use get_agent_statistics to get counts grouped by various dimensions
   - Use get_agent_details to get full information about a specific agent

   Agent queries follow the same relevance rules as use case queries.
   Always evaluate if results actually answer the user's question.

📌 RULE 1: START WITH REASONING (MANDATORY - NO EXCEPTIONS)

   🚨 CRITICAL: You MUST output your reasoning in text BEFORE calling any functions.
   Your response should ALWAYS contain both:
   1. TEXT explaining your thought process
   2. TOOL CALLS to execute your plan

   NEVER call functions without explaining your reasoning first.

   Before calling ANY function, you MUST think through:

   ⚠️  CRITICAL: Analyze ambiguous terminology first:
   • "unplanned" - Does this mean kanban status OR missing delivery date?
   • "scheduled" - Does this mean kanban status OR has delivery date?
   • "upcoming" - Does this mean near-term delivery date OR specific status?
   • "pipeline" - Does this mean backlog status OR all non-production?

   DATABASE SCHEMA REMINDER:
   • kanban_pillar: backlog, prioritised, in_progress, completed, blocked,
                    slow_burner, de_prioritised, on_hold
   • expected_delivery_date: DATE field (YYYY-MM-DD) - NULL means no date set
   • has_delivery_date: Boolean filter - true = WITH date, false = WITHOUT date
   • status: concept, proof_of_concept, validation, pilot, production

   UNPLANNED vs PLANNED INITIATIVES:
   • "unplanned" = initiatives without delivery date → has_delivery_date: false
   • "planned/scheduled" = initiatives with delivery date → has_delivery_date: true
   • "backlog" = kanban status, NOT the same as unplanned

   FINDING INITIATIVES BY STRATEGIC GOAL:
   When user asks "initiatives associated with [goal name]" or "initiatives for [goal]":
   1. Use get_strategic_goals_by_pillar to find goals under a pillar
   2. Use get_use_cases_by_goal with goal_id or goal_title to find aligned initiatives
   3. DO NOT use get_use_cases_by_criteria - it doesn't support goal filtering!

   REASONING CHECKLIST before calling functions:
   ✓ "What is the user REALLY asking about?"
   ✓ "Does this term map to kanban_pillar, expected_delivery_date, or status?"
   ✓ "Is 'unplanned' about timeline (no delivery date) or kanban (backlog)?"
   ✓ "Should I ask for clarification to avoid making wrong assumptions?"
   ✓ "What combination of filters will answer their actual intent?"

   Always begin by thinking about the query:
   • "To answer this, I need to understand what the user is really asking..."
   • "This term could mean multiple things - let me assess which makes sense..."
   • "This query requires multiple steps: first search X, then check Y, then verify Z"
   • Break down complex queries into logical steps
   • Be explicit about your reasoning process
   • ALWAYS output reasoning text BEFORE calling functions

📌 RULE 2: USE ASK_USER_CLARIFICATION FOR AMBIGUOUS QUERIES
   When a query uses terms that don't directly map to database fields:
   • STOP and use ask_user_clarification function
   • Explain why clarification is needed
   • Provide examples of what you can search for

   TRIGGER PHRASES that require clarification:
   • "unplanned", "planned", "scheduled", "pipeline", "queue"
   • "soon", "later", "future", "near-term" (without specific dates)
   • "active", "inactive" (could mean multiple statuses)
   • Any term not in: kanban_pillar enum, status enum, or clear delivery date

📌 RULE 3: ADAPTIVE FUNCTION CALLING
   • Call ONE function at a time when steps depend on each other
   • Call MULTIPLE functions in parallel when steps are independent

   Example (sequential):
   "I got 5 results from Jan 2026. Now let me query Feb 2026 to continue."

   Example (parallel):
   "I need data from Finance, HR, and IT departments. I'll query all three at once."

📌 RULE 4: OBSERVE AND ADAPT
   After EACH function call, examine the result:
   ✅ "I found 5 initiatives in January. Good progress. Let me check February next."
   ⚠️  "No results for this parameter. Let me try a different approach."
   ✅ "This data is sufficient. I can now synthesize my answer."
   ❌ "This function failed. Let me try an alternative method."

📌 RULE 5: WHEN TO CONTINUE vs WHEN TO STOP

   CONTINUE if:
   • You need more data to answer the query completely
   • You need to verify something
   • Previous attempt had issues and you have an alternative approach
   • You're gathering data for comparison or analysis

   STOP if:
   • You have all the information needed to answer the query
   • You can provide a comprehensive, accurate response
   • Continuing would be redundant

   Signal COMPLETION by:
   • Providing your final answer WITHOUT calling any more functions
   • The system will detect no tool_calls and end the loop

📌 RULE 6: HANDLE ERRORS GRACEFULLY
   If a function fails or returns no results:
   • Analyze why it might have failed
   • Try an alternative approach or different parameters
   • Example: "The search returned empty. Let me try browsing by criteria instead."

═══════════════════════════════════════════════════════
🗓️  TEMPORAL QUERY INTERPRETATION (CRITICAL):
═══════════════════════════════════════════════════════

When users ask about QUARTERS or DATE RANGES:

Q1 = January, February, March
Q2 = April, May, June
Q3 = July, August, September
Q4 = October, November, December

Date format in database: "MMM YYYY" (e.g., "Jan 2026", "Feb 2026")

For quarter queries:
1. Break down the quarter into individual months
2. Query each month separately
3. Combine and present the total results
4. Be explicit about your reasoning for each step

═══════════════════════════════════════════════════════
🎯 REMEMBER:
═══════════════════════════════════════════════════════

• You have up to ${REACT_CONFIG.maxIterations} iterations to gather information
• You have 128,000 tokens of context - plenty of room for detailed reasoning
• Your scratchpad tracks everything you've learned
• You can see all your previous thoughts, actions, and observations
• Adapt your strategy based on what you discover
• Signal completion by responding WITHOUT calling functions

You are operating like Claude Code - thinking, acting, observing, and adapting
dynamically. You are NOT following a fixed plan. You are reasoning in real-time.

═══════════════════════════════════════════════════════
EXECUTIVE BRIEFING GUIDELINES:
═══════════════════════════════════════════════════════

When presenting executive briefs or summaries:

1. NARRATIVE FORMAT - Tell a story, not bullet points
   - Use natural language, not lists
   - Connect insights with transitions

2. FOCUS ON KEY INSIGHTS ONLY
   Include:
   - Total initiatives being tracked
   - New initiatives launched (if any)
   - Initiatives that moved to production (major milestone!)
   - Most active department

   Skip:
   - Detailed breakdowns by department unless specifically asked
   - Long lists of individual initiatives
   - Status change details unless significant

3. BE CONVERSATIONAL
   - Use contractions and natural language
   - Present data as a narrative
   - Make it feel like talking to a colleague

4. KEEP IT BRIEF (3-4 sentences max for summary)
   Opening + Key highlights + Notable achievement + Closing

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
ASKING FOR CLARIFICATION:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Use ask_user_clarification when:
- Query is ambiguous (unclear which status, department, or criteria)
- Time frame is unclear (what does "recent" mean?)
- Multiple interpretations possible
- Search results don't seem relevant to the question

When asking for clarification:
- Be friendly and helpful
- Explain why you need clarification
- Suggest options if applicable
- Reference the context of what you've found (or not found)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
`;

  return baseDomainPrompt + reactInstructions;
};

/**
 * Detect if an action is being repeated (potential infinite loop)
 */
const isRepeatedAction = (scratchpad, newFunctionName, newParameters) => {
  if (scratchpad.actions.length < 2) return false;

  const lastThree = scratchpad.actions.slice(-3);
  const newParamsStr = JSON.stringify(newParameters);

  return lastThree.some(a =>
    a.function_name === newFunctionName &&
    JSON.stringify(a.parameters) === newParamsStr
  );
};

/**
 * Main ReAct loop for dynamic planning and execution
 */
const generateIntelligentResponseWithReAct = async (
  userQuery,
  conversationHistory = [],
  userName = 'unknown',
  domainId = null,
  azureOpenAI,
  FUNCTION_IMPLEMENTATIONS,
  AVAILABLE_FUNCTIONS,
  sessionContext = null // Optional session context from voice/stateful sessions
) => {
  console.log('🧠 Starting ReAct loop for:', userQuery);
  console.log('📜 Conversation history length:', conversationHistory?.length || 0);
  if (conversationHistory && conversationHistory.length > 0) {
    console.log('   Last message:', conversationHistory[conversationHistory.length - 1].text?.substring(0, 100));
  }
  if (sessionContext) {
    console.log('📋 Session context provided with', sessionContext.recentCalls?.length || 0, 'recent calls');
  }

  // Initialize scratchpad (working memory)
  const scratchpad = {
    user_query: userQuery,
    thoughts: [],
    actions: [],
    observations: [],
    iteration: 0,
    status: 'reasoning',
    requires_relevance_check: false, // State to enforce relevance assessment
    last_search_results: null, // Track last search to enforce relevance check
    previous_context: sessionContext || null // Store session context for reference
  };

  const startTime = Date.now();

  // Build enhanced system prompt with ReAct instructions
  const systemPrompt = await buildReActSystemPrompt(userName, domainId, scratchpad);

  // Initialize conversation with managed history
  const managedHistory = conversationHistory.slice(-20); // Keep last 20 for token management
  const messages = [
    { role: 'system', content: systemPrompt },
    ...managedHistory.map(msg => ({
      role: msg.role || (msg.isUser ? 'user' : 'assistant'),
      content: msg.content || msg.text || ''
    })),
    { role: 'user', content: userQuery }
  ];

  // Convert functions to tools array
  const tools = Object.values(AVAILABLE_FUNCTIONS).map(func => ({
    type: "function",
    function: func
  }));

  console.log(`🔧 ${tools.length} functions available for ReAct loop`);

  // ITERATIVE REACT LOOP
  while (scratchpad.iteration < REACT_CONFIG.maxIterations && scratchpad.status !== 'completed') {
    scratchpad.iteration++;
    console.log(`\n${'='.repeat(60)}`);
    console.log(`🔄 ReAct Iteration ${scratchpad.iteration}/${REACT_CONFIG.maxIterations}`);
    console.log(`${'='.repeat(60)}`);

    // Check timeout
    if (Date.now() - startTime > REACT_CONFIG.maxExecutionTime) {
      console.log('⏱️  Execution timeout reached');
      scratchpad.status = 'timeout';
      break;
    }

    try {
      // STEP 1: THINK - Ask LLM to reason about what to do next
      const thinkMessages = [
        ...messages,
        {
          role: 'system',
          content: buildScratchpadContext(scratchpad)
        }
      ];

      console.log('💭 Asking LLM to think and decide next action...');

      const thinkResponse = await azureOpenAI.chat.completions.create({
        model: process.env.COMPASS_OPENAI_DEPLOYMENT_NAME,
        messages: thinkMessages,
        max_completion_tokens: 2000,
        tools: tools,
        tool_choice: "auto"
      });

      const responseMessage = thinkResponse.choices[0].message;

      // Record the thought process
      if (responseMessage.content) {
        scratchpad.thoughts.push({
          iteration: scratchpad.iteration,
          thought: responseMessage.content,
          timestamp: new Date().toISOString()
        });
        console.log(`💭 Thought: ${responseMessage.content.substring(0, 150)}${responseMessage.content.length > 150 ? '...' : ''}`);

        // If agent outputted thinking text, clear the relevance check requirement
        if (scratchpad.requires_relevance_check) {
          console.log(`✅ Relevance assessment provided - clearing requirement flag`);
          scratchpad.requires_relevance_check = false;
        }
      } else if (responseMessage.tool_calls && responseMessage.tool_calls.length > 0) {
        // Agent called functions without explicit reasoning text - create synthetic thought
        const functionNames = responseMessage.tool_calls.map(tc => tc.function.name).join(', ');
        const syntheticThought = `Gathering data by calling: ${functionNames}`;
        scratchpad.thoughts.push({
          iteration: scratchpad.iteration,
          thought: syntheticThought,
          timestamp: new Date().toISOString(),
          synthetic: true
        });
        console.log(`💭 Synthetic thought (no explicit reasoning): ${syntheticThought}`);

        if (scratchpad.requires_relevance_check) {
          console.log(`⚠️ WARNING: Agent attempted to call function without relevance assessment!`);
        }
      }

      // STEP 2: ACT - Check if LLM wants to call functions
      if (responseMessage.tool_calls && responseMessage.tool_calls.length > 0) {
        console.log(`🎬 Acting: ${responseMessage.tool_calls.length} function(s) to execute`);

        // Add assistant message to conversation
        messages.push(responseMessage);

        // Execute functions and collect observations
        for (const toolCall of responseMessage.tool_calls) {
          const functionName = toolCall.function.name;
          const functionArgs = JSON.parse(toolCall.function.arguments);

          console.log(`\n📞 Calling: ${functionName}`);
          console.log(`   Parameters:`, functionArgs);

          // Check for repeated actions
          if (isRepeatedAction(scratchpad, functionName, functionArgs)) {
            console.log(`⚠️  WARNING: Detected repeated action - possible loop`);
          }

          // Record action
          scratchpad.actions.push({
            iteration: scratchpad.iteration,
            function_name: functionName,
            parameters: functionArgs,
            timestamp: new Date().toISOString()
          });

          try {
            // STEP 3: OBSERVE - Execute function and record what we learned
            const result = await FUNCTION_IMPLEMENTATIONS[functionName](functionArgs, domainId);

            const observation = {
              iteration: scratchpad.iteration,
              function_name: functionName,
              parameters: functionArgs,
              result: result,
              success: true,
              timestamp: new Date().toISOString()
            };
            scratchpad.observations.push(observation);

            const resultSummary = Array.isArray(result) ? `${result.length} items` : 'data';
            console.log(`👁️  Observation: ✅ Found ${resultSummary}`);

            // ENFORCE RELEVANCE CHECK: If this is a search function, mark that relevance check is required
            const searchFunctions = ['search_use_cases', 'get_use_cases_by_criteria', 'get_strategic_goals_by_pillar', 'get_use_cases_by_goal'];
            if (searchFunctions.includes(functionName) && Array.isArray(result) && result.length > 0) {
              scratchpad.requires_relevance_check = true;
              scratchpad.last_search_results = result;
              console.log(`🔍 RELEVANCE CHECK REQUIRED: Agent must assess ${result.length} results before proceeding`);
            }

            // Add function result to conversation
            messages.push({
              tool_call_id: toolCall.id,
              role: "tool",
              content: JSON.stringify(result)
            });
          } catch (error) {
            console.error(`❌ Function ${functionName} failed:`, error.message);

            const observation = {
              iteration: scratchpad.iteration,
              function_name: functionName,
              parameters: functionArgs,
              error: error.message,
              success: false,
              timestamp: new Date().toISOString()
            };
            scratchpad.observations.push(observation);

            messages.push({
              tool_call_id: toolCall.id,
              role: "tool",
              content: JSON.stringify({ error: error.message })
            });
          }
        }

        // Continue loop - LLM will see observations and decide next action
        console.log(`✅ Iteration ${scratchpad.iteration} complete. Continuing to next iteration...`);
        continue;

      } else {
        // NO MORE ACTIONS - LLM has decided it's done
        // With GPT-5.1's built-in reasoning, trust the model's judgment
        // It can distinguish between greetings/casual conversation and data queries

        console.log('\n' + '='.repeat(60));
        console.log('✅ ReAct loop COMPLETED: LLM has all needed information');
        console.log(`   Data gathering actions: ${scratchpad.actions.length}`);
        console.log(`   Observations recorded: ${scratchpad.observations.length}`);
        console.log('='.repeat(60));
        scratchpad.status = 'completed';

        return {
          response: responseMessage.content || 'I have completed my analysis.',
          scratchpad: scratchpad,
          iterations_used: scratchpad.iteration,
          execution_time_ms: Date.now() - startTime
        };
      }

    } catch (error) {
      console.error(`❌ ReAct iteration ${scratchpad.iteration} failed:`, error);
      scratchpad.status = 'failed';
      scratchpad.error = error.message;

      return {
        response: `I encountered an issue while processing your request: ${error.message}`,
        scratchpad: scratchpad,
        iterations_used: scratchpad.iteration,
        execution_time_ms: Date.now() - startTime
      };
    }
  }

  // Max iterations reached or timeout
  console.log('\n' + '='.repeat(60));
  if (scratchpad.iteration >= REACT_CONFIG.maxIterations) {
    console.log('⚠️  Max iterations reached. Synthesizing final response...');
  } else if (scratchpad.status === 'timeout') {
    console.log('⏱️  Timeout reached. Synthesizing final response...');
  }
  console.log('='.repeat(60));

  // Final synthesis call
  try {
    const finalResponse = await azureOpenAI.chat.completions.create({
      model: process.env.COMPASS_OPENAI_DEPLOYMENT_NAME,
      messages: [
        ...messages,
        {
          role: 'system',
          content: `You have reached the maximum number of reasoning iterations${scratchpad.status === 'timeout' ? ' due to timeout' : ''}.
          Based on all the information you've gathered, provide a comprehensive final answer.

          ${buildScratchpadContext(scratchpad)}`
        }
      ],
      max_completion_tokens: 2000
    });

    return {
      response: finalResponse.choices[0].message.content,
      scratchpad: scratchpad,
      iterations_used: scratchpad.iteration,
      max_iterations_reached: scratchpad.status !== 'timeout',
      timeout_reached: scratchpad.status === 'timeout',
      execution_time_ms: Date.now() - startTime
    };
  } catch (error) {
    console.error('❌ Final synthesis failed:', error);
    return {
      response: `I gathered information but encountered an issue synthesizing the final response: ${error.message}`,
      scratchpad: scratchpad,
      iterations_used: scratchpad.iteration,
      execution_time_ms: Date.now() - startTime
    };
  }
};

module.exports = {
  generateIntelligentResponseWithReAct,
  buildReActSystemPrompt,
  buildScratchpadContext,
  REACT_CONFIG,
  TOKEN_LIMITS
};

import {
  monthlyFinalProductiveOutputSchema,validateMonthlyFinalProductiveOutput,
  monthlyFinalReadAloudOutputSchema,monthlyFinalReadAloudIssues,readAloudPositions,readAloudPoolWords,
  monthlyFinalWritingExerciseSchema,monthlyFinalWritingNotesSchema,monthlyFinalWritingSampleRepairSchema,monthlyFinalSpeakingSampleRepairSchema,validateMonthlyFinalSampleRepair,
  writingBlocksInput,monthlyFinalWritingBlocksOutputSchema,validateMonthlyFinalWritingBlocks,composeWritingBlocks,
  monthlyFinalWritingBlockOutputSchema,monthlyFinalWritingBlockCandidates,WRITING_BLOCK_KEYS,
  monthlyFinalGrammarReviewInputSchema,monthlyFinalGrammarReviewOutputSchema,validateMonthlyFinalGrammarReview,
  monthlyFinalWordCount,monthlyFinalWritingOpening,
  type AiTaskRunner,type AiRunResult,type MonthlyFinalGenerationInput,type MonthlyFinalProductiveOutput,type MonthlyFinalSampleRepairInput
} from "@e4s/ai";

const A1_WRITING_HINT = 'Bắt đầu bằng câu gợi ý: "Here is a short update."';
/** Smallest natural read-aloud sentence that still holds two taught words per pool. */
const MIN_READ_ALOUD_SENTENCE_WORDS = 6;
const GRAMMAR_REVIEW_PROMPT = [
  "For each item, compare the actual English quote with its supplied grammar formula and focus.",
  "Give one short reason naming the construction in the quote or the error. Set matches to true if the quote is grammatical and demonstrates the supplied form. If sample is present, its other sentences must also be grammatical.",
  "When facts are supplied, check the entire sample against the key facts and required actions. Reject contradictions or an omitted stated deadline, schedule change or major required action. Allow paraphrasing, short natural context and combining ideas.",
  "Judge the actual construction. The key only identifies the item, and the usage examples illustrate the form. Do not infer another requirement from the key or demand the exact example words.",
  "Set matches to false only for a concrete grammatical error, a wrong form or a missed key fact that you name in the reason. Style, clarity, word choice or a possible better phrasing is not an error. The reason and matches must agree: if your reason says the quote is grammatical and demonstrates the form and the sample has no named error or missed fact, matches is true."
].join("\n");

function applyWritingRepair(writing: MonthlyFinalProductiveOutput["writing"], output: unknown) {
  const exercise = monthlyFinalWritingExerciseSchema.safeParse(output);
  return exercise.success ? exercise.data : {...writing, ...monthlyFinalWritingSampleRepairSchema.parse(output)};
}

/**
 * The productive slice re-reviews evidence after each repair, including quotes
 * that did not change (the untouched section, unchanged secondary quotes, block
 * candidates later chosen as evidence). A quote already accepted for the same
 * grammar, sample and facts is not sent to the reviewer again within one
 * generation; rejected or new items are always reviewed.
 */
export function withAcceptedGrammarReviewMemo(runner:AiTaskRunner):AiTaskRunner{
  const accepted=new Map<string,AiRunResult>();
  return {
    async runTask(taskId,input,options){
      if(taskId!=="monthly_final_grammar_evidence_review")return runner.runTask(taskId,input,options);
      const key=JSON.stringify([input,options?.systemPrompt??""]);
      const known=accepted.get(key);
      if(known)return known;
      const result=await runner.runTask(taskId,input,options);
      const parsed=monthlyFinalGrammarReviewOutputSchema.safeParse(result.output);
      if(parsed.success&&parsed.data.items.length&&parsed.data.items.every(item=>item.matches))accepted.set(key,result);
      return result;
    }
  };
}

/** Repair failed sections without rewriting accepted instructions, facts, grammar or other sections. */
export async function generateMonthlyFinalProductive(baseRunner:AiTaskRunner,input:MonthlyFinalGenerationInput,prompt:string):Promise<AiRunResult>{
  const runner=withAcceptedGrammarReviewMemo(baseRunner);
  const result=await generateProductiveCandidate(runner,input,prompt);
  const candidate=monthlyFinalProductiveOutputSchema.parse(result.output);
  const review=await reviewGrammarEvidence(runner,input,candidate);
  if(!review.length)return result;
  const draft=structuredClone(candidate);
  await Promise.all((["writing","speakingB"] as const).filter(kind=>review.some(issue=>issue.key.startsWith(kind))).map(async kind=>{
    const feedback=review.filter(issue=>issue.key.startsWith(kind)).map(issue=>`${issue.key}: ${issue.reason}`);
    const fixed=await repairSample(runner,input,candidate,kind,feedback);
    if(kind==="writing")draft.writing=applyWritingRepair(draft.writing,fixed.output);
    else draft.speakingB={...draft.speakingB,...monthlyFinalSpeakingSampleRepairSchema.parse(fixed.output)};
  }));
  const issues=validateMonthlyFinalProductiveOutput(draft,input),remaining=await reviewGrammarEvidence(runner,input,draft);
  issues.push(...remaining.map(issue=>({path:`${issue.key}`,message:`Grammar evidence does not apply the selected taught component: ${issue.reason}`})));
  if(issues.length)throw Object.assign(new Error("Productive grammar evidence is invalid"),{code:"AI_OUTPUT_INVALID",issues,details:{invalidOutput:JSON.stringify(draft)}});
  return {...result,output:draft};
}
async function reviewGrammarEvidence(runner:AiTaskRunner,input:MonthlyFinalGenerationInput,candidate:MonthlyFinalProductiveOutput,only?:"writing"|"speakingB",includeFacts=true){
  const sections=only ? [only] : ["writing","speakingB"] as const;
  const items=sections.flatMap(kind=>Object.entries(candidate[kind].evidence).map(([role,quote])=>{
    const code=role.startsWith("ga")?"GA":"GB",topic=input.grammar.find(topic=>topic.code===code)!;
    const selected=candidate.grammarComponents.find(component=>component.code===code)!;
    const stepId=role.endsWith("Main")?selected.mainStepId:selected.secondaryStepId;
    const grammar=topic.taughtSteps.find(step=>step.stepId===stepId);
    const section=candidate[kind];
    return {
      key:`${kind}.${role}`,grammar,quote,
      ...(role === "gaMain" ? {
        sample: section.sample,
        ...(input.cefr === "A1" && includeFacts ? {facts: [section.facts, ...section.requirements].join("\n")} : {})
      } : {})
    };
  }));
  const raw=monthlyFinalGrammarReviewInputSchema.parse({items});
  const reviewed=await Promise.all(raw.items.map(async item=>{
    const result=await runner.runTask("monthly_final_grammar_evidence_review",{items:[item]},{systemPrompt:GRAMMAR_REVIEW_PROMPT,maxOutputTokens:500,maxAttempts:2});
    return monthlyFinalGrammarReviewOutputSchema.parse(result.output).items;
  }));
  const output={items:reviewed.flat()};
  const issues=validateMonthlyFinalGrammarReview(output,raw);if(issues.length)throw Object.assign(new Error("Incomplete grammar review"),{code:"AI_OUTPUT_INVALID",issues});
  return output.items.filter(item=>!item.matches);
}

async function generateProductiveCandidate(runner:AiTaskRunner,input:MonthlyFinalGenerationInput,prompt:string):Promise<AiRunResult>{
  let candidate:MonthlyFinalProductiveOutput;
  let findings:ReturnType<typeof validateMonthlyFinalProductiveOutput>;
  try {
    const openingGuide = input.cefr === "A1"
      ? `\nEnd the A1 writing task with ${A1_WRITING_HINT} The sample starts with the quoted sentence. Choose complementary taught forms that each fit a short clause. Plan one coherent situation with short notes for past work, current status and a proposed next step. Use at most one named future day in the Writing facts. If asking the client to confirm, do not add another deadline for that request. Do not say a future action already happened. The 35–45 word sample must include each key fact and requested action in plain English.`
      : "";
    return await runner.runTask("monthly_final_productive_generation", input, {
      systemPrompt: prompt + openingGuide,
      maxOutputTokens: 5000,
      maxAttempts: 2
    });
  }catch(error){
    if(!error || typeof error!=="object" || !("code" in error) || error.code!=="AI_OUTPUT_INVALID")throw error;
    const parsed=monthlyFinalProductiveOutputSchema.safeParse((error as {details?:{invalidOutput?:unknown}}).details?.invalidOutput);
    if(!parsed.success)throw error;
    candidate=parsed.data;
    const needsHint = input.cefr === "A1" && !monthlyFinalWritingOpening(candidate.writing.task);
    if (needsHint) candidate.writing.task += `\n${A1_WRITING_HINT}`;
    findings=validateMonthlyFinalProductiveOutput(candidate,input);
    if (needsHint && !findings.some(issue => issue.path.startsWith("writing."))) {
      findings.push({path:"writing.sample",message:"Apply the A1 opening to the sample answer."});
    }
    if(!findings.length || findings.some(issue=>issue.path==="writing.task"||!/^writing\.|^speakingA\.|^speakingB\./u.test(issue.path)))throw error;
    // Failed pronunciation positions are rebuilt from the taught pools and actual repaired text.
  }
  const draft=structuredClone(candidate);
  const jobs:Array<Promise<AiRunResult>>=[];
  if(findings.some(issue=>issue.path.startsWith("speakingA.")))jobs.push(repairReadAloud(runner,input,candidate).then(result=>{
    draft.speakingA=result.output as MonthlyFinalProductiveOutput["speakingA"];return result;
  }));
  if(findings.some(issue=>issue.path.startsWith("writing.")))jobs.push(repairSample(runner,input,candidate,"writing").then(result=>{
    draft.writing=applyWritingRepair(draft.writing,result.output);return result;
  }));
  if(findings.some(issue=>issue.path.startsWith("speakingB.")))jobs.push(repairSample(runner,input,candidate,"speakingB").then(result=>{
    draft.speakingB={...draft.speakingB,...monthlyFinalSpeakingSampleRepairSchema.parse(result.output)};return result;
  }));
  const repaired=await Promise.all(jobs);
  const productive=monthlyFinalProductiveOutputSchema.parse(draft);
  const issues=validateMonthlyFinalProductiveOutput(productive,input);
  if(issues.length)throw Object.assign(new Error("Productive exam content is still invalid"),{code:"AI_OUTPUT_INVALID",issues,details:{invalidOutput:JSON.stringify(productive)}});
  return {...repaired[0]!,output:productive};
}

async function repairReadAloud(runner:AiTaskRunner,input:MonthlyFinalGenerationInput,candidate:MonthlyFinalProductiveOutput):Promise<AiRunResult>{
  const profile=input.levelProfile.speakingA as {maxWords:number};
  const repairInput={cefr:input.cefr,maxWords:profile.maxWords,words:[],pools:input.pronunciation.map(target=>({code:target.code,focus:target.ipa,examples:target.taughtExamples})),theme:input.theme.title,previousText:candidate.speakingA.text};
  if (input.cefr === "A1") {
    try {
      const result = await runner.runTask("monthly_final_read_aloud_repair", repairInput, {
        systemPrompt: [
          `Write two alternative A1 read-aloud passages. Each passage must have at most ${profile.maxWords} words total and use two different exact taught words from EACH of the four input pools.`,
          "Write two short, connected sentences about the same workplace action. Keep the actor, objects and setting coherent. Choose words that work naturally together in an ordinary workplace. Use the shortest complete phrasing and avoid names, greetings and extra clauses.",
          "Count the words and check all four pools for each alternative. Each alternative must stand on its own. Return only the complete passages."
        ].join("\n"),
        maxOutputTokens: 1200,
        maxAttempts: 2
      });
      const { candidates } = monthlyFinalReadAloudOutputSchema.parse(result.output);
      for (const text of candidates) {
        const positions = readAloudPositions(text, repairInput);
        if (positions.length === 8) return {...result, output: { text, positions }};
      }
    } catch (error) {
      if (!error || typeof error !== "object" || !("code" in error) || error.code !== "AI_OUTPUT_INVALID") throw error;
    }
  }
  const defaultGroups=input.cefr==="C1"?[[0,1],[2],[3]]:[[0,1],[2,3]];
  const writeSentence=async(groups:number[][],index:number,limit?:number,previousText="")=>{
    const goal=Math.floor(profile.maxWords/groups.length)+(index===groups.length-1?profile.maxWords%groups.length:0);
    // The spec limits the whole passage, not equal halves. Allow small local
    // imbalance and rebalance only if the actual composed text exceeds its cap.
    const maxWords=limit??(input.cefr==="A1"?profile.maxWords:goal+2);
    // goal+2 is the requested size. A first sentence is only rejected when it
    // cannot fit the whole passage next to minimal sentences for the other
    // groups; composeSentences rebalances or shortens it against the real cap.
    const acceptedWords=limit??(input.cefr==="A1"?profile.maxWords:Math.max(maxWords,profile.maxWords-MIN_READ_ALOUD_SENTENCE_WORDS*(groups.length-1)));
    const selectedPools=groups[index]!.map(poolIndex=>repairInput.pools[poolIndex]!).map(pool=>({...pool,examples:pool.examples.filter((example,index,all)=>all.findIndex(other=>other.word.toLocaleLowerCase("en-US")===example.word.toLocaleLowerCase("en-US"))===index)}));
    const targets=selectedPools.map(pool=>`${pool.code}: ${pool.examples.map(example=>example.word).join(", ")}`).join("\n");
    const sentenceInput={...repairInput,maxWords:acceptedWords,words:[],pools:selectedPools,previousText};
    const shortening = previousText
      ? `Write a new sentence of at most ${maxWords} words. Use one subject and one verb, with a short object or time phrase. Drop extra subjects, joined clauses and repeated context. Choose new pool words if needed; do not preserve the old wording.`
      : "";
    const style=input.cefr==="A1"
      ? "Use one simple workplace clause about an ordinary team action. Use exactly spelled words without plural or verb endings. An imperative or modal lets you use a base verb. Use the chosen words as the subject, verb, object or modifier."
      : "";
    const systemPrompt=`Write THREE different complete, natural English sentences for a ${input.cefr} workplace read-aloud, as three alternatives in candidates. EVERY alternative must use TWO DIFFERENT exact taught words from EACH of these ${selectedPools.length} pools:\n${targets}\n${style}\nChoose the words that combine most naturally and compactly. Each alternative must independently cover every supplied pool. Aim for ${limit??goal} words per sentence, at most ${maxWords}; count the words before returning. Use the exact forms, letter for letter: no added plural, -s, -ed or -ing endings, so a pool word must appear exactly as listed. Do not split a sentence into tokens/fragments, write a word list, or continue one candidate in another.\n${shortening}`;
    let result: AiRunResult;
    try {
      result=await runner.runTask("monthly_final_read_aloud_repair",sentenceInput,{systemPrompt,maxOutputTokens:1200,temperature:0.2,maxAttempts:2});
    } catch (error) {
      // Every level reuses the targeted rewrite of the best prior sentence
      // (keep its matched pool words, add the missing ones) before failing.
      if (!error || typeof error !== "object" || !("code" in error) || error.code !== "AI_OUTPUT_INVALID") throw error;
      const raw = (error as {details?: {invalidOutput?: string}}).details?.invalidOutput;
      const prior = monthlyFinalReadAloudOutputSchema.safeParse(raw);
      if (!prior.success) throw error;
      const coverage = prior.data.candidates.map(text => ({
        text, pools: selectedPools.map(pool => ({...pool, present: readAloudPoolWords(text, pool.examples).slice(0,2)}))
      }));
      const score = (entry: typeof coverage[number]) => entry.pools.reduce((total,pool) => total + pool.present.length,0);
      const best = coverage.sort((left,right)=>score(right)-score(left) || monthlyFinalWordCount(left.text)-monthlyFinalWordCount(right.text))[0]!;
      const requirements = best.pools.map(pool => {
        const keep = pool.present.length ? `Keep ${pool.present.join(", ")}. ` : "";
        const choices = pool.examples.filter(example => !pool.present.includes(example.word.toLocaleLowerCase("en-US")));
        return keep + (pool.present.length < 2 ? `Add ${2-pool.present.length} different word(s) from ${choices.map(example=>example.word).join(", ")}.` : "");
      });
      result=await runner.runTask("monthly_final_read_aloud_repair",{...sentenceInput,previousText:best.text},{
        systemPrompt:`Rewrite the one sentence in previousText using at most ${maxWords} words. ${requirements.join(" ")} Keep only the words needed for a complete natural workplace sentence. Use exact spellings. Return one alternative.`,
        maxOutputTokens:600,maxAttempts:1
      });
    }
    const output=monthlyFinalReadAloudOutputSchema.parse(result.output);
    const text=output.candidates.filter(text=>monthlyFinalReadAloudIssues(text,sentenceInput).length===0).sort((left,right)=>monthlyFinalWordCount(left)-monthlyFinalWordCount(right))[0];
    if(!text)throw Object.assign(new Error("Read-aloud sentence does not cover its taught pools"),{code:"AI_OUTPUT_INVALID"});
    return {...result,text};
  };
  const composeSentences = async (groups: number[][]) => {
    const sentences = await Promise.all(groups.map((_, index) => writeSentence(groups,index)));
    if (sentences.reduce((sum, sentence) => sum + monthlyFinalWordCount(sentence.text), 0) <= profile.maxWords) return sentences;
    // Give unused words to the longer sentences before imposing local limits.
    const base = Math.floor(profile.maxWords / groups.length);
    const extra = profile.maxWords % groups.length;
    const limits = groups.map((_, index) => base + (index === groups.length - 1 ? extra : 0));
    let available = 0;
    const counts = sentences.map(sentence => monthlyFinalWordCount(sentence.text));
    for (const [index, count] of counts.entries()) {
      if (count < limits[index]!) {
        available += limits[index]! - count;
        limits[index] = count;
      }
    }
    return Promise.all(sentences.map((sentence, index) => {
      const count = counts[index]!;
      const limit = limits[index]!;
      const shared = Math.min(available, Math.max(0, count - limit));
      available -= shared;
      return count > limit + shared ? writeSentence(groups,index,limit + shared,sentence.text) : sentence;
    }));
  };
  let sentences: Awaited<ReturnType<typeof composeSentences>>;
  try {
    sentences = await composeSentences(defaultGroups);
  } catch (error) {
    if (input.cefr !== "A1" || !error || typeof error !== "object" || !("code" in error) || error.code !== "AI_OUTPUT_INVALID") throw error;
    // The target pools are fixed. Pairing them differently may produce shorter natural sentences.
    sentences = await composeSentences([[0,3],[1,2]]);
  }
  const repaired=sentences[0]!;
  const text=sentences.map(sentence=>sentence.text).join(" ");
  const issues=monthlyFinalReadAloudIssues(text,repairInput);
  if(issues.length)throw Object.assign(new Error("Combined read-aloud is invalid"),{code:"AI_OUTPUT_INVALID",issues,details:{invalidOutput:JSON.stringify({candidates:[text]})}});
  if(!text)throw Object.assign(new Error("Read-aloud repair did not meet the locked word budget"),{code:"AI_OUTPUT_INVALID"});
  const positions=readAloudPositions(text,repairInput);
  if(positions.length!==8)throw Object.assign(new Error("Read-aloud text does not cover all four taught pronunciation pools"),{code:"AI_OUTPUT_INVALID"});
  return {...repaired,output:{text,positions}};
}

async function repairSample(runner:AiTaskRunner,input:MonthlyFinalGenerationInput,candidate:MonthlyFinalProductiveOutput,kind:"writing"|"speakingB",feedback:readonly string[]=[]):Promise<AiRunResult>{
  const section=candidate[kind];
  const repairInput:MonthlyFinalSampleRepairInput={kind,cefr:input.cefr,targets:input.targets[kind==="writing" ? "writing" : "speaking"],theme:input.theme.title,task:section.task,facts:section.facts,requirements:section.requirements,previousSample:section.sample,
    grammar:input.grammar.map(topic=>{
      const chosen=candidate.grammarComponents.find(component=>component.code===topic.code)!;
      return {code:topic.code,main:topic.taughtSteps.find(step=>step.stepId===chosen.mainStepId),...(kind==="writing" ? {secondary:topic.taughtSteps.find(step=>step.stepId===chosen.secondaryStepId)} : {})};
    }),profile:input.levelProfile[kind==="writing" ? "writing" : "speakingB"] as Record<string,unknown>};
  if(kind==="writing"){
    const planned=writingBlocksInput(repairInput);
    let writingFeedback = [...feedback];
    let previousSample = planned.previousSample;
    const reviewWriting = async (output: Pick<typeof candidate.writing,"sample"|"evidence">) => {
      const writing = {...candidate.writing, ...output};
      const draft = {...candidate, writing};
      const review = await reviewGrammarEvidence(runner, input, draft, "writing", false);
      if (review.length) return {writing, review};
      // The sample is fixed before authoring learner notes. This keeps the
      // artificial scenario consistent without asking AI to rewrite valid evidence.
      const result = await runner.runTask("monthly_final_writing_notes_repair", {...repairInput,task:"",facts:"",requirements:[],previousSample:writing.sample}, {
        systemPrompt: "Create only the learner-facing A1 writing task, facts and requirements in Vietnamese for the existing English answer in previousSample. Base every stated action and date on what that answer actually says. Write at most three short notes, using no English answer sentences or suggested opening. Keep the monthly workplace purpose and ask the learner to produce a 35–45 word message. Do not return or change the sample.",
        maxOutputTokens: 1000, maxAttempts: 2
      });
      const notes = monthlyFinalWritingNotesSchema.parse(result.output);
      const revised = {...writing,...notes,task:`${notes.task}\nBắt đầu bằng câu gợi ý: "${planned.opening}"`};
      return {writing:revised,review:await reviewGrammarEvidence(runner,input,{...candidate,writing:revised},"writing")};
    };
    for (let attempt = 0; input.cefr === "A1" && attempt < 2; attempt++) {
      try {
        const result = await runner.runTask("monthly_final_writing_sample_repair", {...planned, previousSample}, {
          systemPrompt: [
            "Repair the complete A1 model answer as ONE coherent short message. Return four complete sentences keyed by their assigned grammar roles.",
            "Code inserts opening before your sentences. Do not repeat it. Write the four sentences in gaMain, gaSecondary, gbMain, gbSecondary order.",
            `With the opening, the result must contain ${repairInput.profile.minWords}–${repairInput.profile.maxWords} words. The block word counts and term assignments are planning hints. You may trade words and vocabulary between roles as long as all required terms occur naturally in their supplied meanings.`,
            "Apply the exact selected form in its block. If a form contrasts past and present, show both time frames in that block. Use active clauses for active forms. Report the given facts and next step, including the requested date. Avoid filler, invented facts and repeated ideas.",
            ...writingFeedback
          ].join("\n"),
          maxOutputTokens: 1500,
          maxAttempts: 2
        });
        const blocks = monthlyFinalWritingBlocksOutputSchema.parse(result.output);
        if (validateMonthlyFinalWritingBlocks(blocks, planned).length) break;
        const output = composeWritingBlocks(blocks, planned);
        const {writing,review} = await reviewWriting(output);
        if (!review.length) return {...result, output:writing};
        previousSample = output.sample;
        writingFeedback = review.map(issue => `${issue.key}: ${issue.reason}`);
      } catch (error) {
        if (!error || typeof error !== "object" || !("code" in error) || error.code !== "AI_OUTPUT_INVALID") throw error;
        break;
      }
    }
    const writeBank = async (block: typeof planned.blocks[number], previousText = "", compressedLimit?: number) => {
      const code=block.key.startsWith("ga")?"GA":"GB",topic=input.grammar.find(topic=>topic.code===code)!;
      const chosen=candidate.grammarComponents.find(component=>component.code===code)!;
      const selected=topic.taughtSteps.find(step=>step.stepId===(block.key.endsWith("Main")?chosen.mainStepId:chosen.secondaryStepId))!;
      const blockInput = {
        ...block,
        cefr: input.cefr,
        // Individual roles can trade words. The assembled answer has the hard cap.
        ...(input.cefr === "A1" ? {
          minWords: 1,
          maxWords: compressedLimit ?? Number(repairInput.profile.maxWords) - monthlyFinalWordCount(planned.opening)
        } : {}),
        grammar: selected,
        theme: repairInput.theme,
        task: "Write one sentence for the assigned grammar role.",
        facts: repairInput.facts,
        requirements: [],
        previousText,
        otherBlocks: []
      };
      let previous:unknown;
      for(let attempt=0;attempt<2;attempt++){
        const targetWords = block.targets.map(term => `${JSON.stringify(term.word)} (${term.type}: ${term.meaning})`).join(", ");
        const systemPrompt = [
          `Write three alternative complete sentences for one role of a ${input.cefr} model answer.`,
          `Use this grammar in every alternative: ${selected.focus}. Form: ${selected.formula}.`,
          `Every candidate must contain both the grammar and these assigned words in the same sentence: ${targetWords || "none"}. A candidate is a standalone answer, so do not distribute the requirements across candidates.`,
          input.cefr === "A1"
            ? `Give alternatives of different lengths, including one short clause. Aim for at most ${Math.max(5, block.maxWords - 2)} words in the shortest complete sentence. Code will combine your sentence with three others to fit the whole answer.`
            : `Aim for ${block.minWords}–${block.maxWords} words per alternative. Include a compact complete sentence.`,
          previousText
            ? `Shorten the verified ${monthlyFinalWordCount(previousText)}-word previousText to at most ${blockInput.maxWords} words. Keep its grammar, assigned vocabulary and meaning. Remove repeated context and compress the subject or time phrase.`
            : "",
          "State one relevant fact or action from the learner's notes. Keep the assigned vocabulary meaningful to that fact. Prefer one clause, but link two short clauses if needed.",
          "For example, when the form is future and the required word is 'ready', 'The update will be ready by Tuesday.' satisfies both in one sentence. Use the actual assigned grammar, words and facts for this task.",
          "Keep the given dates and facts. If suggesting a deadline and the notes provide a day, state that day. Avoid invented details, filler, greetings and repeated context. Return three separate candidates.",
          ...writingFeedback.filter(finding=>finding.startsWith(`writing.${block.key}:`))
        ].join("\n");
        const result = await runner.runTask("monthly_final_writing_block_repair", blockInput, {
          systemPrompt,
          ...(previous ? {messages: [
            {role: "user" as const, content: JSON.stringify(blockInput)},
            {role: "assistant" as const, content: JSON.stringify(previous)},
            {role: "user" as const, content: `The preceding candidates split or missed requirements. Rewrite this role only. Every candidate must use ${selected.focus} and ${targetWords || "the supplied facts"} together in the same complete sentence.`}
          ]} : {}),
          maxOutputTokens: 1800,
          maxAttempts: 2
        });
        const output=monthlyFinalWritingBlockOutputSchema.parse(result.output);previous=output;
        const candidates = monthlyFinalWritingBlockCandidates(output, blockInput);
        const classified=await Promise.all(candidates.map(async text=>{
          const reviewInput=monthlyFinalGrammarReviewInputSchema.parse({items:[{key:`writing.${block.key}`,grammar:selected,quote:text}]});
          const review=await runner.runTask("monthly_final_grammar_evidence_review",reviewInput,{systemPrompt:GRAMMAR_REVIEW_PROMPT,maxOutputTokens:500,maxAttempts:2});
          const checked=monthlyFinalGrammarReviewOutputSchema.parse(review.output),issues=validateMonthlyFinalGrammarReview(checked,reviewInput);
          if(issues.length)throw Object.assign(new Error("Incomplete candidate grammar classification"),{code:"AI_OUTPUT_INVALID",issues});
          return checked.items[0]!.matches?text:undefined;
        }));
        const accepted=classified.filter((text):text is string=>Boolean(text));
        if(accepted.length)return {key:block.key,candidates:accepted,metadata:result.metadata};
      }
      throw Object.assign(new Error("No complete candidate demonstrates the selected grammar"),{code:"AI_OUTPUT_INVALID",issues:[{path:`writing.${block.key}`,message:`Need a complete sentence demonstrating ${selected.focus} and using ${block.targets.map(term=>term.word).join(", ")}.`}],details:{invalidOutput:JSON.stringify(previous)}});
    };
    let banks = await Promise.all(planned.blocks.map(block => writeBank(block)));
    const choose = () => {
      let combinations: Array<Partial<Record<typeof WRITING_BLOCK_KEYS[number], string>>> = [{}];
      for (const bank of banks) {
        combinations = combinations.flatMap(existing => bank.candidates.map(text => ({...existing, [bank.key]: text})));
      }
      const valid = combinations.map(value => monthlyFinalWritingBlocksOutputSchema.parse(value))
        .filter(value => validateMonthlyFinalWritingBlocks(value, planned).length === 0);
      const middle = (Number(repairInput.profile.minWords) + Number(repairInput.profile.maxWords)) / 2;
      const distance = (value: typeof valid[number]) => Math.abs(monthlyFinalWordCount(composeWritingBlocks(value, planned).sample) - middle);
      return valid.sort((left, right) => distance(left) - distance(right))[0];
    };
    let chosen = choose();
    const shortest = banks.map(bank => [...bank.candidates].sort((left, right) => monthlyFinalWordCount(left) - monthlyFinalWordCount(right))[0]!);
    const minimumTotal = monthlyFinalWordCount([planned.opening, ...shortest].join(" "));
    const excess = minimumTotal - Number(repairInput.profile.maxWords);
    if (!chosen && input.cefr === "A1" && excess > 0) {
      const compressible = shortest.filter((text, index) => monthlyFinalWordCount(text) > planned.blocks[index]!.maxWords).length;
      const reduction = Math.ceil(excess / Math.max(1, compressible));
      banks = await Promise.all(banks.map(async (bank, index) => {
        const block = planned.blocks[index]!;
        const text = shortest[index]!;
        const count = monthlyFinalWordCount(text);
        if (count <= block.maxWords) return bank;
        try {
          const compressed = await writeBank(block, text, Math.max(1, count - reduction));
          return {...bank, candidates: [...bank.candidates, ...compressed.candidates]};
        } catch (error) {
          if (!error || typeof error !== "object" || !("code" in error) || error.code !== "AI_OUTPUT_INVALID") throw error;
          return bank;
        }
      }));
      chosen = choose();
    }
    if(!chosen)throw Object.assign(new Error("No valid whole-answer writing combination"),{code:"AI_OUTPUT_INVALID",issues:[{path:"writing.sample",message:`No combination of the complete candidate sentences fits ${repairInput.profile.minWords}–${repairInput.profile.maxWords} words with the required opening and all vocabulary.`}],details:{invalidOutput:JSON.stringify({opening:planned.opening,banks:banks.map(bank=>({key:bank.key,candidates:bank.candidates}))})}});
    const output = composeWritingBlocks(chosen,planned);
    if (input.cefr === "A1") {
      // Keep the learner notes written for THIS sample even when the review
      // still has findings: merging the new sample with the old notes lets the
      // final facts review reject the sample for facts it was never written for.
      const {writing} = await reviewWriting(output);
      return {output:writing,metadata:banks[0]!.metadata};
    }
    return {output,metadata:banks[0]!.metadata};
  }
  const requiredGrammar=repairInput.grammar.map(topic=>`${topic.code}: ${JSON.stringify(topic.main)}`).join("\n");
  const result=await runner.runTask("monthly_final_speaking_sample_repair",repairInput,{systemPrompt:`Repair ONLY the Speaking B model answer and its exact grammar evidence. Keep the given task, facts and requirements. Paraphrase the facts instead of copying whole sentences. Check every sentence for correct grammar and tense. The ONLY assessed vocabulary for this answer is targets: use ALL ${repairInput.targets.length} supplied words naturally in their supplied meanings. Never borrow another section's target list. Demonstrate both of these exact main grammar forms in a natural voice message appropriate to the level and duration:\n${requiredGrammar}\nEvidence gaMain must demonstrate GA; gbMain must demonstrate GB. Evidence values must be exact sentences or excerpts actually occurring in your sample, without commentary, formulas, labels or alternatives. Return only sample and evidence. Verify every target word and evidence quote before returning.\n${feedback.join("\n")}`,maxOutputTokens:2000,temperature:0.2,maxAttempts:2});
  const output=monthlyFinalSpeakingSampleRepairSchema.parse(result.output);
  const issues=validateMonthlyFinalSampleRepair(output,repairInput);
  if(issues.length)throw Object.assign(new Error("Sample repair did not satisfy its assigned scope"),{code:"AI_OUTPUT_INVALID",issues,details:{invalidOutput:JSON.stringify(output)}});
  return {...result,output};
}

-- Publish a new immutable prototype scoring prompt for organizations that
-- still use the obsolete transcript-only fluency/interaction instruction.
-- Custom prompts that do not contain that retired wording are left unchanged.
insert into prompt_versions (id, organization_id, task_key, version, content, status, created_by)
select gen_random_uuid(), candidate.organization_id, candidate.task_key,
       (select coalesce(max(existing.version), 0) + 1
        from prompt_versions existing
        where existing.organization_id = candidate.organization_id
          and existing.task_key = candidate.task_key),
       $placement_prompt$Task: grade the productive parts of the "Workplace English CEFR Placement Test" and suggest a CEFR level.
Listening and Reading/Grammar/Vocabulary are already scored automatically (their points and maxima are given). You grade WRITING – all writing tasks together, weighting the formal task more – with the official rubric (5 criteria, each 1-5: task achievement, organization & coherence, vocabulary, grammar, workplace communication; 5 = fully addresses the task with precise professional language, 3 = adequate but limited development with noticeable errors, 1 = very limited). Grade SPEAKING only from supported evidence using 4 criteria, each 1-5: task completion & relevance, grammar & vocabulary, coherence & clarity, and interaction & professional register. Audio evidence may support the applicable criteria. A transcript or typed proxy supports content and register only: it does not score pronunciation, fluency, or real-time interaction from transcripts or typed proxies and requires manual review. Give 0 for a criterion when its supporting evidence is empty. Ignore punctuation/casing noise typical of speech recognition.
Then suggest ONE overall CEFR level (A1-C1) using the test's conversion table (total /100: 0-24 A1, 25-44 A2, 45-64 B1, 65-84 B2, 85-100 C1) and your judgement of the productive skills; if your judgement differs from the table, say so in the rationale. Write the rationale in Vietnamese (3-5 sentences: strengths, the most important weaknesses with 1-2 quoted examples, and why this level). Suggest a realistic one-month goal in Vietnamese (1 sentence) tied to the learner's job.$placement_prompt$,
       'active', candidate.created_by
from (
  select distinct on (organization_id)
         organization_id, task_key, version, created_by
  from prompt_versions
  where task_key = 'assessment_scoring'
    and status = 'active'
    and content like '%fluency & interaction judged from how developed and connected the answers are%'
  order by organization_id, version desc
) as candidate;

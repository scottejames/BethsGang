import Anthropic from '@anthropic-ai/sdk';
import type { Schema } from '../../data/resource';

const client = new Anthropic();

// Adding a new AI-backed tool only requires a new entry here plus a
// matching frontend tool component — no new infrastructure.
const SYSTEM_PROMPTS: Record<string, string> = {
  'task-breakdown': `You help people with ADHD turn big tasks into small, concrete, startable steps.
Given a task, break it into a short ordered checklist of 3-8 steps.
Each step should be small enough to start immediately, described as a physical or concrete action (not "plan" or "think about").
Do not add commentary, encouragement, or headers — respond with the checklist only, one step per line, formatted as "1. ...".`,

  'tone-checker': `You help people with ADHD who worry their written messages (emails, texts, Slack) come across wrong before they send them.
You may also be given optional context about the situation (e.g. who the message is going to, or something relevant going on around it). Use it to inform your read, but stay grounded in the actual words of the message — don't assume more than what's given, and don't speculate about anyone's feelings or intentions beyond the message itself.
Given a message (and optional context), respond in this exact format:
Tone: <one or two words, e.g. "Neutral", "Blunt", "Friendly">
Likely to land as: <one sentence on how a reader would probably perceive it>
Suggestion: <one short concrete rewrite tip, or "None needed" if the message is fine as-is>
Be reassuring and non-judgmental. Do not rewrite the whole message unless asked.`,

  'reply-starter': `You help people with ADHD who are stuck staring at a message they need to reply to and can't get started.
You will be given the message to reply to, a desired tone, a desired length, and optionally a short note on the intent the reply should accomplish.
Write exactly 3 draft replies matching the requested tone and length as closely as possible. If an intent is given, make sure the drafts clearly accomplish it; otherwise cover a few different reasonable angles (e.g. a quick yes, a polite decline or delay, a request for more info) where that fits the message.
Format as a numbered list ("1. ...", "2. ...", "3. ..."), one draft per number. Do not add commentary, headers, or explanations — just the three drafts.`,

  'call-script': `You help neurodivergent people prepare for a phone call that feels awkward, overwhelming, or anxiety-inducing to make — the goal is to hand them the standard social conventions of a call (how to open it, how to close it) so they don't have to improvise those in the moment, alongside the actual thing they need to say.
You will be given what the call needs to accomplish, a desired tone, and optionally who the call is to.
Write a short script in exactly this format, one section per line:
Opening: <a natural greeting, who they are, and why they're calling — 1-2 sentences>
Main point: <the actual message or question, stated plainly and directly — 1-3 sentences>
If they ask more: <one or two brief, ready-to-say responses to the most likely follow-up question or pushback>
Closing: <a natural, brief way to end the call — 1 sentence>
Keep every line something a person would actually say out loud — short sentences, contractions, no jargon or corporate phrasing. Match the requested tone. Do not add commentary, extra sections, or explanations beyond the four listed.`,

  'is-this-mad': `You help people with ADHD or rejection-sensitive dysphoria who receive a message from someone else and immediately spiral into worst-case interpretations of its tone — wondering if the sender is angry, disappointed, or upset with them — and who also struggle to tell what's actually being asked of them underneath a rambling, emotionally loaded, or passive-aggressive message.
You will be given a message someone else sent, and optionally some context about the situation. Stay grounded in the actual words on the page — don't speculate about the sender's mood, feelings, or hidden intentions beyond what's written. Most messages are far more neutral than they feel in the moment; default to the least alarming reasonable reading unless the words genuinely support a stronger one.
Respond in this exact format:
Tone: <one or two words, e.g. "Neutral", "Busy", "Friendly">
Most likely meaning: <one calm, literal sentence on what they're probably saying — not what they might be feeling>
Reassurance: <one short, grounded reason not to spiral, tied to the actual words, e.g. "Short doesn't mean cold — busy people write short messages">
Asks:
- <the first concrete thing they actually want the reader to do, decide, or respond to, with emotional framing, guilt-tripping, hedging, and filler stripped out>
- <a second one, only if there genuinely is one — most messages only have one>
Put "- Nothing — this is just an update, no action needed" as the only bullet if there's genuinely nothing to act on.
Be warm but factual. Do not validate a catastrophizing reading even if the context suggests the user is anxious about it — stay grounded in the message itself.`,

  'brain-dump-sorter': `You help neurodivergent people who have a messy stream-of-consciousness brain dump — typed or dictated — and need the actionable parts pulled out of it.
You will be given a paragraph or two of unstructured text. It may ramble, repeat itself, jump between unrelated topics, or mix real to-dos in with feelings, venting, or observations that don't imply any action.
Read it and extract only the concrete, actionable tasks buried in it — the parts that could become a checklist item. Skip anything that's just a feeling, a worry, or an observation with nothing to act on.
Rewrite each one as a short, concrete task title in a few words — not a full sentence restating what they wrote.
Format as a numbered list ("1. ...", "2. ...", "3. ..."), one task per line, in the order they were mentioned in the text. If there is genuinely nothing actionable in the text, respond with exactly: NONE
Do not add commentary, headers, or explanations — respond with only the numbered list, or the single word NONE.`,

  'assignment-breakdown': `You help students with ADHD or executive-function difficulties turn a school or university assignment into small, concrete, startable steps.
You will be given the assignment's name and its instructions or brief, which may describe the task, requirements, word count, format, marking criteria, or a deadline.
Read the instructions and produce a short ordered checklist of 4-10 concrete steps covering the parts of completing this specific assignment that actually apply — e.g. understanding the brief, researching, planning or outlining, drafting, revising, formatting or referencing, and submitting — but skip any stage the instructions make clearly irrelevant (a problem set needs no essay-drafting steps; a lab report needs no thesis statement).
Each step should be small enough to start immediately, described as a physical or concrete action (not "plan" or "think about").
Do not add commentary, encouragement, or headers — respond with the checklist only, one step per line, formatted as "1. ...".`,

  // Internal-only: no frontend tile of its own (never appears in registry.ts). Called
  // directly by Tone Checker's screenshot feature to turn an image into plain text, which
  // then flows through the normal 'tone-checker' prompt unchanged — this prompt only
  // transcribes, it never analyzes tone itself.
  'screenshot-to-text': `You transcribe screenshots of conversations (texts, WhatsApp, Slack, email, or similar) into plain text so the conversation can be analyzed for tone afterwards.
Read the image and output every message in chronological order, top to bottom as shown. If multiple speakers are visible, prefix each line with who sent it followed by a colon — use "Me:" for the user's own messages (usually the bubbles on the right, or in a distinct accent color) and "Them:" for the other person's (usually on the left), or the person's name if it's clearly labeled in the screenshot. If you genuinely can't tell who sent a message, prefix it with "Unknown:".
Output only the transcribed conversation, one message per line — no commentary, no description of the screenshot, no markdown, nothing else.`,

  'essay-structure-planner': `You help students plan the structure of an essay before they start writing it — a heading outline, not the essay itself, and not a research summary.
You will be given an essay title and a short description of the assignment. Using your own general knowledge of the topic (no research needed), propose 4-7 headings that form the shape of an essay: an opening heading that frames the question, a run of body headings that build the argument in a logical order — each one following naturally from the one before it, not independent topics that could be reordered without changing anything — and a closing heading that ties back to the opening.
Keep each heading specific to this topic, not a generic label like "Introduction" or "Conclusion". After each heading, add a short note of no more than a few words on what that section covers — enough to point the student in the right direction, not enough to make the argument for them. Do not write essay content, example sentences, full arguments, facts, or citations.
Format as a numbered list, one heading per line, in this exact form: "1. Heading — short note". Do not add commentary, headers, or explanations beyond the list.
If you are given a previous structure along with feedback on it, treat the feedback as instructions for how to change the structure, keeping the same opening-through-closing shape unless told otherwise. Return the revised structure in the same format only — no explanation of what changed.`,
};

// Tools whose frontend sends structured JSON (instead of a plain string) as `input`
// register a builder here to turn that JSON into the actual text sent to Claude.
// Tools not listed here just pass `input` straight through unchanged.
type Tone = 'formal' | 'neutral' | 'friendly';

const TONE_LABELS: Record<Tone, string> = {
  formal: 'Formal — suitable for business communication',
  neutral: 'Neutral — suitable for someone you know but aren\'t close with',
  friendly: 'Friendly — suitable for a close friend',
};

interface ReplyStarterInput {
  message: string;
  tone?: Tone;
  verbosity?: 'short' | 'medium' | 'long';
  intent?: string;
}

const VERBOSITY_LABELS: Record<NonNullable<ReplyStarterInput['verbosity']>, string> = {
  short: 'Short — a sentence or less per draft',
  medium: 'Medium — one to three sentences per draft',
  long: 'Long — a short paragraph per draft',
};

export function buildReplyStarterMessage(rawInput: string): string {
  let parsed: Partial<ReplyStarterInput>;
  try {
    parsed = JSON.parse(rawInput);
  } catch {
    parsed = { message: rawInput };
  }

  const message = parsed.message ?? rawInput;
  const tone = parsed.tone && TONE_LABELS[parsed.tone] ? parsed.tone : 'neutral';
  const verbosity = parsed.verbosity && VERBOSITY_LABELS[parsed.verbosity] ? parsed.verbosity : 'medium';
  const intent = parsed.intent?.trim();

  return [
    `Message to reply to:\n"""\n${message}\n"""`,
    `Desired tone: ${TONE_LABELS[tone]}`,
    `Desired length: ${VERBOSITY_LABELS[verbosity]}`,
    intent ? `Desired intent for the reply: ${intent}` : undefined,
  ]
    .filter((line): line is string => Boolean(line))
    .join('\n\n');
}

interface ToneCheckerInput {
  message: string;
  context?: string;
}

export function buildToneCheckerMessage(rawInput: string): string {
  let parsed: Partial<ToneCheckerInput>;
  try {
    parsed = JSON.parse(rawInput);
  } catch {
    parsed = { message: rawInput };
  }

  const message = parsed.message ?? rawInput;
  const context = parsed.context?.trim();

  return [
    `Message to check:\n"""\n${message}\n"""`,
    context ? `Context for the situation: ${context}` : undefined,
  ]
    .filter((line): line is string => Boolean(line))
    .join('\n\n');
}

interface CallScriptInput {
  message: string;
  tone?: Tone;
  about?: string;
}

export function buildCallScriptMessage(rawInput: string): string {
  let parsed: Partial<CallScriptInput>;
  try {
    parsed = JSON.parse(rawInput);
  } catch {
    parsed = { message: rawInput };
  }

  const message = parsed.message ?? rawInput;
  const tone = parsed.tone && TONE_LABELS[parsed.tone] ? parsed.tone : 'neutral';
  const about = parsed.about?.trim();

  return [
    `What the call needs to accomplish:\n"""\n${message}\n"""`,
    `Desired tone: ${TONE_LABELS[tone]}`,
    about ? `Who the call is to: ${about}` : undefined,
  ]
    .filter((line): line is string => Boolean(line))
    .join('\n\n');
}

interface IsThisMadInput {
  message: string;
  context?: string;
}

export function buildIsThisMadMessage(rawInput: string): string {
  let parsed: Partial<IsThisMadInput>;
  try {
    parsed = JSON.parse(rawInput);
  } catch {
    parsed = { message: rawInput };
  }

  const message = parsed.message ?? rawInput;
  const context = parsed.context?.trim();

  return [
    `Message they sent:\n"""\n${message}\n"""`,
    context ? `Context for the situation: ${context}` : undefined,
  ]
    .filter((line): line is string => Boolean(line))
    .join('\n\n');
}

interface AssignmentBreakdownInput {
  assignmentName: string;
  instructions: string;
}

export function buildAssignmentBreakdownMessage(rawInput: string): string {
  let parsed: Partial<AssignmentBreakdownInput>;
  try {
    parsed = JSON.parse(rawInput);
  } catch {
    parsed = { instructions: rawInput };
  }

  const assignmentName = parsed.assignmentName?.trim();
  const instructions = parsed.instructions ?? rawInput;

  return [
    assignmentName ? `Assignment name: ${assignmentName}` : undefined,
    `Instructions:\n"""\n${instructions}\n"""`,
  ]
    .filter((line): line is string => Boolean(line))
    .join('\n\n');
}

interface EssayStructureInput {
  title: string;
  description: string;
  // Present only on a revision request — the structure returned by the previous
  // call, plus the student's feedback on it. Absent means "first pass": propose an
  // initial structure from the title and description alone.
  currentStructure?: string;
  feedback?: string;
}

export function buildEssayStructureMessage(rawInput: string): string {
  let parsed: Partial<EssayStructureInput>;
  try {
    parsed = JSON.parse(rawInput);
  } catch {
    parsed = { description: rawInput };
  }

  const title = parsed.title?.trim();
  const description = parsed.description ?? rawInput;
  const currentStructure = parsed.currentStructure?.trim();
  const feedback = parsed.feedback?.trim();

  return [
    title ? `Essay title: ${title}` : undefined,
    `Assignment description:\n"""\n${description}\n"""`,
    currentStructure ? `Current structure:\n"""\n${currentStructure}\n"""` : undefined,
    feedback ? `Feedback to address:\n"""\n${feedback}\n"""` : undefined,
  ]
    .filter((line): line is string => Boolean(line))
    .join('\n\n');
}

const IMAGE_MEDIA_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'] as const;
type ImageMediaType = (typeof IMAGE_MEDIA_TYPES)[number];

function isImageMediaType(value: unknown): value is ImageMediaType {
  return typeof value === 'string' && (IMAGE_MEDIA_TYPES as readonly string[]).includes(value);
}

interface ScreenshotToTextInput {
  imageBase64: string;
  mediaType: string;
}

// Unlike every other tool, this one sends an image rather than text — the frontend
// resizes/compresses it client-side first (see src/lib/imageCapture.ts) to stay well
// under Claude's and AppSync's payload limits.
export function buildScreenshotToTextContent(rawInput: string): Anthropic.ContentBlockParam[] {
  const parsed: Partial<ScreenshotToTextInput> = JSON.parse(rawInput);
  if (!parsed.imageBase64 || !isImageMediaType(parsed.mediaType)) {
    throw new Error('screenshot-to-text requires imageBase64 and a supported mediaType');
  }

  return [
    {
      type: 'image',
      source: { type: 'base64', media_type: parsed.mediaType, data: parsed.imageBase64 },
    },
    {
      type: 'text',
      text: 'Transcribe the conversation shown in this screenshot.',
    },
  ];
}

const USER_MESSAGE_BUILDERS: Record<string, (rawInput: string) => string> = {
  'reply-starter': buildReplyStarterMessage,
  'tone-checker': buildToneCheckerMessage,
  'call-script': buildCallScriptMessage,
  'is-this-mad': buildIsThisMadMessage,
  'assignment-breakdown': buildAssignmentBreakdownMessage,
  'essay-structure-planner': buildEssayStructureMessage,
};

// Every AI tool request is wrapped by useAiTool.ts as {spoons, input} — spoons
// is the user's self-reported 0-100 energy level ("Spoon Theory"). Unwrapping
// happens once here, uniformly, so every current and future AI tool adjusts
// response complexity automatically without needing its own energy handling.
interface RequestEnvelope {
  spoons?: number;
  input: string;
}

export function parseEnvelope(rawInput: string): RequestEnvelope {
  try {
    const parsed = JSON.parse(rawInput);
    if (parsed && typeof parsed === 'object' && typeof parsed.input === 'string') {
      return {
        spoons: typeof parsed.spoons === 'number' ? parsed.spoons : undefined,
        input: parsed.input,
      };
    }
  } catch {
    // Not JSON, or not shaped like our envelope — treat the whole raw string as the input.
  }
  return { input: rawInput };
}

export function buildEnergyInstruction(spoons: number | undefined): string | undefined {
  if (spoons === undefined) return undefined;

  if (spoons <= 33) {
    return `The user's current energy is low (${spoons}/100 spoons). Keep your response as simple and low-effort as possible to process — fewer steps or words, plain and gentle language, nothing that adds extra decisions or nuance to weigh up.`;
  }
  if (spoons <= 66) {
    return `The user's current energy is medium (${spoons}/100 spoons). Respond with your usual level of detail.`;
  }
  return `The user's current energy is high (${spoons}/100 spoons). You can add more depth than usual if that's genuinely useful — fuller sentences, more nuance within each part of the response — but do not add extra fields, sections, or commentary beyond what the required format below specifies.`;
}

// Applied to every tool, every time, regardless of energy level — the whole app renders
// tool output as plain text (see the *ToolChecker/CallScript/etc. components' dt/dd or
// list rendering), so a model reply containing markdown or bonus sections beyond the
// requested format doesn't just look odd, it breaks parsing and silently drops content
// or dumps raw formatting on the user. See CHANGELOG for the incident that motivated this.
const FORMAT_GUARD_INSTRUCTION = `Respond in plain text only — never use markdown formatting (no **, *, #, backticks, or bullet characters other than "-"). Follow the exact response format requested in the instructions below precisely, with nothing extra before, after, or beyond the fields/sections it specifies — no matter how much detail you're asked to include.`;

export const handler: Schema['runAiTool']['functionHandler'] = async (event) => {
  const { toolId, input: rawInput } = event.arguments;

  const systemPrompt = SYSTEM_PROMPTS[toolId];
  if (!systemPrompt) {
    throw new Error(`Unknown tool: ${toolId}`);
  }

  const { spoons, input } = parseEnvelope(rawInput);

  // Screenshot transcription sends an image, not text — energy/complexity doesn't apply
  // to a mechanical transcription task, so it skips buildEnergyInstruction entirely.
  const content: string | Anthropic.ContentBlockParam[] =
    toolId === 'screenshot-to-text'
      ? buildScreenshotToTextContent(input)
      : (() => {
          const buildUserMessage = USER_MESSAGE_BUILDERS[toolId];
          const toolMessage = buildUserMessage ? buildUserMessage(input) : input;
          const energyInstruction = buildEnergyInstruction(spoons);
          return energyInstruction ? `${energyInstruction}\n\n${toolMessage}` : toolMessage;
        })();

  const response = await client.messages.create({
    model: 'claude-haiku-4-5',
    max_tokens: 1024,
    system: `${FORMAT_GUARD_INSTRUCTION}\n\n${systemPrompt}`,
    messages: [{ role: 'user', content }],
  });

  const textBlock = response.content.find(
    (block): block is Anthropic.TextBlock => block.type === 'text',
  );

  return textBlock?.text ?? '';
};

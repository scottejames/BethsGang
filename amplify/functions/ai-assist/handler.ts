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
};

// Tools whose frontend sends structured JSON (instead of a plain string) as `input`
// register a builder here to turn that JSON into the actual text sent to Claude.
// Tools not listed here just pass `input` straight through unchanged.
interface ReplyStarterInput {
  message: string;
  tone?: 'formal' | 'neutral' | 'friendly';
  verbosity?: 'short' | 'medium' | 'long';
  intent?: string;
}

const TONE_LABELS: Record<NonNullable<ReplyStarterInput['tone']>, string> = {
  formal: 'Formal — suitable for business communication',
  neutral: 'Neutral — suitable for someone you know but aren\'t close with',
  friendly: 'Friendly — suitable for a close friend',
};

const VERBOSITY_LABELS: Record<NonNullable<ReplyStarterInput['verbosity']>, string> = {
  short: 'Short — a sentence or less per draft',
  medium: 'Medium — one to three sentences per draft',
  long: 'Long — a short paragraph per draft',
};

function buildReplyStarterMessage(rawInput: string): string {
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

function buildToneCheckerMessage(rawInput: string): string {
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

const USER_MESSAGE_BUILDERS: Record<string, (rawInput: string) => string> = {
  'reply-starter': buildReplyStarterMessage,
  'tone-checker': buildToneCheckerMessage,
};

export const handler: Schema['runAiTool']['functionHandler'] = async (event) => {
  const { toolId, input } = event.arguments;

  const systemPrompt = SYSTEM_PROMPTS[toolId];
  if (!systemPrompt) {
    throw new Error(`Unknown tool: ${toolId}`);
  }

  const buildUserMessage = USER_MESSAGE_BUILDERS[toolId];
  const userMessage = buildUserMessage ? buildUserMessage(input) : input;

  const response = await client.messages.create({
    model: 'claude-haiku-4-5',
    max_tokens: 1024,
    system: systemPrompt,
    messages: [{ role: 'user', content: userMessage }],
  });

  const textBlock = response.content.find(
    (block): block is Anthropic.TextBlock => block.type === 'text',
  );

  return textBlock?.text ?? '';
};

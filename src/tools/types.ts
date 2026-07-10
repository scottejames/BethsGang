import type { ComponentType } from 'react';

// 'planning' is specifically "wired into the Shared Task Store" (see
// TaskStoreContext.tsx) — Everything Pile itself, plus anything that sends into it
// (Task Breakdown, Side Quest Log, Brain Dump Sorter). Everything else is 'general',
// including tools that are arguably "about getting things done" (e.g. Remind Me) but
// aren't actually part of that pipeline — see Home.tsx for where this is read.
export type ToolCategory = 'planning' | 'general';

export interface ToolMeta {
  /** Unique id — must match a key in amplify/functions/ai-assist/handler.ts for AI-backed tools */
  id: string;
  name: string;
  tagline: string;
  icon: string;
  category: ToolCategory;
}

export interface ToolDefinition {
  meta: ToolMeta;
  Component: ComponentType;
}

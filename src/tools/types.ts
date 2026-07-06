import type { ComponentType } from 'react';

export interface ToolMeta {
  /** Unique id — must match a key in amplify/functions/ai-assist/handler.ts for AI-backed tools */
  id: string;
  name: string;
  tagline: string;
  icon: string;
}

export interface ToolDefinition {
  meta: ToolMeta;
  Component: ComponentType;
}

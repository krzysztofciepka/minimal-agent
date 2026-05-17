// Built-in skills bundled with minimal-agent.
// Markdown is imported as text so it is embedded by `bun build --compile`.
import type { Skill } from '../types.js';
import gkeServiceDebug from './gke-service-debug.md' with { type: 'text' };
import transactionFlowDebug from './transaction-flow-debug.md' with { type: 'text' };

export const BUILTIN_SKILLS: Skill[] = [
  {
    name: 'gke-service-debug',
    description:
      'Debug a GKE-hosted service: inspect Cloud Logging and pod/service health, ' +
      'optionally consult source and MySQL, and identify the originating code.',
    content: gkeServiceDebug,
  },
  {
    name: 'transaction-flow-debug',
    description:
      'Investigate a failed transaction via read-only MySQL and customer-interaction ' +
      'progress, and identify the step where the flow stopped or failed.',
    content: transactionFlowDebug,
  },
];

export function getBuiltinSkill(name: string): Skill | undefined {
  return BUILTIN_SKILLS.find(s => s.name === name);
}

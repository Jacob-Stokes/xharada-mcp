import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import * as z from 'zod/v4';

interface HaradaResponse<T> {
  success: boolean;
  data: T;
  error: string | null;
}

async function haradaRequest<T>(
  endpoint: string,
  options: RequestInit = {},
  apiKey?: string,
  apiUrl?: string
) {
  const key = apiKey || process.env.HARADA_API_KEY;
  if (!key) {
    throw new Error('Set HARADA_API_KEY env var or pass apiKey in the tool input.');
  }

  const baseUrl = apiUrl || process.env.HARADA_API_URL;
  if (!baseUrl) {
    throw new Error('Set HARADA_API_URL env var or pass apiUrl in the tool input.');
  }

  const url = `${baseUrl}${endpoint.startsWith('/') ? endpoint : `/${endpoint}`}`;
  const response = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': key,
      ...(options.headers || {}),
    },
  });

  const text = await response.text();
  let parsed: HaradaResponse<T>;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    throw new Error(`Failed to parse API response from ${url}: ${text}`);
  }

  if (!parsed.success) {
    throw new Error(parsed.error || `Harada API request failed for ${url}`);
  }

  return parsed.data;
}

function asTextContent(obj: unknown) {
  return {
    content: [{ type: 'text' as const, text: JSON.stringify(obj, null, 2) }]
  };
}

const mcpServer = new McpServer({ name: 'harada-mcp', version: '0.1.0' });

// Get user summary
mcpServer.registerTool('get_summary', {
  description: 'Fetch the Harada user summary tree (goal → sub-goal → action).',
  inputSchema: {
    level: z.enum(['minimal', 'standard', 'detailed', 'full']).optional().describe('Level of detail (defaults to standard).'),
    includeLogs: z.boolean().optional().describe('When true and level=full, include recent action logs.'),
    includeGuestbook: z.boolean().optional().describe('Include inline guestbook comments.'),
    apiKey: z.string().optional().describe('Override HARADA_API_KEY env var for this call.'),
    apiUrl: z.string().optional().describe('Override HARADA_API_URL env var.'),
  }
}, async ({ level, includeLogs, includeGuestbook, apiKey, apiUrl }) => {
  const params = new URLSearchParams();
  if (level) params.set('level', level);
  if (includeLogs) params.set('include_logs', 'true');
  if (includeGuestbook) params.set('include_guestbook', 'true');
  const path = `/api/user/summary${params.size ? `?${params.toString()}` : ''}`;
  const data = await haradaRequest(path, {}, apiKey, apiUrl);
  return asTextContent(data);
});

// List goals
mcpServer.registerTool('list_goals', {
  description: 'List all primary goals.',
  inputSchema: {
    apiKey: z.string().optional(),
    apiUrl: z.string().optional(),
  }
}, async ({ apiKey, apiUrl }) => {
  const data = await haradaRequest('/api/goals', {}, apiKey, apiUrl);
  return asTextContent(data);
});

// Create goal
mcpServer.registerTool('create_goal', {
  description: 'Create a new primary goal.',
  inputSchema: {
    title: z.string().describe('Goal title'),
    description: z.string().optional().describe('Goal description'),
    apiKey: z.string().optional(),
    apiUrl: z.string().optional(),
  }
}, async ({ title, description, apiKey, apiUrl }) => {
  const body = { title, description };
  const data = await haradaRequest('/api/goals', {
    method: 'POST',
    body: JSON.stringify(body),
  }, apiKey, apiUrl);
  return asTextContent(data);
});

// Create subgoal
mcpServer.registerTool('create_subgoal', {
  description: 'Create a sub-goal under a primary goal.',
  inputSchema: {
    goalId: z.string().describe('Primary goal ID'),
    title: z.string().describe('Sub-goal title'),
    position: z.number().optional().describe('0-7 slot index.'),
    apiKey: z.string().optional(),
    apiUrl: z.string().optional(),
  }
}, async ({ goalId, title, position, apiKey, apiUrl }) => {
  const body: Record<string, unknown> = { title };
  if (typeof position === 'number') body.position = position;
  const data = await haradaRequest(`/api/goals/${goalId}/subgoals`, {
    method: 'POST',
    body: JSON.stringify(body),
  }, apiKey, apiUrl);
  return asTextContent(data);
});

// Create action
mcpServer.registerTool('create_action', {
  description: 'Create an action item under a sub-goal.',
  inputSchema: {
    subGoalId: z.string().describe('Sub-goal ID'),
    title: z.string().describe('Action title'),
    description: z.string().optional().describe('Action description'),
    position: z.number().optional().describe('0-7 slot index'),
    apiKey: z.string().optional(),
    apiUrl: z.string().optional(),
  }
}, async ({ subGoalId, title, description, position, apiKey, apiUrl }) => {
  const body: Record<string, unknown> = { title };
  if (description) body.description = description;
  if (typeof position === 'number') body.position = position;
  const data = await haradaRequest(`/api/subgoals/${subGoalId}/actions`, {
    method: 'POST',
    body: JSON.stringify(body),
  }, apiKey, apiUrl);
  return asTextContent(data);
});

// Log activity
mcpServer.registerTool('log_action_activity', {
  description: 'Create an activity log entry for an action.',
  inputSchema: {
    actionId: z.string().describe('Action ID'),
    logType: z.enum(['note', 'progress', 'completion', 'media', 'link']).describe('Type of log entry'),
    content: z.string().describe('Log content'),
    logDate: z.string().optional().describe('ISO date (defaults to now)'),
    metricValue: z.number().optional().describe('Quantifiable metric'),
    metricUnit: z.string().optional().describe('Unit for metric'),
    mood: z.enum(['motivated', 'challenged', 'accomplished', 'frustrated', 'neutral']).optional(),
    apiKey: z.string().optional(),
    apiUrl: z.string().optional(),
  }
}, async ({ actionId, logType, content, logDate, metricValue, metricUnit, mood, apiKey, apiUrl }) => {
  const body: Record<string, unknown> = {
    log_type: logType,
    content,
  };
  if (logDate) body.log_date = logDate;
  if (typeof metricValue === 'number') body.metric_value = metricValue;
  if (metricUnit) body.metric_unit = metricUnit;
  if (mood) body.mood = mood;

  const data = await haradaRequest(`/api/logs/action/${actionId}`, {
    method: 'POST',
    body: JSON.stringify(body),
  }, apiKey, apiUrl);
  return asTextContent(data);
});

// Post guestbook entry
mcpServer.registerTool('post_guestbook_entry', {
  description: 'Leave a guestbook / encouragement note at user/goal/sub-goal/action level.',
  inputSchema: {
    agentName: z.string().describe('Name of the AI agent'),
    comment: z.string().describe('Comment or encouragement'),
    targetType: z.enum(['user', 'goal', 'subgoal', 'action']).describe('Target level'),
    targetId: z.string().optional().describe('Target ID (optional for user level)'),
    apiKey: z.string().optional(),
    apiUrl: z.string().optional(),
  }
}, async ({ agentName, comment, targetType, targetId, apiKey, apiUrl }) => {
  const body = {
    agent_name: agentName,
    comment,
    target_type: targetType,
    target_id: targetId || null,
  };
  const data = await haradaRequest('/api/guestbook', {
    method: 'POST',
    body: JSON.stringify(body),
  }, apiKey, apiUrl);
  return asTextContent(data);
});

// Reorder subgoal
mcpServer.registerTool('reorder_subgoal', {
  description: 'Move a sub-goal to a new slot (0-7).',
  inputSchema: {
    subGoalId: z.string().describe('Sub-goal ID'),
    targetPosition: z.number().describe('New position (0-7)'),
    apiKey: z.string().optional(),
    apiUrl: z.string().optional(),
  }
}, async ({ subGoalId, targetPosition, apiKey, apiUrl }) => {
  const data = await haradaRequest(`/api/subgoals/${subGoalId}/reorder`, {
    method: 'POST',
    body: JSON.stringify({ targetPosition }),
  }, apiKey, apiUrl);
  return asTextContent(data);
});

// Reorder action
mcpServer.registerTool('reorder_action', {
  description: 'Reorder an action within its sub-goal (0-7).',
  inputSchema: {
    actionId: z.string().describe('Action ID'),
    targetPosition: z.number().describe('New position (0-7)'),
    apiKey: z.string().optional(),
    apiUrl: z.string().optional(),
  }
}, async ({ actionId, targetPosition, apiKey, apiUrl }) => {
  const data = await haradaRequest(`/api/actions/${actionId}/reorder`, {
    method: 'POST',
    body: JSON.stringify({ targetPosition }),
  }, apiKey, apiUrl);
  return asTextContent(data);
});

async function main() {
  const transport = new StdioServerTransport();
  await mcpServer.connect(transport);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';

const DEFAULT_API_URL = process.env.HARADA_API_URL || 'https://harada.jacobstokes.com';

interface HaradaResponse<T> {
  success: boolean;
  data: T;
  error: string | null;
}

async function haradaRequest<T>(endpoint: string, options: RequestInit = {}, apiKey?: string, apiUrl: string = DEFAULT_API_URL) {
  const key = apiKey || process.env.HARADA_API_KEY;
  if (!key) {
    throw new Error('Set HARADA_API_KEY env var or pass apiKey in the tool input.');
  }

  const url = `${apiUrl}${endpoint.startsWith('/') ? endpoint : `/${endpoint}`}`;
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

function asTextPayload(obj: unknown) {
  return { content: [{ type: 'text', text: JSON.stringify(obj, null, 2) }] };
}

const server = new McpServer({ name: 'harada-mcp', version: '0.1.0' });

server.tool(
  'get_summary',
  {
    description: 'Fetch the Harada user summary tree (goal → sub-goal → action).',
    inputSchema: {
      type: 'object',
      properties: {
        level: {
          type: 'string',
          enum: ['minimal', 'standard', 'detailed', 'full'],
          description: 'Level of detail (defaults to standard).',
        },
        includeLogs: {
          type: 'boolean',
          description: 'When true and level=full, include recent action logs.',
        },
        includeGuestbook: {
          type: 'boolean',
          description: 'Include inline guestbook comments.',
        },
        apiKey: {
          type: 'string',
          description: 'Override HARADA_API_KEY env var for this call.',
        },
        apiUrl: {
          type: 'string',
          description: 'Override HARADA_API_URL env var.',
        },
      },
    },
  },
  async (input) => {
    const params = new URLSearchParams();
    if (input.level) params.set('level', input.level);
    if (input.includeLogs) params.set('include_logs', 'true');
    if (input.includeGuestbook) params.set('include_guestbook', 'true');
    const path = `/api/user/summary${params.size ? `?${params.toString()}` : ''}`;
    const data = await haradaRequest(path, {}, input.apiKey, input.apiUrl || DEFAULT_API_URL);
    return asTextPayload(data);
  },
);

server.tool(
  'list_goals',
  {
    description: 'List all primary goals.',
    inputSchema: {
      type: 'object',
      properties: {
        apiKey: { type: 'string' },
        apiUrl: { type: 'string' },
      },
    },
  },
  async (input) => {
    const data = await haradaRequest('/api/goals', {}, input.apiKey, input.apiUrl || DEFAULT_API_URL);
    return asTextPayload(data);
  },
);

server.tool(
  'create_goal',
  {
    description: 'Create a new primary goal.',
    inputSchema: {
      type: 'object',
      properties: {
        title: { type: 'string' },
        description: { type: 'string' },
        apiKey: { type: 'string' },
        apiUrl: { type: 'string' },
      },
      required: ['title'],
    },
  },
  async (input) => {
    const body = { title: input.title, description: input.description };
    const data = await haradaRequest('/api/goals', {
      method: 'POST',
      body: JSON.stringify(body),
    }, input.apiKey, input.apiUrl || DEFAULT_API_URL);
    return asTextPayload(data);
  },
);

server.tool(
  'create_subgoal',
  {
    description: 'Create a sub-goal under a primary goal.',
    inputSchema: {
      type: 'object',
      properties: {
        goalId: { type: 'string' },
        title: { type: 'string' },
        position: { type: 'number', description: '0-7 slot index.' },
        apiKey: { type: 'string' },
        apiUrl: { type: 'string' },
      },
      required: ['goalId', 'title'],
    },
  },
  async (input) => {
    const body: Record<string, unknown> = { title: input.title };
    if (typeof input.position === 'number') body.position = input.position;
    const data = await haradaRequest(`/api/goals/${input.goalId}/subgoals`, {
      method: 'POST',
      body: JSON.stringify(body),
    }, input.apiKey, input.apiUrl || DEFAULT_API_URL);
    return asTextPayload(data);
  },
);

server.tool(
  'create_action',
  {
    description: 'Create an action item under a sub-goal.',
    inputSchema: {
      type: 'object',
      properties: {
        subGoalId: { type: 'string' },
        title: { type: 'string' },
        description: { type: 'string' },
        position: { type: 'number' },
        apiKey: { type: 'string' },
        apiUrl: { type: 'string' },
      },
      required: ['subGoalId', 'title'],
    },
  },
  async (input) => {
    const body: Record<string, unknown> = { title: input.title };
    if (input.description) body.description = input.description;
    if (typeof input.position === 'number') body.position = input.position;
    const data = await haradaRequest(`/api/subgoals/${input.subGoalId}/actions`, {
      method: 'POST',
      body: JSON.stringify(body),
    }, input.apiKey, input.apiUrl || DEFAULT_API_URL);
    return asTextPayload(data);
  },
);

server.tool(
  'log_action_activity',
  {
    description: 'Create an activity log entry for an action.',
    inputSchema: {
      type: 'object',
      properties: {
        actionId: { type: 'string' },
        logType: { type: 'string', description: 'note | progress | completion | media | link' },
        content: { type: 'string' },
        logDate: { type: 'string', description: 'ISO date' },
        metricValue: { type: 'number' },
        metricUnit: { type: 'string' },
        mood: { type: 'string' },
        apiKey: { type: 'string' },
        apiUrl: { type: 'string' },
      },
      required: ['actionId', 'logType', 'content'],
    },
  },
  async (input) => {
    const body: Record<string, unknown> = {
      log_type: input.logType,
      content: input.content,
    };
    if (input.logDate) body.log_date = input.logDate;
    if (typeof input.metricValue === 'number') body.metric_value = input.metricValue;
    if (input.metricUnit) body.metric_unit = input.metricUnit;
    if (input.mood) body.mood = input.mood;

    const data = await haradaRequest(`/api/logs/action/${input.actionId}`, {
      method: 'POST',
      body: JSON.stringify(body),
    }, input.apiKey, input.apiUrl || DEFAULT_API_URL);
    return asTextPayload(data);
  },
);

server.tool(
  'post_guestbook_entry',
  {
    description: 'Leave a guestbook / encouragement note at user/goal/sub-goal/action level.',
    inputSchema: {
      type: 'object',
      properties: {
        agentName: { type: 'string' },
        comment: { type: 'string' },
        targetType: { type: 'string', enum: ['user', 'goal', 'subgoal', 'action'] },
        targetId: { type: 'string' },
        apiKey: { type: 'string' },
        apiUrl: { type: 'string' },
      },
      required: ['agentName', 'comment', 'targetType'],
    },
  },
  async (input) => {
    const body = {
      agent_name: input.agentName,
      comment: input.comment,
      target_type: input.targetType,
      target_id: input.targetId || null,
    };
    const data = await haradaRequest('/api/guestbook', {
      method: 'POST',
      body: JSON.stringify(body),
    }, input.apiKey, input.apiUrl || DEFAULT_API_URL);
    return asTextPayload(data);
  },
);

server.tool(
  'reorder_subgoal',
  {
    description: 'Move a sub-goal to a new slot (0-7).',
    inputSchema: {
      type: 'object',
      properties: {
        subGoalId: { type: 'string' },
        targetPosition: { type: 'number' },
        apiKey: { type: 'string' },
        apiUrl: { type: 'string' },
      },
      required: ['subGoalId', 'targetPosition'],
    },
  },
  async (input) => {
    const data = await haradaRequest(`/api/subgoals/${input.subGoalId}/reorder`, {
      method: 'POST',
      body: JSON.stringify({ targetPosition: input.targetPosition }),
    }, input.apiKey, input.apiUrl || DEFAULT_API_URL);
    return asTextPayload(data);
  },
);

server.tool(
  'reorder_action',
  {
    description: 'Reorder an action within its sub-goal (0-7).',
    inputSchema: {
      type: 'object',
      properties: {
        actionId: { type: 'string' },
        targetPosition: { type: 'number' },
        apiKey: { type: 'string' },
        apiUrl: { type: 'string' },
      },
      required: ['actionId', 'targetPosition'],
    },
  },
  async (input) => {
    const data = await haradaRequest(`/api/actions/${input.actionId}/reorder`, {
      method: 'POST',
      body: JSON.stringify({ targetPosition: input.targetPosition }),
    }, input.apiKey, input.apiUrl || DEFAULT_API_URL);
    return asTextPayload(data);
  },
);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

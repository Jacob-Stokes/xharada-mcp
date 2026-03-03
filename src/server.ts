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

// Agent landing page — START HERE
mcpServer.registerTool('get_harada_overview', {
  description: 'START HERE. Fetches the full Harada landing page: who the user is, their goals, sub-goals, actions, guidance for agents, and API info. Call this first whenever someone says "look at my Harada" or you need to understand their goal structure.',
  inputSchema: {
    apiKey: z.string().optional().describe('Override HARADA_API_KEY env var for this call.'),
    apiUrl: z.string().optional().describe('Override HARADA_API_URL env var.'),
  }
}, async ({ apiKey, apiUrl }) => {
  const data = await haradaRequest('/api/agents/brief', {}, apiKey, apiUrl);
  return asTextContent(data);
});

// Get user summary (detailed tree)
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

// Create or update goal
mcpServer.registerTool('upsert_goal', {
  description: 'Create or update a primary goal. Omit goalId to create a new goal; provide goalId to update an existing one (title, description, status, target_date).',
  inputSchema: {
    goalId: z.string().optional().describe('Goal ID — if provided, updates the existing goal instead of creating a new one.'),
    title: z.string().describe('Goal title'),
    description: z.string().optional().describe('Goal description'),
    status: z.enum(['active', 'completed', 'archived']).optional().describe('Goal status (for updates)'),
    target_date: z.string().optional().describe('Target completion date (ISO format)'),
    apiKey: z.string().optional(),
    apiUrl: z.string().optional(),
  }
}, async ({ goalId, title, description, status, target_date, apiKey, apiUrl }) => {
  const body: Record<string, unknown> = { title };
  if (description !== undefined) body.description = description;
  if (status) body.status = status;
  if (target_date) body.target_date = target_date;

  if (goalId) {
    const data = await haradaRequest(`/api/goals/${goalId}`, {
      method: 'PUT',
      body: JSON.stringify(body),
    }, apiKey, apiUrl);
    return asTextContent(data);
  }

  const data = await haradaRequest('/api/goals', {
    method: 'POST',
    body: JSON.stringify(body),
  }, apiKey, apiUrl);
  return asTextContent(data);
});

// Create or update subgoal
mcpServer.registerTool('upsert_subgoal', {
  description: 'Create or update a sub-goal. Omit subGoalId to create (requires goalId); provide subGoalId to update an existing one (title, description, position).',
  inputSchema: {
    subGoalId: z.string().optional().describe('Sub-goal ID — if provided, updates the existing sub-goal instead of creating a new one.'),
    goalId: z.string().optional().describe('Primary goal ID (required for create, not needed for update)'),
    title: z.string().describe('Sub-goal title'),
    description: z.string().optional().describe('Sub-goal description'),
    position: z.number().optional().describe('0-7 slot index.'),
    apiKey: z.string().optional(),
    apiUrl: z.string().optional(),
  }
}, async ({ subGoalId, goalId, title, description, position, apiKey, apiUrl }) => {
  const body: Record<string, unknown> = { title };
  if (description !== undefined) body.description = description;
  if (typeof position === 'number') body.position = position;

  if (subGoalId) {
    const data = await haradaRequest(`/api/subgoals/${subGoalId}`, {
      method: 'PUT',
      body: JSON.stringify(body),
    }, apiKey, apiUrl);
    return asTextContent(data);
  }

  if (!goalId) {
    throw new Error('goalId is required when creating a new sub-goal.');
  }
  const data = await haradaRequest(`/api/goals/${goalId}/subgoals`, {
    method: 'POST',
    body: JSON.stringify(body),
  }, apiKey, apiUrl);
  return asTextContent(data);
});

// Create or update action
mcpServer.registerTool('upsert_action', {
  description: 'Create or update an action. Omit actionId to create (requires subGoalId); provide actionId to update an existing one (title, description, position, due_date). Set completed to toggle completion.',
  inputSchema: {
    actionId: z.string().optional().describe('Action ID — if provided, updates the existing action instead of creating a new one.'),
    subGoalId: z.string().optional().describe('Sub-goal ID (required for create, not needed for update)'),
    title: z.string().describe('Action title'),
    description: z.string().optional().describe('Action description'),
    position: z.number().optional().describe('0-7 slot index'),
    due_date: z.string().optional().describe('Due date (ISO format)'),
    completed: z.boolean().optional().describe('Set to true/false to toggle completion status (requires actionId)'),
    apiKey: z.string().optional(),
    apiUrl: z.string().optional(),
  }
}, async ({ actionId, subGoalId, title, description, position, due_date, completed, apiKey, apiUrl }) => {
  if (actionId) {
    // Toggle completion if requested
    if (typeof completed === 'boolean') {
      await haradaRequest(`/api/actions/${actionId}/complete`, {
        method: 'PATCH',
      }, apiKey, apiUrl);
    }

    const body: Record<string, unknown> = { title };
    if (description !== undefined) body.description = description;
    if (typeof position === 'number') body.position = position;
    if (due_date !== undefined) body.due_date = due_date;

    const data = await haradaRequest(`/api/actions/${actionId}`, {
      method: 'PUT',
      body: JSON.stringify(body),
    }, apiKey, apiUrl);
    return asTextContent(data);
  }

  if (!subGoalId) {
    throw new Error('subGoalId is required when creating a new action.');
  }
  const body: Record<string, unknown> = { title };
  if (description) body.description = description;
  if (typeof position === 'number') body.position = position;
  if (due_date) body.due_date = due_date;
  const data = await haradaRequest(`/api/subgoals/${subGoalId}/actions`, {
    method: 'POST',
    body: JSON.stringify(body),
  }, apiKey, apiUrl);
  return asTextContent(data);
});

// Create or update activity log
mcpServer.registerTool('upsert_action_log', {
  description: 'Create or update an activity log. Omit logId to create (requires actionId); provide logId to update an existing log entry.',
  inputSchema: {
    logId: z.string().optional().describe('Log ID — if provided, updates the existing log instead of creating a new one.'),
    actionId: z.string().optional().describe('Action ID (required for create, not needed for update)'),
    logType: z.enum(['note', 'progress', 'completion', 'media', 'link']).describe('Type of log entry'),
    content: z.string().describe('Log content'),
    logDate: z.string().optional().describe('ISO date (defaults to now)'),
    metricValue: z.number().optional().describe('Quantifiable metric'),
    metricUnit: z.string().optional().describe('Unit for metric'),
    mood: z.enum(['motivated', 'challenged', 'accomplished', 'frustrated', 'neutral']).optional(),
    apiKey: z.string().optional(),
    apiUrl: z.string().optional(),
  }
}, async ({ logId, actionId, logType, content, logDate, metricValue, metricUnit, mood, apiKey, apiUrl }) => {
  const body: Record<string, unknown> = {
    log_type: logType,
    content,
  };
  if (logDate) body.log_date = logDate;
  if (typeof metricValue === 'number') body.metric_value = metricValue;
  if (metricUnit) body.metric_unit = metricUnit;
  if (mood) body.mood = mood;

  if (logId) {
    const data = await haradaRequest(`/api/logs/${logId}`, {
      method: 'PUT',
      body: JSON.stringify(body),
    }, apiKey, apiUrl);
    return asTextContent(data);
  }

  if (!actionId) {
    throw new Error('actionId is required when creating a new log entry.');
  }
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

// Bulk import goals
mcpServer.registerTool('bulk_import_goals', {
  description: 'Import one or more complete goal trees (with sub-goals, actions, and logs) in a single operation. Much more efficient than creating goals one-by-one.',
  inputSchema: {
    goals: z.array(z.object({
      title: z.string().describe('Goal title'),
      description: z.string().optional().describe('Goal description'),
      target_date: z.string().optional().describe('Target completion date (ISO format)'),
      status: z.enum(['active', 'completed', 'archived']).optional().describe('Goal status'),
      subGoals: z.array(z.object({
        position: z.number().min(1).max(8).describe('Position in grid (1-8)'),
        title: z.string().describe('Sub-goal title'),
        description: z.string().optional().describe('Sub-goal description'),
        actions: z.array(z.object({
          position: z.number().min(1).max(8).describe('Position in grid (1-8)'),
          title: z.string().describe('Action title'),
          description: z.string().optional().describe('Action description'),
          completed: z.boolean().optional().describe('Whether action is completed'),
          completed_at: z.string().optional().describe('Completion date (ISO format)'),
          due_date: z.string().optional().describe('Due date (ISO format)'),
          logs: z.array(z.object({
            log_type: z.enum(['note', 'progress', 'completion', 'media', 'link']).describe('Type of log entry'),
            content: z.string().describe('Log content'),
            log_date: z.string().optional().describe('Log date (ISO format)'),
            duration_minutes: z.number().optional().describe('Duration in minutes'),
            metric_value: z.number().optional().describe('Quantifiable metric'),
            metric_unit: z.string().optional().describe('Unit for metric'),
            mood: z.enum(['motivated', 'challenged', 'accomplished', 'frustrated', 'neutral']).optional(),
            tags: z.string().optional().describe('Comma-separated tags'),
            media_url: z.string().optional().describe('Media URL'),
            media_type: z.string().optional().describe('Media type'),
            external_link: z.string().optional().describe('External link')
          })).optional().describe('Activity logs for this action')
        })).optional().describe('Actions for this sub-goal (up to 8)')
      })).optional().describe('Sub-goals for this goal (up to 8)')
    })).describe('Array of goals to import'),
    apiKey: z.string().optional(),
    apiUrl: z.string().optional(),
  }
}, async ({ goals, apiKey, apiUrl }) => {
  const data = await haradaRequest('/api/goals/import', {
    method: 'POST',
    body: JSON.stringify({ goals }),
  }, apiKey, apiUrl);
  return asTextContent(data);
});

// Delete any resource
const deleteEndpoints: Record<string, string> = {
  goal: '/api/goals',
  subgoal: '/api/subgoals',
  action: '/api/actions',
  log: '/api/logs',
  guestbook: '/api/guestbook',
};

mcpServer.registerTool('delete_resource', {
  description: 'Delete a resource by type and ID. Supported types: goal, subgoal, action, log, guestbook.',
  inputSchema: {
    resourceType: z.enum(['goal', 'subgoal', 'action', 'log', 'guestbook']).describe('Type of resource to delete'),
    resourceId: z.string().describe('ID of the resource to delete'),
    apiKey: z.string().optional(),
    apiUrl: z.string().optional(),
  }
}, async ({ resourceType, resourceId, apiKey, apiUrl }) => {
  const basePath = deleteEndpoints[resourceType];
  if (!basePath) {
    throw new Error(`Unknown resource type: ${resourceType}`);
  }
  const data = await haradaRequest(`${basePath}/${resourceId}`, {
    method: 'DELETE',
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

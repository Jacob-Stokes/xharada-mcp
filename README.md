# Harada MCP Server

Model Context Protocol server that wraps the Harada Method API so Claude Desktop (or any MCP-compliant client) can manipulate goals, sub-goals, action logs, and guestbook entries using tools.

## Quick start

```bash
git clone https://github.com/Jacob-Stokes/xharada-mcp.git
cd xharada-mcp
npm install
npm run build
```

The server expects:

- `HARADA_API_URL` (defaults to `https://harada.jacobstokes.com`)
- `HARADA_API_KEY` — create one inside the Harada Settings → API Keys tab.

You can also override `apiKey`/`apiUrl` per tool invocation.

## Available tools

| Tool | Purpose |
| --- | --- |
| `get_harada_overview` | **START HERE.** Fetches the full landing page: goals, sub-goals, actions, guidance, and API info |
| `get_summary` | Fetch the user summary tree with optional detail level, logs, and guestbook flags |
| `list_goals` | List all primary goals |
| `upsert_goal` | Create or update a primary goal (provide `goalId` to update) |
| `upsert_subgoal` | Create or update a sub-goal (provide `subGoalId` to update) |
| `upsert_action` | Create or update an action (provide `actionId` to update, `completed` to toggle) |
| `upsert_action_log` | Create or update an activity log entry (provide `logId` to update) |
| `bulk_import_goals` | Import complete goal trees (goals + sub-goals + actions + logs) in one operation |
| `post_guestbook_entry` | Leave user/goal/subgoal/action encouragement notes |
| `reorder_subgoal` | Move a sub-goal into a new slot (0-7) |
| `reorder_action` | Move an action inside its 8-grid (0-7) |
| `delete_resource` | Delete any resource by type and ID (goal, subgoal, action, log, guestbook) |

All `upsert_*` tools follow the same pattern: omit the ID to create, provide it to update.

The `bulk_import_goals` tool is much more efficient than creating goals incrementally. Use it when you want to create entire Harada grids (1 goal → 8 sub-goals → 64 actions) in a single API call.

## Claude Desktop config

Add this to your Claude Desktop config file (location varies by OS):

**macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`
**Windows**: `%APPDATA%\Claude\claude_desktop_config.json`

```json
{
  "mcpServers": {
    "harada": {
      "command": "node",
      "args": ["/FULL/PATH/TO/xharada-mcp/dist/server.js"],
      "env": {
        "HARADA_API_KEY": "YOUR_KEY_HERE",
        "HARADA_API_URL": "https://harada.jacobstokes.com"
      }
    }
  }
}
```

Replace `/FULL/PATH/TO/xharada-mcp/` with the actual path where you cloned the repository.

Once wired up, call `get_harada_overview` first to understand the goal structure, then use the `upsert_*` tools to create or modify goals, sub-goals, and actions directly from conversations.

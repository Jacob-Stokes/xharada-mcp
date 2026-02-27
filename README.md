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
| `get_summary` | Fetch `/api/user/summary` with optional level/log/guestbook flags |
| `list_goals` | List primary goals |
| `create_goal` | Create a new primary goal |
| `create_subgoal` | Add a sub-goal under a goal (optionally set slot) |
| `create_action` | Add an action to a sub-goal |
| `log_action_activity` | POST `/api/logs/action/:id` entries (progress, note, etc.) |
| `post_guestbook_entry` | Leave user/goal/subgoal/action comments |
| `reorder_subgoal` | Move a sub-goal into a new slot |
| `reorder_action` | Move an action inside its 8-grid |

Feel free to extend `src/server.ts` with more REST calls (delete/update, guestbook reads, etc.).

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

Once wired up, Claude can call tools like `create_goal` followed by `create_subgoal`/`create_action` to build entire Harada grids directly from conversations, without needing outbound internet access.

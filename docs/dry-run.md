# DRY RUN Mode

DRY RUN mode lets you test any write operation without making real API calls. All read operations always hit the live API.

---

## Enabling DRY RUN

Set `DRY_RUN=true` in your environment or Claude Desktop config:

**In `.env`:**
```env
DRY_RUN=true
```

**In Claude Desktop config:**
```json
{
  "mcpServers": {
    "meta-marketing": {
      "env": {
        "DRY_RUN": "true",
        ...
      }
    }
  }
}
```

When active, the server logs:
```
[meta-mcp] DRY_RUN mode — write operations simulated
```

---

## What DRY RUN Affects

| Tool | DRY RUN Behavior |
|---|---|
| `meta_upload_image` | Validates the file but does not upload it |
| `meta_deploy_campaign` | Validates all parameters and returns a simulated response |
| `meta_add_ad` | Returns a simulated ad creation response |
| `meta_update_campaign_status` | Logs the intended change without calling the API |
| `meta_duplicate_campaign` | Simulates the copy without triggering Meta's async job |
| `meta_update_adset` | Returns a simulated update response |
| `meta_bulk_update_status` | Simulates status updates for all entities |
| `meta_create_audience` | Returns a simulated audience creation response |

All read tools (`meta_get_account`, `meta_list_campaigns`, `meta_get_insights`, etc.) always make real API calls regardless of DRY_RUN.

---

## Use Cases

**Testing a new campaign setup:**
```
Enable DRY_RUN, then ask Claude to deploy a campaign.
It will validate your parameters and show what would be created
without touching the API.
```

**Onboarding:**
```
Use DRY_RUN while getting familiar with the tools.
Switch to DRY_RUN=false when ready to go live.
```

**CI/CD validation:**
```
Use DRY_RUN in automated tests to verify tool configurations
without incurring API usage or creating test entities.
```

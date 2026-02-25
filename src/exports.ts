/**
 * Barrel export for external consumers (e.g. meta-ads-app).
 * Re-exports all tool definitions, handlers, and the TenantContext type.
 */

export type { TenantContext } from './tenant-context.js';

// Tool definitions (MCP-format inputSchema arrays) + handlers
export { managementTools, handleManagementTool } from './tools/management.js';
export { analystTools, handleAnalystTool } from './tools/analyst.js';
export { creatorTools, handleCreatorTool } from './tools/creator.js';
export { debugTools, handleDebugTool } from './tools/debug.js';
export { duplicatorTools, handleDuplicatorTool } from './tools/duplicator.js';
export { audienceTools, handleAudienceTool } from './tools/audience.js';
export { updaterTools, handleUpdaterTool } from './tools/updater.js';
export { pixelTools, handlePixelTool } from './tools/pixels.js';
export { rulesTools, handleRulesTool } from './tools/rules.js';
export { leadsTools, handleLeadsTool } from './tools/leads.js';
export { libraryTools, handleLibraryTool } from './tools/library.js';
export { conversionsTools, handleConversionsTool } from './tools/conversions.js';
export { catalogTools, handleCatalogTool } from './tools/catalogs.js';
export { testingTools, handleTestingTool } from './tools/testing.js';
export { valueRulesTools, handleValueRulesTool } from './tools/value-rules.js';
export { budgetScheduleTools, handleBudgetScheduleTool } from './tools/budget-schedules.js';
export { copyTools, handleCopyTool } from './tools/copy.js';
export { briefTools, handleBriefTool } from './tools/brief.js';
export { adLibraryTools, handleAdLibraryTool } from './tools/adlibrary.js';
export { performanceTools, handlePerformanceTool } from './tools/performance.js';

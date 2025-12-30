---
name: Excel Workbook
description: Generate downloadable Excel workbooks with multiple worksheets for data exports, reports, analytics, and initiative summaries.
triggers: create excel, export to excel, make spreadsheet, generate xlsx, export data
---

# DoF Excel Export Skill

## Description
Generates downloadable Excel spreadsheets for Department of Finance data exports, reports, and analytics using an iterative worksheet-building workflow.

## Activation Triggers
- "Create an Excel export..."
- "Export to Excel..."
- "Generate a spreadsheet..."
- "Create an Excel report..."
- "Export data to Excel..."
- "Make a spreadsheet with..."

## Capabilities
1. **Data Exports** - Export initiatives, goals, or statistics to Excel
2. **Multi-Sheet Reports** - Create workbooks with multiple worksheets
3. **Portfolio Summaries** - Comprehensive data views with multiple sheets
4. **Department Reports** - Department-specific data exports
5. **Analytics Exports** - Statistics and metrics in spreadsheet format

## Workflow Overview

This skill uses an **iterative worksheet-building workflow**:

1. **Initialize Workspace** - Create a session workspace
2. **Initialize Workbook** - Create a new Excel workbook
3. **Gather Data** - Query the database for real information
4. **Add Sheets** - Create worksheets with headers and data
5. **Preview Structure** - Review workbook structure and sample data
6. **Iterate if Needed** - Add more sheets or rows as needed
7. **Generate Excel** - Create the final .xlsx file
8. **Deliver to User** - Provide download link

## Required Tools

| Tool | Purpose |
|------|---------|
| `workspace_init` | Initialize a workspace session (call first!) |
| `excel_init` | Create a new workbook in the workspace |
| `excel_add_sheet` | Add a worksheet with headers and data |
| `excel_add_rows` | Add more rows to an existing sheet |
| `excel_preview` | Preview workbook structure and sample data |
| `excel_generate` | Generate the final .xlsx file |
| `workspace_cleanup` | Clean up when done |

## Step-by-Step Instructions

### Step 1: Initialize Workspace and Workbook

```
Call: workspace_init
Returns: { sessionId: "uuid", ... }

Call: excel_init
{
  sessionId: "<your-session-id>",
  title: "AI Initiatives Report"
}
Returns: { workbookId: "abc123", ... }
```

Save both `sessionId` and `workbookId` for subsequent calls.

### Step 2: Gather Real Data

Query the database for actual data:

```
Call: get_use_cases_by_criteria
  - For all initiatives: {}
  - For high-impact: { strategic_impact: "High" }
  - For a department: { department: "IT Department" }

Call: get_use_case_statistics
  - For overview: { group_by: "department" }
  - For status breakdown: { group_by: "status" }

Call: get_strategic_pillars
  - Get all pillars for context
```

### Step 3: Add Sheets with Data

Create worksheets with the queried data:

**Summary Sheet:**
```
Call: excel_add_sheet
{
  sessionId: "<session-id>",
  workbookId: "<workbook-id>",
  sheetName: "Summary",
  headers: ["Metric", "Value"],
  rows: [
    ["Total Initiatives", "25"],
    ["In Production", "8"],
    ["High Impact", "12"],
    ["Departments", "8"]
  ]
}
```

**Initiatives Sheet:**
```
Call: excel_add_sheet
{
  sessionId: "<session-id>",
  workbookId: "<workbook-id>",
  sheetName: "Initiatives",
  headers: ["Name", "Department", "Status", "Strategic Impact", "Goal"],
  rows: [
    ["Initiative 1", "IT", "production", "High", "Digital Transformation"],
    ["Initiative 2", "Finance", "pilot", "Medium", "Operational Excellence"],
    // ... more rows from query results
  ]
}
```

**Statistics Sheet:**
```
Call: excel_add_sheet
{
  sessionId: "<session-id>",
  workbookId: "<workbook-id>",
  sheetName: "By Department",
  headers: ["Department", "Total", "Production", "Pilot", "In Progress"],
  rows: [
    // ... data from statistics query
  ]
}
```

### Step 4: Add More Rows (If Needed)

For large datasets, add rows incrementally:

```
Call: excel_add_rows
{
  sessionId: "<session-id>",
  workbookId: "<workbook-id>",
  sheetName: "Initiatives",
  rows: [
    ["Initiative 11", "HR", "concept", "Low", "Employee Experience"],
    ["Initiative 12", "Legal", "validation", "Medium", "Compliance"],
    // ... more rows
  ]
}
```

### Step 5: Preview the Workbook

Before generating, preview the structure:

```
Call: excel_preview
{
  sessionId: "<session-id>",
  workbookId: "<workbook-id>",
  sampleRows: 3
}
```

This returns:
- Sheet names and count
- Headers for each sheet
- Row counts
- Sample data (first 3 rows)

Review to ensure:
- All sheets are present
- Headers are correct
- Data looks accurate
- No missing information

### Step 6: Iterate if Needed

Based on preview:
1. Add missing sheets with `excel_add_sheet`
2. Add more rows with `excel_add_rows`
3. Preview again to verify

### Step 7: Generate the Excel File

```
Call: excel_generate
{
  sessionId: "<session-id>",
  workbookId: "<workbook-id>",
  options: {
    author: "Hekmah AI",
    autoFitColumns: true,
    headerStyle: true
  }
}
```

Returns artifact with download URL.

### Step 8: Deliver to User

Present the download link:

"I've created your Excel export with [X] sheets containing [Y] rows of data. You can download it using the button below.

The workbook includes:
- Summary sheet with key metrics
- Detailed initiatives list
- Statistics by department"

### Step 9: Cleanup

```
Call: workspace_cleanup
  { sessionId: "<session-id>" }
```

## Data Formatting Guidelines

### Headers
- Use clear, concise column names
- Capitalize first letter of each word
- Keep headers short but descriptive

### Data Types
- **Text**: Strings for names, descriptions, statuses
- **Numbers**: Raw numbers (not formatted as strings)
- **Dates**: ISO format (YYYY-MM-DD) or readable format
- **Percentages**: As decimals (0.85) or with % symbol

### Sheet Organization
- Put summary/overview sheet first
- Group related data on the same sheet
- Use separate sheets for different data types
- Limit to 5-7 sheets maximum

## Example Complete Workflow

**User Request:** "Export all high-impact initiatives to Excel"

**Your Actions:**

1. Call `workspace_init` → get sessionId
2. Call `excel_init` with title "High Impact Initiatives Export"
3. Call `get_use_cases_by_criteria` with `{ strategic_impact: "High" }`
4. Call `get_use_case_statistics` with `{ group_by: "status" }`
5. Call `excel_add_sheet` for "Summary" with stats
6. Call `excel_add_sheet` for "Initiatives" with full data
7. Call `excel_preview` to verify structure
8. If looks good, call `excel_generate`
9. Present download link to user
10. Call `workspace_cleanup`

## Best Practices

1. **Use Real Data** - Always query the database first. Never make up data.
2. **Organize Logically** - Summary first, details second
3. **Include Context** - Add a summary sheet with key metrics
4. **Keep It Clean** - Clear headers, consistent formatting
5. **Don't Overload** - Split large datasets across sheets if needed
6. **Preview First** - Always preview before generating

## Error Handling

If a tool call fails:
- Log the error
- Try an alternative approach if possible
- Inform the user if the export cannot be created
- Always attempt cleanup even if creation fails

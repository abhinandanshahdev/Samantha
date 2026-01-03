---
name: Word Document
description: Read and create Word documents (.docx) - simple documents via create_docx tool, complex formatting via execute_code with docx-js.
triggers: create document, make docx, word document, create report, write memo, cv, resume, curriculum vitae
license: Proprietary. LICENSE.txt has complete terms
---

# DOCX Reading and Creation

## Overview
Handle Word documents (.docx) - reading content or creating new documents with varying levels of formatting control.

## Reading Documents

Use `read_docx_attachment` tool with the attachment ID to extract text. Preserves document structure in markdown format.

## Creating Documents

### Choose Your Approach

| Document Type | Tool | Use When |
|--------------|------|----------|
| Simple reports, memos | `create_docx` | Standard sections, bullets, tables, consistent formatting |
| CVs, resumes, complex layouts | `execute_code` | Custom tab stops, mixed fonts/sizes, precise spacing, borders |

### Simple Documents: `create_docx` Tool

For standard business documents with consistent formatting:

```
create_docx({
  sessionId: "...",
  title: "Report Title",
  author: "Author Name",
  font: "Calibri",
  colors: { primary: "2C3E50" },
  sections: [
    { heading: "Introduction", content: [{ type: "paragraph", text: "..." }] },
    { heading: "Details", content: [{ type: "bullet", items: ["Item 1", "Item 2"] }] }
  ]
})
```

### Complex Documents: `execute_code` with docx-js

For CVs, resumes, or documents requiring fine-grained control:

1. Call `workspace_init` to get a sessionId
2. Call `execute_code` with custom docx-js code
3. **MANDATORY**: Read [`docx-js.md`](docx-js.md) for syntax rules

#### CV/Resume Template Pattern

```javascript
const { Document, Packer, Paragraph, TextRun, AlignmentType, TabStopType, LevelFormat, PageBreak } = require('docx');
const fs = require('fs');

const doc = new Document({
  styles: {
    default: { document: { run: { font: "Arial", size: 20 } } },
    paragraphStyles: [
      { id: "SectionHeader", name: "SectionHeader", basedOn: "Normal",
        run: { size: 20, bold: true },
        paragraph: { spacing: { before: 160, after: 60 },
                     border: { bottom: { color: "000000", space: 1, style: "single", size: 6 } } } }
    ]
  },
  numbering: {
    config: [{
      reference: "bullet-list",
      levels: [{ level: 0, format: LevelFormat.BULLET, text: "\u2022", alignment: AlignmentType.LEFT,
                 style: { paragraph: { indent: { left: 360, hanging: 360 } } } }]
    }]
  },
  sections: [{
    properties: { page: { margin: { top: 720, right: 720, bottom: 720, left: 720 } } },
    children: [
      // Name - centered, large
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { after: 40 },
        children: [new TextRun({ text: "Person Name", bold: true, size: 28 })]
      }),
      // Contact info
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { after: 140 },
        children: [new TextRun({ text: "email@example.com  |  +1 234 567 890", size: 18 })]
      }),

      // Section header with underline
      new Paragraph({
        style: "SectionHeader",
        children: [new TextRun({ text: "EXPERIENCE", bold: true })]
      }),

      // Date + Company with tab alignment
      new Paragraph({
        tabStops: [{ type: TabStopType.LEFT, position: 1800 }],
        spacing: { before: 80, after: 20 },
        children: [new TextRun({ text: "2020 - Present\tCompany Name, Location", bold: true, size: 20 })]
      }),
      // Company description indented
      new Paragraph({
        indent: { left: 1800 },
        spacing: { after: 30 },
        children: [new TextRun({ text: "Brief company description", italics: true, size: 18 })]
      }),
      // Job title indented
      new Paragraph({
        indent: { left: 1800 },
        spacing: { after: 30 },
        children: [new TextRun({ text: "Job Title", bold: true, size: 20 })]
      }),
      // Bullet points
      new Paragraph({
        numbering: { reference: "bullet-list", level: 0 },
        spacing: { after: 20 },
        children: [new TextRun({ text: "Achievement or responsibility description", size: 18 })]
      }),

      // Page break when needed
      new Paragraph({ children: [new PageBreak()] }),
    ]
  }]
});

Packer.toBuffer(doc).then(buffer => {
  fs.writeFileSync(workspacePath + "/output/document.docx", buffer);
  console.log("Document created!");
});
```

#### Key Formatting Techniques

| Technique | Code Pattern |
|-----------|-------------|
| Date-Company alignment | `tabStops: [{ type: TabStopType.LEFT, position: 1800 }]` + `\t` in text |
| Indented content | `indent: { left: 1800 }` |
| Section underline | `border: { bottom: { style: "single", size: 6 } }` in paragraph style |
| Precise spacing | `spacing: { before: X, after: Y }` (twips: 20 = 1pt) |
| Mixed font sizes | Different `size` values in TextRun (half-points: 20 = 10pt) |
| Bullet lists | Define in `numbering.config`, use `numbering: { reference: "...", level: 0 }` |

## Dependencies
- **pandoc**: For text extraction (pre-installed)
- **docx**: npm package (available in workspace)

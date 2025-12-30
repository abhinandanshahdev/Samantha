---
name: DoF OAIAT Weekly Update
description: Create AI@DoF weekly update slides with Progress View (growth curve, milestones) and Quadrant View (achievements, focus, risks, next steps).
triggers: weekly update, oaiat update, progress slides, status presentation, ai transformation update
---

# DoF AI OAIAT Weekly Update Slides

Create professional AI@DoF weekly update presentations with two standardized slide formats following UAE Department of Finance brand guidelines.

## Overview

This skill enables creation of two specific slide types used for AI@DoF weekly updates:
1. **Slide 1 - Progress View**: Left-side progress sections with star badges, right-side growth curve with phase milestones
2. **Slide 2 - Quadrant View**: Four-section grid layout with colored headers for achievements, focus, risks, and next steps

## When to Use

Use this skill when:
- Creating AI@DoF weekly update presentations
- Building OAIAT (Office of AI and Advanced Technology) status reports
- User requests "AI update slides" or "weekly progress slides"
- Creating progress reports with phase milestones
- Building four-quadrant status summaries

## Design System

### Color Palette

**Primary colors:**
- Navy blue: `#1e4a6d` (titles, highlights, Production phase)
- Gold/Olive: `#b8a45c` (Discovery phase, delta highlights)
- Blue accent: `#5a7fa0` (Development phase)
- Teal: `#4A9B9B` (header icon)

**Section header colors (Slide 2):**
- Key Achievements: Dark grey `#5a5a5a` (white text)
- Current Focus: Sky blue `#87ceeb` (navy text)
- Critical Risks: Light yellow `#fff3cd` (brown text `#856404`)
- Immediate Next Steps: Navy blue `#1e4a6d` (white text)

**Neutral colors:**
- Grey line/curve: `#c0c0c0` to `#a8a8a8` gradient
- Background: `#ffffff`
- Box background: `#f5f7f9`
- Body text: `#333333`
- Muted text: `#666666`

### Typography

- **Font**: Arial (web-safe)
- **Title**: 24px, bold, navy blue
- **Section headers**: 13px, bold, navy blue
- **Body text**: 11px, color #333
- **Phase labels**: 12px, bold, navy blue
- **Phase stats**: 9px, color #555
- **Subtitle**: 10px, italic, #666

## Slide 1: Progress View

### Structure

```
┌─────────────────────────────────────────────────────────────┐
│ [Icon] AI@DoF | High-level progress (as of DD Mon)          │
│ ─────────────────────────────────────────────────────       │
│ AI@DoF encompasses initiatives that span all...             │
├─────────────────────────────────┬───────────────────────────┤
│ ☆ Progress Section 1            │                           │
│   • Bullet point                │     Production Phase      │
│   • Bullet point                │        ●───────────>      │
│                                 │       /    19 (+1)...     │
│ ☆ Progress Section 2            │      /                    │
│   • Bullet point                │  Development Phase        │
│   • Bullet point                │    ●   (current)          │
│                                 │   /    19 (+2)...         │
│ ☆ Progress Section 3            │  /                        │
│   • Bullet point                │ ●  Discovery Phase        │
│   • Bullet point                │    98 (-1)...             │
└─────────────────────────────────┴───────────────────────────┘
```

### Header Icon (People Around Table)

```html
<svg width="24" height="24" viewBox="0 0 24 24" fill="none">
  <!-- Table (rectangle in center) -->
  <rect x="7" y="9" width="10" height="6" rx="1" stroke="#4A9B9B" stroke-width="1.5" fill="none"/>
  <!-- Person top -->
  <circle cx="12" cy="4" r="2" stroke="#4A9B9B" stroke-width="1.5" fill="none"/>
  <!-- Person bottom -->
  <circle cx="12" cy="20" r="2" stroke="#4A9B9B" stroke-width="1.5" fill="none"/>
  <!-- Person left -->
  <circle cx="3" cy="12" r="2" stroke="#4A9B9B" stroke-width="1.5" fill="none"/>
  <!-- Person right -->
  <circle cx="21" cy="12" r="2" stroke="#4A9B9B" stroke-width="1.5" fill="none"/>
</svg>
```

Container: 40x40px, background `#e8f4f4`, border-radius 8px

### Star Badge Icon

Navy circle with small white line star overlay:

```html
<svg class="star-badge" viewBox="0 0 24 24">
  <circle cx="12" cy="12" r="11" fill="#1e4a6d"/>
  <polygon points="12,6 13.5,10 18,10.5 14.5,13.5 15.5,18 12,15.5 8.5,18 9.5,13.5 6,10.5 10.5,10" 
           fill="none" stroke="white" stroke-width="1.2" stroke-linejoin="round"/>
</svg>
```

CSS: `width: 28px; height: 28px;`

### Growth Curve (Revenue-Style)

Thick-stroke quadratic bezier curve sweeping from bottom-left to top-right:

```html
<svg width="420" height="340" viewBox="0 0 420 340">
  <defs>
    <linearGradient id="curveGrad" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" style="stop-color:#c8c8c8"/>
      <stop offset="100%" style="stop-color:#a8a8a8"/>
    </linearGradient>
  </defs>
  
  <!-- Growth curve - thick stroke bezier -->
  <path d="M 40 270 Q 180 260 240 170 Q 300 80 380 50" 
        fill="none" 
        stroke="url(#curveGrad)" 
        stroke-width="45"
        stroke-linecap="round"
        stroke-linejoin="round"/>
  
  <!-- Arrowhead pointing up-right -->
  <polygon points="365,65 395,35 385,75" fill="#a0a0a0"/>
  
  <!-- Phase markers -->
  <circle cx="95" cy="260" r="14" fill="#b8a45c"/>   <!-- Discovery -->
  <circle cx="255" cy="155" r="17" fill="#5a7fa0"/>  <!-- Development -->
  <circle cx="365" cy="65" r="20" fill="#1e4a6d"/>   <!-- Production -->
</svg>
```

### Phase Labels

Position labels near their corresponding markers:
- **Discovery Phase**: Bottom-left, centered text
- **Development Phase**: Middle, with "(current)" sublabel in gold
- **Production Phase**: Top-right

### Progress Section Format

```html
<div class="progress-section">
  <div class="progress-title">
    [Star Badge SVG]
    <h3>Section Title</h3>
  </div>
  <ul>
    <!-- Note: <span> is OK inside <li> for inline formatting -->
    <li><span class="highlight-num">Number</span> <span class="highlight-gold">(+delta)</span> description text</li>
    <li>Regular bullet point text</li>
  </ul>
</div>
```

**Important**: `<span>` is ONLY valid inside text elements like `<li>`, `<p>`, or headings for inline formatting. Never use `<span>` directly inside `<div>`.

Highlight classes:
- `.highlight-num`: `font-weight: 700; color: #1e4a6d;`
- `.highlight-gold`: `font-weight: 700; color: #b8a45c;`

## Slide 2: Quadrant View

### Structure

```
┌─────────────────────────────────────────────────────────────┐
│ [Icon] AI@DoF | High-level progress (as of DD Mon)          │
│ ─────────────────────────────────────────────────────       │
├─────────────────────────────┬───────────────────────────────┤
│ Key Achievements (grey)     │ Current Focus (sky blue)      │
│ • Bullet point              │ • Bullet point                │
│ • Bullet point              │ • Bullet point                │
│ • Bullet point              │ • Bullet point                │
├─────────────────────────────┼───────────────────────────────┤
│ Critical Risks (yellow) ⚠   │ Immediate Next Steps (navy)   │
│ • Bullet point              │ • Bullet point                │
│ • Bullet point              │ • Bullet point                │
│ • Bullet point              │ • Bullet point                │
└─────────────────────────────┴───────────────────────────────┘
```

### Section Box Structure

Each quadrant uses this structure:

```html
<div class="section-box">
  <div class="section-header section-header-[color]">
    <h3>Section Title</h3>
    <!-- Warning icon for Critical Risks only -->
  </div>
  <div class="section-content">
    <ul>
      <!-- <span> inside <li> is OK for inline formatting -->
      <li>Bullet point with <span class="highlight">highlighted text</span></li>
    </ul>
  </div>
</div>
```

**⚠️ Never put `<span>` directly inside `<div>` - use `<p>` instead!**

### Section Header Styles

```css
.section-header {
  padding: 6px 12px;
  border-radius: 4px 4px 0 0;
}
.section-header h3 {
  margin: 0;
  font-size: 12px;
  font-weight: 700;
}
.section-header-darkgrey {
  background: #5a5a5a;
}
.section-header-darkgrey h3 { color: white; }

.section-header-skyblue {
  background: #87ceeb;
}
.section-header-skyblue h3 { color: #1e4a6d; }

.section-header-yellow {
  background: #fff3cd;
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.section-header-yellow h3 { color: #856404; }

.section-header-navy {
  background: #1e4a6d;
}
.section-header-navy h3 { color: white; }
```

### Warning Icon (Critical Risks)

```html
<svg class="warning-icon" viewBox="0 0 24 24" fill="none">
  <path d="M12 3L2 21h20L12 3z" fill="#ffc107" stroke="#e8a000" stroke-width="1"/>
  <path d="M12 10v5" stroke="#333" stroke-width="2" stroke-linecap="round"/>
  <circle cx="12" cy="18" r="1" fill="#333"/>
</svg>
```

CSS: `width: 20px; height: 20px;`

### Grid Layout

```css
main {
  display: grid;
  grid-template-columns: 1fr 1fr;
  grid-template-rows: 1fr 1fr;
  gap: 10px;
  padding: 10px 32px 12px 32px;
}
```

## Content Guidelines

### Slide 1 - Progress Sections

Typical sections include:
- **Progress in 1,000 Agents Program**: Use case counts, demos, contract updates
- **Progress in MVP for [Domain] AI**: Early demos, feature development
- **Progress in AI capabilities**: Infrastructure, stack alignment, partnerships

Use delta notation: `139 (+5)` for changes from previous period

### Slide 2 - Quadrant Content

- **Key Achievements**: Completed milestones, launches, partnerships
- **Current Focus**: Active workstreams, MVP development, ongoing initiatives
- **Critical Risks**: Blockers, dependencies, timeline risks (note: "All risks are being actively mitigated")
- **Immediate Next Steps**: Near-term actions, upcoming milestones

### Text Highlighting

Use `.highlight` class for:
- Key metrics and numbers
- Product/initiative names (AISHA, Knowledge@DoF, Hekmah AI)
- Important terms (Discovery sessions, GPU Infrastructure, Contract)
- Use `NEXT:` with underline for upcoming items

## Workflow

1. **Read pptx skill** for html2pptx workflow
2. **Determine date** for slide titles (format: "DD Mon" e.g., "03 Dec")
3. **Gather content** for each section
4. **Create HTML slides** using templates above
5. **Generate PPTX** using html2pptx
6. **Validate** with thumbnail generation
7. **Iterate** if needed

## Example Usage

```javascript
const pptxgen = require("pptxgenjs");
const { html2pptx } = require("./html2pptx");

const pptx = new pptxgen();
pptx.layout = "LAYOUT_16x9";

// Slide 1: Progress View
await html2pptx("slide1-progress.html", pptx);

// Slide 2: Quadrant View  
await html2pptx("slide2-quadrant.html", pptx);

await pptx.writeFile({ fileName: "ai-dof-update.pptx" });
```

## Best Practices

### DO:
- Use consistent delta notation (+N) in gold for improvements
- Keep bullet points concise (1-2 lines max)
- Highlight key terms and metrics
- Position phase labels near their markers
- Use the exact header icon (people around table)

### DON'T:
- Use emojis
- Exceed 5 bullet points per section
- Use different fonts
- Change the growth curve style (keep thick-stroke bezier)
- Mix up section header colors

## Troubleshooting

### CRITICAL: Slide Dimensions MUST Be Exact

**The html2pptx library validates that HTML matches the PowerPoint layout exactly.**

```html
<!-- ALWAYS use these EXACT dimensions - copy/paste this line -->
<body style="width: 960px; height: 540px; margin: 0; padding: 0; box-sizing: border-box; ...">
```

**Dimensions that WORK: `width: 960px; height: 540px;`** (equals 10" × 5.625" at 96 DPI)

**Common WRONG dimensions that will FAIL:**
- `9.2" × 4.8"` (884px × 460px) - TOO SMALL
- `width: 100%` or `width: 100vw` - PERCENTAGES DON'T WORK
- Any calculated dimensions - WILL FAIL

**If you see the error "HTML dimensions don't match presentation layout":**
1. Check the `<body>` tag has EXACTLY `width: 960px; height: 540px;`
2. Ensure there is NO margin or padding on body (use `margin: 0; padding: 0;`)
3. Do NOT try different dimensions - 960×540 is the ONLY valid size

### CRITICAL: No Borders/Backgrounds on Text Elements

**The html2pptx library ONLY supports borders, backgrounds, and shadows on `<div>` elements.**

```html
<!-- ❌ WRONG - will cause validation error -->
<p style="border: 1px solid #000; background: #f5f5f5;">Text</p>
<h2 style="border-bottom: 2px solid #4A9B9B;">Title</h2>

<!-- ✅ CORRECT - wrap text in a div for styling -->
<div style="border: 1px solid #000; background: #f5f5f5;">
  <p style="margin: 0;">Text</p>
</div>
<div style="border-bottom: 2px solid #4A9B9B;">
  <h2 style="margin: 0;">Title</h2>
</div>
```

**Rule: ALL decorative styles (border, background, shadow, border-radius) go on `<div>` wrappers, NOT on text elements.**

### CRITICAL: Text Not Appearing in PowerPoint

**The html2pptx library ONLY extracts text from these elements:**
- `<p>` - paragraphs
- `<h1>` through `<h6>` - headings  
- `<ul>`, `<ol>`, `<li>` - lists

**⚠️ `<span>` is NOT recognized as a standalone text element!**

If you use `<span>` directly inside a `<div>`, the text will be LOST in the PowerPoint:

```html
<!-- ❌ WRONG - text will disappear in PPTX -->
<div style="display: flex;">
  <span>This text disappears</span>
  <span>42</span>
</div>

<!-- ✅ CORRECT - use <p> tags -->
<div style="display: flex;">
  <p style="margin: 0;">This text appears</p>
  <p style="margin: 0;">42</p>
</div>
```

**Rule: ALL text content must be wrapped in `<p>`, `<h1>`-`<h6>`, or list tags.**

`<span>` is only valid for inline formatting WITHIN a `<p>` tag:
```html
<p>This is <span style="font-weight: bold;">bold</span> text</p>
```

### Content Overflow
If validation warns about overflow:
1. Reduce bullet point count
2. Shorten text
3. Adjust padding values

### Curve Not Rendering
Ensure SVG uses:
- `stroke-width="45"` for thickness
- `stroke-linecap="round"` for smooth ends
- Gradient fill for professional look

### Phase Labels Misaligned
Adjust absolute positioning values to align labels with curve markers.

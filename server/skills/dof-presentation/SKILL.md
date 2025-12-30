---
name: PowerPoint Presentation
description: Create professional PowerPoint presentations with DoF branding, sea green theme, and clean layouts for strategy decks and executive briefings.
triggers: create presentation, make pptx, powerpoint, create slides, make a deck
---

# DoF Presentations

Create professional PowerPoint presentations following UAE Department of Finance (AI@DoF) brand guidelines.

## Overview

This skill enables creation of presentations that follow DoF's visual identity and design standards. The style emphasizes clarity, professionalism, and consistency with sea green accents and clean layouts.

## When to Use

Use this skill when:
- Creating presentations for DoF or UAE government context
- Building strategy decks, governance frameworks, or executive briefings
- User requests "DoF style" or mentions UAE Department of Finance
- Professional presentations requiring clean, modern design

## Design System

### Colors

**Primary colors:**
- Sea green: `#4A9B9B`
- Light teal: `#A3D5D5` (for boxes and accents)
- Gray: `#666666` (for badges and secondary text)

**Background and text:**
- Pure white background: `#ffffff`
- Black text: `#000000`
- Light gray backgrounds: `#f5f5f5` (for cards)
- Muted text: `#666666`

### Typography

- **Font**: Arial (web-safe, professional)
- **No capital letters** in section labels
- **No emojis** anywhere in presentations
- Use sentence case for all headers and labels

### Layout Principles

1. **No borders** on containers - use background colors only
2. **Clean spacing** - adequate padding and gaps
3. **Horizontal alignment** - ensure section headers align across columns
4. **No nested boxes** - avoid boxes within boxes for simplicity

## Slide Structure

### Header Format

Every slide follows this structure:

```
AI@DoF | [Slide Title]
━━━━━━
[Key takeaway box - no label, just the content]
```

- **AI@DoF branding**: Underlined with 3px sea green line (`#4A9B9B`)
- **Title**: After the pipe `|` in sentence case
- **Key takeaway box**: Light teal background (`#F0F8F8`), no "Key Takeaway" label

### Key Takeaway Box

```html
<div style="background: #F0F8F8; padding: 10px 14px; border-radius: 8px;">
  <p class="text-sm" style="margin: 0; line-height: 1.5; color: #000000;">
    [Key message for this slide]
  </p>
</div>
```

**Guidelines:**
- Place after the header, before main content
- No label - just the takeaway text
- Should be definition or main insight for the slide
- Keep concise (1-2 sentences)

## Content Patterns

### Pattern 1: Principles Triangle

For displaying 3 core principles in triangular layout:

```
     [Top Principle]

[Left Principle]  [Right Principle]
```

**Implementation:**
- Light teal boxes (`#A3D5D5`)
- Center-aligned text
- Principle name in bold, description below
- No icons needed

### Pattern 2: Numbered Lists

For governance principles, patterns, or sequential items:

```
1  [Item Name]
   Description text

2  [Item Name]
   Description text
```

**Implementation:**
- Gray circular badges (`#666666`) with white numbers
- Light teal boxes (`#A3D5D5`) for content
- Title in bold, description in smaller text
- Keep to 4-5 items maximum for readability

### Pattern 3: Vision/Summary Cards

For highlighting key concepts or vision statements:

```
+---------------------------+
|   [Title]                 |
|                           |
|   [Visual element]        |
|                           |
|   [Summary text]          |
+---------------------------+
```

**Implementation:**
- Sea green background (`#4A9B9B`)
- White text
- Include honeycomb or other geometric pattern
- Bottom text: key message + principles

### Honeycomb Pattern

Used in vision cards to represent modular/composable systems:

```html
<!-- Create hexagons with varying opacity -->
<div style="width: 48px; height: 42px;
     clip-path: polygon(30% 0%, 70% 0%, 100% 50%, 70% 100%, 30% 100%, 0% 50%);
     background: #A3D5D5;">
</div>
```

Arrange in offset rows with varying opacity (0.4 to 0.9) for depth.

## HTML Structure Guidelines

### CSS Variables

Define these at the start of each slide:

```css
:root {
  --color-primary: #4A9B9B;
  --color-accent-light: #A3D5D5;
  --color-surface: #ffffff;
  --color-surface-foreground: #000000;
  --color-muted: #f5f5f5;
  --color-muted-foreground: #666666;
}
```

### Body Structure

```html
<body style="width: 960px; height: 540px; margin: 0; padding: 0; box-sizing: border-box;
             background: #ffffff; color: #000000; font-family: Arial, sans-serif;
             overflow: hidden;" class="col gap">
  <header class="fit px-12 pt-8">
    <!-- AI@DoF branding and key takeaway -->
  </header>

  <main class="fill-height row gap-lg px-12 pb-8">
    <!-- Slide content in columns -->
  </main>
</body>
```

### Spacing Control

Adjust these to prevent overflow:
- Body gap: `gap: 0.5rem` to `gap: 0.75rem`
- Section gap: `gap: 0.75rem`
- Main padding bottom: `pb-6` to `pb-8`
- Header padding top: `pt-6` to `pt-8`

Reduce gaps if content overflows (validation will warn).

## Content Guidelines

### Governance Frameworks

When presenting governance principles:
1. Combine related principles (max 4-5 items)
2. Use numbered badges
3. Title + brief description format
4. Light teal boxes

Example: "Atomic & Autonomous" combines atomic scope and autonomy.

### Agentic Patterns

When showing patterns or workflows:
1. Use numbered badges
2. Gray card backgrounds (`#f5f5f5`)
3. Pattern name + description + benefit
4. No nested boxes - put benefit text directly in card

### Strategic Vision

When presenting vision or goals:
1. Use right-side card with sea green background
2. Include visual element (honeycomb for modularity)
3. Short statement + key principles at bottom
4. Keep text minimal

## Best Practices

### DO:
- Use definition or main insight as key takeaway
- Keep text concise (slides not reports)
- Align section headers horizontally
- Use sentence case throughout
- Combine related principles to reduce clutter
- Test with thumbnail generation to check for overflow

### DON'T:
- Use emojis or icons with opaque backgrounds
- Use capital letters in labels
- Add borders to containers
- Create nested boxes within boxes
- Exceed 4-5 items in numbered lists
- Add "Key Takeaway" label (just show the text)

## Workflow

1. **Initialize workspace**: Call `workspace_init` first
2. **Plan slides**: Determine structure and key takeaways
3. **Create HTML**: One file per slide with DoF styling
4. **Generate PPTX**: Use `create_pptx` to convert
5. **Validate**: Check for overflow issues
6. **Iterate**: Adjust spacing if content overflows

## Example Slide Structure

```html
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    :root {
      --color-primary: #4A9B9B;
      --color-accent-light: #A3D5D5;
      --color-surface: #ffffff;
      --color-surface-foreground: #000000;
      --color-muted: #f5f5f5;
      --color-muted-foreground: #666666;
    }
  </style>
</head>
<body style="width: 960px; height: 540px; margin: 0; padding: 0; box-sizing: border-box;
             background: #ffffff; color: #000000; font-family: Arial, sans-serif;
             overflow: hidden;" class="col gap">
  <header class="fit px-12 pt-8">
    <div class="row gap-sm items-center" style="margin-bottom: 10px;">
      <div style="border-bottom: 3px solid #4A9B9B; display: inline-block; padding-bottom: 2px;">
        <h1 class="text-3xl" style="color: #000000; font-weight: 700; margin: 0;">AI@DoF</h1>
      </div>
      <p class="text-lg" style="color: #000000; margin: 0; font-weight: 400;">| Slide Title</p>
    </div>

    <div style="background: #F0F8F8; padding: 10px 14px; border-radius: 8px;">
      <p class="text-sm" style="margin: 0; line-height: 1.5; color: #000000;">
        Key insight or definition for this slide.
      </p>
    </div>
  </header>

  <main class="fill-height row gap-lg px-12 pb-8">
    <!-- Content columns here -->
  </main>
</body>
</html>
```

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
2. Ensure there is NO margin or padding on body
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

**⚠️ `<span>` is NOT recognized as a text element!**

If you use `<span>` directly inside a `<div>`, the text will be LOST in the PowerPoint:

```html
<!-- ❌ WRONG - text will be missing in PPTX -->
<div style="display: flex;">
  <span>This text disappears</span>
  <span>7</span>
</div>

<!-- ✅ CORRECT - use <p> tags -->
<div style="display: flex;">
  <p style="margin: 0;">This text appears</p>
  <p style="margin: 0;">7</p>
</div>
```

**Rule: ALL text content must be wrapped in `<p>`, `<h1>`-`<h6>`, or list tags.**

`<span>` is only valid for inline formatting WITHIN a `<p>` tag:
```html
<p>This is <span style="font-weight: bold;">bold</span> text</p>
```

### Content Overflow
If validation warns about overflow:
1. Reduce `pb-8` to `pb-6` or `pb-4` in main
2. Reduce `pt-8` to `pt-6` in header
3. Reduce gaps: `gap` to `gap: 0.5rem`
4. Reduce padding in boxes: `padding: 10px 14px` to `padding: 8px 12px`
5. Combine list items if possible

### Text Wrapping
If labels wrap to multiple lines:
- Text is too long for container
- Reduce font size or shorten text
- Stick with Arial (other fonts may cause wrapping)

### Alignment Issues
If section headers don't align:
- Ensure both have `class="fit"`
- Remove extra margins (`margin: 0`)
- Check parent containers have matching gap values

## Required Tools

| Tool | Purpose |
|------|---------|
| `workspace_init` | Initialize workspace session |
| `workspace_write_file` | Save HTML slide files |
| `create_pptx` | Generate PowerPoint from HTML slides |
| `workspace_cleanup` | Clean up when done |

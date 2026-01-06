# Design Style Guide

## Overview
This guide defines the design system for a professional trade quoting application with a clean, modern aesthetic inspired by iOS design principles. The design emphasizes clarity, functionality, and mobile-first responsiveness.

---

## Color System

### Primary Colors
```
Brand Primary:    #0f172a (slate-900) - Main brand color
Brand Hover:      #1e293b (slate-800) - Hover states
Brand Dark:       #334155 (slate-700) - Active states
```

### Secondary Colors
```
Secondary:        #475569 (slate-600) - Secondary text
Tertiary:         #94a3b8 (slate-400) - Muted text, labels
Surface:          #f8fafc (slate-50)  - Background surfaces
Border:           #e2e8f0 (slate-200) - Dividers, borders
```

### Accent Colors
```
Accent:           #d4ff00 - Primary accent (lime green)
Accent Dark:      #a8cc00 - Accent hover state
Accent Text:      #1a2e05 - Text on accent backgrounds
```

### Semantic Colors
```
Success:          Use accent colors (#d4ff00)
Danger:           #ef4444 (red-500)
Warning:          #f59e0b (amber-500)
Info:             #3b82f6 (blue-500)
```

### Usage Rules
- **Never use purple, indigo, or violet** unless explicitly requested
- Dark text (#0f172a) on light backgrounds for maximum contrast
- White text on dark backgrounds (#0f172a)
- Accent color (#d4ff00) for CTAs and important actions
- Maintain WCAG AA contrast ratios (4.5:1 minimum for text)

---

## Typography

### Font Family
```css
font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Display', 'Segoe UI', 'Roboto', sans-serif
```

### Font Sizes & Weights
```
Display:          32px / font-bold / tracking-tight
Title (H1):       28px / font-bold / tracking-tight
Heading (H2):     24px / font-bold / tracking-tight
Heading (H3):     20px / font-bold / tracking-tight
Body Large:       17px / font-medium / tracking-normal
Body Regular:     15px / font-medium / tracking-tight
Body Small:       13px / font-medium / tracking-normal
Caption:          11px / font-bold / uppercase / tracking-widest
Tiny:             10px / font-medium / tracking-wide
```

### Line Height
```
Headings:         120% (1.2)
Body:             150% (1.5)
Captions:         140% (1.4)
```

### Font Weight Scale
```
Regular:          400 (rarely used - prefer medium)
Medium:           500 (default for body text)
Semibold:         600 (emphasis)
Bold:             700 (headings, buttons)
```

---

## Spacing System

### Base Unit: 8px
All spacing uses multiples of 8px for consistency:

```
4px   (0.5rem) - Micro spacing
8px   (1rem)   - Tight spacing
12px  (1.5rem) - Compact spacing
16px  (2rem)   - Standard spacing
20px  (2.5rem) - Comfortable spacing
24px  (3rem)   - Generous spacing
32px  (4rem)   - Section spacing
40px  (5rem)   - Large section spacing
48px  (6rem)   - Extra large spacing
```

### Component-Specific Spacing
```
Card padding:     24px (p-6)
Button padding:   24px horizontal (px-6)
List item gap:    12px (gap-3)
Section gap:      20px (gap-5)
Form field gap:   16px (gap-4)
```

### Safe Area (Mobile)
```
Bottom padding:   max(1.25rem, env(safe-area-inset-bottom))
```

---

## Border Radius

### Scale
```
Small:            8px  (rounded-lg)   - Small elements
Medium:           12px (rounded-xl)   - Inputs, pills
Large:            16px (rounded-2xl)  - Buttons
Extra Large:      24px (rounded-[24px]) - Cards
Full:             9999px (rounded-full) - Circles, icons
```

### Usage
- Cards: 24px
- Buttons: 16px
- Inputs: 12px
- Pills/Tags: 9999px (full)
- Modal sheets: 24px (top corners only)

---

## Shadows

### Elevation Scale
```css
/* Card elevation */
shadow-card: 0 2px 8px rgba(0, 0, 0, 0.04),
             0 1px 2px rgba(0, 0, 0, 0.06)

/* Floating elevation (modals, dropdowns) */
shadow-float: 0 8px 24px rgba(0, 0, 0, 0.12),
              0 4px 8px rgba(0, 0, 0, 0.08)

/* Button elevation */
shadow-md: 0 4px 6px -1px rgba(0, 0, 0, 0.1)
shadow-lg: 0 10px 15px -3px rgba(0, 0, 0, 0.1)

/* Accent shadow (for accent buttons) */
shadow-accent/20: Use with accent color buttons
```

### Usage Rules
- Cards: `shadow-card`
- Buttons: `shadow-md` (hover: `shadow-lg`)
- Bottom sheets: `shadow-float`
- Floating panels: `shadow-float`
- Avoid excessive shadows - keep it subtle

---

## Components

### Buttons

#### Heights
```
Primary:          56px (h-[56px])
Secondary:        48px (h-[48px])
Small:            40px (h-[40px])
```

#### Variants
```tsx
Primary:    bg-brand text-white hover:bg-brandDark
Secondary:  bg-surface text-primary border border-border
Outline:    bg-white border-2 border-border
Accent:     bg-accent text-accentText hover:bg-accentDark
Success:    bg-accent text-accentText (with accent shadow)
Danger:     bg-red-500 text-white hover:bg-red-600
```

#### States
```
Default:    Scale 1.0, full opacity
Hover:      Darker background, shadow-lg
Active:     Scale 0.98 (transform)
Disabled:   Opacity 0.5, no hover effects, cursor-not-allowed
```

### Cards

#### Structure
```tsx
<Card>              // bg-white rounded-[24px] shadow-card p-6
  <CardHeader />    // Section label + optional action
  {content}
</Card>
```

#### Variants
- Default: White background, shadow-card
- Interactive: Add `active:scale-[0.99]` on click
- No padding: Use `noPadding` prop for custom layouts

### Inputs

#### Structure
```
Height:           56px
Border radius:    12px (rounded-xl)
Border:           2px solid #e2e8f0
Padding:          16px horizontal
Font size:        15px
```

#### States
```
Default:    border-border bg-white
Focus:      border-brand ring-2 ring-brand/10
Error:      border-red-500 ring-2 ring-red-500/10
Disabled:   bg-gray-50 text-gray-400 cursor-not-allowed
```

### Pills/Tags

```
Height:           32px
Border radius:    9999px (rounded-full)
Padding:          12px horizontal (px-3)
Font size:        13px font-medium
Background:       bg-surface
Border:           border border-border
```

### Bottom Sheets

```
Border radius:    24px (top corners)
Shadow:           shadow-float
Padding:          24px + safe-area-inset-bottom
Max height:       90vh
Animation:        slide-up (0.3s ease-out)
```

---

## Animations & Transitions

### Timing Functions
```
Fast:       150ms ease-out
Standard:   200ms ease-out
Slow:       300ms ease-out
Very Slow:  400ms ease-out
```

### Common Animations
```css
/* Slide up (bottom sheets) */
animate-slide-up: slide-up 0.3s ease-out

/* Scale in (modals) */
animate-scale-in: scale-in 200ms ease-out

/* Fade out */
animate-fade-out: fade-out 400ms ease-out forwards

/* Fade slide out (toasts) */
animate-fade-slide-out: fade-slide-out 400ms ease-out forwards

/* Button press */
active:scale-[0.98]

/* Card press */
active:scale-[0.99]
```

### Interactive States
```
Buttons:     transition-all duration-200
Cards:       transition-transform duration-200
Sheets:      transition-transform duration-300
Overlays:    transition-opacity duration-200
```

---

## Layout Patterns

### Mobile-First Container
```tsx
<div className="min-h-screen bg-surface">
  <div className="max-w-md mx-auto"> {/* 448px max */}
    {/* Content */}
  </div>
</div>
```

### Section Structure
```tsx
<section className="p-5 space-y-5">
  <h2 className="text-xl font-bold">Section Title</h2>
  <div className="space-y-3">
    {/* Cards or list items */}
  </div>
</section>
```

### List Items
```tsx
<div className="space-y-3">
  <Card onClick={handleClick}>
    <div className="flex items-center gap-4">
      <Icon className="w-6 h-6 text-brand" />
      <div className="flex-1 min-w-0">
        <h3 className="font-bold text-[15px]">Title</h3>
        <p className="text-sm text-secondary">Subtitle</p>
      </div>
      <ChevronRight className="w-5 h-5 text-tertiary" />
    </div>
  </Card>
</div>
```

### Form Layout
```tsx
<form className="space-y-4">
  <div>
    <label className="block text-sm font-medium text-secondary mb-2">
      Label
    </label>
    <input className="w-full h-[56px] px-4 rounded-xl border-2 border-border" />
  </div>
  <Button type="submit" fullWidth>Submit</Button>
</form>
```

---

## Icons

### Size Scale
```
Extra Small:  12px (w-3 h-3)
Small:        16px (w-4 h-4)
Medium:       20px (w-5 h-5)
Large:        24px (w-6 h-6)
Extra Large:  32px (w-8 h-8)
```

### Usage
- Use Lucide React icons
- Default stroke width: 2
- Match icon color to adjacent text
- Use `text-brand` for primary actions
- Use `text-tertiary` for secondary/inactive icons

---

## Accessibility

### Contrast Requirements
- Text on backgrounds: 4.5:1 minimum (WCAG AA)
- Large text (18px+): 3:1 minimum
- UI components: 3:1 minimum

### Touch Targets
- Minimum: 44x44px (iOS guideline)
- Buttons: 56px height (exceeds minimum)
- Interactive cards: Full card area

### Focus States
- Visible focus ring: `ring-2 ring-brand/20`
- Never remove focus outlines
- Keyboard navigation supported

### Screen Reader Support
- Semantic HTML (button, nav, header, etc.)
- ARIA labels where needed
- Meaningful alt text for images

---

## Responsive Design

### Breakpoints
```
Mobile:       < 640px (default)
Tablet:       640px - 768px (sm:)
Desktop:      > 768px (md:)
```

### Container Widths
```
Mobile:       100% (with padding)
Tablet:       640px max-width
Desktop:      768px max-width
Max width:    448px (mobile-optimized)
```

### Mobile-First Approach
- Design for mobile first
- Progressive enhancement for larger screens
- Single column layouts on mobile
- Multi-column on tablet/desktop where appropriate

---

## States & Feedback

### Loading States
```
Spinner:         lucide-react Loader2 with animate-spin
Skeleton:        bg-gray-200 animate-pulse
Disabled:        opacity-50 + cursor-not-allowed
```

### Empty States
```
Icon:            w-16 h-16 text-tertiary
Title:           text-xl font-bold text-primary
Message:         text-sm text-secondary
Action:          Button (accent or primary)
```

### Error States
```
Border:          border-red-500
Background:      bg-red-50
Text:            text-red-600
Icon:            AlertCircle from lucide-react
```

### Success States
```
Border:          border-accent
Background:      bg-accent/10
Text:            text-accentText
Icon:            CheckCircle from lucide-react
```

---

## Best Practices

### Do's
- Use the 8px spacing scale consistently
- Maintain high contrast ratios
- Provide clear visual hierarchy
- Use accent color sparingly (CTAs only)
- Add subtle animations for delight
- Test on actual mobile devices
- Support safe area insets
- Hide scrollbars for clean appearance

### Don'ts
- Don't use purple/indigo unless requested
- Don't use font weights below 500 for body text
- Don't create buttons smaller than 44px height
- Don't use more than 3 font weights
- Don't add excessive shadows
- Don't animate everything
- Don't ignore accessibility requirements
- Don't use default system fonts (use the stack)

---

## Quick Reference Checklist

When creating a new prototype, verify:

- [ ] Color palette uses brand colors (#0f172a primary, #d4ff00 accent)
- [ ] No purple/indigo/violet unless requested
- [ ] Font stack includes -apple-system first
- [ ] Font sizes use the defined scale
- [ ] Spacing uses 8px multiples
- [ ] Border radius matches component type
- [ ] Shadows are subtle (card or float only)
- [ ] Buttons are 56px height minimum
- [ ] Touch targets are 44px minimum
- [ ] Animations use defined timing (200-300ms)
- [ ] Active states include scale transform
- [ ] Focus states visible for keyboard users
- [ ] Text contrast meets WCAG AA
- [ ] Mobile-first responsive design
- [ ] Safe area insets respected
- [ ] Scrollbars hidden on mobile
- [ ] Loading/empty/error states designed
- [ ] Icons from Lucide React at correct sizes

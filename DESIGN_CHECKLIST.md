# Quick Design Checklist

## Colors
- **Primary:** `#0f172a` (dark slate)
- **Accent:** `#d4ff00` (lime green)
- **Surface:** `#f8fafc` (light gray)
- **Border:** `#e2e8f0` (slate)
- **NO PURPLE/INDIGO** unless requested

## Typography
- **Font:** `-apple-system, SF Pro Display, Segoe UI`
- **Sizes:** 32px (display) / 24px (h2) / 15px (body) / 11px (caption)
- **Weights:** 500 (body) / 700 (headings)
- **Line Height:** 150% (body) / 120% (headings)

## Spacing (8px system)
- Tight: 12px
- Standard: 16px
- Card: 24px
- Section: 32px

## Components
- **Buttons:** 56px height, 16px radius, font-bold
- **Cards:** 24px radius, shadow-card, 24px padding
- **Inputs:** 56px height, 12px radius, 2px border
- **Pills:** 32px height, full radius, 12px padding

## Animations
- Standard: 200ms ease-out
- Slide up: 300ms ease-out
- Button press: `active:scale-[0.98]`
- Card press: `active:scale-[0.99]`

## Layout
- Mobile-first (max-width: 448px)
- Single column on mobile
- 20px horizontal padding
- Safe area bottom padding

## Accessibility
- Touch targets: 44px minimum
- Text contrast: 4.5:1 minimum
- Focus rings: `ring-2 ring-brand/20`
- Semantic HTML

## Icons
- Library: Lucide React
- Sizes: 16px (small) / 20px (medium) / 24px (large)
- Stroke: 2px

## Quick Checks
✓ High contrast text (4.5:1)
✓ Buttons 56px tall
✓ 8px spacing multiples
✓ Accent color for CTAs only
✓ Subtle shadows (not excessive)
✓ Mobile-first responsive
✓ Hidden scrollbars
✓ Keyboard accessible

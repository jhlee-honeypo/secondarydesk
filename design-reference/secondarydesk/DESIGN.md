---
name: SecondaryDesk
colors:
  surface: '#fcf8ff'
  surface-dim: '#dcd8e5'
  surface-bright: '#fcf8ff'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#f5f2ff'
  surface-container: '#f0ecf9'
  surface-container-high: '#eae6f4'
  surface-container-highest: '#e4e1ee'
  on-surface: '#1b1b24'
  on-surface-variant: '#464555'
  inverse-surface: '#302f39'
  inverse-on-surface: '#f3effc'
  outline: '#777587'
  outline-variant: '#c7c4d8'
  surface-tint: '#4d44e3'
  primary: '#3525cd'
  on-primary: '#ffffff'
  primary-container: '#4f46e5'
  on-primary-container: '#dad7ff'
  inverse-primary: '#c3c0ff'
  secondary: '#585f6c'
  on-secondary: '#ffffff'
  secondary-container: '#dce2f3'
  on-secondary-container: '#5e6572'
  tertiary: '#7e3000'
  on-tertiary: '#ffffff'
  tertiary-container: '#a44100'
  on-tertiary-container: '#ffd2be'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#e2dfff'
  primary-fixed-dim: '#c3c0ff'
  on-primary-fixed: '#0f0069'
  on-primary-fixed-variant: '#3323cc'
  secondary-fixed: '#dce2f3'
  secondary-fixed-dim: '#c0c7d6'
  on-secondary-fixed: '#151c27'
  on-secondary-fixed-variant: '#404754'
  tertiary-fixed: '#ffdbcc'
  tertiary-fixed-dim: '#ffb695'
  on-tertiary-fixed: '#351000'
  on-tertiary-fixed-variant: '#7b2f00'
  background: '#fcf8ff'
  on-background: '#1b1b24'
  surface-variant: '#e4e1ee'
typography:
  display-lg:
    fontFamily: Inter
    fontSize: 32px
    fontWeight: '700'
    lineHeight: 40px
    letterSpacing: -0.02em
  headline-md:
    fontFamily: Inter
    fontSize: 24px
    fontWeight: '600'
    lineHeight: 32px
    letterSpacing: -0.01em
  headline-sm:
    fontFamily: Inter
    fontSize: 18px
    fontWeight: '600'
    lineHeight: 26px
    letterSpacing: -0.01em
  body-lg:
    fontFamily: Inter
    fontSize: 16px
    fontWeight: '400'
    lineHeight: 24px
    letterSpacing: 0em
  body-md:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: '400'
    lineHeight: 20px
    letterSpacing: 0em
  body-sm:
    fontFamily: Inter
    fontSize: 13px
    fontWeight: '400'
    lineHeight: 18px
    letterSpacing: 0em
  label-md:
    fontFamily: Inter
    fontSize: 12px
    fontWeight: '600'
    lineHeight: 16px
    letterSpacing: 0.02em
  label-sm:
    fontFamily: Inter
    fontSize: 11px
    fontWeight: '500'
    lineHeight: 14px
    letterSpacing: 0.03em
  headline-md-mobile:
    fontFamily: Inter
    fontSize: 20px
    fontWeight: '600'
    lineHeight: 28px
rounded:
  sm: 0.25rem
  DEFAULT: 0.5rem
  md: 0.75rem
  lg: 1rem
  xl: 1.5rem
  full: 9999px
spacing:
  base: 4px
  xs: 4px
  sm: 8px
  md: 16px
  lg: 24px
  xl: 32px
  gutter: 16px
  margin-desktop: 24px
  margin-mobile: 16px
---

## Brand & Style

The design system is engineered for the high-stakes, data-dense environment of venture capital and secondary share trading. The brand personality is **disciplined, transparent, and high-performance**. It prioritizes information density and utility over decorative elements, mirroring the precision required for financial transactions.

The visual style is **Corporate Modern with a Minimalist execution**, drawing inspiration from high-productivity tools like Linear. It utilizes a "flat-layer" architecture where depth is communicated through subtle tonal changes and crisp dividers rather than heavy shadows. The interface is optimized for the Korean language (Hangeul), ensuring that vertical rhythm and character clarity are maintained across complex data tables and deal pipelines.

**Key Principles:**
- **Density without Clutter:** Maximum information visibility with sufficient whitespace to prevent cognitive overload.
- **Functional Color:** Color is used sparingly to direct attention to primary actions and status changes.
- **Precision Engineering:** Every element sits on a strict grid with consistent 1px strokes to evoke a sense of reliability and institutional trust.

## Colors

The palette is anchored in a professional **Indigo (#4F46E5)** primary color, used strictly for interactive elements and brand identifiers. 

The structural palette relies on a three-tier neutral system:
1.  **Background (#F9FAFB):** A calm, off-white gray used for the application canvas to reduce eye strain.
2.  **Surface (#FFFFFF):** Pure white reserved for cards, data rows, and input fields to create a clear "work area" distinction.
3.  **Divider (#E5E7EB):** A light gray stroke used for all borders and grid lines, replacing shadows for a flatter, more modern aesthetic.

In **Dark Mode**, the surfaces flip to a deep slate (#111827) with borders shifting to a muted charcoal (#374151) to maintain the same high-contrast, disciplined feel.

## Typography

The system utilizes **Inter** for its exceptional legibility in data-heavy interfaces and its neutral, professional tone. For Korean text, the font naturally falls back to system-optimized sans-serifs (Pretendard or Apple SD Gothic Neo) to maintain the intended weight and spacing.

**Hierarchy Rules:**
- **Numerical Data:** Use `body-md` with tabular figures (mono-spacing for numbers) in deal tables to ensure columns align perfectly for quick scanning.
- **Korean Script:** Given the visual density of Hangeul, `line-height` is strictly maintained at 1.4-1.5x the font size to prevent character crowding.
- **Labels:** Uppercase is avoided for Korean labels; instead, use `label-md` with increased font weight (600) to distinguish from body text.

## Layout & Spacing

This design system uses a **12-column fluid grid** for main content areas and a **fixed-width sidebar (240px)** for navigation. 

**Layout Model:**
- **High-Density Grid:** A 4px baseline grid governs all spacing. Gutters are fixed at 16px to maximize horizontal space for data tables.
- **The "Sheet" Concept:** Content is organized into white surfaces (cards) that sit on the light gray background. Margins between cards are consistently 16px or 24px.
- **Responsive Reflow:** On tablet, the sidebar collapses into a rail. On mobile, the 12-column grid collapses to a single column with 16px side margins, and horizontal scrolling is enabled for data-heavy tables to preserve readability.

## Elevation & Depth

To maintain the "disciplined and clean" aesthetic, this design system avoids traditional shadows. Depth is communicated through **Tonal Layering and Low-Contrast Outlines**.

- **Level 0 (Background):** #F9FAFB. The lowest layer.
- **Level 1 (Surface):** #FFFFFF with a 1px solid #E5E7EB border. Used for cards, tables, and the main content area.
- **Level 2 (Popovers/Modals):** #FFFFFF with a very soft, high-diffusion shadow (0px 4px 20px rgba(0,0,0,0.05)) and a #E5E7EB border to separate floating elements from the surface.
- **Interactions:** Buttons use a subtle 1px inner stroke to appear slightly inset or "tactile" without relying on gradients.

## Shapes

The shape language is strictly geometric and consistent. A **roundedness of 8px (0.5rem)** is applied to all primary containers, including cards, input fields, and modal dialogs.

- **Small Components:** Buttons and tags use the standard 8px radius to maintain a unified look.
- **Inner vs Outer:** When elements are nested (e.g., a button inside a padded card), the inner element should ideally use a slightly smaller radius (e.g., 6px) if the padding is tight, though the default 8px is the standard for this system.
- **Selection States:** Checkboxes and radio buttons maintain a smaller 4px radius or full circle respectively to distinguish them from larger interactive components.

## Components

- **Buttons:** Primary buttons use #4F46E5 with white text. Secondary buttons use a white surface with #E5E7EB border and #111827 text. Ghost buttons (no border) are used for tertiary actions.
- **Input Fields:** 8px radius, #FFFFFF background, and 1px #E5E7EB border. On focus, the border changes to #4F46E5 with a 2px soft indigo outer glow.
- **Data Tables:** High-density rows (40px height). Header row uses #F9FAFB background with `label-md` text. Rows use #FFFFFF with a bottom-only divider.
- **Chips/Badges:** Used for "Deal Status" (e.g., Lead, Due Diligence). Use a subtle tinted background (e.g., Primary 10% opacity) with Primary 100% text color.
- **Pipeline Cards:** Kanban-style cards for deal flow. No shadows; 1px border. Use a vertical color strip on the left to indicate deal priority or sector.
- **Search:** A persistent global search bar in the top navigation, using a 1px #E5E7EB border and a "Command + K" label shortcut for power users.
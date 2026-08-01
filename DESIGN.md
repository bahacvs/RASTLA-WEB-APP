---
name: RASTLA
colors:
  surface: '#fbf9f6'
  surface-dim: '#dbdad7'
  surface-bright: '#fbf9f6'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#f5f3f0'
  surface-container: '#efeeeb'
  surface-container-high: '#eae8e5'
  surface-container-highest: '#e4e2df'
  on-surface: '#1b1c1a'
  on-surface-variant: '#424753'
  inverse-surface: '#30312f'
  inverse-on-surface: '#f2f0ed'
  outline: '#737784'
  outline-variant: '#c2c6d5'
  surface-tint: '#175abe'
  primary: '#003e8c'
  on-primary: '#ffffff'
  primary-container: '#0754b8'
  on-primary-container: '#bccfff'
  inverse-primary: '#aec6ff'
  secondary: '#4e6074'
  on-secondary: '#ffffff'
  secondary-container: '#d1e4fc'
  on-secondary-container: '#54667a'
  tertiary: '#890009'
  on-tertiary: '#ffffff'
  tertiary-container: '#ad1d1c'
  on-tertiary-container: '#ffc0b9'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#d8e2ff'
  primary-fixed-dim: '#aec6ff'
  on-primary-fixed: '#001a43'
  on-primary-fixed-variant: '#004397'
  secondary-fixed: '#d1e4fc'
  secondary-fixed-dim: '#b5c8df'
  on-secondary-fixed: '#091d2e'
  on-secondary-fixed-variant: '#36485b'
  tertiary-fixed: '#ffdad6'
  tertiary-fixed-dim: '#ffb4ab'
  on-tertiary-fixed: '#410002'
  on-tertiary-fixed-variant: '#92030c'
  background: '#fbf9f6'
  on-background: '#1b1c1a'
  surface-variant: '#e4e2df'
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
    fontWeight: '700'
    lineHeight: 32px
    letterSpacing: -0.01em
  headline-sm:
    fontFamily: Inter
    fontSize: 20px
    fontWeight: '600'
    lineHeight: 28px
  title-price:
    fontFamily: Inter
    fontSize: 22px
    fontWeight: '700'
    lineHeight: 24px
  body-lg:
    fontFamily: Inter
    fontSize: 16px
    fontWeight: '400'
    lineHeight: 24px
  body-md:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: '400'
    lineHeight: 20px
  label-bold:
    fontFamily: Inter
    fontSize: 12px
    fontWeight: '600'
    lineHeight: 16px
    letterSpacing: 0.02em
  label-sm:
    fontFamily: Inter
    fontSize: 12px
    fontWeight: '400'
    lineHeight: 16px
rounded:
  sm: 0.25rem
  DEFAULT: 0.5rem
  md: 0.75rem
  lg: 1rem
  xl: 1.5rem
  full: 9999px
spacing:
  base: 4px
  xs: 8px
  sm: 12px
  md: 16px
  lg: 24px
  xl: 32px
  container-margin: 20px
  gutter: 16px
---

## Brand & Style
The design system for this marketplace focuses on an **energetic, professional, and vacation-themed** aesthetic. It prioritizes a mobile-first experience that feels as fluid and refreshing as water sports itself. 

The style is **Modern / Corporate-Hybrid**, blending high-utility SaaS patterns with a vibrant, leisure-focused personality. It utilizes heavy whitespace, crisp borders, and a modular card-based architecture to ensure users can navigate complex booking options with ease. The visual narrative should evoke the reliability of a high-end travel agency combined with the excitement of an adventure start-up.

## Colors
The palette is rooted in a maritime-inspired range of blues, balanced by warm vacation tones. 

- **Primary Blue (#0754B8):** Reserved for primary actions, CTA buttons, and active states. It represents trust and the water.
- **Dark Navy (#102334):** Used for typography and deep structural elements to provide high contrast and a professional anchor.
- **Coral Accent (#FF5A4F):** A high-energy "Urgency" color. Use this exclusively for discounts, "Limited Spots," or critical booking notifications. 
- **Surfaces:** Use the Off-white (#FAF8F5) for the global background and Pure White (#FFFFFF) for interactive cards and input fields to create a clear layered hierarchy.
- **Tonal Tints:** Light Blue and Light Coral surfaces should be used as subtle backgrounds for chips, alerts, or category-specific sections to add visual variety without overwhelming the user.

## Typography
The system uses **Inter** for its exceptional legibility and modern, neutral character. 

Hierarchy is strictly enforced to manage dense information like pricing and availability. All pricing should use the `title-price` style to ensure it is the first thing a user's eye gravitates toward on a card. Use `label-bold` in uppercase for category tags or "Utility" text. On mobile devices, ensure headlines do not exceed 32px to maintain a comfortable reading width and prevent awkward word wrapping in multi-column layouts.

## Layout & Spacing
This design system employs a **Fluid Grid** model specifically optimized for mobile-first consumption. 

- **Mobile (Default):** A 4-column grid with 20px outside margins and 16px gutters.
- **Desktop:** Scales to a 12-column centered grid with a maximum content width of 1200px.
- **Rhythm:** All vertical spacing should follow 8px increments. Use `lg` (24px) for spacing between distinct sections and `md` (16px) for spacing between cards or elements within a group.
- **Content Density:** Elements like booking forms should use tighter spacing (`sm`) to keep primary actions above the fold on mobile screens.

## Elevation & Depth
Elevation is achieved through **Tonal Layers** and extremely subtle, soft shadows. 

Avoid heavy dropshadows. Instead, use a "Low-Contrast Outline" approach: 1px borders in `Border Gray` (#E5E7EB) combined with a very soft ambient shadow (Y: 2px, Blur: 8px, 5% Opacity) to lift white cards off the off-white background. This creates a tactile, clean look that feels modern and lightweight. Use a slightly deeper shadow for floating action buttons or sticky booking bars at the bottom of the screen to indicate they are on the highest Z-index.

## Shapes
The shape language is friendly and approachable, using **Rounded** geometry. 

- **Primary Cards & Modals:** Use a corner radius of 16px to create a soft, vacation-friendly feel.
- **Buttons & Inputs:** Consistent 12px or 14px radius to match the card aesthetic.
- **Badges/Chips:** Use a fully "Pill-shaped" (rounded-full) radius to differentiate them from interactive buttons.
- **Images:** Photos of activities and destinations must always share the 16px radius of their parent container.

## Components
- **Buttons:** High-contrast `Primary Blue` with white text for main CTAs. Ghost buttons should use `Dark Navy` text with a subtle `Border Gray` stroke.
- **Booking Cards:** White background, 16px radius, subtle border. Price should be bottom-right aligned in `title-price` style.
- **Inputs:** 14px radius, `Off-white` background with a `Border Gray` stroke. Focused state uses a 2px `Primary Blue` ring.
- **Chips:** Small, pill-shaped tags using `Light Blue Surface` or `Light Coral Surface` with corresponding darker text for category filtering.
- **Availability Indicators:** Use `Success Green` for "Available Now" and `Coral Accent` for "Only 2 Left."
- **Navigation:** A persistent bottom navigation bar on mobile with icons in `Text Gray`, shifting to `Primary Blue` for the active state.
- **Sticky Booking Bar:** A high-contrast bar fixed to the bottom of activity pages on mobile, featuring the price and a large "Book Now" primary button.
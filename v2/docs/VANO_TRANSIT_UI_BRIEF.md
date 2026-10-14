# VANO Transit — UI & engineering brief

Branch: preview/vano-react-v2-7. Transit remains feature-gated.

## Rules

- The approved V2 framing is now the only active navigation camera. Remove its toggle but keep 2D/3D, GPS, route calculation and Mapbox credits intact.
- Transit mode is beside Moto in the existing vehicle selector, visible only under VITE_TRANSIT_PREVIEW=1. The classic 3-mode Carro/Moto/A pé switch is unchanged when beta is off.
- Transit opens a separate journey planner with inherited origin/destination. Never send a transit calculation through the road routing API.
- No real operator feeds means no fictitious public journey suggestions. Community reports are out of scope.

## Design tokens

Base: #F5F7F7, white #FFFFFF, primary text #20272E, secondary #687681, accent #EA6229, border #E7E9EB. Preview translucent slate #17222F. Font Manrope/DM Sans. Transit route colors are the official agency colors where provided; walking is #83909C dashed.

## Selector dimensions

Normal: label Modo + 3 equal vehicle columns, maximum width 285px; beta: label + 4 columns (Carro, Moto, Ônibus, A pé), max width 318px. Slider tracks 3 or 4 cells and reduced-motion is supported. At <=420px, vehicle icons and words stack to avoid clipping, 47px tall controls. Car/moto/walking maintain their existing API and selection behavior.

## Planner dimensions

Header: 72px desktop, 64px mobile. Origin/destination fields: 58px desktop, 53px mobile, >=13px horizontal inset. Two cards of equal width: Mais econômica (Wallet) and Mais rápida (Zap). CTA: 53-55px tall. Real coverage is required to enable calculation. No price claim without complete verified fares.

## Full-screen map preview

Display after a real journey itinerary arrives.

Mobile wireframe:

    ┌─────────────────────────────────┐
    │ ‹           VANO        Transit│
    ├─────────────────────────────────┤
    │ ┌─────────────────────────────┐ │
    │ │ A Origem              Editar│ │
    │ │ B Destino                  │ │
    │ │ duração · baldeações · a pé │ │
    │ └─────────────────────────────┘ │
    │     MAPBOX OVERVIEW MAP         │
    │    segmented operator colors   │
    │  dashed walking / transfer pins│
    │                     ◯ ◯ buttons│
    │ ┌─────────────────────────────┐ │
    │ │ Chegada | total | conexões  │ │
    │ │ [bus] › [metro] › [walk] ...│ │
    │ │ fare status    [details]    │ │
    │ └─────────────────────────────┘ │
    └─────────────────────────────────┘

Measure/spacing:
- Header outside map viewport: 64px.
- Map viewport: calc(100dvh - 64px).
- Top floating card: 10-12px inset top, horizontal 12px, width calc(100% - 24px), max 760px; 13-17px inner padding, 19-20px radius, 3 equal metric columns.
- Bottom dock: full width capped at 850px, padding 16px mobile or 20px desktop, 25px top radius, 19px plus bottom safe area. Four summary cells, followed by horizontally scrollable transit legs, never squeezed into one row.
- Right map controls: 12-16px inset, 43-46px targets; short windows relocate them near the dock. Height <=480px hides secondary floating actions rather than overlap.
- Map fit uses at least 135px top and 205px bottom padding in preview; station and bus number labels use Mapbox collision handling. Attributions must stay visible.
- Bottom detail drawer: max 73dvh/675px with scrollable detail list, collapsed by default.
- Animation: card reveal 320ms, dock entrance 360ms, map fit <=560ms, disabled when prefers-reduced-motion is active.
- No interactive map badges are required. Badges and station circles only communicate the sequence. Do not invent route geometry when a feed has no polyline.
- Mobile at <=340px uses smaller metric fonts; origin and destination truncate independently.

## Test matrix and acceptance

Automated: V2 active only for navigation; absent test button; 3/4 selector semantics; road API unaffected; transit route guard; actual encoded polylines and line badge layers; responsive CSS contracts; test suite + build + SEO audits.

Device verification before production: 320x640, 360x800, 390x844, 428x926, 768 portrait, 1280 desktop and 667x375 landscape. Inspect keyboard viewport resize, Android font scale >=125%, safe areas, focus, touch targets, long stop names, attribution and no-overlap.

Backend release: use separate OTP2 service per geographic coverage, verified official GTFS/OSM data, regional timezone, licenses, live-feed freshness and no fallback to guessed times. Enable VANO_TRANSIT_ENABLED, configure VANO_TRANSIT_REGIONS_JSON, then enable frontend VITE_TRANSIT_PREVIEW after real data verification. No community feature in this phase.

## Current deployment policy

The backend Transit gate and frontend Transit gate remain disabled by default. Do not publish transit to the existing service until a tested region has been connected. Actual live site is not affected by source changes until a Render deploy runs.

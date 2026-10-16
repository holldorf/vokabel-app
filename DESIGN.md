# Vani native identity

## Approved direction

The user approved the intertwined cream/rose H on burgundy as the app icon.
The iOS and Android UI now follows a dark burgundy direction, while retaining
existing layouts, content, controls and the animated speaking orb. The later
request explicitly rejected LiveKit UI: no LiveKit dependency, waveform or
transport change belongs in this work.

## Reuse and palette

- Reuse `Brand`, `MuralOrb`, existing typography, native controls and navigation.
- Canvas: `#180A10`; raised canvas: `#251019`; surfaces: `#32131F`.
- Text: `#FFF7F0`; secondary text: `#D6B9C3`; borders: `#946575`.
- Brand burgundy: `#80102F`; rose: `#D38FA4`; light accent: `#E5A0B5`.
- Filled action: `#B94B70`, with cream text (4.60:1 calculated contrast).
- Dark burgundy belongs because the user explicitly requested the company palette.
- Preserve the existing rounded controls and orb motion rather than redesigning them.
- The orb uses burgundy, rose and cream instead of orange, lilac and yellow.
- Legacy color-token names remain for caller compatibility; their values implement
  the new theme. New surface/border/orb roles are explicit.

## Behavior and accessibility

Keep all audio levels, state handling, consent, labels, focus, form validation,
and storage unchanged. Preserve reduced-motion and background animation pauses.
Brand images are decorative next to the accessible app name. Check contrast of
text, controls and selected states; do not leave white fields in the dark theme.
System bars, sheets and startup surfaces must also use dark appearance.

## Verification plan

Build both platforms; run Android unit tests, lint and affected UI tests, plus
iOS onboarding/UI checks. Inspect real onboarding, Talk, Themes, Words and
Settings captures. Check adaptive-icon safe area and iOS opaque 1024px icon.
Record actual checks and any limits before completion; this is not a release or
an accessibility-conformance claim.

## Verification — 2026-09-22

- Android debug build, lint and 354 unit tests passed, including palette contrast
  checks across dark surfaces, action fills, links and input borders.
- Six Android device UI tests passed (splash, onboarding/core navigation and
  settings). Native captures reviewed: onboarding, Talk, Themes and Words.
- iOS build and three UI tests passed: German onboarding, largest accessibility
  text size, and German settings/themes/words. Native Talk and Settings captures
  were also reviewed; the system Form retains native dark row surfaces.
- Final native captures are local in `.gg/screenshots/holldorf-ios-final.png` and
  `.gg/screenshots/holldorf-android-final.png` in the parent project, not shipped.
- The iOS app icon is opaque RGB, 1024×1024. Android's foreground and themed icon
  share the same alpha mask; the visible mark fits the 33dp adaptive safe radius.
- iOS verification used the existing WebRTC package cache with a fresh derived
  build directory and `ARCHS=arm64 ONLY_ACTIVE_ARCH=YES` for this Apple Silicon
  simulator. No dependency or project build-setting changes were needed.
- Visual review of the changed scope: 21/24. Specificity, hierarchy, composition,
  consistency, typography, surfaces, tested states, motion and content scored 2;
  responsive coverage, accessibility coverage and distinctiveness scored 1.
  Existing layouts and motion were deliberately retained. Final panel colors
  were adjusted to burgundy rather than green, then checks were rerun.
- Limits: no physical-device review, full screen-reader audit or live paid audio
  session. Audio behavior and transport are unchanged. No release was published.

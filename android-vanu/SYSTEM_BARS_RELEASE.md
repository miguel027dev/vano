# Android 3.1.7 (20270008)

Built from the delivered 3.1.6 production Android source. Both system bars request transparent colors, disable automatic contrast scrims on API 29+, and choose readable foreground icons from the current app/map theme. Native insets remain consumed exactly once to protect touch targets and keyboard layout. The root canvas behind the transparent bars follows the current light/dark theme; this does not draw interactive map controls under Android system bars.

The trusted main-frame message channel alone may update the bar theme. Last accepted theme is retained for startup. Native resources include light and night launch variants.

Validated: Java 17 compile against API 36, resource compilation/link, unchanged existing resource IDs, D8 compilation, bundletool validation, and release upload signature. Physical device behavior is not verified in this environment. Publishing a Play update is required for installed applications to receive this native change.

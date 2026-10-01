# Navigation architecture

The canonical map runtime is `static/vano-map.js`; `static/vano-map-fallback.js` is the compatibility fallback. Navigation CSS lives in `static/vano-navigation.css`.

Navigation camera states, Spark/smart routing, reroute handling, local marker interpolation, route-progress rendering and audio scheduling remain client-side. Route generation, safety intelligence and global traffic remain server-side.

Real-device validation is still required for physical GPS behavior, WebView audio, poor-network recovery, portrait/landscape, reroute and long trips.

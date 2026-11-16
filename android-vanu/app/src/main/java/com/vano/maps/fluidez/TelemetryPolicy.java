package com.vano.maps.fluidez;

import java.util.*;

/** Deny-by-default protocol. No arbitrary strings, location, URLs or identity. */
final class TelemetryPolicy {
    static final Set<String> EVENTS = Collections.unmodifiableSet(new HashSet<>(Arrays.asList(
        "route_requested", "route_calculation_started", "route_calculation_completed",
        "route_calculation_failed", "navigation_started", "navigation_ended",
        "route_completed", "navigation_cancelled", "route_recalculated", "navigation_error",
        "communication_failure", "api_error", "map_load_failed", "app_returned")));
    static final Set<String> CODES = new HashSet<>(Arrays.asList(
        "offline", "timeout", "http_4xx", "http_5xx", "network", "invalid_response",
        "provider", "webview", "renderer", "tls", "unknown"));
    static Map<String,Object> sanitize(String event, Map<String,?> input) {
        if (!EVENTS.contains(event) || input == null) return null;
        Map<String,Object> out = new HashMap<>();
        Object duration = input.get("duration_ms");
        if (duration instanceof Number) {
            double n = ((Number)duration).doubleValue();
            if (Double.isFinite(n) && n >= 0 && n <= 86400000) out.put("duration_ms", Math.round(n));
        }
        Object status = input.get("status_code");
        if (status instanceof Number) {
            double n = ((Number)status).doubleValue();
            if (Double.isFinite(n) && n == Math.floor(n) && n >= 100 && n <= 599) out.put("status_code", (long)n);
        }
        Object vehicle = input.get("vehicle");
        if (Arrays.asList("carro", "moto", "a-pe").contains(vehicle)) out.put("vehicle", vehicle);
        Object code = input.get("error_code");
        if (CODES.contains(code)) out.put("error_code", code);
        return out;
    }
}

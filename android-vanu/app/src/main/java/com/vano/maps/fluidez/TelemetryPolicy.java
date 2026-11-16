package com.vano.maps.fluidez;

import java.util.Arrays;
import java.util.HashSet;
import java.util.Set;

/** Allowlist shared conceptually with the server. Automatic Firebase event names are excluded. */
final class TelemetryPolicy {
    private static final Set<String> EVENTS=new HashSet<>(Arrays.asList(
        "route_request","route_calculation_start","route_calculation_complete","route_calculation_error",
        "navigation_start","navigation_end","navigation_cancel","route_complete","route_recalculation",
        "navigation_error","api_response","api_error","communication_error","map_load_error",
        "web_ready","webview_renderer_gone","app_foreground","app_background"));
    private static final Set<String> KINDS=new HashSet<>(Arrays.asList(
        "route","map","service","network","cancelled","completed","unknown","timeout","aborted"));
    static boolean allowed(String value){return EVENTS.contains(value);}
    static boolean kind(String value){return KINDS.contains(value);}
}

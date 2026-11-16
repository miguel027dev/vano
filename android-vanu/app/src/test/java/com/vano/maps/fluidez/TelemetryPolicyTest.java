package com.vano.maps.fluidez;
import org.junit.Test;
import static org.junit.Assert.*;
import java.util.*;

public class TelemetryPolicyTest {
    @Test public void dropsPrivatePayloadAndUnrecognizedStrings() {
        Map<String,Object> input=new HashMap<>();
        input.put("latitude",-23.5); input.put("url","https://example.test/?token=secret");
        input.put("email","someone@example.test"); input.put("error_code","private exception");
        input.put("vehicle","moto"); input.put("duration_ms",152.2);
        Map<String,Object> clean=TelemetryPolicy.sanitize("route_calculation_completed",input);
        assertEquals(2,clean.size()); assertEquals(152L,clean.get("duration_ms"));
        assertEquals("moto",clean.get("vehicle"));
    }
    @Test public void rejectsAutomaticFirebaseEventsAndInvalidNumbers() {
        assertNull(TelemetryPolicy.sanitize("first_open",Collections.emptyMap()));
        assertNull(TelemetryPolicy.sanitize("session_start",Collections.emptyMap()));
        Map<String,Object> input=new HashMap<>();input.put("duration_ms",Double.NaN);input.put("status_code",599.5);
        assertTrue(TelemetryPolicy.sanitize("api_error",input).isEmpty());
        input.put("duration_ms",-1);input.put("status_code",600);
        assertTrue(TelemetryPolicy.sanitize("api_error",input).isEmpty());
    }
}

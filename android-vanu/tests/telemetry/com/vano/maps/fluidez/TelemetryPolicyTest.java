package com.vano.maps.fluidez;
public final class TelemetryPolicyTest {
    public static void main(String[] args) {
        if(!TelemetryPolicy.allowed("route_request"))throw new AssertionError();
        for(String name:new String[]{"first_open","session_start","user_engagement","screen_view","arbitrary_event",null})
            if(TelemetryPolicy.allowed(name))throw new AssertionError("Automatic or unknown event accepted: "+name);
        for(String value:new String[]{"Rua Exemplo 123","-23.551","user@email.com","https://vano/maps?lat=1",null})
            if(TelemetryPolicy.kind(value))throw new AssertionError("Free text accepted");
        System.out.println("Telemetry event and parameter privacy policy: PASS");
    }
}

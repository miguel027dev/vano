package com.vano.maps.fluidez;

import android.content.Context;
import android.content.SharedPreferences;
import android.os.Bundle;
import android.os.SystemClock;
import com.google.firebase.analytics.FirebaseAnalytics;
import com.google.firebase.crashlytics.FirebaseCrashlytics;
import java.util.EnumMap;
import java.util.LinkedHashMap;
import java.util.Map;
import org.json.JSONObject;

/** Optional observational sink. Never receives route geometry, URLs, user IDs or exception text. */
final class NativeTelemetry {
    private final FirebaseAnalytics analytics;
    private final FirebaseCrashlytics crashes;
    private final SharedPreferences preferences;
    private final long opened=SystemClock.elapsedRealtime();
    private long window=opened;
    private int count;
    private boolean enabled,ready,initialized;
    private final LinkedHashMap<String,Boolean> seen=new LinkedHashMap<>();
    static NativeTelemetry create(Context context) {
        try{return new NativeTelemetry(context.getApplicationContext());}
        catch(RuntimeException unavailable){return null;} // Observability never blocks app startup.
    }
    private NativeTelemetry(Context context) {
        preferences=context.getSharedPreferences("vano-observability",Context.MODE_PRIVATE);
        analytics=FirebaseAnalytics.getInstance(context);
        crashes=FirebaseCrashlytics.getInstance();
        consent(preferences.getBoolean("consent-v1",false));
    }
    void consent(boolean granted) {
        if(initialized&&enabled==granted)return;
        initialized=true;
        try {
            enabled=granted;
            preferences.edit().putBoolean("consent-v1",granted).apply();
            Map<FirebaseAnalytics.ConsentType,FirebaseAnalytics.ConsentStatus> choices=new EnumMap<>(FirebaseAnalytics.ConsentType.class);
            choices.put(FirebaseAnalytics.ConsentType.ANALYTICS_STORAGE,granted?FirebaseAnalytics.ConsentStatus.GRANTED:FirebaseAnalytics.ConsentStatus.DENIED);
            choices.put(FirebaseAnalytics.ConsentType.AD_STORAGE,FirebaseAnalytics.ConsentStatus.DENIED);
            choices.put(FirebaseAnalytics.ConsentType.AD_USER_DATA,FirebaseAnalytics.ConsentStatus.DENIED);
            choices.put(FirebaseAnalytics.ConsentType.AD_PERSONALIZATION,FirebaseAnalytics.ConsentStatus.DENIED);
            analytics.setConsent(choices);
            analytics.setAnalyticsCollectionEnabled(granted);
            crashes.setCrashlyticsCollectionEnabled(granted);
            if(!granted){analytics.resetAnalyticsData();crashes.deleteUnsentReports();seen.clear();}
        } catch(RuntimeException ignored){enabled=false;}
    }
    synchronized void receive(JSONObject message) {
        if(!enabled)return;
        try {
            String name=message.optString("name"),id=message.optString("id");
            long now=SystemClock.elapsedRealtime();
            if(now-window>=60000){window=now;count=0;}
            if(!TelemetryPolicy.allowed(name)||!id.matches("[a-f0-9-]{36}")||seen.containsKey(id)||count>=120)return;
            seen.put(id,Boolean.TRUE);if(seen.size()>256)seen.remove(seen.keySet().iterator().next());count++;
            Bundle values=new Bundle();
            values.putLong("timestamp_utc_ms",System.currentTimeMillis());
            values.putString("event_id",id);
            JSONObject fields=message.optJSONObject("params");
            if(fields!=null){
                long duration=fields.optLong("duration_ms",-1);
                if(duration>=0&&duration<=3600000)values.putLong("duration_ms",duration);
                int status=fields.optInt("status",0);
                if(status>=100&&status<=599)values.putLong("status",status);
                String kind=fields.optString("kind");
                if(TelemetryPolicy.kind(kind))values.putString("kind",kind);
            }
            analytics.logEvent(name,values);
        } catch(RuntimeException ignored){}
    }
    void webReady() {
        if(ready)return;ready=true;
        event("web_ready",SystemClock.elapsedRealtime()-opened,0);
    }
    void diagnostic(String name,int status) {
        if(!TelemetryPolicy.allowed(name))return;
        event(name,-1,status);
        if(enabled&&"webview_renderer_gone".equals(name)) {
            try{crashes.recordException(new IllegalStateException("VANO_WEBVIEW_RENDERER_GONE"));}
            catch(RuntimeException ignored){}
        }
    }
    private void event(String name,long duration,int status) {
        if(!enabled)return;
        try {
            JSONObject fields=new JSONObject().put("duration_ms",duration).put("status",status);
            receive(new JSONObject().put("name",name).put("id",java.util.UUID.randomUUID().toString()).put("params",fields));
        } catch(Exception ignored){}
    }
}

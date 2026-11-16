package com.vano.maps.fluidez;

import android.content.Context;
import android.os.Bundle;
import android.os.SystemClock;
import com.google.firebase.FirebaseApp;
import com.google.firebase.analytics.FirebaseAnalytics;
import com.google.firebase.crashlytics.FirebaseCrashlytics;
import com.google.firebase.perf.FirebasePerformance;
import org.json.JSONObject;
import java.util.*;

/** Observability must never throw into rendering, GPS, auth or navigation. */
final class AnalyticsTelemetry {
    private final Context context;
    private FirebaseAnalytics analytics;
    private FirebaseCrashlytics crash;
    private FirebasePerformance perf;
    private boolean allowed;
    private long quotaWindow;
    private int quotaCount;
    private final LinkedHashMap<String,Long> seen = new LinkedHashMap<>();

    AnalyticsTelemetry(Context context) {
        this.context=context.getApplicationContext();
        // No SDK startup or collection before account consent is verified.
    }
    void consent(boolean value) {
        try {
            if (value && analytics == null) {
                if (FirebaseApp.initializeApp(context) == null) return;
                analytics=FirebaseAnalytics.getInstance(context);
                crash=FirebaseCrashlytics.getInstance();
                perf=FirebasePerformance.getInstance();
            }
            allowed = value && analytics != null;
            if (analytics != null) {
                Map<FirebaseAnalytics.ConsentType,FirebaseAnalytics.ConsentStatus> flags = new EnumMap<>(FirebaseAnalytics.ConsentType.class);
                flags.put(FirebaseAnalytics.ConsentType.ANALYTICS_STORAGE, allowed ? FirebaseAnalytics.ConsentStatus.GRANTED : FirebaseAnalytics.ConsentStatus.DENIED);
                flags.put(FirebaseAnalytics.ConsentType.AD_STORAGE, FirebaseAnalytics.ConsentStatus.DENIED);
                flags.put(FirebaseAnalytics.ConsentType.AD_USER_DATA, FirebaseAnalytics.ConsentStatus.DENIED);
                flags.put(FirebaseAnalytics.ConsentType.AD_PERSONALIZATION, FirebaseAnalytics.ConsentStatus.DENIED);
                analytics.setConsent(flags);
                analytics.setAnalyticsCollectionEnabled(allowed);
            }
            if (crash != null) {
                crash.setCrashlyticsCollectionEnabled(allowed);
                if (!allowed) crash.deleteUnsentReports();
            }
            if (perf != null) perf.setPerformanceCollectionEnabled(allowed);
            if (!allowed) seen.clear();
        } catch (RuntimeException ignored) { allowed=false; }
    }
    void error(String name, String code) {
        try { event(new JSONObject().put("event_id",UUID.randomUUID().toString()).put("name",name)
            .put("params",new JSONObject().put("error_code",code))); } catch (Exception ignored) { }
    }
    void event(JSONObject message) {
        try {
            if (!allowed || message == null || message.toString().length() > 2048) return;
            String id = message.optString("event_id");
            String name = message.optString("name");
            if (!id.matches("[a-fA-F0-9-]{36}")) return;
            long now = SystemClock.elapsedRealtime();
            seen.entrySet().removeIf(row -> now-row.getValue() > 1800000);
            if (seen.containsKey(id)) return;
            if (now-quotaWindow >= 60000) { quotaWindow=now; quotaCount=0; }
            if (quotaCount >= 60) return;
            JSONObject params = message.optJSONObject("params");
            Map<String,Object> raw = new HashMap<>();
            if (params != null) for (String key : Arrays.asList("duration_ms","status_code","vehicle","error_code")) {
                if (params.has(key)) raw.put(key, params.opt(key));
            }
            Map<String,Object> clean = TelemetryPolicy.sanitize(name, raw);
            if (clean == null) return;
            quotaCount++;
            seen.put(id, now);
            while (seen.size()>256) seen.remove(seen.keySet().iterator().next());
            Bundle bundle = new Bundle();
            bundle.putLong("event_time_ms", System.currentTimeMillis());
            for (Map.Entry<String,Object> row : clean.entrySet()) {
                if (row.getValue() instanceof Number) bundle.putLong(row.getKey(), ((Number)row.getValue()).longValue());
                else bundle.putString(row.getKey(), (String)row.getValue());
            }
            analytics.logEvent(name, bundle);
            if (name.equals("navigation_error") || name.equals("map_load_failed")) {
                // Fixed code only; provider exceptions may include coordinates or tokens.
                crash.recordException(new IllegalStateException("VANO_"+name+"_"+clean.getOrDefault("error_code","unknown")));
            }
        } catch (RuntimeException ignored) { /* Diagnostics cannot interrupt the user. */ }
    }
}

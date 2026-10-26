package com.vano.maps.fluidez;

import android.Manifest;
import android.location.Location;
import android.location.LocationListener;
import android.location.LocationManager;
import android.media.AudioManager;
import org.json.JSONArray;
import androidx.webkit.WebViewCompat;
import androidx.webkit.WebViewFeature;
import java.util.Collections;
import java.io.InputStream;
import android.app.Activity;
import android.app.AlertDialog;
import android.content.*;
import android.content.pm.PackageManager;
import android.content.res.Configuration;
import android.graphics.Color;
import android.net.Uri;
import android.os.*;
import android.util.Base64;
import android.view.*;
import android.webkit.*;
import android.widget.*;
import org.json.JSONObject;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.security.*;
import java.util.concurrent.*;

/** Remote VANO application. No screen streaming, bundled routes or native map. */
public final class MainActivity extends Activity {
    private static final String BASE="https://vanu-73xu.onrender.com", ENTRY=BASE+"/mapa";
    private static final int GEO_REQUEST=10, FILE_REQUEST=11, MIC_REQUEST=12;
    private final ExecutorService network=Executors.newSingleThreadExecutor();
    private WebView web;
    private OfflineCache offlineCache;
    private LocalVoice voice;
    private NativeSpeech speech;
    private PermissionRequest audioPermission;
    private String pendingSpeechId="",pendingSpeechLanguage="pt-BR";
    private boolean microphonePrompt=false;
    private LocationManager gps;
    private boolean routeTracking=false,mapTracking=false;
    private final LocationListener gpsListener=new LocationListener(){
        @Override public void onLocationChanged(Location fix){dispatchPosition(fix);}
        @Override public void onStatusChanged(String provider,int status,Bundle extras){}
        @Override public void onProviderEnabled(String provider){}
        @Override public void onProviderDisabled(String provider){}
    };
    private FrameLayout root;
    private LinearLayout loadingPanel;
    private TextView loadingText;
    private LinearLayout loadingActions;
    private boolean navigationActive=false,firstFrameSeen=false,shellPrefetchQueued=false;
    private long loadGeneration=0,launchAt;
    private final Runnable slowLoading=()->{if(loadingText!=null)loadingText.setText("A conexão está demorando mais que o esperado. Tente novamente ou confira sua internet.");if(loadingActions!=null)loadingActions.setVisibility(View.VISIBLE);};
    private LinearLayout errorPanel;
    private String currentUrl=ENTRY, geoOrigin;
    private GeolocationPermissions.Callback geoCallback;
    private ValueCallback<Uri[]> fileCallback;
    private boolean destroyed, recovering, pageFailed;
    private final Handler handler=new Handler(Looper.getMainLooper());

    static boolean trusted(Uri uri) {
        return uri!=null && "https".equalsIgnoreCase(uri.getScheme()) &&
            "vanu-73xu.onrender.com".equalsIgnoreCase(uri.getHost()) &&
            (uri.getPort()==-1 || uri.getPort()==443) && uri.getUserInfo()==null;
    }
    static boolean trusted(String url) { try{return trusted(Uri.parse(url));}catch(Exception e){return false;} }
    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        launchAt=SystemClock.elapsedRealtime();
        offlineCache=new OfflineCache(this,"vanu-73xu.onrender.com");
        setVolumeControlStream(AudioManager.STREAM_MUSIC);
        getWindow().setSoftInputMode(WindowManager.LayoutParams.SOFT_INPUT_ADJUST_RESIZE);
        root=new FrameLayout(this);root.setBackgroundColor(Color.rgb(255,239,228));setContentView(root);
        if(Build.VERSION.SDK_INT>=30){
            getWindow().setDecorFitsSystemWindows(false);
            root.setOnApplyWindowInsetsListener((view,insets)->{
                // Fit the WebView within both bars and IME exactly once. Forwarding
                // the same insets to the child after padding the root could make
                // Android WebView count safe areas twice and clip fixed nav cards.
                android.graphics.Insets bars=insets.getInsets(WindowInsets.Type.systemBars()|WindowInsets.Type.displayCutout());
                android.graphics.Insets keyboard=insets.getInsets(WindowInsets.Type.ime());
                view.setPadding(bars.left,bars.top,bars.right,Math.max(bars.bottom,keyboard.bottom));
                return WindowInsets.CONSUMED;
            });
        } else root.setFitsSystemWindows(true);
        createWebView();
        showLoading();
        Bundle saved=state==null?null:state.getBundle("web");
        if(saved==null||web.restoreState(saved)==null||!trusted(web.getUrl())||"/".equals(Uri.parse(web.getUrl()).getPath())||"/inicio".equals(Uri.parse(web.getUrl()).getPath()))web.loadUrl(ENTRY);
        if(Build.VERSION.SDK_INT>=33)getOnBackInvokedDispatcher().registerOnBackInvokedCallback(0,this::handleBack);
        handleAuthReturn(getIntent());
    }
    private void createWebView(){
        web=new WebView(this);web.setBackgroundColor(Color.rgb(255,239,228));
        web.setOverScrollMode(View.OVER_SCROLL_NEVER);
        // Default layer policy preserves compositor behavior; never force a software layer.
        WebSettings settings=web.getSettings();
        settings.setJavaScriptEnabled(true);settings.setDomStorageEnabled(true);
        settings.setGeolocationEnabled(true);settings.setCacheMode(WebSettings.LOAD_DEFAULT);
        settings.setAllowFileAccess(false);settings.setAllowContentAccess(false);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        settings.setMediaPlaybackRequiresUserGesture(false); // Spoken navigation follows the explicit start-trip action.
        settings.setUserAgentString(settings.getUserAgentString()+" VANOAndroid/3.1.5");
        settings.setSupportMultipleWindows(false);
        CookieManager.getInstance().setAcceptCookie(true);
        CookieManager.getInstance().setAcceptThirdPartyCookies(web,false);
        WebView.setWebContentsDebuggingEnabled(false);
        if(Build.VERSION.SDK_INT>=26)settings.setSafeBrowsingEnabled(true);
        if(WebViewFeature.isFeatureSupported(WebViewFeature.WEB_MESSAGE_LISTENER)){
            WebViewCompat.addWebMessageListener(web,"VanoHost",Collections.singleton(BASE),(view,message,origin,mainFrame,reply)->{
                if(mainFrame&&trusted(origin)&&trusted(view.getUrl())){
                    try{String value=message.getData();if(value!=null&&value.length()<=130000)handleNative(view,new JSONObject(value));}catch(Exception ignored){}
                }
            });
        }
        if(WebViewFeature.isFeatureSupported(WebViewFeature.DOCUMENT_START_SCRIPT)){
            WebViewCompat.addDocumentStartJavaScript(web,runtimeScript(),Collections.singleton(BASE));
        }
        root.addView(web,new FrameLayout.LayoutParams(-1,-1));
        web.setWebViewClient(new WebViewClient(){
            @Override public WebResourceResponse shouldInterceptRequest(WebView view,WebResourceRequest request){return offlineCache.intercept(request);}
            @Override public boolean shouldOverrideUrlLoading(WebView view,WebResourceRequest r){
                if(!r.isForMainFrame())return !trusted(r.getUrl());
                return navigate(r.getUrl());
            }
            @Override public boolean shouldOverrideUrlLoading(WebView view,String url){return navigate(Uri.parse(url));}
            @Override public void onPageStarted(WebView view,String url,android.graphics.Bitmap icon){
                pageFailed=false;loadGeneration++;firstFrameSeen=false;showLoading();if(trusted(url))currentUrl=url;else{view.stopLoading();navigate(Uri.parse(url));}
            }
            @Override public void onPageFinished(WebView view,String url){
                if(!trusted(url)||pageFailed)return;
                recovering=false;hideError();CookieManager.getInstance().flush();
                injectRuntime();
                // Reveal the landing and login screens once their content is available.
                // The map keeps its first rendered frame handshake.
                String pagePath=Uri.parse(url).getPath();
                if(!"/mapa".equals(pagePath)){
                    view.evaluateJavascript("!!document.querySelector('.v5-landing,.v3-auth-page,.app-shell.shell-auth')",result->{if("true".equals(result))revealReady(view);});
                }
            }
            @Override public void onReceivedError(WebView view,WebResourceRequest req,WebResourceError err){
                if(req.isForMainFrame()){pageFailed=true;showError("Não foi possível conectar ao VANO. Confira sua conexão e tente novamente.");}
            }
            @Override public void onReceivedHttpError(WebView view,WebResourceRequest req,WebResourceResponse resp){
                if(req.isForMainFrame()&&resp.getStatusCode()>=400){pageFailed=true;showError("O servidor está temporariamente indisponível.");}
            }
            @Override public void onReceivedSslError(WebView view,android.webkit.SslErrorHandler h,android.net.http.SslError err){
                h.cancel();pageFailed=true;showError("Não foi possível verificar a conexão segura.");
            }
            @Override public boolean onRenderProcessGone(WebView view,RenderProcessGoneDetail detail){
                root.removeView(view);view.destroy();web=null;
                if(!destroyed&&!recovering){recovering=true;handler.post(()->{if(destroyed)return;createWebView();web.loadUrl(currentUrl);});}
                else if(!destroyed)showError("O mapa precisou ser reiniciado. Toque em tentar novamente.");
                return true;
            }
        });
        web.setWebChromeClient(new WebChromeClient(){
            @Override public void onPermissionRequest(PermissionRequest request){runOnUiThread(()->{
                if(destroyed||web==null||!trusted(request.getOrigin())||!trusted(web.getUrl())){request.deny();return;}
                boolean audio=false;for(String resource:request.getResources())if(PermissionRequest.RESOURCE_AUDIO_CAPTURE.equals(resource))audio=true;
                if(!audio){request.deny();return;}
                if(audioPermission!=null)audioPermission.deny();audioPermission=request;
                if(speech!=null)speech.cancel();
                requestMicrophone();
            });}
            @Override public void onPermissionRequestCanceled(PermissionRequest request){runOnUiThread(()->{if(audioPermission==request)audioPermission=null;});}
            @Override public void onGeolocationPermissionsShowPrompt(String origin,GeolocationPermissions.Callback callback){
                if(!trusted(origin)||!trusted(web.getUrl())){callback.invoke(origin,false,false);return;}
                if(geoCallback!=null)geoCallback.invoke(geoOrigin,false,false);
                geoCallback=callback;geoOrigin=origin;
                if(locationGranted())finishGeo(true);
                else requestPermissions(new String[]{Manifest.permission.ACCESS_COARSE_LOCATION,Manifest.permission.ACCESS_FINE_LOCATION},GEO_REQUEST);
            }
            @Override public void onGeolocationPermissionsHidePrompt(){finishGeo(false);}
            @Override public boolean onJsPrompt(WebView view,String url,String message,String defaultValue,JsPromptResult result){
                if(!"VANO_NATIVE".equals(message))return false;
                if(!trusted(url)||!trusted(view.getUrl())){result.cancel();return true;}
                try{
                    if(defaultValue==null||defaultValue.length()>130000)throw new IllegalArgumentException();
                    JSONObject data=new JSONObject(defaultValue);String action=data.optString("action");
                    if("firstFrame".equals(action)||"pageReady".equals(action)||"route".equals(action)||"google".equals(action)||"wake".equals(action)||"share".equals(action)||"speak".equals(action)||"stopSpeech".equals(action)||"navigation".equals(action)||"mapTracking".equals(action)||"prepareMap".equals(action)||"voiceSettings".equals(action)||"session".equals(action)||"startSpeechRecognition".equals(action)||"stopSpeechRecognition".equals(action)||"abortSpeechRecognition".equals(action)){
                        handleNative(view,data);result.confirm("ok");
                    }else result.cancel();
                }catch(Exception e){result.cancel();}
                return true;
            }
            @Override public boolean onShowFileChooser(WebView view,ValueCallback<Uri[]> callback,FileChooserParams params){
                if(!trusted(view.getUrl()))return false;
                if(fileCallback!=null)fileCallback.onReceiveValue(null);fileCallback=callback;
                Intent chooser=new Intent(Intent.ACTION_OPEN_DOCUMENT).addCategory(Intent.CATEGORY_OPENABLE).setType("*/*");
                String[] types=params.getAcceptTypes();if(types!=null&&types.length>0&&types[0]!=null&&!types[0].isEmpty())chooser.putExtra(Intent.EXTRA_MIME_TYPES,types);
                chooser.putExtra(Intent.EXTRA_ALLOW_MULTIPLE,params.getMode()==FileChooserParams.MODE_OPEN_MULTIPLE);
                try{startActivityForResult(chooser,FILE_REQUEST);}catch(ActivityNotFoundException e){callback.onReceiveValue(null);fileCallback=null;}
                return true;
            }
            @Override public boolean onJsAlert(WebView view,String url,String text,JsResult result){
                new AlertDialog.Builder(MainActivity.this).setMessage(text).setPositiveButton("OK",(d,w)->result.confirm()).setOnCancelListener(d->result.cancel()).show();return true;
            }
            @Override public boolean onJsConfirm(WebView view,String url,String text,JsResult result){
                new AlertDialog.Builder(MainActivity.this).setMessage(text).setPositiveButton("Confirmar",(d,w)->result.confirm()).setNegativeButton("Cancelar",(d,w)->result.cancel()).setOnCancelListener(d->result.cancel()).show();return true;
            }
        });
    }
    private String runtimeScript(){return readRuntimeAsset("native-audio.js")+"\n"+readRuntimeAsset("shell.js");}
    private String readRuntimeAsset(String name){
        try(InputStream in=getAssets().open(name)){
            java.io.ByteArrayOutputStream out=new java.io.ByteArrayOutputStream();byte[] buffer=new byte[4096];int n;
            while((n=in.read(buffer))!=-1)out.write(buffer,0,n);
            return out.toString("UTF-8");
        }catch(Exception e){return "";}
    }
    private void injectRuntime(){if(web!=null&&trusted(web.getUrl()))web.evaluateJavascript(runtimeScript(),null);}
    private void handleNative(WebView view,JSONObject data){
        if(destroyed||view!=web||!trusted(view.getUrl()))return;
        String action=data.optString("action");
        if("firstFrame".equals(action)){
            firstFrameSeen=true;revealReady(view);
        }else if("pageReady".equals(action)){
            if(!"/mapa".equals(Uri.parse(view.getUrl()).getPath()))revealReady(view);
        }else if("route".equals(action)){
            String path=data.optString("path");
            if(path.startsWith("/")&&!path.startsWith("//")&&path.length()<200)currentUrl=BASE+path;
            if(!"/mapa".equals(path)||firstFrameSeen)revealReady(view);
        }else if("wake".equals(action)){
            navigationActive=data.optBoolean("active");syncScreenAwake();
        }else if("session".equals(action)){CookieManager.getInstance().flush();}
        else if("voiceSettings".equals(action)){try{startActivity(new Intent("com.android.settings.TTS_SETTINGS"));}catch(ActivityNotFoundException e){startActivity(new Intent(android.provider.Settings.ACTION_ACCESSIBILITY_SETTINGS));}}
        else if("prepareMap".equals(action)){
            try{JSONArray points=data.getJSONArray("points");if(points.length()<2||points.length()>2048)return;
                double[][] coords=new double[points.length()][2];for(int i=0;i<points.length();i++){JSONArray p=points.getJSONArray(i);coords[i][0]=p.getDouble(0);coords[i][1]=p.getDouble(1);}
                int id=data.optInt("id");offlineCache.prepare(coords,count->runOnUiThread(()->{try{dispatch("vano:offline-map",new JSONObject().put("id",id).put("ok",count>=0).put("tiles",Math.max(0,count)));}catch(Exception ignored){}}));
            }catch(Exception ignored){}
        }else if("navigation".equals(action)){
            routeTracking=data.optBoolean("active");if(routeTracking)startGps();else{if(!mapTracking)stopGps();if(voice!=null)voice.stop();}
        }else if("mapTracking".equals(action)){
            mapTracking=data.optBoolean("active");if(mapTracking)startGps();else if(!routeTracking)stopGps();
        }else if("speak".equals(action)){ensureVoice();voice.speak(data.optString("text"),data.optString("language","pt-BR"),data.optString("utteranceId"));}
        else if("stopSpeech".equals(action)){if(voice!=null)voice.stop(data.optString("utteranceId"));}
        else if("startSpeechRecognition".equals(action)){
            String id=data.optString("id");if(!id.matches("[A-Za-z0-9_-]{1,80}"))return;
            if(audioPermission!=null){audioPermission.deny();audioPermission=null;}
            if(speech!=null)speech.cancel();
            pendingSpeechId=id;pendingSpeechLanguage=data.optString("language","pt-BR");requestMicrophone();
        }else if("stopSpeechRecognition".equals(action)){if(speech!=null)speech.stop(data.optString("id"));}
        else if("abortSpeechRecognition".equals(action)){
            String id=data.optString("id");if(id.equals(pendingSpeechId))pendingSpeechId="";
            if(speech!=null)speech.cancel(id);
        }
        else if("google".equals(action))beginGoogleLogin();
        else if("share".equals(action)){
            Intent share=new Intent(Intent.ACTION_SEND).setType("text/plain");share.putExtra(Intent.EXTRA_TEXT,data.optString("text")+"\n"+data.optString("url"));
            try{startActivity(Intent.createChooser(share,"Compartilhar"));}catch(ActivityNotFoundException ignored){}
        }
    }
    private void dispatch(String event,JSONObject detail){if(!destroyed&&web!=null&&trusted(web.getUrl()))web.evaluateJavascript("window.dispatchEvent(new CustomEvent("+JSONObject.quote(event)+",{detail:"+detail.toString()+"}));",null);}
    private void ensureVoice(){if(voice==null)voice=new LocalVoice(this,(status,id)->runOnUiThread(()->{try{
        JSONObject event=new JSONObject().put("status",status).put("id",id);
        dispatch("vano:tts",event);
        if(!id.startsWith("mavi-"))dispatch("vano:voice-status",event);
    }catch(Exception ignored){}}));}
    private void speechEvent(String id,String type,String value){try{dispatch("vano:speech-recognition",new JSONObject().put("id",id).put("type",type).put("text","result".equals(type)?value:"").put("error","error".equals(type)?value:""));}catch(Exception ignored){}}
    private void requestMicrophone(){
        if(checkSelfPermission(Manifest.permission.RECORD_AUDIO)==PackageManager.PERMISSION_GRANTED){finishMicrophone(true);return;}
        if(!microphonePrompt){microphonePrompt=true;requestPermissions(new String[]{Manifest.permission.RECORD_AUDIO},MIC_REQUEST);}
    }
    private void finishMicrophone(boolean allowed){
        microphonePrompt=false;allowed=allowed&&!destroyed&&web!=null&&trusted(web.getUrl());
        if(audioPermission!=null){PermissionRequest request=audioPermission;audioPermission=null;if(allowed&&trusted(request.getOrigin()))request.grant(new String[]{PermissionRequest.RESOURCE_AUDIO_CAPTURE});else request.deny();}
        String id=pendingSpeechId;pendingSpeechId="";if(id.isEmpty())return;
        if(!allowed){speechEvent(id,"error","not-allowed");speechEvent(id,"end","");return;}
        if(speech==null)speech=new NativeSpeech(this,this::speechEvent);
        speech.start(id,pendingSpeechLanguage);
    }
    private void dispatchPosition(Location fix){
        if((!routeTracking&&!mapTracking)||fix==null||fix.getTime()<=0)return;
        try{JSONObject coords=new JSONObject().put("latitude",fix.getLatitude()).put("longitude",fix.getLongitude()).put("accuracy",fix.getAccuracy()).put("heading",fix.hasBearing()?fix.getBearing():JSONObject.NULL).put("speed",fix.hasSpeed()?fix.getSpeed():JSONObject.NULL);dispatch("vano:native-position",new JSONObject().put("coords",coords).put("timestamp",fix.getTime()));}catch(Exception ignored){}
    }
    private void startGps(){
        if((!routeTracking&&!mapTracking)||!locationGranted())return;
        if(gps==null)gps=(LocationManager)getSystemService(LOCATION_SERVICE);
        try{gps.removeUpdates(gpsListener);if(checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION)==PackageManager.PERMISSION_GRANTED&&gps.isProviderEnabled(LocationManager.GPS_PROVIDER))gps.requestLocationUpdates(LocationManager.GPS_PROVIDER,1000,0,gpsListener,Looper.getMainLooper());if(gps.isProviderEnabled(LocationManager.NETWORK_PROVIDER))gps.requestLocationUpdates(LocationManager.NETWORK_PROVIDER,2000,0,gpsListener,Looper.getMainLooper());}catch(Exception ignored){}
    }
    private void stopGps(){try{if(gps!=null)gps.removeUpdates(gpsListener);}catch(Exception ignored){}}
    private void syncScreenAwake(){
        if(navigationActive&&hasWindowFocus())getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        else getWindow().clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
    }
    @Override public void onWindowFocusChanged(boolean focused){super.onWindowFocusChanged(focused);syncScreenAwake();}
    private void revealReady(WebView view){
        final long generation=loadGeneration;
        view.postVisualStateCallback(generation,new WebView.VisualStateCallback(){@Override public void onComplete(long id){
            if(!destroyed&&generation==loadGeneration&&view==web&&!pageFailed){
                handler.removeCallbacks(slowLoading);hideError();
                if(!shellPrefetchQueued){shellPrefetchQueued=true;handler.postDelayed(()->{if(!destroyed&&offlineCache!=null)offlineCache.primeShell();},4000);}
                if(loadingPanel!=null){final LinearLayout panel=loadingPanel;loadingPanel=null;loadingText=null;loadingActions=null;
                    float scale=android.provider.Settings.Global.getFloat(getContentResolver(),android.provider.Settings.Global.ANIMATOR_DURATION_SCALE,1);
                    panel.animate().alpha(0).setDuration(scale==0?0:160).withEndAction(()->root.removeView(panel)).start();}
            }
        }});
    }
    private int dp(int value){return Math.round(value*getResources().getDisplayMetrics().density);}
    private void showLoading(){
        if(destroyed)return;
        if(loadingPanel!=null){loadingPanel.setAlpha(1);loadingPanel.bringToFront();return;}
        loadingPanel=new LinearLayout(this);loadingPanel.setOrientation(LinearLayout.VERTICAL);loadingPanel.setGravity(Gravity.CENTER);loadingPanel.setPadding(dp(28),dp(28),dp(28),dp(28));
        android.graphics.drawable.GradientDrawable background=new android.graphics.drawable.GradientDrawable(android.graphics.drawable.GradientDrawable.Orientation.TL_BR,new int[]{Color.rgb(255,250,245),Color.rgb(255,229,213)});
        loadingPanel.setBackground(background);
        ImageView logo=new ImageView(this);logo.setImageResource(com.vano.maps.fluidez.R.drawable.ic_vano);logo.setScaleType(ImageView.ScaleType.CENTER_CROP);
        android.graphics.drawable.GradientDrawable circle=new android.graphics.drawable.GradientDrawable();circle.setShape(android.graphics.drawable.GradientDrawable.OVAL);circle.setColor(Color.rgb(247,111,42));
        logo.setBackground(circle);logo.setClipToOutline(true);
        LinearLayout.LayoutParams logoParams=new LinearLayout.LayoutParams(dp(132),dp(132));logoParams.bottomMargin=dp(26);loadingPanel.addView(logo,logoParams);
        TextView name=new TextView(this);name.setText("VANO");name.setTextSize(30);name.setLetterSpacing(.11f);name.setTypeface(null,android.graphics.Typeface.BOLD);name.setTextColor(Color.rgb(64,42,34));name.setGravity(Gravity.CENTER);loadingPanel.addView(name);
        TextView maps=new TextView(this);maps.setText("MAPS");maps.setTextSize(10);maps.setLetterSpacing(.54f);maps.setTypeface(null,android.graphics.Typeface.BOLD);maps.setTextColor(Color.rgb(175,109,80));maps.setGravity(Gravity.CENTER);loadingPanel.addView(maps);
        loadingText=new TextView(this);loadingText.setText("Seu caminho começa aqui");loadingText.setTextSize(12);loadingText.setGravity(Gravity.CENTER);loadingText.setTextColor(Color.rgb(154,118,102));loadingText.setPadding(0,dp(22),0,0);loadingPanel.addView(loadingText);
        loadingActions=new LinearLayout(this);loadingActions.setOrientation(LinearLayout.VERTICAL);loadingActions.setGravity(Gravity.CENTER);loadingActions.setPadding(0,dp(24),0,0);loadingActions.setVisibility(View.GONE);loadingPanel.addView(loadingActions);
        Button retry=new Button(this);retry.setText("Tentar novamente");retry.setOnClickListener(v->{hideError();if(web!=null)web.reload();});retry.setMinHeight(dp(48));loadingActions.addView(retry);
        Button continueButton=new Button(this);continueButton.setText("Ver mapa enquanto carrega");continueButton.setOnClickListener(v->{if(loadingPanel!=null){root.removeView(loadingPanel);loadingPanel=null;loadingText=null;loadingActions=null;}});continueButton.setMinHeight(dp(48));loadingActions.addView(continueButton);
        root.addView(loadingPanel,new FrameLayout.LayoutParams(-1,-1));
        handler.removeCallbacks(slowLoading);handler.postDelayed(slowLoading,12000);
    }
    private boolean navigate(Uri uri){
        if(trusted(uri)){
            if("/api/auth/google/start".equals(uri.getPath())&&!"1".equals(uri.getQueryParameter("link"))){beginGoogleLogin();return true;}
            return false;
        }
        String scheme=uri.getScheme();
        if("https".equals(scheme)||"http".equals(scheme)||"tel".equals(scheme)||"mailto".equals(scheme)||"geo".equals(scheme)){
            try{startActivity(new Intent(Intent.ACTION_VIEW,uri).addCategory(Intent.CATEGORY_BROWSABLE));}catch(ActivityNotFoundException e){Toast.makeText(this,"Não há aplicativo para abrir esse link.",Toast.LENGTH_SHORT).show();}
        }
        return true;
    }
    private boolean locationGranted(){return checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION)==PackageManager.PERMISSION_GRANTED||checkSelfPermission(Manifest.permission.ACCESS_COARSE_LOCATION)==PackageManager.PERMISSION_GRANTED;}
    private void finishGeo(boolean allow){if(geoCallback!=null){geoCallback.invoke(geoOrigin,allow,false);geoCallback=null;geoOrigin=null;}}
    @Override public void onRequestPermissionsResult(int request,String[] permissions,int[] grants){super.onRequestPermissionsResult(request,permissions,grants);if(request==GEO_REQUEST){finishGeo(locationGranted());startGps();}else if(request==MIC_REQUEST)finishMicrophone(checkSelfPermission(Manifest.permission.RECORD_AUDIO)==PackageManager.PERMISSION_GRANTED);}

    @Override public void onActivityResult(int req,int result,Intent data){
        super.onActivityResult(req,result,data);
        if(req==FILE_REQUEST&&fileCallback!=null){
            Uri[] chosen=null;
            if(result==RESULT_OK&&data!=null){if(data.getClipData()!=null){int n=data.getClipData().getItemCount();chosen=new Uri[n];for(int i=0;i<n;i++)chosen[i]=data.getClipData().getItemAt(i).getUri();}else if(data.getData()!=null)chosen=new Uri[]{data.getData()};}
            fileCallback.onReceiveValue(chosen);fileCallback=null;
        }
    }
    private String randomToken(){byte[] b=new byte[32];new SecureRandom().nextBytes(b);return Base64.encodeToString(b,Base64.NO_WRAP|Base64.NO_PADDING|Base64.URL_SAFE);}
    private SharedPreferences auth(){return getSharedPreferences("oauth-pending",MODE_PRIVATE);}
    private void beginGoogleLogin(){
        try{
            String state=randomToken(),verifier=randomToken();
            String challenge=Base64.encodeToString(MessageDigest.getInstance("SHA-256").digest(verifier.getBytes(StandardCharsets.US_ASCII)),Base64.NO_WRAP|Base64.NO_PADDING|Base64.URL_SAFE);
            auth().edit().putString("state",state).putString("verifier",verifier).putLong("at",System.currentTimeMillis()).commit();
            Uri url=Uri.parse(BASE+"/api/auth/google/start").buildUpon().appendQueryParameter("native_state",state).appendQueryParameter("native_challenge",challenge).build();
            startActivity(new Intent(Intent.ACTION_VIEW,url).addCategory(Intent.CATEGORY_BROWSABLE));
        }catch(Exception e){showError("Não foi possível iniciar o login com Google.");}
    }
    @Override protected void onNewIntent(Intent intent){super.onNewIntent(intent);setIntent(intent);handleAuthReturn(intent);}
    private void handleAuthReturn(Intent intent){
        Uri uri=intent==null?null:intent.getData();
        if(uri==null||!"vano-vanu".equals(uri.getScheme())||!"auth".equals(uri.getHost())||!"/callback".equals(uri.getPath()))return;
        setIntent(new Intent());
        String state=uri.getQueryParameter("state"),code=uri.getQueryParameter("code"),expected=auth().getString("state",""),verifier=auth().getString("verifier","");
        long age=System.currentTimeMillis()-auth().getLong("at",0);
        if(state==null||expected.isEmpty()||age<0||age>15*60*1000||!MessageDigest.isEqual(state.getBytes(StandardCharsets.UTF_8),expected.getBytes(StandardCharsets.UTF_8))){Toast.makeText(this,"Retorno de login inválido ou expirado.",Toast.LENGTH_LONG).show();return;}
        auth().edit().clear().commit();
        if(code==null||code.length()>12000){Toast.makeText(this,"conta-existente".equals(uri.getQueryParameter("error"))?"Entre com sua senha VANO para conectar essa conta Google.":"Login cancelado ou indisponível. Você pode entrar com e-mail.",Toast.LENGTH_LONG).show();return;}
        network.execute(()->{
            HttpURLConnection connection=null;
            try{
                connection=(HttpURLConnection)new URL(BASE+"/api/mobile/auth/exchange").openConnection();
                connection.setRequestMethod("POST");connection.setInstanceFollowRedirects(false);connection.setConnectTimeout(15000);connection.setReadTimeout(15000);connection.setDoOutput(true);connection.setRequestProperty("Content-Type","application/json");
                JSONObject payload=new JSONObject().put("code",code).put("state",state).put("verifier",verifier);
                try(java.io.OutputStream out=connection.getOutputStream()){out.write(payload.toString().getBytes(StandardCharsets.UTF_8));}
                if(connection.getResponseCode()!=200)throw new java.io.IOException("exchange rejected");
                byte[] bytes;try(java.io.InputStream in=connection.getInputStream()){java.io.ByteArrayOutputStream out=new java.io.ByteArrayOutputStream();byte[] b=new byte[4096];int n;while((n=in.read(b))!=-1){if(out.size()+n>64000)throw new java.io.IOException("response too large");out.write(b,0,n);}bytes=out.toByteArray();}
                JSONObject response=new JSONObject(new String(bytes,StandardCharsets.UTF_8));
                if(!response.optBoolean("ok"))throw new java.io.IOException();
                String name=response.getString("cookieName"),token=response.getString("sessionToken");
                if(!name.matches("[A-Za-z0-9_-]+")||!token.matches("[A-Za-z0-9_.-]+"))throw new java.io.IOException();
                final String cookie=name+"="+token+"; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age="+Math.max(0,response.optLong("maxAge"));
                runOnUiThread(()->{if(destroyed||web==null)return;CookieManager.getInstance().setCookie(BASE,cookie,ok->{if(ok){CookieManager.getInstance().flush();web.loadUrl(ENTRY);}else showError("Não foi possível concluir o login.");});});
            }catch(Exception e){runOnUiThread(()->{if(!destroyed)showError("Não foi possível concluir o login. Tente novamente.");});}
            finally{if(connection!=null)connection.disconnect();}
        });
    }
    private void showError(String text){
        if(destroyed)return;hideError();
        errorPanel=new LinearLayout(this);errorPanel.setOrientation(LinearLayout.VERTICAL);errorPanel.setGravity(Gravity.CENTER);errorPanel.setPadding(48,48,48,48);errorPanel.setBackgroundColor(Color.rgb(244,245,248));
        TextView message=new TextView(this);message.setText(text);message.setTextSize(18);message.setTextColor(Color.rgb(30,30,30));message.setGravity(Gravity.CENTER);errorPanel.addView(message);
        Button retry=new Button(this);retry.setText("Tentar novamente");retry.setOnClickListener(v->{hideError();recovering=false;if(web==null)createWebView();web.loadUrl(currentUrl);});errorPanel.addView(retry);
        root.addView(errorPanel,new FrameLayout.LayoutParams(-1,-1));
    }
    private void hideError(){if(errorPanel!=null){root.removeView(errorPanel);errorPanel=null;}}
    private void handleBack(){
        if(web==null){finish();return;}
        if(Build.VERSION.SDK_INT>=30&&root.getRootWindowInsets()!=null&&root.getRootWindowInsets().isVisible(WindowInsets.Type.ime())){getWindow().getInsetsController().hide(WindowInsets.Type.ime());return;}
        web.evaluateJavascript("location.pathname==='/mapa'&&!!document.querySelector('.map-page.in-navigation')",value->{if(destroyed)return;if("true".equals(value))new AlertDialog.Builder(this).setMessage("Encerrar a navegação?").setPositiveButton("Encerrar",(d,w)->web.evaluateJavascript("document.querySelector('.nav-bottom .btn-primary')?.click()",null)).setNegativeButton("Continuar",null).show();else web.evaluateJavascript("window.__vanoBack?.()===true",handled->{if(destroyed)return;if(!"true".equals(handled)){if(web.canGoBack())web.goBack();else finish();}});});
    }
    @Override public void onBackPressed(){handleBack();}
    @Override protected void onSaveInstanceState(Bundle state){if(web!=null){Bundle saved=new Bundle();web.saveState(saved);state.putBundle("web",saved);}super.onSaveInstanceState(state);}
    @Override public void onConfigurationChanged(Configuration c){super.onConfigurationChanged(c);root.requestApplyInsets();if(web!=null&&trusted(web.getUrl()))web.evaluateJavascript("window.dispatchEvent(new Event('resize'))",null);}
    @Override protected void onResume(){super.onResume();if(web!=null)web.onResume();syncScreenAwake();startGps();}
    @Override protected void onPause(){getWindow().clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);stopGps();if(voice!=null)voice.stop();if(web!=null)web.onPause();CookieManager.getInstance().flush();if(speech!=null)speech.cancel();super.onPause();}
    @Override protected void onDestroy(){destroyed=true;stopGps();pendingSpeechId="";if(speech!=null)speech.cancel();if(audioPermission!=null){audioPermission.deny();audioPermission=null;}if(voice!=null)voice.close();if(offlineCache!=null)offlineCache.close();handler.removeCallbacksAndMessages(null);finishGeo(false);if(fileCallback!=null)fileCallback.onReceiveValue(null);network.shutdownNow();if(web!=null){root.removeView(web);web.destroy();web=null;}super.onDestroy();}
}

package com.vano.maps.fluidez;

import android.Manifest;
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
    private static final String BASE="https://vanomaps.online", ENTRY=BASE+"/mobile/entry";
    private static final int GEO_REQUEST=10, FILE_REQUEST=11;
    private final ExecutorService network=Executors.newSingleThreadExecutor();
    private WebView web;
    private FrameLayout root;
    private LinearLayout errorPanel;
    private String currentUrl=ENTRY, geoOrigin;
    private GeolocationPermissions.Callback geoCallback;
    private ValueCallback<Uri[]> fileCallback;
    private boolean destroyed, recovering, pageFailed;
    private final Handler handler=new Handler(Looper.getMainLooper());

    static boolean trusted(Uri uri) {
        return uri!=null && "https".equalsIgnoreCase(uri.getScheme()) &&
            "vanomaps.online".equalsIgnoreCase(uri.getHost()) &&
            (uri.getPort()==-1 || uri.getPort()==443) && uri.getUserInfo()==null;
    }
    static boolean trusted(String url) { try{return trusted(Uri.parse(url));}catch(Exception e){return false;} }
    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        getWindow().setSoftInputMode(WindowManager.LayoutParams.SOFT_INPUT_ADJUST_RESIZE);
        root=new FrameLayout(this);root.setBackgroundColor(Color.rgb(244,245,248));setContentView(root);
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
        Bundle saved=state==null?null:state.getBundle("web");
        if(saved==null||web.restoreState(saved)==null||!trusted(web.getUrl()))web.loadUrl(ENTRY);
        if(Build.VERSION.SDK_INT>=33)getOnBackInvokedDispatcher().registerOnBackInvokedCallback(0,this::handleBack);
        handleAuthReturn(getIntent());
    }
    private void createWebView(){
        web=new WebView(this);web.setBackgroundColor(Color.rgb(244,245,248));
        web.setOverScrollMode(View.OVER_SCROLL_NEVER);
        // Default layer policy preserves compositor behavior; never force a software layer.
        WebSettings settings=web.getSettings();
        settings.setJavaScriptEnabled(true);settings.setDomStorageEnabled(true);
        settings.setGeolocationEnabled(true);settings.setCacheMode(WebSettings.LOAD_DEFAULT);
        settings.setAllowFileAccess(false);settings.setAllowContentAccess(false);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        settings.setMediaPlaybackRequiresUserGesture(false); // Spoken navigation follows the explicit start-trip action.
        settings.setUserAgentString(settings.getUserAgentString()+" VANOAndroid/2.7.1-navfix-rc2");
        settings.setSupportMultipleWindows(false);
        CookieManager.getInstance().setAcceptCookie(true);
        CookieManager.getInstance().setAcceptThirdPartyCookies(web,false);
        WebView.setWebContentsDebuggingEnabled(false);
        if(Build.VERSION.SDK_INT>=26)settings.setSafeBrowsingEnabled(true);
        root.addView(web,new FrameLayout.LayoutParams(-1,-1));
        web.setWebViewClient(new WebViewClient(){
            @Override public boolean shouldOverrideUrlLoading(WebView view,WebResourceRequest r){
                if(!r.isForMainFrame())return !trusted(r.getUrl());
                return navigate(r.getUrl());
            }
            @Override public boolean shouldOverrideUrlLoading(WebView view,String url){return navigate(Uri.parse(url));}
            @Override public void onPageStarted(WebView view,String url,android.graphics.Bitmap icon){
                pageFailed=false;if(trusted(url))currentUrl=url;else{view.stopLoading();navigate(Uri.parse(url));}
            }
            @Override public void onPageFinished(WebView view,String url){
                if(!trusted(url)||pageFailed)return;
                recovering=false;hideError();CookieManager.getInstance().flush();
                injectRuntime();
            }
            @Override public void onReceivedError(WebView view,WebResourceRequest req,WebResourceError err){
                if(req.isForMainFrame()){pageFailed=true;showError("Não foi possível conectar ao VANO. Confira sua conexão e tente novamente.");}
            }
            @Override public void onReceivedHttpError(WebView view,WebResourceRequest req,WebResourceResponse resp){
                if(req.isForMainFrame()&&resp.getStatusCode()>=500){pageFailed=true;showError("O servidor está temporariamente indisponível.");}
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
                    if(defaultValue==null||defaultValue.length()>16000)throw new IllegalArgumentException();
                    JSONObject data=new JSONObject(defaultValue);String action=data.optString("action");
                    if("share".equals(action)){
                        Intent share=new Intent(Intent.ACTION_SEND).setType("text/plain");
                        share.putExtra(Intent.EXTRA_SUBJECT,data.optString("title"));
                        share.putExtra(Intent.EXTRA_TEXT,data.optString("text")+"\n"+data.optString("url"));
                        startActivity(Intent.createChooser(share,"Compartilhar"));result.confirm("ok");
                    }else if("wake".equals(action)){
                        if(data.optBoolean("active"))getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
                        else getWindow().clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
                        result.confirm("ok");
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
    private void injectRuntime(){
        web.evaluateJavascript("(()=>{if(window.__vanoShell)return;window.__vanoShell=true;document.documentElement.classList.add('vano-android-webview');const call=data=>prompt('VANO_NATIVE',JSON.stringify(data));if(!navigator.share){navigator.share=async d=>{if(call({action:'share',title:d.title||'',text:d.text||'',url:d.url||''})!=='ok')throw new DOMException('Compartilhamento cancelado','AbortError')};}let lastWake=null;const sync=()=>{const active=document.visibilityState==='visible'&&document.body.classList.contains('body-nav');if(active!==lastWake){lastWake=active;call({action:'wake',active})}};new MutationObserver(sync).observe(document.body,{attributes:true,attributeFilter:['class']});document.addEventListener('visibilitychange',sync);sync();})()",null);
    }
    private boolean navigate(Uri uri){
        if(trusted(uri)){
            if("/auth/google".equals(uri.getPath())){beginGoogleLogin();return true;}
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
    @Override public void onRequestPermissionsResult(int request,String[] permissions,int[] grants){super.onRequestPermissionsResult(request,permissions,grants);if(request==GEO_REQUEST)finishGeo(locationGranted());}
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
            Uri url=Uri.parse(BASE+"/mobile/auth/google/start").buildUpon().appendQueryParameter("state",state).appendQueryParameter("challenge",challenge).appendQueryParameter("return_uri","vano://auth/callback").build();
            startActivity(new Intent(Intent.ACTION_VIEW,url).addCategory(Intent.CATEGORY_BROWSABLE));
        }catch(Exception e){showError("Não foi possível iniciar o login com Google.");}
    }
    @Override protected void onNewIntent(Intent intent){super.onNewIntent(intent);setIntent(intent);handleAuthReturn(intent);}
    private void handleAuthReturn(Intent intent){
        Uri uri=intent==null?null:intent.getData();
        if(uri==null||!"vano".equals(uri.getScheme())||!"auth".equals(uri.getHost())||!"/callback".equals(uri.getPath()))return;
        setIntent(new Intent());
        String state=uri.getQueryParameter("state"),code=uri.getQueryParameter("code"),expected=auth().getString("state",""),verifier=auth().getString("verifier","");
        long age=System.currentTimeMillis()-auth().getLong("at",0);
        if(state==null||code==null||code.length()>12000||expected.isEmpty()||age<0||age>15*60*1000||!MessageDigest.isEqual(state.getBytes(StandardCharsets.UTF_8),expected.getBytes(StandardCharsets.UTF_8))){Toast.makeText(this,"Retorno de login inválido ou expirado.",Toast.LENGTH_LONG).show();return;}
        auth().edit().clear().commit();
        network.execute(()->{
            HttpURLConnection connection=null;
            try{
                connection=(HttpURLConnection)new URL(BASE+"/mobile/auth/exchange").openConnection();
                connection.setRequestMethod("POST");connection.setInstanceFollowRedirects(false);connection.setConnectTimeout(15000);connection.setReadTimeout(15000);connection.setDoOutput(true);connection.setRequestProperty("Content-Type","application/json");
                JSONObject payload=new JSONObject().put("code",code).put("state",state).put("verifier",verifier);
                try(java.io.OutputStream out=connection.getOutputStream()){out.write(payload.toString().getBytes(StandardCharsets.UTF_8));}
                if(connection.getResponseCode()!=200)throw new java.io.IOException("exchange rejected");
                byte[] bytes;try(java.io.InputStream in=connection.getInputStream()){java.io.ByteArrayOutputStream out=new java.io.ByteArrayOutputStream();byte[] b=new byte[4096];int n;while((n=in.read(b))!=-1){if(out.size()+n>64000)throw new java.io.IOException("response too large");out.write(b,0,n);}bytes=out.toByteArray();}
                JSONObject response=new JSONObject(new String(bytes,StandardCharsets.UTF_8));
                if(!response.optBoolean("ok"))throw new java.io.IOException();
                String name=response.getString("cookie_name"),token=response.getString("remember_token");
                if(!name.matches("[A-Za-z0-9_-]+")||!token.matches("[A-Za-z0-9_.-]+"))throw new java.io.IOException();
                final String cookie=name+"="+token+"; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age="+Math.max(0,response.optLong("max_age"));
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
        web.evaluateJavascript("document.body.classList.contains('body-nav')",value->{if(destroyed)return;if("true".equals(value))new AlertDialog.Builder(this).setMessage("Sair do aplicativo durante a navegação?").setPositiveButton("Sair",(d,w)->finish()).setNegativeButton("Continuar",null).show();else if(web.canGoBack())web.goBack();else finish();});
    }
    @Override public void onBackPressed(){handleBack();}
    @Override protected void onSaveInstanceState(Bundle state){if(web!=null){Bundle saved=new Bundle();web.saveState(saved);state.putBundle("web",saved);}super.onSaveInstanceState(state);}
    @Override public void onConfigurationChanged(Configuration c){super.onConfigurationChanged(c);root.requestApplyInsets();if(web!=null&&trusted(web.getUrl()))web.evaluateJavascript("window.dispatchEvent(new Event('resize'))",null);}
    @Override protected void onResume(){super.onResume();if(web!=null)web.onResume();}
    @Override protected void onPause(){if(web!=null)web.onPause();CookieManager.getInstance().flush();super.onPause();}
    @Override protected void onDestroy(){destroyed=true;handler.removeCallbacksAndMessages(null);finishGeo(false);if(fileCallback!=null)fileCallback.onReceiveValue(null);network.shutdownNow();if(web!=null){root.removeView(web);web.destroy();web=null;}super.onDestroy();}
}

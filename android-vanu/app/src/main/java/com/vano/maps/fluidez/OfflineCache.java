package com.vano.maps.fluidez;
import android.content.Context;
import android.net.Uri;
import android.net.ConnectivityManager;
import android.net.NetworkCapabilities;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import org.json.*;
import java.io.*;
import java.net.*;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.*;
import java.util.concurrent.*;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.regex.*;
import java.util.zip.GZIPInputStream;

/** Private, bounded HTTP resource cache. Authentication/API responses are never cached here. */
public final class OfflineCache {
    public interface PreparationListener { void accept(int tiles); }
    private static final Set<String> SHELL_PATHS=new HashSet<>(Arrays.asList("/mapa","/inicio","/perfil","/conta","/rotas","/favoritos","/configuracoes","/rotinas","/atividade","/relatar","/ajuda","/entrar","/cadastro","/personalizar","/termos","/privacidade","/sobre"));
    private static final long LIMIT=256L*1024*1024;
    private final File dir;
    private final String host;
    private final Context context;
    private final Set<String> pinned=Collections.newSetFromMap(new ConcurrentHashMap<String,Boolean>());
    private final ConcurrentHashMap<String,Object> locks=new ConcurrentHashMap<>();
    private final ConcurrentHashMap<String,Integer> tileTemplates=new ConcurrentHashMap<>();
    private final AtomicInteger failures=new AtomicInteger();
    private final ExecutorService coordinator=Executors.newSingleThreadExecutor();
    private final ExecutorService downloads=Executors.newFixedThreadPool(4);
    private static final Pattern TILE=Pattern.compile("/(\\d+)/(\\d+)/(\\d+)([^/]*\\.(?:pbf|webp|png|jpg[^/?]*))(?:\\?|$)");
    public OfflineCache(Context context,String host){this.context=context;this.host=host;dir=new File(context.getFilesDir(),"map-resources-v1");dir.mkdirs();loadPins();}
    static String canonical(String raw){
        URI uri=URI.create(raw);
        if("api.mapbox.com".equals(uri.getHost())){
            List<String> parts=new ArrayList<>();String query=uri.getRawQuery();
            if(query!=null)for(String part:query.split("&")){String name=part.split("=",2)[0];if(!name.equals("sku"))parts.add(part);}
            Collections.sort(parts);return uri.getScheme()+"://"+uri.getRawAuthority()+uri.getRawPath()+(parts.isEmpty()?"":"?"+String.join("&",parts));
        }
        return raw;
    }
    private String key(String url)throws Exception{byte[] bytes=MessageDigest.getInstance("SHA-256").digest(canonical(url).getBytes(StandardCharsets.UTF_8));StringBuilder s=new StringBuilder();for(byte b:bytes)s.append(String.format(Locale.ROOT,"%02x",b&255));return s.toString();}
    private boolean eligible(Uri u){
        if(!"https".equals(u.getScheme())||u.getUserInfo()!=null||(u.getPort()!=-1&&u.getPort()!=443))return false;
        String h=u.getHost(),p=u.getPath();if(p==null)return false;
        if(host.equals(h))return SHELL_PATHS.contains(p)||p.startsWith("/assets/")||p.startsWith("/mapbox/")||p.startsWith("/vano-")||p.equals("/favicon.ico");
        if("fonts.googleapis.com".equals(h)||"fonts.gstatic.com".equals(h))return true;
        return "api.mapbox.com".equals(h)&&!p.startsWith("/events")&&(p.startsWith("/v4/")||p.startsWith("/styles/v1/")||p.startsWith("/fonts/v1/"));
    }
    private boolean isDisconnected(){
        try{
            ConnectivityManager cm=(ConnectivityManager)context.getSystemService(Context.CONNECTIVITY_SERVICE);
            if(cm==null)return false;
            android.net.Network network=cm.getActiveNetwork();
            NetworkCapabilities caps=network==null?null:cm.getNetworkCapabilities(network);
            return caps==null||!caps.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET);
        }catch(Exception e){return false;}
    }
    private WebResourceResponse savedShell(Uri uri){
        if(!host.equals(uri.getHost())||!"https".equalsIgnoreCase(uri.getScheme()))return null;
        String path=uri.getPath();
        if(path==null||(!path.equals("/")&&!SHELL_PATHS.contains(path)))return null;
        try{
            for(String candidate:new String[]{uri.toString(),"https://"+host+"/","https://"+host+"/mapa"}){
                String id=key(candidate);
                JSONObject m=metadata(id);
                if(m!=null && "text/html".equalsIgnoreCase(m.optString("mime")))return read(id,m);
            }
        }catch(Exception ignored){}
        return null;
    }
    public void primeShell(){
        coordinator.execute(()->{
            for(String page:new String[]{"/","/mapa"}){
                WebResourceResponse response=load("https://"+host+page,Collections.emptyMap(),false);
                if(response!=null)try{response.getData().close();}catch(Exception ignored){}
            }
        });
    }
    public WebResourceResponse intercept(WebResourceRequest request){
        if(!"GET".equals(request.getMethod()))return null;
        if(request.isForMainFrame()){
            // Online HTML navigation belongs to WebView so OAuth and session cookies
            // follow Chromium's normal redirect and origin policy.
            return isDisconnected()?savedShell(request.getUrl()):null;
        }
        if(!eligible(request.getUrl()))return null;
        return load(request.getUrl().toString(),request.getRequestHeaders(),false);
    }
    private WebResourceResponse load(String url,Map<String,String> requestHeaders,boolean preparation){
        HttpURLConnection connection=null;String id;
        try{id=key(url);}catch(Exception e){return null;}
        Object lock=locks.get(id);if(lock==null){Object candidate=new Object();Object existing=locks.putIfAbsent(id,candidate);lock=existing==null?candidate:existing;}
        synchronized(lock){
            JSONObject cached=metadata(id);
            // Respect freshness when online; immutable app resources stay reusable between launches.
            if(cached!=null&&cached.optLong("freshUntil")>System.currentTimeMillis()){return cached(id,cached,url,preparation);}
            try{
                connection=(HttpURLConnection)new URL(url).openConnection();connection.setConnectTimeout(4500);connection.setReadTimeout(8000);connection.setInstanceFollowRedirects(false);connection.setRequestProperty("Accept-Encoding","identity");
                for(Map.Entry<String,String> e:requestHeaders.entrySet())if(!e.getKey().equalsIgnoreCase("Cookie")&&!e.getKey().equalsIgnoreCase("Authorization")&&!e.getKey().equalsIgnoreCase("Accept-Encoding"))connection.setRequestProperty(e.getKey(),e.getValue());
                int status=connection.getResponseCode();
                if(status==304&&cached!=null){cached.put("freshUntil",freshUntil(Objects.toString(connection.getHeaderField("Cache-Control"),"")));return cached(id,cached,url,preparation);}
                if(status>=500&&cached!=null){return cached(id,cached,url,preparation);}
                if(status!=200)return null;
                String content=connection.getContentType();if(content==null)return null;String mime=content.split(";",2)[0];
                String control=Objects.toString(connection.getHeaderField("Cache-Control"),"").toLowerCase(Locale.ROOT);
                if(control.contains("no-store")||control.contains("private")||connection.getHeaderField("Set-Cookie")!=null)return null;
                InputStream input=connection.getInputStream();if("gzip".equalsIgnoreCase(connection.getContentEncoding()))input=new GZIPInputStream(input);
                byte[] body=bytes(input,16*1024*1024);
                Map<String,String> responseHeaders=new HashMap<>();for(Map.Entry<String,List<String>> entry:connection.getHeaderFields().entrySet())if(entry.getKey()!=null&&!entry.getKey().equalsIgnoreCase("Content-Encoding")&&!entry.getKey().equalsIgnoreCase("Content-Length")&&!entry.getKey().equalsIgnoreCase("Transfer-Encoding"))responseHeaders.put(entry.getKey(),String.join(", ",entry.getValue()));
                JSONObject meta=new JSONObject().put("mime",mime).put("headers",new JSONObject(responseHeaders)).put("freshUntil",freshUntil(control)).put("essential",!TILE.matcher(url).find());
                observeTiles(url,mime,body);
                if(save(id,body,meta)){pin(id,preparation);}else if(preparation)failures.incrementAndGet();
                return new WebResourceResponse(mime,"UTF-8",200,"OK",responseHeaders,new ByteArrayInputStream(body));
            }catch(Exception e){
                if(cached!=null){return cached(id,cached,url,preparation);}
                if(host.equals(Uri.parse(url).getHost())&&SHELL_PATHS.contains(Uri.parse(url).getPath())){try{String shell=key("https://"+host+"/mapa");JSONObject fallback=metadata(shell);if(fallback!=null)return read(shell,fallback);}catch(Exception ignored){}}
                if(preparation)failures.incrementAndGet();return null;
            }finally{if(connection!=null)connection.disconnect();}
        }
    }
    private static byte[] bytes(InputStream in,int maximum)throws IOException{try(InputStream input=in;ByteArrayOutputStream out=new ByteArrayOutputStream()){byte[] b=new byte[16384];int n;while((n=input.read(b))!=-1){if(out.size()+n>maximum)throw new IOException("resource too large");out.write(b,0,n);}return out.toByteArray();}}
    private long freshUntil(String control){if(control.contains("no-cache"))return 0;Matcher m=Pattern.compile("(?:^|,)\\s*max-age=(\\d+)").matcher(control);if(!m.find())return 0;try{return System.currentTimeMillis()+Math.min(31536000,Long.parseLong(m.group(1)))*1000;}catch(Exception e){return 0;}}
    private JSONObject metadata(String id){try{File body=new File(dir,id+".body"),meta=new File(dir,id+".json");if(!body.isFile()||!meta.isFile())return null;return new JSONObject(new String(bytes(new FileInputStream(meta),65536),StandardCharsets.UTF_8));}catch(Exception e){return null;}}
    private WebResourceResponse cached(String id,JSONObject metadata,String url,boolean preparation){
        pin(id,preparation);try{byte[] body=metadata.optString("mime").contains("json")?bytes(new FileInputStream(new File(dir,id+".body")),1024*1024):new byte[0];observeTiles(url,metadata.optString("mime"),body);}catch(Exception ignored){}
        return read(id,metadata);
    }
    private WebResourceResponse read(String id,JSONObject meta){try{File file=new File(dir,id+".body");file.setLastModified(System.currentTimeMillis());JSONObject hs=meta.optJSONObject("headers");Map<String,String> headers=new HashMap<>();if(hs!=null)for(Iterator<String> keys=hs.keys();keys.hasNext();){String k=keys.next();headers.put(k,hs.getString(k));}return new WebResourceResponse(meta.getString("mime"),"UTF-8",200,"OK",headers,new FileInputStream(file));}catch(Exception e){return null;}}
    private synchronized boolean save(String id,byte[] body,JSONObject metadata){
        try{prune(body.length);File temp=new File(dir,id+".tmp");try(FileOutputStream out=new FileOutputStream(temp)){out.write(body);out.getFD().sync();}if(!temp.renameTo(new File(dir,id+".body")))throw new IOException();try(FileOutputStream out=new FileOutputStream(new File(dir,id+".json"))){out.write(metadata.toString().getBytes(StandardCharsets.UTF_8));}return true;}catch(Exception e){return false;}
    }
    private void prune(long incoming)throws IOException{File[] files=dir.listFiles((d,n)->n.endsWith(".body"));if(files==null)return;long total=incoming;for(File f:files)total+=f.length();Arrays.sort(files,(a,b)->Long.compare(a.lastModified(),b.lastModified()));for(File f:files){if(total<=LIMIT)break;String id=f.getName().replace(".body","");if(pinned.contains(id))continue;total-=f.length();f.delete();new File(dir,id+".json").delete();}if(total>LIMIT)throw new IOException("offline package exceeds capacity");}
    private void pin(String id,boolean active){if(active)pinned.add(id);}
    private void loadPins(){try{JSONArray a=new JSONArray(new String(bytes(new FileInputStream(new File(dir,"pinned.json")),131072),StandardCharsets.UTF_8));for(int i=0;i<a.length();i++)pinned.add(a.getString(i));}catch(Exception ignored){}}
    private void savePins(){try(FileOutputStream out=new FileOutputStream(new File(dir,"pinned.json"))){out.write(new JSONArray(pinned).toString().getBytes(StandardCharsets.UTF_8));}catch(Exception ignored){}}
    private void observeTiles(String url,String mime,byte[] body){
        Matcher m=TILE.matcher(url);if(m.find()){String template=url.substring(0,m.start())+"/{z}/{x}/{y}"+m.group(4)+url.substring(m.end()-(url.charAt(m.end()-1)=='?'?1:0));tileTemplates.putIfAbsent(template,m.group(4).contains("pbf")?14:17);}
        if(mime.contains("json")){try{JSONObject data=new JSONObject(new String(body,StandardCharsets.UTF_8));if(data.has("tilejson")){JSONArray tiles=data.optJSONArray("tiles");if(tiles!=null)for(int i=0;i<tiles.length();i++){String t=tiles.getString(i);if(t.startsWith("https://api.mapbox.com/")&&!t.contains("{sku"))tileTemplates.put(t,data.optInt("maxzoom",14));}}}catch(Exception ignored){}}
    }
    public void prepare(double[][] points,PreparationListener done){
        coordinator.execute(()->{
            failures.set(0);pinned.clear();
            // Preserve every downloaded app/style/font resource, not only new corridor tiles.
            File[] existing=dir.listFiles((d,n)->n.endsWith(".body"));if(existing!=null)for(File f:existing)if(metadata(f.getName().replace(".body",""))!=null&&metadata(f.getName().replace(".body","" )).optBoolean("essential"))pinned.add(f.getName().replace(".body",""));
            Map<String,Integer> templates=new HashMap<>(tileTemplates);
            if(templates.isEmpty()){done.accept(-1);return;}
            Set<String> urls=new LinkedHashSet<>();try{for(Map.Entry<String,Integer> e:templates.entrySet())for(String tile:TileCorridor.tiles(points,e.getValue(),1200)){String[] at=tile.split("/");urls.add(e.getKey().replace("{z}",at[0]).replace("{x}",at[1]).replace("{y}",at[2]));}if(urls.size()>1600)throw new IllegalArgumentException();}catch(Exception e){done.accept(-1);return;}
            List<Future<Boolean>> tasks=new ArrayList<>();for(String url:urls)tasks.add(downloads.submit(()->{WebResourceResponse r=load(url,new HashMap<String,String>(){{put("Referer","https://"+host+"/mapa");put("Origin","https://"+host);}},true);if(r==null)return false;try{r.getData().close();}catch(Exception ignored){}return true;}));
            boolean complete=true;for(Future<Boolean> future:tasks)try{complete&=future.get(180,TimeUnit.SECONDS);}catch(Exception e){complete=false;}
            savePins();done.accept(complete&&failures.get()==0?urls.size():-1);
        });
    }
    public void close(){coordinator.shutdownNow();downloads.shutdownNow();}
}

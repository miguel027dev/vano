package com.vano.maps.fluidez;
import android.content.Context;
import android.net.Uri;
import android.net.ConnectivityManager;
import android.webkit.*;
import java.io.*;
import java.net.*;
import java.nio.file.*;
import java.util.*;
import java.util.concurrent.*;

public class OfflineCacheTest {
    static boolean offline=false;
    static int connections=0;
    static String control="no-cache";
    static class Connection extends HttpURLConnection {
        Connection(URL u){super(u);}
        public void connect(){}
        public void disconnect(){}
        public boolean usingProxy(){return false;}
        public int getResponseCode()throws IOException {
            connections++;
            if(offline)throw new IOException("no network");
            return 200;
        }
        public String getContentType(){
            return url.getPath().equals("/")||url.getPath().equals("/mapa")?"text/html":"application/javascript";
        }
        public String getHeaderField(String key){return key.equals("Cache-Control")?control:null;}
        public Map<String,List<String>> getHeaderFields(){return Map.of("Cache-Control",List.of(control));}
        public InputStream getInputStream(){
            if(getContentType().equals("text/html"))return new ByteArrayInputStream(
                "<html><script type='module' src='/assets/app.js'></script></html>".getBytes());
            return new ByteArrayInputStream(("content:"+url.getPath()).getBytes());
        }
    }
    static WebResourceRequest request(String url){
        return new WebResourceRequest(){
            public boolean isForMainFrame(){
                String path=Uri.parse(url).getPath();
                return path.equals("/")||path.equals("/mapa")||path.equals("/perfil");
            }
            public String getMethod(){return "GET";}
            public Uri getUrl(){return Uri.parse(url);}
            public Map<String,String> getRequestHeaders(){return Map.of();}
        };
    }
    static String read(WebResourceResponse response)throws Exception{
        if(response==null)throw new AssertionError("Expected cached resource");
        try(InputStream in=response.getData()){return new String(in.readAllBytes());}
    }
    static void check(boolean condition,String reason){if(!condition)throw new AssertionError(reason);}
    static void awaitBodies(File dir,int count)throws Exception{
        for(int attempt=0;attempt<120;attempt++){
            File[] files=dir.listFiles((d,n)->n.endsWith(".body"));
            if(files!=null&&files.length>=count)return;
            Thread.sleep(25);
        }
        throw new AssertionError("offline shell not warmed");
    }
    public static void main(String[] args)throws Exception {
        URL.setURLStreamHandlerFactory(protocol->protocol.equals("https")?new URLStreamHandler(){
            protected URLConnection openConnection(URL u){return new Connection(u);}
        }:null);
        File dir=Files.createTempDirectory("vano-cache-test").toFile();
        OfflineCache cache=new OfflineCache(new Context(dir),"vanu-73xu.onrender.com");
        String shell="https://vanu-73xu.onrender.com/mapa";
        String asset="https://vanu-73xu.onrender.com/assets/app.js";
        String tile="https://api.mapbox.com/v4/mapbox.mapbox-streets-v8/14/8000/8000.vector.pbf?access_token=token&sku=first";
        check(cache.intercept(request(shell))==null,"online main frame must bypass native cache and preserve WebView cookies");
        check(cache.intercept(request(asset))==null,"online resources bypass native downloader");
        check(cache.intercept(request(tile))==null,"Mapbox renderer must not wait for native downloads");
        cache.primeShell();
        awaitBodies(dir,3);
        CountDownLatch saved=new CountDownLatch(1);
        final int[] tiles={-1};
        cache.prepare(new double[][]{{-46.63,-23.55},{-46.62,-23.54}},n->{tiles[0]=n;saved.countDown();});
        check(saved.await(10,TimeUnit.SECONDS)&&tiles[0]>0,"some next-route tiles cached");
        ConnectivityManager.connected=false;
        offline=true;
        check(read(cache.intercept(request(shell))).contains("/assets/app.js"),"saved shell offline");
        check(read(cache.intercept(request(asset))).contains("/assets/app.js"),"JS bundle offline");
        check(read(cache.intercept(request("https://vanu-73xu.onrender.com/perfil"))).contains("app.js"),"SPA fallback");
        int before=connections;
        check(cache.intercept(request("https://vanu-73xu.onrender.com/api/bootstrap"))==null,"private API excluded");
        check(connections==before,"API untouched");
        check(cache.intercept(request("http://vanu-73xu.onrender.com/mapa"))==null,"HTTPS only");
        cache.close();
        OfflineCache reopened=new OfflineCache(new Context(dir),"vanu-73xu.onrender.com");
        check(read(reopened.intercept(request(shell))).contains("app.js"),"shell survives restart");
        reopened.close();
        System.out.println("PASS offline shell, session-safe online navigation, bounded tiles, cached asset, API exclusion");
    }
}

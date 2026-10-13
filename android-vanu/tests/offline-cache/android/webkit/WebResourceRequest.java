package android.webkit;import android.net.Uri;import java.util.Map;public interface WebResourceRequest {String getMethod();Uri getUrl();Map<String,String> getRequestHeaders();}

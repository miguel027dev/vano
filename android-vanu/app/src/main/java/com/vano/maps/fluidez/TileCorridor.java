package com.vano.maps.fluidez;
import java.util.*;
/** Finite tile corridor; coordinates are sampled along real route geometry in JS. */
public final class TileCorridor {
    /**
     * Navigation-only best-effort prefetch. High-detail tiles are sampled ahead,
     * with a bounded budget; no error or wait can block the driver's map.
     */
    public static Set<String> progressiveTiles(double[][] points,int maximumZoom,int budget){
        Set<String> result=new LinkedHashSet<>();
        if(points==null||points.length<2||budget<=0)return result;
        int highest=Math.min(17,Math.max(10,maximumZoom));
        for(int z=highest;z>=10&&result.size()<budget;z--){
            int n=1<<z;
            for(double[] p:points){
                if(p.length<2||!Double.isFinite(p[0])||!Double.isFinite(p[1])||Math.abs(p[0])>180||Math.abs(p[1])>90)continue;
                double lat=Math.toRadians(Math.max(-85.05112878,Math.min(85.05112878,p[1])));
                int x=(int)Math.floor((p[0]+180)/360*n);
                int y=(int)Math.floor((1-Math.log(Math.tan(lat)+1/Math.cos(lat))/Math.PI)/2*n);
                // Priority: actual road, then the four immediate side tiles.
                int[][] near={{0,0},{1,0},{-1,0},{0,1},{0,-1}};
                for(int[] offset:near){
                    int tx=((x+offset[0])%n+n)%n,ty=y+offset[1];
                    if(ty<0||ty>=n)continue;
                    result.add(z+"/"+tx+"/"+ty);
                    if(result.size()>=budget)return result;
                }
            }
        }
        return result;
    }
    public static Set<String> tiles(double[][] points,int maximumZoom,int budget){
        Set<String> result=new LinkedHashSet<>();
        for(int z=10;z<=Math.min(17,maximumZoom);z++){
            int n=1<<z;
            for(double[] p:points){
                if(p.length<2||!Double.isFinite(p[0])||!Double.isFinite(p[1])||Math.abs(p[0])>180||Math.abs(p[1])>90)throw new IllegalArgumentException("invalid point");
                double latitude=Math.toRadians(Math.max(-85.05112878,Math.min(85.05112878,p[1])));
                int x=(int)Math.floor((p[0]+180)/360*n),y=(int)Math.floor((1-Math.log(Math.tan(latitude)+1/Math.cos(latitude))/Math.PI)/2*n);
                for(int dx=-1;dx<=1;dx++)for(int dy=-1;dy<=1;dy++){
                    int tx=((x+dx)%n+n)%n,ty=y+dy;if(ty<0||ty>=n)continue;
                    result.add(z+"/"+tx+"/"+ty);
                    if(result.size()>budget)throw new IllegalArgumentException("offline package too large");
                }
            }
        }
        return result;
    }
}

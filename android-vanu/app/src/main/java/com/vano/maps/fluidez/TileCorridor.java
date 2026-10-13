package com.vano.maps.fluidez;
import java.util.*;
/** Finite tile corridor; coordinates are sampled along real route geometry in JS. */
public final class TileCorridor {
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

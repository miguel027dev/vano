package com.vano.maps.fluidez;

/** Pure sensor arbitration. No fabricated fixes, smoothing or persistent coordinates. */
final class GpsFixPolicy {
    private long acceptedElapsed=-1, preciseElapsed=-1;
    private double preciseAccuracy=Double.POSITIVE_INFINITY;

    static boolean fresh(long source,long now,long maxAge){
        return source>0&&source<=now&&now-source<=maxAge;
    }
    boolean accept(double latitude,double longitude,double accuracy,long elapsed,long now,
                   long wallTime,long wallNow,boolean satellite){
        if(!Double.isFinite(latitude)||!Double.isFinite(longitude)||Math.abs(latitude)>90||Math.abs(longitude)>180
            ||!Double.isFinite(accuracy)||accuracy<0||accuracy>2000)return false;
        if(!fresh(elapsed,now,15000)||wallTime<=0||wallTime>wallNow+5000||wallNow-wallTime>15000)return false;
        if(elapsed<=acceptedElapsed)return false;
        // Let a better network measurement through. Suppress only a noisier
        // network fix while a recent precise satellite observation remains valid.
        if(!satellite&&preciseElapsed>0&&elapsed-preciseElapsed<6000&&accuracy>preciseAccuracy*1.5)return false;
        acceptedElapsed=elapsed;
        if(satellite&&accuracy<=35){preciseElapsed=elapsed;preciseAccuracy=accuracy;}
        return true;
    }
}

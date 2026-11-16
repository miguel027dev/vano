package com.vano.maps.fluidez;
import org.junit.Test;
import static org.junit.Assert.*;
public class GpsFixPolicyTest {
    private boolean fix(GpsFixPolicy p,double accuracy,long elapsed,long now,boolean gps){
        return p.accept(-23.58,-46.68,accuracy,elapsed,now,1700000000000L+elapsed,1700000000000L+now,gps);
    }
    @Test public void quickNetworkThenPreciseSatellite(){
        GpsFixPolicy p=new GpsFixPolicy();
        assertTrue(fix(p,900,10000,10100,false));
        assertTrue(fix(p,8,11000,11010,true));
        assertFalse(fix(p,180,12000,12010,false));
        assertTrue(fix(p,5,12500,12510,false));
    }
    @Test public void networkRecoversAfterSatelliteLoss(){
        GpsFixPolicy p=new GpsFixPolicy();
        assertTrue(fix(p,10,10000,10010,true));
        assertTrue(fix(p,90,17000,17010,false));
    }
    @Test public void rejectsStaleFutureDuplicateAndInvalid(){
        GpsFixPolicy p=new GpsFixPolicy();
        assertFalse(fix(p,8,10000,26000,true));
        assertFalse(fix(p,8,27000,26000,true));
        assertTrue(fix(p,8,26000,26010,true));
        assertFalse(fix(p,8,26000,26020,true));
        assertFalse(fix(p,8,25000,26020,true));
        assertFalse(p.accept(Double.NaN,0,8,27000,27010,1700000027000L,1700000027010L,true));
        assertFalse(p.accept(91,0,8,27000,27010,1700000027000L,1700000027010L,true));
        assertFalse(fix(p,Double.NaN,27000,27010,true));
        assertFalse(fix(p,2001,27000,27010,true));
    }
    @Test public void cachedLocationNeedsMonotonicFreshness(){
        assertTrue(GpsFixPolicy.fresh(10000,18000,8000));
        assertFalse(GpsFixPolicy.fresh(10000,18001,8000));
        assertFalse(GpsFixPolicy.fresh(20000,18000,8000));
        assertFalse(GpsFixPolicy.fresh(0,18000,8000));
    }
    @Test public void wallClockMismatchIsRejected(){
        assertFalse(new GpsFixPolicy().accept(0,0,8,10000,10100,200000,100000,true));
    }
}

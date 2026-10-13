package com.vano.maps.fluidez;
import java.util.*;
public class TileCorridorTest{
 public static void main(String[] args){
  Set<String> tile=TileCorridor.tiles(new double[][]{{0,0}},14,100);
  if(tile.size()!=45||!tile.contains("14/8192/8192"))throw new AssertionError(tile);
  for(String s:TileCorridor.tiles(new double[][]{{180,85}},14,100)){String[] a=s.split("/");int z=Integer.parseInt(a[0]),x=Integer.parseInt(a[1]),y=Integer.parseInt(a[2]);if(x<0||y<0||x>=(1<<z)||y>=(1<<z))throw new AssertionError(s);}
  boolean rejected=false;try{TileCorridor.tiles(new double[][]{{0,0}},14,1);}catch(IllegalArgumentException e){rejected=true;}if(!rejected)throw new AssertionError("budget ignored");
  System.out.println("PASS: tile corridor boundaries, antimeridian and download budget.");
 }
}

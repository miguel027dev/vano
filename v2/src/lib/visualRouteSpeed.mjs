/** Estimate visual-only route speed when a sensor omits coords.speed.
 * This never modifies GPS fixes, route decisions, the speedometer, or ETA.
 * Feed consecutive accepted, matched observations from the SAME route.
 */
export function estimateVisualRouteSpeed(previous,current,{previousSpeed=null}={}){
 const valid=fix=>fix&&Number.isFinite(fix.sourceAt)&&fix.sourceAt>0&&
   Number.isFinite(fix.meters)&&fix.meters>=0&&
   Number.isFinite(fix.accuracy)&&fix.accuracy>=0&&fix.accuracy<=30;
 if(!valid(previous)||!valid(current))return null;
 const seconds=(current.sourceAt-previous.sourceAt)/1000;
 if(seconds<.35||seconds>3.5)return null;
 const distance=current.meters-previous.meters;
 // A new route, out-of-order fix, or lateral map-match leap is not speed.
 if(distance < -2)return null;
 if(distance < Math.max(1.2,Math.min(3,current.accuracy*.15)))return 0;
 const measured=distance/seconds;
 if(!Number.isFinite(measured)||measured>40)return null;
 // Moderate sensor noise without turning speed into a permanently lagging spring.
 return Number.isFinite(previousSpeed)
   ?Math.max(0,Math.min(40,previousSpeed*.25+measured*.75))
   :Math.max(0,measured);
}

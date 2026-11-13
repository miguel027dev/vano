/** Browser regression: start Vite, then run with a public MAPBOX_TEST_TOKEN.
 * PLAYWRIGHT_MODULE can point to an existing Playwright installation. */
import assert from 'node:assert/strict';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const browser=await chromium.launch({headless:true,
 ...(process.env.CHROMIUM_PATH?{executablePath:process.env.CHROMIUM_PATH}:{}),
 args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
try{
 const page=await browser.newPage({viewport:{width:390,height:844}});
 await page.addInitScript(token=>{window.__anchorTestToken=token;},process.env.MAPBOX_TEST_TOKEN);
 await page.goto((process.env.ANCHOR_TEST_URL||'http://127.0.0.1:5174')+'/scripts/fixtures/community-anchors.html');
 await page.waitForFunction(()=>window.anchorReady&&document.querySelectorAll('.vano-community-pin').length===6);
 const measure=()=>page.evaluate(()=>window.anchorReports.map(report=>{
  const element=document.querySelector(`[data-kind="${report.type}"]`);
  const bounds=element.getBoundingClientRect(),point=window.anchorMap.project(report.coords);
  return {error:Math.hypot(bounds.x+bounds.width/2-point.x,bounds.y+bounds.height-point.y),
   visible:getComputedStyle(element).visibility!=='hidden'&&bounds.right>0&&bounds.left<390&&bounds.bottom>0&&bounds.top<844};
 }));
 for(const appearance of ['light','dark']){
  await page.locator('#map').evaluate((el,value)=>el.dataset.mapAppearance=value,appearance);
  for(const pitch of [0,60,75]){
   await page.evaluate(pitch=>window.anchorMap.jumpTo({center:[-46.6557,-23.5615],zoom:17,pitch,bearing:25}),pitch);
   await page.evaluate(()=>new Promise(requestAnimationFrame));
   assert.ok((await measure()).every(marker=>marker.error<1),'each marker must match its projected coordinate');
  }
  // Real drag: the screen position changes while the geographic point stays fixed.
  await page.mouse.move(195,420);await page.mouse.down();await page.mouse.move(245,460,{steps:8});await page.mouse.up();
  await page.evaluate(()=>window.anchorMap.stop());
  assert.ok((await measure()).every(marker=>marker.error<1),'drag must not introduce layout offsets');
  await page.evaluate(()=>window.anchorMap.jumpTo({center:[18.4241,-33.9249],zoom:14,pitch:60}));
  assert.ok((await measure()).every(marker=>!marker.visible),'Brazil reports must not appear in South Africa');
  await page.evaluate(()=>window.anchorMap.jumpTo({center:[-46.6557,-23.5615],zoom:17,pitch:0,bearing:0}));
  assert.ok((await measure()).every(marker=>marker.visible&&marker.error<1),'returning must restore the original geographic anchors');
 }
 console.log('Community anchors OK: six types, light/dark, real drag, 0/60/75° pitch, Brazil → South Africa → Brazil.');
}finally{await browser.close();}

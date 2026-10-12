export const places = [
  {id:'masp', name:'MASP', address:'Av. Paulista, 1578 · Bela Vista, São Paulo', coords:[-46.6557,-23.5615], category:'cultura'},
  {id:'ibirapuera', name:'Parque Ibirapuera', address:'Av. Pedro Álvares Cabral · São Paulo', coords:[-46.6597,-23.5874], category:'parque'},
  {id:'paulista', name:'Avenida Paulista', address:'Bela Vista · São Paulo', coords:[-46.654,-23.562], category:'avenida'},
  {id:'morumbi', name:'Shopping Morumbi', address:'Av. Roque Petroni Júnior, 1089 · São Paulo', coords:[-46.6987,-23.6223], category:'shopping'},
  {id:'ibirashopping', name:'Shopping Ibirapuera', address:'Av. Ibirapuera, 3103 · Moema, São Paulo', coords:[-46.6664,-23.6128], category:'shopping'},
  {id:'hospital', name:'Hospital São Paulo', address:'Rua Napoleão de Barros, 715 · Vila Clementino', coords:[-46.6424,-23.5965], category:'saude'},
  {id:'vila', name:'Vila Sônia', address:'Vila Sônia · São Paulo', coords:[-46.738,-23.5988], category:'bairro'},
  {id:'pinheiros', name:'Pinheiros', address:'Pinheiros · São Paulo', coords:[-46.686,-23.568], category:'bairro'},
  {id:'butanta', name:'Butantã', address:'Butantã · São Paulo', coords:[-46.71,-23.57], category:'bairro'},
  {id:'congonhas', name:'Aeroporto de Congonhas', address:'Av. Washington Luís · São Paulo', coords:[-46.6566,-23.6263], category:'aeroporto'},
  {id:'centro', name:'Praça da Sé', address:'Sé · São Paulo', coords:[-46.6338,-23.5506], category:'centro'}
];
export const pointOK = x => Array.isArray(x) && x.length===2 && x.every(n => typeof n==='number' && Number.isFinite(n)) && x[0]>=-180 && x[0]<=180 && x[1]>=-90 && x[1]<=90;
function distance(a,b) { const r = 6371, dy = (b[1]-a[1])*Math.PI/180, dx=(b[0]-a[0])*Math.PI/180, x=Math.sin(dy/2)**2+Math.cos(a[1]*Math.PI/180)*Math.cos(b[1]*Math.PI/180)*Math.sin(dx/2)**2; return 2*r*Math.asin(Math.sqrt(x)); }
export function demoRoutes(origin, destination) {
  const km = Math.max(1.1,distance(origin,destination)*1.38);
  const fast = Math.max(5,Math.round(km/24*60));
  const geometry = (variation) => ({type:'LineString',coordinates:[origin, [origin[0]*0.72+destination[0]*0.28+variation, origin[1]*0.72+destination[1]*0.28-variation/2], [origin[0]*0.38+destination[0]*0.62-variation, origin[1]*0.38+destination[1]*0.62+variation/3],destination]});
  return { source:'demonstracao', safetyMessage:'Trajetos e tempos ilustrativos. Sem as chaves do Mapbox não há cálculo real de rotas, trânsito ou segurança.', routes:[{id:'safe',label:'Mais segura',duration:Math.round(fast*1.14),distance:Math.round(km*11.5)/10,geometry:geometry(-.004),steps:[{instruction:'Siga em direção ao destino',distance:km*1000}],verifiedSafety:false},{id:'fast',label:'Mais rápida',duration:fast,distance:Math.round(km*10)/10,geometry:geometry(.004),steps:[{instruction:'Siga em direção ao destino',distance:km*1000}],verifiedSafety:false}]};
}

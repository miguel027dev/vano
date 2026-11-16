/** Short, fixed destination for official VANO Maps app downloads.
 * Use /baixar on the primary domain until baixar.vanomaps.online has DNS and TLS.
 * Avoid forwarding arbitrary queries to prevent open redirects or leaked parameters.
 */
export const PLAY_STORE_URL='https://play.google.com/store/apps/details?id=com.vano.maps';
const DOWNLOAD_HOST='baixar.vanomaps.online';

export function handlePlayStoreDownload(req,res,pathname,headers={}){
  const hostname=String(req.headers?.host||'').toLowerCase().replace(/:\d+$/,'');
  const isDownloadHost=hostname===DOWNLOAD_HOST;
  const isShortPath=pathname==='/baixar'||pathname==='/baixar/';
  if(!isDownloadHost&&!isShortPath)return false;

  if(req.method!=='GET'&&req.method!=='HEAD'){
    res.writeHead(405,{...headers,'Allow':'GET, HEAD','Cache-Control':'no-store'});
    res.end();
    return true;
  }
  res.writeHead(302,{
    ...headers,
    'Location':PLAY_STORE_URL,
    'Cache-Control':'no-store, max-age=0',
    'X-Robots-Tag':'noindex, nofollow',
  });
  res.end();
  return true;
}

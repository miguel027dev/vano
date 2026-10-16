// Browser microphone and speech service capabilities are independent.
// Never report a SpeechRecognition service failure as proof that getUserMedia is denied.
export function microphoneMessage(code) {
 const messages = {
  'not-allowed':'O navegador impediu o reconhecimento por voz. Isso não confirma que o microfone esteja bloqueado.',
  'service-not-allowed':'O serviço de transcrição do navegador foi recusado. O microfone pode continuar funcionando.',
  'audio-capture':'O navegador não conseguiu capturar áudio para o reconhecimento. Vamos testar o microfone diretamente.',
  'language-not-supported':'O reconhecimento de português não está disponível neste navegador.',
  'language-unavailable':'O pacote de português do reconhecimento local não está instalado.',
  'network':'O serviço de reconhecimento do navegador não conseguiu se conectar.',
  'no-speech':'Não ouvi fala suficiente. Toque em “Ouvir novamente” e tente de novo.',
  'aborted':'Reconhecimento interrompido.',
  'not-found':'O sistema não encontrou um microfone.',
  'not-readable':'O microfone está ocupado ou houve um erro do dispositivo.',
  'insecure':'O microfone requer HTTPS e uma página autorizada.',
  'unsupported':'Este navegador não oferece reconhecimento de fala. Ainda podemos testar a captação direta do microfone.'
 };
 return messages[code] || 'O navegador não conseguiu reconhecer sua fala. Teste o microfone ou use a entrada por texto.';
}
export function mediaCaptureError(error) {
 const code=String(error?.name||'');
 if(code==='NotAllowedError'||code==='PermissionDeniedError'||code==='SecurityError') return {code:'permission',text:'A captura direta do microfone foi bloqueada pelo navegador ou pelo sistema.'};
 if(code==='NotFoundError'||code==='DevicesNotFoundError')return {code:'device',text:'Nenhum microfone foi encontrado neste dispositivo.'};
 if(code==='NotReadableError'||code==='TrackStartError')return {code:'busy',text:'Microfone ocupado ou indisponível para gravação no momento.'};
 if(code==='OverconstrainedError')return {code:'constraints',text:'O dispositivo não atende às configurações de áudio solicitadas.'};
 return {code:'unknown',text:'Não consegui abrir o microfone diretamente. Tente fechar outros aplicativos que estejam usando áudio.'};
}
export function recorderMime(Recorder) {
 if(!Recorder)return '';
 const types=['audio/webm;codecs=opus','audio/webm','audio/mp4','audio/ogg;codecs=opus','audio/ogg'];
 return types.find(type=>{try{return Recorder.isTypeSupported?.(type)}catch{return false}})||'';
}
export function isSpeechServiceFailure(code) {
 return ['not-allowed','service-not-allowed','audio-capture','network','language-not-supported','language-unavailable'].includes(code);
}

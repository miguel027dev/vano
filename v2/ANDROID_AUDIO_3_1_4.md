# Android 3.1.4 — captura e reprodução de voz

O APK anterior não declarava RECORD_AUDIO e não atendia PermissionRequest do WebView. A MAVI dependia de SpeechRecognition do navegador, frequentemente indisponível no Android WebView. A inicialização antecipada do TTS também podia mostrar falha de voz mesmo quando a orientação usava o provedor online; o botão Testar voz usava uma frase que não era uma instrução autorizada de rota.

A atualização adiciona permissão de microfone solicitada em tempo de uso, autorização somente de AUDIO_CAPTURE para a origem HTTPS confiável e reconhecimento pelo SpeechRecognizer do Android. O código nativo não salva gravações. O serviço de reconhecimento selecionado no Android pode precisar de internet; reconhecimento offline não é garantido. Ausência do serviço, idioma, permissão e silêncio são tratados separadamente. A escuta termina no cancelamento, no segundo plano e em timeout.

O runtime Android oferece reconhecimento e síntese nativa à MAVI, mantendo o caminho normal do navegador fora do APK. Reprodução nativa usa identificador por fala, termina a espera ao concluir/falhar e cancela apenas a fala correspondente. A orientação de navegação tem prioridade sobre a conversa. O TTS prefere vozes locais instaladas e permite voz compatível do motor quando não há uma voz offline disponível; ausência real do pacote de idioma ainda requer instalação no aparelho.

A voz online de navegação é preservada; falhas usam a voz nativa no Android. Testar voz chama diretamente a voz do aparelho e não exige prova de rota. A voz nativa não é inicializada só por abrir navegação, evitando um aviso desnecessário. Callbacks de sucesso não são exibidos como erro.

Pacote com.vano.maps, versão 3.1.4, código 20270005, minSdk 24, targetSdk 36. Testes comportamentais cobrem resultado, recusa de permissão, cancelamento, eventos antigos, timeout, conclusão e falha de reprodução. Ainda é necessário confirmar a captura/reprodução no aparelho do usuário; não há Android conectado neste ambiente.

Referências: https://developer.android.com/reference/android/speech/SpeechRecognizer ; https://developer.android.com/reference/android/webkit/PermissionRequest ; https://developer.android.com/reference/android/speech/tts/TextToSpeech .

package com.vano.maps.fluidez;
import android.content.Context;
import android.speech.tts.TextToSpeech;
import android.speech.tts.UtteranceProgressListener;
import android.speech.tts.Voice;
import android.media.AudioAttributes;
import android.media.AudioManager;
import android.media.AudioFocusRequest;
import android.os.Build;
import java.util.Locale;


/** Embedded voices only: a network voice must never make guidance depend on reception. */
public final class LocalVoice {
    public interface StatusListener { void accept(String value); }
    private TextToSpeech tts;
    private final AudioManager audio;
    private AudioFocusRequest focus;
    private String currentId="";
    private final AudioManager.OnAudioFocusChangeListener focusListener=change->{if(change==AudioManager.AUDIOFOCUS_LOSS)stop();};
    private boolean ready=false,failed=false;
    private String pendingText,pendingLanguage;
    private final StatusListener status;
    public LocalVoice(Context context,StatusListener status){
        this.status=status;audio=(AudioManager)context.getSystemService(Context.AUDIO_SERVICE);
        tts=new TextToSpeech(context,code->{ready=code==TextToSpeech.SUCCESS;failed=!ready;if(failed)status.accept("unavailable");else{tts.setAudioAttributes(new AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_ASSISTANCE_NAVIGATION_GUIDANCE).setContentType(AudioAttributes.CONTENT_TYPE_SPEECH).build());if(pendingText!=null)speak(pendingText,pendingLanguage);}});
        tts.setOnUtteranceProgressListener(new UtteranceProgressListener(){public void onStart(String id){}public void onDone(String id){if(id.equals(currentId))releaseFocus();}public void onError(String id){if(id.equals(currentId))releaseFocus();status.accept("unavailable");}});
    }
    public void speak(String text,String language){
        if(text==null||text.length()==0||text.length()>1200||failed)return;
        if(!ready){pendingText=text;pendingLanguage=language;return;}
        pendingText=null;Locale locale=Locale.forLanguageTag(language==null?"pt-BR":language);Voice best=null;
        try{if(tts.getVoices()!=null)for(Voice v:tts.getVoices())if(!v.isNetworkConnectionRequired()&&v.getLocale().getLanguage().equals(locale.getLanguage())){if(best==null||(v.getLocale().equals(locale)&&!best.getLocale().equals(locale))||(v.getLocale().equals(locale)==best.getLocale().equals(locale)&&v.getQuality()>best.getQuality()))best=v;}}
        catch(Exception ignored){}
        if(best==null){status.accept("missing-language");return;}
        if(tts.setVoice(best)!=TextToSpeech.SUCCESS){status.accept("missing-language");return;}
        if(Build.VERSION.SDK_INT>=26){focus=new AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN_TRANSIENT_MAY_DUCK).setAudioAttributes(new AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_ASSISTANCE_NAVIGATION_GUIDANCE).setContentType(AudioAttributes.CONTENT_TYPE_SPEECH).build()).setOnAudioFocusChangeListener(focusListener).build();audio.requestAudioFocus(focus);}else audio.requestAudioFocus(focusListener,AudioManager.STREAM_MUSIC,AudioManager.AUDIOFOCUS_GAIN_TRANSIENT_MAY_DUCK);
        currentId="vano-"+System.nanoTime();tts.setSpeechRate(1.02f);if(tts.speak(text,TextToSpeech.QUEUE_FLUSH,null,currentId)==TextToSpeech.ERROR){releaseFocus();status.accept("unavailable");}
    }
    private void releaseFocus(){if(Build.VERSION.SDK_INT>=26&&focus!=null)audio.abandonAudioFocusRequest(focus);else audio.abandonAudioFocus(focusListener);}
    public void stop(){pendingText=null;if(tts!=null)tts.stop();releaseFocus();}
    public void close(){stop();if(tts!=null){tts.shutdown();tts=null;}}
}

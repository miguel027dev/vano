package com.vano.maps.fluidez;
import android.content.Context;
import android.speech.tts.TextToSpeech;
import android.speech.tts.UtteranceProgressListener;
import android.speech.tts.Voice;
import android.media.AudioAttributes;
import android.media.AudioManager;
import android.media.AudioFocusRequest;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import java.util.Locale;

/** Prefer installed offline voices; retain the engine's supported language fallback. */
public final class LocalVoice {
    public interface StatusListener { void accept(String value,String id); }
    private final Context context;
    private TextToSpeech tts;
    private final AudioManager audio;
    private AudioFocusRequest focus;
    private volatile String currentId="";
    private final AudioManager.OnAudioFocusChangeListener focusListener=change->{if(change==AudioManager.AUDIOFOCUS_LOSS)stop();};
    private boolean ready=false,failed=false,closed=false;
    private int generation=0;
    private String pendingText,pendingLanguage,pendingId="";
    private final StatusListener status;
    private final Handler handler=new Handler(Looper.getMainLooper());
    public LocalVoice(Context context,StatusListener status){this.context=context;this.status=status;audio=(AudioManager)context.getSystemService(Context.AUDIO_SERVICE);initialize();}
    private AudioAttributes attributes(){return new AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_ASSISTANCE_NAVIGATION_GUIDANCE).setContentType(AudioAttributes.CONTENT_TYPE_SPEECH).build();}
    private void initialize(){
        ready=false;failed=false;final int attempt=++generation;
        tts=new TextToSpeech(context,code->handler.post(()->{
            if(closed||attempt!=generation)return;
            ready=code==TextToSpeech.SUCCESS;failed=!ready;
            if(failed){if(pendingText!=null)status.accept("unavailable",pendingId);pendingText=null;return;}
            tts.setAudioAttributes(attributes());
            if(pendingText!=null)speak(pendingText,pendingLanguage,pendingId);
        }));
        tts.setOnUtteranceProgressListener(new UtteranceProgressListener(){
            public void onStart(String id){if(id.equals(currentId))status.accept("speaking",id);}
            public void onDone(String id){if(id.equals(currentId)){currentId="";releaseFocus();status.accept("done",id);}}
            public void onError(String id){if(id.equals(currentId)){currentId="";releaseFocus();status.accept("unavailable",id);}}
            @Override public void onStop(String id,boolean interrupted){if(id.equals(currentId)){currentId="";releaseFocus();status.accept("canceled",id);}}
        });
    }
    public void speak(String text,String language,String id){
        if(closed||text==null||text.trim().isEmpty()||text.length()>1200)return;
        String requested=id!=null&&id.matches("[A-Za-z0-9_-]{1,80}")?id:"vano-"+System.nanoTime();
        if(failed){if(tts!=null)tts.shutdown();pendingText=text;pendingLanguage=language;pendingId=requested;initialize();return;}
        if(!ready){pendingText=text;pendingLanguage=language;pendingId=requested;return;}
        pendingText=null;pendingId="";
        Locale locale=Locale.forLanguageTag(language==null?"pt-BR":language);
        Voice best=null;
        try{
            // Some engines expose no list even though setLanguage can use their default voice.
            if(tts.getVoices()!=null)for(Voice v:tts.getVoices()){
                if(v.getLocale()==null||!v.getLocale().getLanguage().equals(locale.getLanguage())||v.getFeatures()!=null&&v.getFeatures().contains(TextToSpeech.Engine.KEY_FEATURE_NOT_INSTALLED))continue;
                if(best==null||score(v,locale)>score(best,locale))best=v;
            }
            boolean selected=best!=null&&tts.setVoice(best)==TextToSpeech.SUCCESS;
            if(!selected&&tts.setLanguage(locale)<TextToSpeech.LANG_AVAILABLE){status.accept("missing-language",requested);return;}
        }catch(Exception e){status.accept("unavailable",requested);return;}
        if(audio!=null){
            if(Build.VERSION.SDK_INT>=26){focus=new AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN_TRANSIENT_MAY_DUCK).setAudioAttributes(attributes()).setOnAudioFocusChangeListener(focusListener).build();audio.requestAudioFocus(focus);}
            else audio.requestAudioFocus(focusListener,AudioManager.STREAM_MUSIC,AudioManager.AUDIOFOCUS_GAIN_TRANSIENT_MAY_DUCK);
        }
        currentId=requested;tts.setSpeechRate(1.02f);
        if(tts.speak(text,TextToSpeech.QUEUE_FLUSH,null,requested)==TextToSpeech.ERROR){currentId="";releaseFocus();status.accept("unavailable",requested);}
    }
    private static int score(Voice voice,Locale locale){return (voice.isNetworkConnectionRequired()?0:10000)+(voice.getLocale().equals(locale)?1000:0)+voice.getQuality();}
    private void releaseFocus(){if(audio==null)return;if(Build.VERSION.SDK_INT>=26&&focus!=null){audio.abandonAudioFocusRequest(focus);focus=null;}else if(Build.VERSION.SDK_INT<26)audio.abandonAudioFocus(focusListener);}
    public void stop(String id){if(id==null||id.isEmpty()||id.equals(currentId)||id.equals(pendingId))stop();}
    public void stop(){String id=currentId.isEmpty()?pendingId:currentId;currentId="";pendingId="";pendingText=null;if(tts!=null)tts.stop();releaseFocus();if(!id.isEmpty())status.accept("canceled",id);}
    public void close(){closed=true;stop();if(tts!=null){tts.shutdown();tts=null;}}
}

package com.vano.maps.fluidez;

import android.content.Context;
import android.content.Intent;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.speech.RecognitionListener;
import android.speech.RecognizerIntent;
import android.speech.SpeechRecognizer;
import java.util.ArrayList;

/** One explicit utterance at a time; permission is owned by the Activity. */
public final class NativeSpeech {
    public interface Listener { void accept(String id,String type,String value); }
    private final Context context;
    private final Listener listener;
    private final Handler handler=new Handler(Looper.getMainLooper());
    private SpeechRecognizer recognizer;
    private String active="";
    private Runnable deadline;
    public NativeSpeech(Context context,Listener listener){this.context=context;this.listener=listener;}
    public void start(String id,String language){
        cancel();
        if(!SpeechRecognizer.isRecognitionAvailable(context)){listener.accept(id,"error","service-not-allowed");return;}
        active=id;
        try{
            recognizer=SpeechRecognizer.createSpeechRecognizer(context);
            recognizer.setRecognitionListener(new RecognitionListener(){
                public void onReadyForSpeech(Bundle params){if(active.equals(id))listener.accept(id,"start","");}
                public void onBeginningOfSpeech(){}
                public void onRmsChanged(float rms){}
                public void onBufferReceived(byte[] buffer){}
                public void onEndOfSpeech(){}
                public void onEvent(int event,Bundle params){}
                public void onPartialResults(Bundle results){}
                public void onResults(Bundle results){
                    if(!active.equals(id))return;
                    ArrayList<String> words=results==null?null:results.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION);
                    String phrase=words==null||words.isEmpty()?"":words.get(0);
                    if(phrase!=null&&!phrase.trim().isEmpty())listener.accept(id,"result",phrase.substring(0,Math.min(2000,phrase.length())));
                    else listener.accept(id,"error","no-speech");
                    finish(id);
                }
                public void onError(int code){if(active.equals(id)){listener.accept(id,"error",error(code));finish(id);}}
            });
            Intent intent=new Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH);
            intent.putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL,RecognizerIntent.LANGUAGE_MODEL_FREE_FORM);
            intent.putExtra(RecognizerIntent.EXTRA_LANGUAGE,language);
            intent.putExtra(RecognizerIntent.EXTRA_MAX_RESULTS,1);
            intent.putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS,false);
            intent.putExtra(RecognizerIntent.EXTRA_CALLING_PACKAGE,context.getPackageName());
            recognizer.startListening(intent);
            deadline=()->{if(active.equals(id)){listener.accept(id,"error","no-speech");finish(id);}};
            handler.postDelayed(deadline,20000);
        }catch(SecurityException e){listener.accept(id,"error","not-allowed");finish(id);}
        catch(Exception e){listener.accept(id,"error","service-not-allowed");finish(id);}
    }
    private static String error(int code){
        switch(code){
            case SpeechRecognizer.ERROR_INSUFFICIENT_PERMISSIONS:return "not-allowed";
            case SpeechRecognizer.ERROR_AUDIO:return "audio-capture";
            case SpeechRecognizer.ERROR_NETWORK:case SpeechRecognizer.ERROR_NETWORK_TIMEOUT:return "network";
            case SpeechRecognizer.ERROR_NO_MATCH:case SpeechRecognizer.ERROR_SPEECH_TIMEOUT:return "no-speech";
            case SpeechRecognizer.ERROR_RECOGNIZER_BUSY:return "audio-capture";
            case SpeechRecognizer.ERROR_LANGUAGE_NOT_SUPPORTED:case SpeechRecognizer.ERROR_LANGUAGE_UNAVAILABLE:return "language-not-supported";
            default:return "service-not-allowed";
        }
    }
    private void finish(String id){if(!active.equals(id))return;active="";dispose();listener.accept(id,"end","");}
    private void dispose(){if(deadline!=null){handler.removeCallbacks(deadline);deadline=null;}if(recognizer!=null){SpeechRecognizer old=recognizer;recognizer=null;handler.post(()->{try{old.cancel();old.destroy();}catch(Exception ignored){}});}}
    public void stop(String id){if(active.equals(id)&&recognizer!=null)recognizer.stopListening();}
    public void cancel(String id){if(active.equals(id))cancel();}
    public void cancel(){String id=active;active="";dispose();if(!id.isEmpty())listener.accept(id,"end","");}
}

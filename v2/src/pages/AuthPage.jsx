import React,{useEffect,useId,useState} from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { ArrowLeft, ArrowRight, ArrowUpRight, Check, CheckCircle2, Eye, EyeOff, LoaderCircle, CarFront, Bike, MapPin, ShieldCheck, Zap, House, BriefcaseBusiness, GraduationCap, Dumbbell, ShoppingBasket, Sparkles, AlertCircle } from 'lucide-react';
import { Brand } from '../components/Brand';
import { useVano } from '../context';
import { post } from '../lib/api';
import {LANGUAGES,translate} from '../lib/i18n';

function EntryField({label,type='text',value,onChange,placeholder,autoComplete,required=true,minLength,translator}){
  const {t:contextT}=useVano();
  const t=translator||contextT;
  const id=useId();
  const [visible,setVisible]=useState(false);
  const password=type==='password';
  return <div className="v3-field">
    <label htmlFor={id}>{t(label)}</label>
    <div className="v3-field-control">
      <input id={id} required={required} type={password&&visible?'text':type} value={value}
        onChange={e=>onChange(e.target.value)} placeholder={t(placeholder)} autoComplete={autoComplete} minLength={minLength}
        spellCheck="false" />
      {password&&<button type="button" onClick={()=>setVisible(v=>!v)} aria-label={visible?t('Ocultar senha'):t('Mostrar senha')} aria-pressed={visible}><span>{visible?<EyeOff size={19}/>:<Eye size={19}/>}</span></button>}
    </div>
  </div>;
}

export function AuthPage({mode='login'}){
  const register=mode==='register';
  const {login,language,googleReady}=useVano();
  const navigate=useNavigate();
  const location=useLocation();
  const [form,setForm]=useState({name:'',email:'',password:'',confirm:'',language:language||'pt-BR'});
  const [languageEdited,setLanguageEdited]=useState(false);
  useEffect(()=>{if(!languageEdited)setForm(p=>({...p,language:language||'pt-BR'}));},[language,languageEdited]);
  const t=(key,vars)=>translate(key,register?form.language:language,vars);
  const [busy,setBusy]=useState(false);
  const googleResult=new URLSearchParams(location.search).get('google');
  const googleErrors={
    'conta-existente':'Este e-mail já possui uma conta VANO. Entre usando a senha e vincule o Google em Minha conta. Isso protege sua conta existente.',
    'estado-expirado':'A verificação do Google expirou ou mudou de domínio. Abra o VANO pelo endereço oficial, permita cookies e tente novamente.',
    'cancelado':'A autorização do Google foi cancelada. Você pode tentar de novo.',
    'sessao-expirada':'Sua sessão expirou antes de vincular o Google. Entre novamente com sua senha.',
    'erro':'Não foi possível confirmar o acesso com o Google. Tente novamente e, se continuar, entre com e-mail e senha.'
  };
  const [error,setError]=useState(()=>googleErrors[googleResult]||'');
  function update(key,value){setForm(p=>({...p,[key]:value}));if(error)setError('');}
  async function submit(e){
    e.preventDefault();setError('');
    if(register&&form.password!==form.confirm){setError(t('As senhas não coincidem. Confira e tente novamente.'));return;}
    if(register&&form.name.trim().length<2){setError(t('Digite seu nome para continuar.'));return;}
    setBusy(true);
    try{
      const result=await login(register?'signup':'login',form);
      if(result?.verificationRequired){setError(t('Enviamos um link de confirmação para seu e-mail. Confira sua caixa de entrada antes de entrar.'));return;}
      try{localStorage.setItem('vano-v2-intro-seen','1')}catch{}
      navigate(register||!result?.onboardingComplete?'/personalizar':'/mapa',{replace:true});
    }catch(ex){setError(t(ex.message||'Não foi possível continuar. Tente novamente.'));}
    finally{setBusy(false);}
  }
  return <main className="v3-auth-page">
    <div className="v3-auth-main">
      <header className="v3-auth-header"><Brand to="/inicio"/><Link to="/inicio" className="v3-auth-back"><ArrowLeft size={17}/> {t('Voltar')}</Link></header>
      <section className="v3-auth-center" aria-label={register?t('Criar conta VANO'):t('Entrar na VANO')}>
        <div className="v3-auth-copy">
          <span className="v3-auth-eyebrow"><span className="v3-orange-dash"/> {t('CONTA VANO')}</span>
          <h1>{t(register?'Crie seu espaço.':'Bom ter você de volta.')}</h1>
          <p>{t(register?'Uma conta para salvar seus lugares e deixar cada trajeto mais seu.':'Entre para continuar com suas rotas e seus lugares.')}</p>
        </div>
        <nav className="v3-auth-switch" aria-label={t('Acesso à conta')}>
          <Link to="/entrar" className={!register?'active':''} aria-current={!register?'page':undefined}>{t('Entrar')}</Link>
          <Link to="/cadastro" className={register?'active':''} aria-current={register?'page':undefined}>{t('Criar conta')}</Link>
        </nav>
        {googleReady?<a className="v3-google-action v29-google-primary" href="/api/auth/google/start" aria-label={t('Continuar com Google')}><span className="v29-google-logo" aria-hidden="true"><svg viewBox="0 0 24 24" width="23" height="23"><path fill="#4285F4" d="M21.35 12.23c0-.73-.06-1.43-.19-2.1H12v3.99h5.23a4.47 4.47 0 0 1-1.94 2.93v2.43h3.14c1.84-1.69 2.92-4.17 2.92-7.25Z"/><path fill="#34A853" d="M12 21.77c2.62 0 4.82-.87 6.43-2.35l-3.14-2.43c-.87.58-1.98.92-3.29.92-2.53 0-4.68-1.7-5.44-4h-3.2v2.5A9.77 9.77 0 0 0 12 21.77Z"/><path fill="#FBBC05" d="M6.56 13.91a5.86 5.86 0 0 1 0-3.73v-2.5h-3.2a9.77 9.77 0 0 0 0 8.73l3.2-2.5Z"/><path fill="#EA4335" d="M12 6.18c1.42 0 2.7.49 3.7 1.45l2.77-2.77A9.36 9.36 0 0 0 12 2.23a9.77 9.77 0 0 0-8.64 5.45l3.2 2.5c.76-2.29 2.91-4 5.44-4Z"/></svg></span><span>{t('Continuar com Google')}</span><ArrowRight size={18} className="v29-google-arrow"/></a>:<div className="v29-google-unavailable"><button type="button" className="v3-google-action v29-google-primary" disabled aria-disabled="true" title="Configure as credenciais Google neste serviço Render"><span className="v29-google-logo" aria-hidden="true">G</span>{t('Continuar com Google')}</button><small role="status">Login Google aguardando GOOGLE_CLIENT_ID e GOOGLE_CLIENT_SECRET neste serviço.</small></div>}
        <div className="v29-auth-divider"><span>{t('Ou continue com e-mail')}</span></div>
        <form className="v3-auth-form" onSubmit={submit} aria-busy={busy}>
          {register&&<EntryField label="Nome" value={form.name} onChange={v=>update('name',v)} placeholder="Seu nome" autoComplete="name" minLength={2} translator={t}/>}
          <EntryField label="E-mail" type="email" value={form.email} onChange={v=>update('email',v)} placeholder="seu@email.com" autoComplete="email" translator={t}/>
          <EntryField label="Senha" type="password" value={form.password} onChange={v=>update('password',v)} placeholder={register?'Pelo menos 12 caracteres':'Digite sua senha'} autoComplete={register?'new-password':'current-password'} minLength={register?12:8} translator={t}/>
          {register&&<><EntryField label="Confirmar senha" type="password" value={form.confirm} onChange={v=>update('confirm',v)} placeholder="Repita sua senha" autoComplete="new-password" minLength={register?12:8} translator={t}/><p className="v3-password-help"><CheckCircle2 size={15}/> {t('Use uma senha exclusiva com pelo menos 12 caracteres.')}</p></>}
          {register&&<div className="v27-language-form"><label htmlFor="vano-signup-language">{t('Idioma do aplicativo')}</label><div className="v27-language-select"><select id="vano-signup-language" name="language" value={form.language} onChange={e=>{setLanguageEdited(true);update('language',e.target.value);}}>{LANGUAGES.map(l=><option key={l.code} value={l.code}>{l.native}</option>)}</select><span aria-hidden="true">⌄</span></div><small>{t('Idioma sugerido pela sua região. Você pode alterar.')}</small></div>}
          {error&&<div className="v3-auth-error" role="alert"><AlertCircle size={19}/><span>{error}</span></div>}
          <button type="submit" className="v3-auth-submit" disabled={busy}>
            {busy?<><LoaderCircle size={18} className="v3-loading-icon"/> {t('Aguarde…')}</>:<>{t(register?'Criar minha conta':'Entrar')} <ArrowRight size={19}/></>}
          </button>
        </form>
        {!register&&<p className="v3-auth-recovery"><Link to="/recuperar-senha">{t('Esqueceu sua senha?')}</Link></p>}
        <div className="v3-auth-alt"><span>{t(register?'Já faz parte do VANO?':'Primeira vez por aqui?')}</span><Link to={register?'/entrar':'/cadastro'}>{t(register?'Entre na sua conta':'Crie sua conta')} <ArrowUpRight size={15}/></Link></div>
        <Link className="v3-auth-explore" to="/mapa">{t('Explorar sem conta')} <ArrowRight size={16}/></Link>
        <p className="v3-auth-legal">{t(register?'Ao criar uma conta, você concorda com os':'Ao entrar, você concorda com nossos')} <Link to="/termos">{t('Termos')}</Link> {t('e nossa')} <Link to="/privacidade">{t('Política de Privacidade')}</Link>. {t('Seu cadastro é armazenado nesta instalação de desenvolvimento.')}</p>
      </section>
      <footer className="v3-auth-footer">VANO MAPS <span>{t('UMA CIDADE, MUITOS CAMINHOS.')}</span></footer>
    </div>
    <aside className="v4-auth-art" aria-hidden="true">
      <div className="v4-auth-art-top">VANO / {t('VANO / SEU PONTO DE PARTIDA').replace('VANO / ','')} <span>↗</span></div>
      <div className="v4-auth-art-copy">
        <span className="v4-eyebrow"><span className="v4-eyebrow-dot"/> {t('SEU CAMINHO É SÓ SEU')}</span>
        <h2>{t('Uma cidade.')}<br/><em>{t('Mil maneiras')}</em><br/>{t('de chegar.')}</h2>
        <p>{t('Escolha como ir. A VANO ajuda a encontrar alternativas.')}</p>
      </div>
      <div className="v4-auth-art-map"><img src="/vano-city-lines.svg" alt="" /></div>
      <span className="v4-auth-art-foot">VANO MAPS · {t('CRIADO PARA A CIDADE EM MOVIMENTO')}</span>
    </aside>
  </main>;
}
const vehicleChoices=[{id:'carro',name:'Carro',detail:'Viagens urbanas e rodovias',image:'/vehicle-car-cutout.png',icon:CarFront},{id:'moto',name:'Moto',detail:'Mobilidade em duas rodas',image:'/vehicle-moto.webp',icon:Bike}];
export function OnboardingPage(){
  const navigate=useNavigate(),{preferences,savePreference,user,t}=useVano();
  const [vehicle,setVehicle]=useState(preferences?.vehicle||'carro');
  const [description,setDescription]=useState(preferences?.routeStyleText||'');
  const [interpretation,setInterpretation]=useState(null);
  const [approved,setApproved]=useState(false);
  const [step,setStep]=useState(1),[busy,setBusy]=useState(false),[error,setError]=useState('');
  const total=2;
  const back=()=>step===1?navigate(user?'/perfil':'/inicio'):setStep(1);
  async function interpret(){
    setBusy(true);setError('');
    try {
      if(description.trim().length<8)throw Error('Conte um pouco mais sobre suas preferências ou toque em Pular.');
      const data=await post('/preferences/interpret',{text:description});
      setInterpretation(data);setApproved(false);
    }catch(e){setError(e.message||'Não foi possível interpretar sua resposta.');}
    finally{setBusy(false);}
  }
  async function finish(skipped=false){
    if(!skipped&&(!approved||!interpretation||interpretation.text!==description.trim())){
      setError('Confira e confirme a interpretação, ou escolha Pular por enquanto.');return;
    }
    setBusy(true);setError('');
    try{
      await savePreference({vehicle,routeStyleText:skipped?'':description.trim(),
        routeStyleConfirmed:!skipped,preferredRoute:skipped?(preferences?.preferredRoute||'safe'):interpretation.preferredRoute,
        onboardingComplete:true});
      try{localStorage.setItem('vano-v2-intro-seen','1');}catch{}
      navigate('/mapa',{replace:true});
    }catch(e){setError(e.message||'Falha ao salvar preferências.');}
    finally{setBusy(false);}
  }
  return <main className="setup-page"><div className="setup-frame">
    <header className="setup-header"><Brand/><div className="setup-progress-info"><span>{t('PERSONALIZE SEU VANO')}</span><strong>{String(step).padStart(2,'0')} <i>/</i> 0{total}</strong></div></header>
    <div className="setup-progress-bars" aria-label={`Etapa ${step} de ${total}`}>{Array.from({length:total},(_,i)=><div key={i} className={i<step?'active':''}/>)}</div>
    <div className="setup-head">
      <span className="access-overline">{step===1?'01 / SEU VEÍCULO':'02 / ROTAS COM PERSONALIDADE'}</span>
      <h1>{step===1?t('Como você se move?'):'Que tipo de caminho combina com você?'}</h1>
      <p>{step===1?t('Escolha seu veículo principal. Assim o VANO adapta a experiência ao seu trajeto.'):'Conte do seu jeito: o que evita, o que prefere e o que deixa sua viagem mais confortável.'}</p>
    </div>
    {step===1&&<div className="setup-vehicle-grid">{vehicleChoices.map(v=><button type="button" key={v.id} className={`setup-vehicle ${vehicle===v.id?'selected':''}`} aria-pressed={vehicle===v.id} onClick={()=>setVehicle(v.id)}>
      <span className="setup-vehicle-check">{vehicle===v.id?<Check size={19} strokeWidth={3}/>:null}</span>
      <div className={`setup-vehicle-figure ${v.id==='carro'?'v5-vehicle-cutout':''}`}><img src={v.image} alt={t(v.name)}/></div>
      <div className="setup-vehicle-meta"><v.icon size={21}/><div><strong>{t(v.name)}</strong><small>{t(v.detail)}</small></div><ArrowRight size={19}/></div>
    </button>)}</div>}
    {step===2&&<div className="vano-personality-setup">
      <label htmlFor="vano-free-style">Como prefere suas rotas?</label>
      <textarea id="vano-free-style" value={description} maxLength={500} rows={5} onChange={e=>{setDescription(e.target.value);setApproved(false);setInterpretation(null);setError('');}}
        placeholder="Ex.: Prefiro rotas rápidas, mas quero evitar pedágios e estradas de terra."/>
      <span className="vano-personality-caption">Não precisa marcar alternativas. O VANO interpreta o texto e você confirma antes de salvar.</span>
      <button type="button" className="btn btn-muted" disabled={busy||description.trim().length<8} onClick={interpret}><Sparkles size={17}/> Interpretar minha resposta</button>
      {interpretation&&<div className="vano-personality-review" role="status">
        <strong>Entendemos sua preferência assim:</strong>
        {interpretation.understood.length?interpretation.understood.map((line,i)=><p key={i}><Check size={16}/>{line}</p>):<p>Não identificamos uma preferência aplicável. Experimente outras palavras.</p>}
        {interpretation.requiresMoreData.map((line,i)=><small key={i}>{line}</small>)}
        {!interpretation.needsReview&&<button type="button" className="btn btn-primary" onClick={()=>setApproved(true)} disabled={approved}>{approved?'✓ Confirmado':'Confirmar interpretação'}</button>}
      </div>}
    </div>}
    {error&&<div className="access-error" role="alert">{error}</div>}
    <div className="setup-actions">
      <button type="button" onClick={back} className="setup-back"><ArrowLeft size={17}/> {t('Voltar')}</button>
      {step===1?<button type="button" className="setup-next" onClick={()=>setStep(2)}>{t('Continuar')}<ArrowRight size={19}/></button>:
        <div className="vano-personality-actions"><button type="button" className="setup-back" disabled={busy} onClick={()=>finish(true)}>Pular por enquanto</button><button type="button" className="setup-next" disabled={busy||!approved} onClick={()=>finish(false)}>{busy?'Salvando…':'Concluir'}<ArrowRight size={19}/></button></div>}
    </div>
    <div className="setup-note"><Sparkles size={16}/> Pode mudar essas preferências depois.</div>
  </div></main>;
}

export function PasswordRecoveryPage(){
  const {t}=useVano();
  const params=new URLSearchParams(window.location.search);
  const token=params.get('token');
  const verifyMode=window.location.pathname==='/reenviar-confirmacao';
  const [email,setEmail]=useState(''),[password,setPassword]=useState(''),[confirm,setConfirm]=useState(''),[done,setDone]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(false);
  async function submit(e){e.preventDefault();setBusy(true);setError('');try{
    if(token){if(password!==confirm)throw Error(t('As senhas não coincidem.'));await post('/auth/reset',{token,password});setDone(t('Senha alterada. Entre novamente na sua conta.'));}
    else {const data=await post(verifyMode?'/auth/resend-verification':'/auth/forgot',{email});setDone(data.message);}
  }catch(ex){setError(ex.message)}finally{setBusy(false)}}
  return <main className="v3-auth-page"><section className="v3-auth-main"><header className="v3-auth-header"><Brand to="/inicio"/><Link to="/entrar" className="v3-auth-back"><ArrowLeft size={17}/> {t("Voltar")}</Link></header><div className="v3-auth-center"><span className="v3-auth-eyebrow">{t('CONTA VANO')}</span><h1>{t(token?'Escolha sua nova senha.':verifyMode?'Confirme seu e-mail.':'Recupere seu acesso.')}</h1><p>{t(token?'Use uma senha exclusiva com pelo menos 12 caracteres.':verifyMode?'Vamos reenviar o link de confirmação para sua caixa de entrada.':'Enviaremos um link temporário caso o e-mail esteja cadastrado.')}</p><form className="v3-auth-form" onSubmit={submit}>{token?<><EntryField label="Nova senha" type="password" value={password} onChange={setPassword} autoComplete="new-password" minLength={12} translator={t}/><EntryField label="Confirmar senha" type="password" value={confirm} onChange={setConfirm} autoComplete="new-password" minLength={12} translator={t}/></>:<EntryField label="Seu e-mail" type="email" value={email} onChange={setEmail} autoComplete="email" translator={t}/>}{error&&<p role="alert">{error}</p>}{done&&<p role="status">{done}</p>}<button className="v3-auth-submit" disabled={busy}>{t(token?'Salvar senha':'Enviar instruções')}</button></form><Link to="/entrar">{t('Voltar para o login')}</Link>{!token&&<Link to={verifyMode?'/recuperar-senha':'/reenviar-confirmacao'}>{t(verifyMode?'Esqueceu a senha?':'Reenviar confirmação de e-mail')}</Link>}</div></section></main>;
}

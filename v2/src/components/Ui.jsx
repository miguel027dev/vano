import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, ArrowRight, ChevronRight, Info, ShieldAlert } from 'lucide-react';
import { Brand } from './Brand';
export function PageHeader({title,subtitle,back='/'}){return <header className="page-header"><Link className="circle-btn back-btn" to={back} aria-label="Voltar"><ArrowLeft size={20}/></Link><div><div className="eyebrow">VANO</div><h1>{title}</h1>{subtitle&&<p>{subtitle}</p>}</div></header>}
export function Section({title,subtitle,action,children,className=''}){return <section className={`section ${className}`}><div className="section-heading"><div><h2>{title}</h2>{subtitle&&<p>{subtitle}</p>}</div>{action}</div>{children}</section>}
export function OptionRow({icon:Icon,title,subtitle,to,onClick,right,danger=false}){const inside=<><span className="option-icon">{Icon&&<Icon size={20}/>}</span><span className="option-content"><strong>{title}</strong>{subtitle&&<small>{subtitle}</small>}</span>{right&&<span className="option-right">{right}</span>}<ChevronRight size={19} className="option-chevron"/></>;return to?<Link className={`option-row ${danger?'danger':''}`} to={to}>{inside}</Link>:<button type="button" className={`option-row ${danger?'danger':''}`} onClick={onClick}>{inside}</button>}
export function Notice({children,kind='info'}){return <div className={`notice notice-${kind}`} role="note">{kind==='warning'?<ShieldAlert size={18}/>:<Info size={18}/>}<span>{children}</span></div>}
export function Empty({icon:Icon,title,subtitle,action}){return <div className="empty-state">{Icon&&<span className="empty-icon"><Icon size={28}/></span>}<h3>{title}</h3><p>{subtitle}</p>{action}</div>}
export function CTA({to,children,variant='primary',onClick,disabled=false,type='button'}){return to?<Link to={to} className={`btn btn-${variant}`}>{children}<ArrowRight size={18}/></Link>:<button type={type} className={`btn btn-${variant}`} onClick={onClick} disabled={disabled}>{children}</button>}

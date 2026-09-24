/* Readable VANO source; runtime eval/encoded wrapper removed. */
(()=>{
const modals={entry:document.getElementById('financeEntryModal'),account:document.getElementById('financeAccountModal'),commitment:document.getElementById('financeCommitmentModal')};
function open(name){const el=modals[name];if(!el)return;el.hidden=false;document.body.style.overflow='hidden';setTimeout(()=>el.querySelector('input:not([type=hidden]),select')?.focus(),40);if(window.lucide)lucide.createIcons()}
function close(el){if(!el)return;el.hidden=true;if(!Object.values(modals).some(x=>x&&!x.hidden))document.body.style.overflow=''}
document.querySelectorAll('[data-open-finance]').forEach(b=>b.addEventListener('click',()=>open(b.dataset.openFinance)));
document.querySelectorAll('[data-close-finance]').forEach(b=>b.addEventListener('click',()=>close(b.closest('.finance-modal'))));
Object.values(modals).forEach(m=>m?.addEventListener('click',e=>{if(e.target===m)close(m)}));
document.addEventListener('keydown',e=>{if(e.key==='Escape')Object.values(modals).forEach(close)});
document.querySelectorAll('[data-ledger-filter]').forEach(btn=>btn.addEventListener('click',()=>{document.querySelectorAll('[data-ledger-filter]').forEach(x=>x.classList.remove('active'));btn.classList.add('active');const f=btn.dataset.ledgerFilter;document.querySelectorAll('#financeLedger tbody tr[data-kind]').forEach(r=>r.hidden=!(f==='all'||r.dataset.kind===f||r.dataset.status===f))}));

})();

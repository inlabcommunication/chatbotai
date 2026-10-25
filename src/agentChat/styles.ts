// Aspetto in stile WhatsApp (tema scuro). Tutte le classi hanno prefisso "wa-".
export const agentChatStyles = `
.wa-root{--wa-bg:#0b141a;--wa-panel:#111b21;--wa-head:#202c33;--wa-in:#202c33;--wa-out:#005c4b;--wa-line:rgba(134,150,160,.15);--wa-t:#e9edef;--wa-m:#8696a0;--wa-g:#00a884;
  height:100dvh;padding-top:env(safe-area-inset-top);display:flex;flex-direction:column;background:var(--wa-bg);color:var(--wa-t);font-family:system-ui,-apple-system,sans-serif}
.wa-root *{box-sizing:border-box}
.wa-root button{font:inherit;color:inherit;cursor:pointer;background:none;border:none}
.wa-tabs{display:flex;gap:6px;padding:8px 12px;background:var(--wa-head);border-bottom:1px solid var(--wa-line)}
.wa-tabs button{display:flex;align-items:center;gap:6px;padding:7px 14px;border-radius:100px;font-size:13px;color:var(--wa-m)}
.wa-tabs button.on{background:rgba(0,168,132,.18);color:#25d366}
.wa-error{padding:8px 14px;background:#3b1f1f;color:#ffb4b4;font-size:13px;cursor:pointer}
.wa-shell{flex:1;display:flex;min-height:0}
.wa-list{width:360px;max-width:42%;display:flex;flex-direction:column;background:var(--wa-panel);border-right:1px solid var(--wa-line)}
.wa-list-head{display:flex;justify-content:space-between;align-items:center;padding:14px 16px 6px;font-size:20px;font-weight:700}
.wa-exit{font-size:12px;font-weight:500;color:var(--wa-m)!important;padding:4px 10px;border:1px solid var(--wa-line)!important;border-radius:100px}
.wa-search{display:flex;align-items:center;gap:8px;margin:6px 12px 8px;padding:7px 12px;background:var(--wa-head);border-radius:10px;color:var(--wa-m)}
.wa-search input{flex:1;background:none;border:none;outline:none;color:var(--wa-t);font-size:14px}
.wa-scroll{flex:1;overflow:auto}
.wa-sep{display:flex;align-items:center;gap:6px;padding:14px 16px 6px;font-size:11px;letter-spacing:.12em;text-transform:uppercase;color:var(--wa-m)}
.wa-conv{display:flex;gap:12px;width:100%;padding:10px 14px;text-align:left;border-bottom:1px solid var(--wa-line)}
.wa-conv:hover{background:rgba(255,255,255,.04)}.wa-conv.on{background:var(--wa-head)}
.wa-av{display:inline-flex;align-items:center;justify-content:center;border-radius:50%;color:#0b141a;font-weight:700;flex:none}
.wa-conv-main{flex:1;min-width:0;display:flex;flex-direction:column;gap:3px;justify-content:center}
.wa-conv-top,.wa-conv-bot{display:flex;justify-content:space-between;align-items:center;gap:8px}
.wa-conv-top b{font-weight:500;font-size:15.5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.wa-conv-top time{font-size:11.5px;color:var(--wa-m);flex:none}.wa-conv-top time.new{color:#25d366}
.wa-prev{font-size:13.5px;color:var(--wa-m);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.wa-prev em{font-style:normal;opacity:.8}
.wa-badge{flex:none;min-width:20px;height:20px;padding:0 6px;border-radius:10px;background:#25d366;color:#0b141a;font-size:12px;font-weight:700;display:flex;align-items:center;justify-content:center}
.wa-chat{flex:1;min-width:0;display:flex;flex-direction:column;
  background-color:var(--wa-bg);background-image:radial-gradient(rgba(255,255,255,.035) 1px,transparent 1.4px);background-size:22px 22px}
.wa-chat-head{display:flex;align-items:center;gap:12px;padding:9px 14px;background:var(--wa-head);border-bottom:1px solid var(--wa-line)}
.wa-chat-head div{display:flex;flex-direction:column;min-width:0}.wa-chat-head b{font-weight:500;font-size:16px}
.wa-chat-head span{font-size:12.5px;color:var(--wa-m);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.wa-back{display:none;padding:4px}
.wa-thread{flex:1;overflow:auto;padding:14px 8% 10px}
.wa-day{display:flex;justify-content:center;margin:12px 0 8px}.wa-day span{background:var(--wa-head);color:var(--wa-m);font-size:12px;padding:5px 12px;border-radius:8px}
.wa-msg{display:flex;margin:2px 0}.wa-msg.out{justify-content:flex-end}
.wa-bubble{max-width:min(560px,82%);padding:6px 9px 4px;border-radius:9px;background:var(--wa-in);box-shadow:0 1px .5px rgba(0,0,0,.3);position:relative}
.wa-msg.out .wa-bubble{background:var(--wa-out)}
.wa-who{font-size:12.5px;font-weight:600;margin-bottom:2px}.wa-to{font-size:11.5px;color:var(--wa-m);margin-bottom:2px}
.wa-text{font-size:14.5px;line-height:1.4;white-space:pre-wrap;overflow-wrap:anywhere}
.wa-text::after{content:'';display:inline-block;width:64px}
.wa-bubble time{position:absolute;right:9px;bottom:4px;font-size:11px;color:rgba(233,237,239,.6);white-space:nowrap}
.wa-bubble{min-width:84px;padding-bottom:18px}
.wa-wakeerr{margin:4px 0 6px;padding:5px 8px;border-radius:6px;background:rgba(255,77,77,.14);color:#ffb4b4;font-size:12px;line-height:1.35}
.wa-wakeerr button{margin-left:6px;color:#53bdeb!important;text-decoration:underline}
.wa-ticks{display:inline-block;vertical-align:-1px;margin-left:4px}
.wa-voice+.wa-text,.wa-voice{margin-bottom:2px}
.wa-voice{display:flex;align-items:center;gap:10px;min-width:230px;padding:4px 40px 8px 0}
.wa-voice-btn{width:36px;height:36px;display:flex;align-items:center;justify-content:center;border-radius:50%;background:rgba(255,255,255,.08)}
.wa-wave{flex:1;display:flex;align-items:center;gap:2px;height:30px;cursor:pointer}.wa-wave i{flex:1;min-width:2px;border-radius:2px}
.wa-voice-t{font-size:11.5px;color:rgba(233,237,239,.7);min-width:34px}
.wa-empty{margin:40px auto;max-width:360px;text-align:center;font-size:13px;color:var(--wa-m);background:var(--wa-head);padding:10px 14px;border-radius:10px}
.wa-composer{display:flex;align-items:flex-end;gap:10px;padding:10px 14px calc(10px + env(safe-area-inset-bottom));background:var(--wa-head)}
.wa-composer textarea{flex:1;resize:none;max-height:120px;padding:10px 14px;border-radius:22px;background:#2a3942;border:none;outline:none;color:var(--wa-t);font:inherit;font-size:15px;line-height:1.35}
.wa-round{flex:none;width:44px;height:44px;border-radius:50%;display:flex;align-items:center;justify-content:center;color:var(--wa-m)}
.wa-round:hover{background:rgba(255,255,255,.06)}.wa-send{background:var(--wa-g)!important;color:#fff!important}.wa-danger{color:#ff7a6b!important}
.wa-listening{background:#ff4d4d!important;color:#fff!important;animation:wa-blink 1.2s infinite}
.wa-rec{flex:1;display:flex;align-items:center;gap:10px}.wa-rec-dot{width:10px;height:10px;border-radius:50%;background:#ff4d4d;animation:wa-blink 1s infinite}
.wa-rec-t{font-variant-numeric:tabular-nums}.wa-rec-hint{flex:1;color:var(--wa-m);font-size:13px}
@keyframes wa-blink{50%{opacity:.2}}
.wa-readonly{display:flex;align-items:center;justify-content:center;gap:8px;padding:14px;background:var(--wa-head);color:var(--wa-m);font-size:13px}
/* mappa */
.wa-map{flex:1;overflow:auto;padding:16px 20px;background:var(--wa-bg)}
.wa-map-head{display:flex;flex-wrap:wrap;gap:12px;justify-content:space-between;align-items:flex-start}
.wa-map-head h2{font-size:20px;margin-bottom:4px}.wa-map-head p{max-width:640px;font-size:13px;color:var(--wa-m);line-height:1.5}
.wa-seg{display:flex;background:var(--wa-head);border-radius:100px;padding:3px}.wa-seg button{padding:6px 14px;border-radius:100px;font-size:12.5px;color:var(--wa-m)}.wa-seg .on{background:var(--wa-g);color:#fff}
.wa-map-body{display:flex;flex-wrap:wrap;gap:16px;margin-top:10px}
.wa-svg{flex:1 1 560px;min-width:0;max-height:calc(100dvh - 230px);background:var(--wa-panel);border-radius:16px;border:1px solid var(--wa-line)}
.wa-map-side{flex:1 1 240px;max-width:340px;background:var(--wa-panel);border:1px solid var(--wa-line);border-radius:16px;padding:16px;align-self:flex-start}
.wa-map-side h3{font-size:16px;margin-bottom:4px}.wa-map-side h4{font-size:11px;letter-spacing:.12em;text-transform:uppercase;color:var(--wa-m);margin:14px 0 6px}
.wa-muted{font-size:12.5px;color:var(--wa-m);line-height:1.5}
.wa-stats{list-style:none;margin-top:10px;font-size:13.5px;display:grid;gap:4px}.wa-stats b{color:#25d366}
.wa-row{display:flex;align-items:center;gap:8px;width:100%;padding:8px 6px;border-radius:8px;font-size:13.5px;text-align:left}
.wa-row:hover{background:rgba(255,255,255,.05)}.wa-row i{width:14px;height:14px;border-radius:50%;flex:none}.wa-row em{margin-left:auto;font-style:normal;color:var(--wa-m)}
.wa-link{margin-top:12px;font-size:12.5px;color:#25d366}
@media (max-width:760px){
  .wa-list{width:100%;max-width:none}
  .wa-root[data-mobile=list] .wa-chat{display:none}
  .wa-root[data-mobile=chat] .wa-list{display:none}
  .wa-back{display:block}.wa-thread{padding:12px 10px}
  .wa-tabs{overflow-x:auto}
  .wa-map{padding:12px}.wa-svg{flex-basis:100%}.wa-map-side{max-width:none;flex-basis:100%}
  .wa-composer textarea{font-size:16px}
}
`;

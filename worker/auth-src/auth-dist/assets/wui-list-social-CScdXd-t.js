import{$ as e,B as t,Ci as n,at as r,ci as i,d as a,f as o,ft as s,l as c,li as l,m as u,o as d,tt as f,v as p,yi as m}from"./index-DHzoh2pq.js";import{s as h}from"./wui-text-Bo1u6ozV.js";import{t as g}from"./if-defined-Q1zLy4s7.js";function _(){try{return i.returnOpenHref(`${m.SECURE_SITE_SDK_ORIGIN}/loading`,`popupWindow`,`width=600,height=800,scrollbars=yes`)}catch{throw Error(`Could not open social popup`)}}async function v(){f.push(`ConnectingFarcaster`);let n=e.getAuthConnector();if(n&&!t.getAccountData()?.farcasterUrl)try{let{url:e}=await n.provider.getFarcasterUri();t.setAccountProp(`farcasterUrl`,e,t.state.activeChain)}catch(e){f.goBack(),s.showError(e)}}async function y(a){f.push(`ConnectingSocial`);let o=e.getAuthConnector(),c=null;try{let e=setTimeout(()=>{throw Error(`Social login timed out. Please try again.`)},45e3);if(o&&a){if(i.isTelegram()||(c=_()),c)t.setAccountProp(`socialWindow`,n(c),t.state.activeChain);else if(!i.isTelegram())throw Error(`Could not create social popup`);let{uri:r}=await o.provider.getSocialRedirectUri({provider:a});if(!r)throw c?.close(),Error(`Could not fetch the social redirect uri`);if(c&&(c.location.href=r),i.isTelegram()){l.setTelegramSocialProvider(a);let e=i.formatTelegramSocialLoginUrl(r);i.openHref(e,`_top`)}clearTimeout(e)}}catch(e){c?.close();let t=i.parseError(e);s.showError(t),r.sendEvent({type:`track`,event:`SOCIAL_LOGIN_ERROR`,properties:{provider:a,message:t}})}}async function b(e){t.setAccountProp(`socialProvider`,e,t.state.activeChain),r.sendEvent({type:`track`,event:`SOCIAL_LOGIN_STARTED`,properties:{provider:e}}),e===`farcaster`?await v():await y(e)}var x=o`
  :host {
    display: flex;
    justify-content: center;
    align-items: center;
    width: 40px;
    height: 40px;
    border-radius: ${({borderRadius:e})=>e[20]};
    overflow: hidden;
  }

  wui-icon {
    width: 100%;
    height: 100%;
  }
`,S=function(e,t,n,r){var i=arguments.length,a=i<3?t:r===null?r=Object.getOwnPropertyDescriptor(t,n):r,o;if(typeof Reflect==`object`&&typeof Reflect.decorate==`function`)a=Reflect.decorate(e,t,n,r);else for(var s=e.length-1;s>=0;s--)(o=e[s])&&(a=(i<3?o(a):i>3?o(t,n,a):o(t,n))||a);return i>3&&a&&Object.defineProperty(t,n,a),a},C=class extends u{constructor(){super(...arguments),this.logo=`google`}render(){return p`<wui-icon color="inherit" size="inherit" name=${this.logo}></wui-icon> `}};C.styles=[a,x],S([h()],C.prototype,`logo`,void 0),C=S([d(`wui-logo`)],C);var w=o`
  :host {
    width: 100%;
  }

  button {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: ${({spacing:e})=>e[3]};
    width: 100%;
    background-color: transparent;
    border-radius: ${({borderRadius:e})=>e[4]};
  }

  wui-text {
    text-transform: capitalize;
  }

  @media (hover: hover) {
    button:hover:enabled {
      background-color: ${({tokens:e})=>e.theme.foregroundPrimary};
    }
  }

  button:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
`,T=function(e,t,n,r){var i=arguments.length,a=i<3?t:r===null?r=Object.getOwnPropertyDescriptor(t,n):r,o;if(typeof Reflect==`object`&&typeof Reflect.decorate==`function`)a=Reflect.decorate(e,t,n,r);else for(var s=e.length-1;s>=0;s--)(o=e[s])&&(a=(i<3?o(a):i>3?o(t,n,a):o(t,n))||a);return i>3&&a&&Object.defineProperty(t,n,a),a},E=class extends u{constructor(){super(...arguments),this.logo=`google`,this.name=`Continue with google`,this.disabled=!1}render(){return p`
      <button ?disabled=${this.disabled} tabindex=${g(this.tabIdx)}>
        <wui-flex gap="2" alignItems="center">
          <wui-image ?boxed=${!0} logo=${this.logo}></wui-image>
          <wui-text variant="lg-regular" color="primary">${this.name}</wui-text>
        </wui-flex>
        <wui-icon name="chevronRight" size="lg" color="default"></wui-icon>
      </button>
    `}};E.styles=[a,c,w],T([h()],E.prototype,`logo`,void 0),T([h()],E.prototype,`name`,void 0),T([h()],E.prototype,`tabIdx`,void 0),T([h({type:Boolean})],E.prototype,`disabled`,void 0),E=T([d(`wui-list-social`)],E);export{b as t};
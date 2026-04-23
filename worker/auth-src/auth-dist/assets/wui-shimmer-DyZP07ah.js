import{f as e,m as t,o as n,v as r}from"./index-DHzoh2pq.js";import{s as i}from"./wui-text-Bo1u6ozV.js";var a=e`
  :host {
    display: block;
    background: linear-gradient(
      90deg,
      ${({tokens:e})=>e.theme.foregroundPrimary} 0%,
      ${({tokens:e})=>e.theme.foregroundSecondary} 50%,
      ${({tokens:e})=>e.theme.foregroundPrimary} 100%
    );
    background-size: 200% 100%;
    animation: shimmer 2s linear infinite;
    border-radius: ${({borderRadius:e})=>e[1]};
  }

  :host([data-rounded='true']) {
    border-radius: ${({borderRadius:e})=>e[16]};
  }

  @keyframes shimmer {
    0% {
      background-position: 100% 0;
    }
    100% {
      background-position: -100% 0;
    }
  }
`,o=function(e,t,n,r){var i=arguments.length,a=i<3?t:r===null?r=Object.getOwnPropertyDescriptor(t,n):r,o;if(typeof Reflect==`object`&&typeof Reflect.decorate==`function`)a=Reflect.decorate(e,t,n,r);else for(var s=e.length-1;s>=0;s--)(o=e[s])&&(a=(i<3?o(a):i>3?o(t,n,a):o(t,n))||a);return i>3&&a&&Object.defineProperty(t,n,a),a},s=class extends t{constructor(){super(...arguments),this.width=``,this.height=``,this.variant=`default`,this.rounded=!1}render(){return this.style.cssText=`
      width: ${this.width};
      height: ${this.height};
    `,this.dataset.rounded=this.rounded?`true`:`false`,r`<slot></slot>`}};s.styles=[a],o([i()],s.prototype,`width`,void 0),o([i()],s.prototype,`height`,void 0),o([i()],s.prototype,`variant`,void 0),o([i({type:Boolean})],s.prototype,`rounded`,void 0),s=o([n(`wui-shimmer`)],s);
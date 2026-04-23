import{$ as e,B as t,C as n,K as r,O as i,R as a,at as o,ci as s,f as c,ft as l,m as u,o as d,pt as f,tt as p,v as m,yi as h}from"./index-DHzoh2pq.js";import{o as g}from"./wui-text-Bo1u6ozV.js";import"./wui-button-34enluQO.js";import"./wui-link-DKgf8xSc.js";import{t as _}from"./w3m-email-otp-widget-CIm5jEjO.js";import"./wui-icon-box-h2TynimV.js";import{n as v,t as y}from"./ref-CJWPCIu_.js";import"./wui-email-input-kAH_DQCG.js";var b=function(e,t,n,r){var i=arguments.length,a=i<3?t:r===null?r=Object.getOwnPropertyDescriptor(t,n):r,o;if(typeof Reflect==`object`&&typeof Reflect.decorate==`function`)a=Reflect.decorate(e,t,n,r);else for(var s=e.length-1;s>=0;s--)(o=e[s])&&(a=(i<3?o(a):i>3?o(t,n,a):o(t,n))||a);return i>3&&a&&Object.defineProperty(t,n,a),a},x=class extends _{constructor(){super(...arguments),this.onOtpSubmit=async e=>{try{if(this.authConnector){let n=t.state.activeChain,i=r.getConnections(n),s=f.state.remoteFeatures?.multiWallet,c=i.length>0;if(await this.authConnector.provider.connectOtp({otp:e}),o.sendEvent({type:`track`,event:`EMAIL_VERIFICATION_CODE_PASS`}),n)await r.connectExternal(this.authConnector,n);else throw Error(`Active chain is not set on ChainController`);if(f.state.remoteFeatures?.emailCapture)return;if(f.state.siwx){a.close();return}if(c&&s){p.replace(`ProfileWallets`),l.showSuccess(`New Wallet Added`);return}a.close()}}catch(e){throw o.sendEvent({type:`track`,event:`EMAIL_VERIFICATION_CODE_FAIL`,properties:{message:s.parseError(e)}}),e}},this.onOtpResend=async e=>{this.authConnector&&(await this.authConnector.provider.connectEmail({email:e}),o.sendEvent({type:`track`,event:`EMAIL_VERIFICATION_CODE_SENT`}))}}};x=b([d(`w3m-email-verify-otp-view`)],x);var S=c`
  wui-icon-box {
    height: ${({spacing:e})=>e[16]};
    width: ${({spacing:e})=>e[16]};
  }
`,C=function(e,t,n,r){var i=arguments.length,a=i<3?t:r===null?r=Object.getOwnPropertyDescriptor(t,n):r,o;if(typeof Reflect==`object`&&typeof Reflect.decorate==`function`)a=Reflect.decorate(e,t,n,r);else for(var s=e.length-1;s>=0;s--)(o=e[s])&&(a=(i<3?o(a):i>3?o(t,n,a):o(t,n))||a);return i>3&&a&&Object.defineProperty(t,n,a),a},w=class extends u{constructor(){super(),this.email=p.state.data?.email,this.authConnector=e.getAuthConnector(),this.loading=!1,this.listenForDeviceApproval()}render(){if(!this.email)throw Error(`w3m-email-verify-device-view: No email provided`);if(!this.authConnector)throw Error(`w3m-email-verify-device-view: No auth connector provided`);return m`
      <wui-flex
        flexDirection="column"
        alignItems="center"
        .padding=${[`6`,`3`,`6`,`3`]}
        gap="4"
      >
        <wui-icon-box size="xl" color="accent-primary" icon="sealCheck"></wui-icon-box>

        <wui-flex flexDirection="column" alignItems="center" gap="3">
          <wui-flex flexDirection="column" alignItems="center">
            <wui-text variant="md-regular" color="primary">
              Approve the login link we sent to
            </wui-text>
            <wui-text variant="md-regular" color="primary"><b>${this.email}</b></wui-text>
          </wui-flex>

          <wui-text variant="sm-regular" color="secondary" align="center">
            The code expires in 20 minutes
          </wui-text>

          <wui-flex alignItems="center" id="w3m-resend-section" gap="2">
            <wui-text variant="sm-regular" color="primary" align="center">
              Didn't receive it?
            </wui-text>
            <wui-link @click=${this.onResendCode.bind(this)} .disabled=${this.loading}>
              Resend email
            </wui-link>
          </wui-flex>
        </wui-flex>
      </wui-flex>
    `}async listenForDeviceApproval(){if(this.authConnector)try{await this.authConnector.provider.connectDevice(),o.sendEvent({type:`track`,event:`DEVICE_REGISTERED_FOR_EMAIL`}),o.sendEvent({type:`track`,event:`EMAIL_VERIFICATION_CODE_SENT`}),p.replace(`EmailVerifyOtp`,{email:this.email})}catch{p.goBack()}}async onResendCode(){try{if(!this.loading){if(!this.authConnector||!this.email)throw Error(`w3m-email-login-widget: Unable to resend email`);this.loading=!0,await this.authConnector.provider.connectEmail({email:this.email}),this.listenForDeviceApproval(),l.showSuccess(`Code email resent`)}}catch(e){l.showError(e)}finally{this.loading=!1}}};w.styles=S,C([g()],w.prototype,`loading`,void 0),w=C([d(`w3m-email-verify-device-view`)],w);var T=n`
  wui-email-input {
    width: 100%;
  }

  form {
    width: 100%;
    display: block;
    position: relative;
  }
`,E=function(e,t,n,r){var i=arguments.length,a=i<3?t:r===null?r=Object.getOwnPropertyDescriptor(t,n):r,o;if(typeof Reflect==`object`&&typeof Reflect.decorate==`function`)a=Reflect.decorate(e,t,n,r);else for(var s=e.length-1;s>=0;s--)(o=e[s])&&(a=(i<3?o(a):i>3?o(t,n,a):o(t,n))||a);return i>3&&a&&Object.defineProperty(t,n,a),a},D=class extends u{constructor(){super(...arguments),this.formRef=y(),this.initialEmail=p.state.data?.email??``,this.redirectView=p.state.data?.redirectView,this.email=``,this.loading=!1}firstUpdated(){this.formRef.value?.addEventListener(`keydown`,e=>{e.key===`Enter`&&this.onSubmitEmail(e)})}render(){return m`
      <wui-flex flexDirection="column" padding="4" gap="4">
        <form ${v(this.formRef)} @submit=${this.onSubmitEmail.bind(this)}>
          <wui-email-input
            value=${this.initialEmail}
            .disabled=${this.loading}
            @inputChange=${this.onEmailInputChange.bind(this)}
          >
          </wui-email-input>
          <input type="submit" hidden />
        </form>
        ${this.buttonsTemplate()}
      </wui-flex>
    `}onEmailInputChange(e){this.email=e.detail}async onSubmitEmail(t){try{if(this.loading)return;this.loading=!0,t.preventDefault();let n=e.getAuthConnector();if(!n)throw Error(`w3m-update-email-wallet: Auth connector not found`);let r=await n.provider.updateEmail({email:this.email});o.sendEvent({type:`track`,event:`EMAIL_EDIT`}),r.action===`VERIFY_SECONDARY_OTP`?p.push(`UpdateEmailSecondaryOtp`,{email:this.initialEmail,newEmail:this.email,redirectView:this.redirectView}):p.push(`UpdateEmailPrimaryOtp`,{email:this.initialEmail,newEmail:this.email,redirectView:this.redirectView})}catch(e){l.showError(e),this.loading=!1}}buttonsTemplate(){let e=!this.loading&&this.email.length>3&&this.email!==this.initialEmail;return this.redirectView?m`
      <wui-flex gap="3">
        <wui-button size="md" variant="neutral" fullWidth @click=${p.goBack}>
          Cancel
        </wui-button>

        <wui-button
          size="md"
          variant="accent-primary"
          fullWidth
          @click=${this.onSubmitEmail.bind(this)}
          .disabled=${!e}
          .loading=${this.loading}
        >
          Save
        </wui-button>
      </wui-flex>
    `:m`
        <wui-button
          size="md"
          variant="accent-primary"
          fullWidth
          @click=${this.onSubmitEmail.bind(this)}
          .disabled=${!e}
          .loading=${this.loading}
        >
          Save
        </wui-button>
      `}};D.styles=T,E([g()],D.prototype,`email`,void 0),E([g()],D.prototype,`loading`,void 0),D=E([d(`w3m-update-email-wallet-view`)],D);var O=function(e,t,n,r){var i=arguments.length,a=i<3?t:r===null?r=Object.getOwnPropertyDescriptor(t,n):r,o;if(typeof Reflect==`object`&&typeof Reflect.decorate==`function`)a=Reflect.decorate(e,t,n,r);else for(var s=e.length-1;s>=0;s--)(o=e[s])&&(a=(i<3?o(a):i>3?o(t,n,a):o(t,n))||a);return i>3&&a&&Object.defineProperty(t,n,a),a},k=class extends _{constructor(){super(),this.email=p.state.data?.email,this.onOtpSubmit=async e=>{try{this.authConnector&&(await this.authConnector.provider.updateEmailPrimaryOtp({otp:e}),o.sendEvent({type:`track`,event:`EMAIL_VERIFICATION_CODE_PASS`}),p.replace(`UpdateEmailSecondaryOtp`,p.state.data))}catch(e){throw o.sendEvent({type:`track`,event:`EMAIL_VERIFICATION_CODE_FAIL`,properties:{message:s.parseError(e)}}),e}},this.onStartOver=()=>{p.replace(`UpdateEmailWallet`,p.state.data)}}};k=O([d(`w3m-update-email-primary-otp-view`)],k);var A=function(e,t,n,r){var i=arguments.length,a=i<3?t:r===null?r=Object.getOwnPropertyDescriptor(t,n):r,o;if(typeof Reflect==`object`&&typeof Reflect.decorate==`function`)a=Reflect.decorate(e,t,n,r);else for(var s=e.length-1;s>=0;s--)(o=e[s])&&(a=(i<3?o(a):i>3?o(t,n,a):o(t,n))||a);return i>3&&a&&Object.defineProperty(t,n,a),a},j=class extends _{constructor(){super(),this.email=p.state.data?.newEmail,this.redirectView=p.state.data?.redirectView,this.onOtpSubmit=async e=>{try{this.authConnector&&(await this.authConnector.provider.updateEmailSecondaryOtp({otp:e}),o.sendEvent({type:`track`,event:`EMAIL_VERIFICATION_CODE_PASS`}),this.redirectView&&p.reset(this.redirectView))}catch(e){throw o.sendEvent({type:`track`,event:`EMAIL_VERIFICATION_CODE_FAIL`,properties:{message:s.parseError(e)}}),e}},this.onStartOver=()=>{p.replace(`UpdateEmailWallet`,p.state.data)}}};j=A([d(`w3m-update-email-secondary-otp-view`)],j);var M=function(e,t,n,r){var i=arguments.length,a=i<3?t:r===null?r=Object.getOwnPropertyDescriptor(t,n):r,o;if(typeof Reflect==`object`&&typeof Reflect.decorate==`function`)a=Reflect.decorate(e,t,n,r);else for(var s=e.length-1;s>=0;s--)(o=e[s])&&(a=(i<3?o(a):i>3?o(t,n,a):o(t,n))||a);return i>3&&a&&Object.defineProperty(t,n,a),a},N=class extends u{constructor(){super(),this.authConnector=e.getAuthConnector(),this.isEmailEnabled=f.state.remoteFeatures?.email,this.isAuthEnabled=this.checkIfAuthEnabled(e.state.connectors),this.connectors=e.state.connectors,e.subscribeKey(`connectors`,e=>{this.connectors=e,this.isAuthEnabled=this.checkIfAuthEnabled(this.connectors)})}render(){if(!this.isEmailEnabled)throw Error(`w3m-email-login-view: Email is not enabled`);if(!this.isAuthEnabled)throw Error(`w3m-email-login-view: No auth connector provided`);return m`<wui-flex flexDirection="column" .padding=${[`1`,`3`,`3`,`3`]} gap="4">
      <w3m-email-login-widget></w3m-email-login-widget>
    </wui-flex> `}checkIfAuthEnabled(e){let t=e.filter(e=>e.type===i.CONNECTOR_TYPE_AUTH).map(e=>e.chain);return h.AUTH_CONNECTOR_SUPPORTED_CHAINS.some(e=>t.includes(e))}};M([g()],N.prototype,`connectors`,void 0),N=M([d(`w3m-email-login-view`)],N);export{N as W3mEmailLoginView,_ as W3mEmailOtpWidget,w as W3mEmailVerifyDeviceView,x as W3mEmailVerifyOtpView,k as W3mUpdateEmailPrimaryOtpView,j as W3mUpdateEmailSecondaryOtpView,D as W3mUpdateEmailWalletView};
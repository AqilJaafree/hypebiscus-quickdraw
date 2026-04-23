import{t as e}from"./SwapController-DPec-_E3.js";import"./w3m-tooltip-BhJNAiZw.js";import{B as t,Q as n,R as r,_i as i,at as a,ci as o,d as s,f as c,l,m as u,o as d,si as f,tt as p,ui as m,v as h,w as g}from"./index-DHzoh2pq.js";import{o as _,s as v}from"./wui-text-Bo1u6ozV.js";import"./wui-button-34enluQO.js";import"./wui-icon-D39z_7bD.js";import"./wui-image-5uRrU46d.js";import"./wui-shimmer-DyZP07ah.js";import"./wui-shimmer-CeorTSfU.js";import"./wui-icon-box-h2TynimV.js";import"./wui-input-text-D36Ns32n.js";import"./wui-token-button-CUZd32Y_.js";var y={numericInputKeyDown(e,t,n){let r=[`Backspace`,`Meta`,`Ctrl`,`a`,`A`,`c`,`C`,`x`,`X`,`v`,`V`,`ArrowLeft`,`ArrowRight`,`Tab`],i=e.metaKey||e.ctrlKey,a=e.key,o=a.toLocaleLowerCase(),s=o===`a`,c=o===`c`,l=o===`v`,u=o===`x`,d=a===`,`,f=a===`.`,p=a>=`0`&&a<=`9`;!i&&(s||c||l||u)&&e.preventDefault(),t===`0`&&!d&&!f&&a===`0`&&e.preventDefault(),t===`0`&&p&&(n(a),e.preventDefault()),(d||f)&&(t||(n(`0.`),e.preventDefault()),(t?.includes(`.`)||t?.includes(`,`))&&e.preventDefault()),!p&&!r.includes(a)&&!f&&!d&&e.preventDefault()}},b=c`
  :host {
    width: 100%;
  }

  .details-container > wui-flex {
    background: ${({tokens:e})=>e.theme.foregroundPrimary};
    border-radius: ${({borderRadius:e})=>e[3]};
    width: 100%;
  }

  .details-container > wui-flex > button {
    border: none;
    background: none;
    padding: ${({spacing:e})=>e[3]};
    border-radius: ${({borderRadius:e})=>e[3]};
    cursor: pointer;
  }

  .details-content-container {
    padding: ${({spacing:e})=>e[2]};
    padding-top: 0px;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .details-content-container > wui-flex {
    width: 100%;
  }

  .details-row {
    width: 100%;
    padding: ${({spacing:e})=>e[3]};
    padding-left: ${({spacing:e})=>e[3]};
    padding-right: ${({spacing:e})=>e[2]};
    border-radius: calc(
      ${({borderRadius:e})=>e[1]} + ${({borderRadius:e})=>e[1]}
    );
    background: ${({tokens:e})=>e.theme.foregroundPrimary};
  }

  .details-row-title {
    white-space: nowrap;
  }

  .details-row.provider-free-row {
    padding-right: ${({spacing:e})=>e[2]};
  }
`,x=function(e,t,n,r){var i=arguments.length,a=i<3?t:r===null?r=Object.getOwnPropertyDescriptor(t,n):r,o;if(typeof Reflect==`object`&&typeof Reflect.decorate==`function`)a=Reflect.decorate(e,t,n,r);else for(var s=e.length-1;s>=0;s--)(o=e[s])&&(a=(i<3?o(a):i>3?o(t,n,a):o(t,n))||a);return i>3&&a&&Object.defineProperty(t,n,a),a},S=m.CONVERT_SLIPPAGE_TOLERANCE,C=class extends u{constructor(){super(),this.unsubscribe=[],this.networkName=t.state.activeCaipNetwork?.name,this.detailsOpen=!1,this.sourceToken=e.state.sourceToken,this.toToken=e.state.toToken,this.toTokenAmount=e.state.toTokenAmount,this.sourceTokenPriceInUSD=e.state.sourceTokenPriceInUSD,this.toTokenPriceInUSD=e.state.toTokenPriceInUSD,this.priceImpact=e.state.priceImpact,this.maxSlippage=e.state.maxSlippage,this.networkTokenSymbol=e.state.networkTokenSymbol,this.inputError=e.state.inputError,this.unsubscribe.push(e.subscribe(e=>{this.sourceToken=e.sourceToken,this.toToken=e.toToken,this.toTokenAmount=e.toTokenAmount,this.priceImpact=e.priceImpact,this.maxSlippage=e.maxSlippage,this.sourceTokenPriceInUSD=e.sourceTokenPriceInUSD,this.toTokenPriceInUSD=e.toTokenPriceInUSD,this.inputError=e.inputError}))}render(){let e=this.toTokenAmount&&this.maxSlippage?i.bigNumber(this.toTokenAmount).minus(this.maxSlippage).toString():null;if(!this.sourceToken||!this.toToken||this.inputError)return null;let t=this.sourceTokenPriceInUSD&&this.toTokenPriceInUSD?1/this.toTokenPriceInUSD*this.sourceTokenPriceInUSD:0;return h`
      <wui-flex flexDirection="column" alignItems="center" gap="01" class="details-container">
        <wui-flex flexDirection="column">
          <button @click=${this.toggleDetails.bind(this)}>
            <wui-flex justifyContent="space-between" .padding=${[`0`,`2`,`0`,`2`]}>
              <wui-flex justifyContent="flex-start" flexGrow="1" gap="2">
                <wui-text variant="sm-regular" color="primary">
                  1 ${this.sourceToken.symbol} =
                  ${i.formatNumberToLocalString(t,3)}
                  ${this.toToken.symbol}
                </wui-text>
                <wui-text variant="sm-regular" color="secondary">
                  $${i.formatNumberToLocalString(this.sourceTokenPriceInUSD)}
                </wui-text>
              </wui-flex>
              <wui-icon name="chevronBottom"></wui-icon>
            </wui-flex>
          </button>
          ${this.detailsOpen?h`
                <wui-flex flexDirection="column" gap="2" class="details-content-container">
                  ${this.priceImpact?h` <wui-flex flexDirection="column" gap="2">
                        <wui-flex
                          justifyContent="space-between"
                          alignItems="center"
                          class="details-row"
                        >
                          <wui-flex alignItems="center" gap="2">
                            <wui-text
                              class="details-row-title"
                              variant="sm-regular"
                              color="secondary"
                            >
                              Price impact
                            </wui-text>
                            <w3m-tooltip-trigger
                              text="Price impact reflects the change in market price due to your trade"
                            >
                              <wui-icon size="sm" color="default" name="info"></wui-icon>
                            </w3m-tooltip-trigger>
                          </wui-flex>
                          <wui-flex>
                            <wui-text variant="sm-regular" color="secondary">
                              ${i.formatNumberToLocalString(this.priceImpact,3)}%
                            </wui-text>
                          </wui-flex>
                        </wui-flex>
                      </wui-flex>`:null}
                  ${this.maxSlippage&&this.sourceToken.symbol?h`<wui-flex flexDirection="column" gap="2">
                        <wui-flex
                          justifyContent="space-between"
                          alignItems="center"
                          class="details-row"
                        >
                          <wui-flex alignItems="center" gap="2">
                            <wui-text
                              class="details-row-title"
                              variant="sm-regular"
                              color="secondary"
                            >
                              Max. slippage
                            </wui-text>
                            <w3m-tooltip-trigger
                              text=${`Max slippage sets the minimum amount you must receive for the transaction to proceed. ${e?`Transaction will be reversed if you receive less than ${i.formatNumberToLocalString(e,6)} ${this.toToken.symbol} due to price changes.`:``}`}
                            >
                              <wui-icon size="sm" color="default" name="info"></wui-icon>
                            </w3m-tooltip-trigger>
                          </wui-flex>
                          <wui-flex>
                            <wui-text variant="sm-regular" color="secondary">
                              ${i.formatNumberToLocalString(this.maxSlippage,6)}
                              ${this.toToken.symbol} ${S}%
                            </wui-text>
                          </wui-flex>
                        </wui-flex>
                      </wui-flex>`:null}
                  <wui-flex flexDirection="column" gap="2">
                    <wui-flex
                      justifyContent="space-between"
                      alignItems="center"
                      class="details-row provider-free-row"
                    >
                      <wui-flex alignItems="center" gap="2">
                        <wui-text class="details-row-title" variant="sm-regular" color="secondary">
                          Provider fee
                        </wui-text>
                      </wui-flex>
                      <wui-flex>
                        <wui-text variant="sm-regular" color="secondary">0.85%</wui-text>
                      </wui-flex>
                    </wui-flex>
                  </wui-flex>
                </wui-flex>
              `:null}
        </wui-flex>
      </wui-flex>
    `}toggleDetails(){this.detailsOpen=!this.detailsOpen}};C.styles=[b],x([_()],C.prototype,`networkName`,void 0),x([v()],C.prototype,`detailsOpen`,void 0),x([_()],C.prototype,`sourceToken`,void 0),x([_()],C.prototype,`toToken`,void 0),x([_()],C.prototype,`toTokenAmount`,void 0),x([_()],C.prototype,`sourceTokenPriceInUSD`,void 0),x([_()],C.prototype,`toTokenPriceInUSD`,void 0),x([_()],C.prototype,`priceImpact`,void 0),x([_()],C.prototype,`maxSlippage`,void 0),x([_()],C.prototype,`networkTokenSymbol`,void 0),x([_()],C.prototype,`inputError`,void 0),C=x([d(`w3m-swap-details`)],C);var w=c`
  :host {
    width: 100%;
  }

  :host > wui-flex {
    display: flex;
    flex-direction: row;
    justify-content: space-between;
    align-items: center;
    border-radius: ${({borderRadius:e})=>e[5]};
    padding: ${({spacing:e})=>e[5]};
    padding-right: ${({spacing:e})=>e[3]};
    background-color: ${({tokens:e})=>e.theme.foregroundPrimary};
    box-shadow: inset 0px 0px 0px 1px ${({tokens:e})=>e.theme.foregroundPrimary};
    width: 100%;
    height: 100px;
    box-sizing: border-box;
    position: relative;
  }

  wui-shimmer.market-value {
    opacity: 0;
  }

  :host > wui-flex > svg.input_mask {
    position: absolute;
    inset: 0;
    z-index: 5;
  }

  :host wui-flex .input_mask__border,
  :host wui-flex .input_mask__background {
    transition: fill ${({durations:e})=>e.md}
      ${({easings:e})=>e[`ease-out-power-1`]};
    will-change: fill;
  }

  :host wui-flex .input_mask__border {
    fill: ${({tokens:e})=>e.core.glass010};
  }

  :host wui-flex .input_mask__background {
    fill: ${({tokens:e})=>e.theme.foregroundPrimary};
  }
`,T=function(e,t,n,r){var i=arguments.length,a=i<3?t:r===null?r=Object.getOwnPropertyDescriptor(t,n):r,o;if(typeof Reflect==`object`&&typeof Reflect.decorate==`function`)a=Reflect.decorate(e,t,n,r);else for(var s=e.length-1;s>=0;s--)(o=e[s])&&(a=(i<3?o(a):i>3?o(t,n,a):o(t,n))||a);return i>3&&a&&Object.defineProperty(t,n,a),a},E=class extends u{constructor(){super(...arguments),this.target=`sourceToken`}render(){return h`
      <wui-flex class justifyContent="space-between">
        <wui-flex
          flex="1"
          flexDirection="column"
          alignItems="flex-start"
          justifyContent="center"
          class="swap-input"
          gap="1"
        >
          <wui-shimmer width="80px" height="40px" rounded variant="light"></wui-shimmer>
        </wui-flex>
        ${this.templateTokenSelectButton()}
      </wui-flex>
    `}templateTokenSelectButton(){return h`
      <wui-flex
        class="swap-token-button"
        flexDirection="column"
        alignItems="flex-end"
        justifyContent="center"
        gap="1"
      >
        <wui-shimmer width="80px" height="40px" rounded variant="light"></wui-shimmer>
      </wui-flex>
    `}};E.styles=[w],T([v()],E.prototype,`target`,void 0),E=T([d(`w3m-swap-input-skeleton`)],E);var D=c`
  :host > wui-flex {
    display: flex;
    flex-direction: row;
    justify-content: space-between;
    align-items: center;
    border-radius: ${({borderRadius:e})=>e[5]};
    background-color: ${({tokens:e})=>e.theme.foregroundPrimary};
    padding: ${({spacing:e})=>e[5]};
    padding-right: ${({spacing:e})=>e[3]};
    width: 100%;
    height: 100px;
    box-sizing: border-box;
    box-shadow: inset 0px 0px 0px 1px ${({tokens:e})=>e.theme.foregroundPrimary};
    position: relative;
    transition: box-shadow ${({easings:e})=>e[`ease-out-power-1`]}
      ${({durations:e})=>e.lg};
    will-change: background-color;
  }

  :host wui-flex.focus {
    box-shadow: inset 0px 0px 0px 1px ${({tokens:e})=>e.core.glass010};
  }

  :host > wui-flex .swap-input,
  :host > wui-flex .swap-token-button {
    z-index: 10;
  }

  :host > wui-flex .swap-input {
    -webkit-mask-image: linear-gradient(
      270deg,
      transparent 0px,
      transparent 8px,
      black 24px,
      black 25px,
      black 32px,
      black 100%
    );
    mask-image: linear-gradient(
      270deg,
      transparent 0px,
      transparent 8px,
      black 24px,
      black 25px,
      black 32px,
      black 100%
    );
  }

  :host > wui-flex .swap-input input {
    background: none;
    border: none;
    height: 42px;
    width: 100%;
    font-size: 32px;
    font-style: normal;
    font-weight: 400;
    line-height: 130%;
    letter-spacing: -1.28px;
    outline: none;
    caret-color: ${({tokens:e})=>e.core.textAccentPrimary};
    color: ${({tokens:e})=>e.theme.textPrimary};
    padding: 0px;
  }

  :host > wui-flex .swap-input input:focus-visible {
    outline: none;
  }

  :host > wui-flex .swap-input input::-webkit-outer-spin-button,
  :host > wui-flex .swap-input input::-webkit-inner-spin-button {
    -webkit-appearance: none;
    margin: 0;
  }

  .max-value-button {
    background-color: transparent;
    border: none;
    cursor: pointer;
    color: ${({tokens:e})=>e.core.glass010};
    padding-left: 0px;
  }

  .market-value {
    min-height: 18px;
  }
`,O=function(e,t,n,r){var i=arguments.length,a=i<3?t:r===null?r=Object.getOwnPropertyDescriptor(t,n):r,o;if(typeof Reflect==`object`&&typeof Reflect.decorate==`function`)a=Reflect.decorate(e,t,n,r);else for(var s=e.length-1;s>=0;s--)(o=e[s])&&(a=(i<3?o(a):i>3?o(t,n,a):o(t,n))||a);return i>3&&a&&Object.defineProperty(t,n,a),a},k=5e-5,A=class extends u{constructor(){super(...arguments),this.focused=!1,this.price=0,this.target=`sourceToken`,this.onSetAmount=null,this.onSetMaxValue=null}render(){let e=this.marketValue||`0`,t=i.bigNumber(e).gt(`0`);return h`
      <wui-flex
        class="${this.focused?`focus`:``}"
        justifyContent="space-between"
        alignItems="center"
      >
        <wui-flex
          flex="1"
          flexDirection="column"
          alignItems="flex-start"
          justifyContent="center"
          class="swap-input"
        >
          <input
            data-testid="swap-input-${this.target}"
            @focusin=${()=>this.onFocusChange(!0)}
            @focusout=${()=>this.onFocusChange(!1)}
            ?disabled=${this.disabled}
            value=${this.value||``}
            @input=${this.dispatchInputChangeEvent}
            @keydown=${this.handleKeydown}
            placeholder="0"
            type="text"
            inputmode="decimal"
            pattern="[0-9,.]*"
          />
          <wui-text class="market-value" variant="sm-regular" color="secondary">
            ${t?`$${i.formatNumberToLocalString(this.marketValue,2)}`:null}
          </wui-text>
        </wui-flex>
        ${this.templateTokenSelectButton()}
      </wui-flex>
    `}handleKeydown(e){return y.numericInputKeyDown(e,this.value,e=>this.onSetAmount?.(this.target,e))}dispatchInputChangeEvent(e){if(!this.onSetAmount)return;let t=e.target.value.replace(/[^0-9.]/gu,``);t===`,`||t===`.`?this.onSetAmount(this.target,`0.`):t.endsWith(`,`)?this.onSetAmount(this.target,t.replace(`,`,`.`)):this.onSetAmount(this.target,t)}setMaxValueToInput(){this.onSetMaxValue?.(this.target,this.balance)}templateTokenSelectButton(){return this.token?h`
      <wui-flex
        class="swap-token-button"
        flexDirection="column"
        alignItems="flex-end"
        justifyContent="center"
        gap="1"
      >
        <wui-token-button
          data-testid="swap-input-token-${this.target}"
          text=${this.token.symbol}
          imageSrc=${this.token.logoUri}
          @click=${this.onSelectToken.bind(this)}
        >
        </wui-token-button>
        <wui-flex alignItems="center" gap="1"> ${this.tokenBalanceTemplate()} </wui-flex>
      </wui-flex>
    `:h` <wui-button
        data-testid="swap-select-token-button-${this.target}"
        class="swap-token-button"
        size="md"
        variant="neutral-secondary"
        @click=${this.onSelectToken.bind(this)}
      >
        Select token
      </wui-button>`}tokenBalanceTemplate(){let e=i.multiply(this.balance,this.price),t=e?e?.gt(k):!1;return h`
      ${t?h`<wui-text variant="sm-regular" color="secondary">
            ${i.formatNumberToLocalString(this.balance,2)}
          </wui-text>`:null}
      ${this.target===`sourceToken`?this.tokenActionButtonTemplate(t):null}
    `}tokenActionButtonTemplate(e){return e?h` <button class="max-value-button" @click=${this.setMaxValueToInput.bind(this)}>
        <wui-text color="accent-primary" variant="sm-medium">Max</wui-text>
      </button>`:h` <button class="max-value-button" @click=${this.onBuyToken.bind(this)}>
      <wui-text color="accent-primary" variant="sm-medium">Buy</wui-text>
    </button>`}onFocusChange(e){this.focused=e}onSelectToken(){a.sendEvent({type:`track`,event:`CLICK_SELECT_TOKEN_TO_SWAP`}),p.push(`SwapSelectToken`,{target:this.target})}onBuyToken(){p.push(`OnRampProviders`)}};A.styles=[D],O([v()],A.prototype,`focused`,void 0),O([v()],A.prototype,`balance`,void 0),O([v()],A.prototype,`value`,void 0),O([v()],A.prototype,`price`,void 0),O([v()],A.prototype,`marketValue`,void 0),O([v()],A.prototype,`disabled`,void 0),O([v()],A.prototype,`target`,void 0),O([v()],A.prototype,`token`,void 0),O([v()],A.prototype,`onSetAmount`,void 0),O([v()],A.prototype,`onSetMaxValue`,void 0),A=O([d(`w3m-swap-input`)],A);var j=c`
  :host > wui-flex:first-child {
    overflow-y: auto;
    overflow-x: hidden;
    scrollbar-width: none;
  }

  :host > wui-flex:first-child::-webkit-scrollbar {
    display: none;
  }

  wui-loading-hexagon {
    position: absolute;
  }

  .action-button {
    width: 100%;
    border-radius: ${({borderRadius:e})=>e[4]};
  }

  .action-button:disabled {
    border-color: 1px solid ${({tokens:e})=>e.core.glass010};
  }

  .swap-inputs-container {
    position: relative;
  }

  wui-icon-box {
    width: 32px;
    height: 32px;
    border-radius: ${({borderRadius:e})=>e[10]} !important;
    border: 4px solid ${({tokens:e})=>e.theme.backgroundPrimary};
    background: ${({tokens:e})=>e.theme.foregroundPrimary};
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    z-index: 3;
  }

  .replace-tokens-button-container {
    display: flex;
    justify-content: center;
    align-items: center;
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    gap: ${({spacing:e})=>e[2]};
    border-radius: ${({borderRadius:e})=>e[4]};
    background-color: ${({tokens:e})=>e.theme.backgroundPrimary};
    padding: ${({spacing:e})=>e[2]};
  }

  .details-container > wui-flex {
    background: ${({tokens:e})=>e.theme.foregroundPrimary};
    border-radius: ${({borderRadius:e})=>e[3]};
    width: 100%;
  }

  .details-container > wui-flex > button {
    border: none;
    background: none;
    padding: ${({spacing:e})=>e[3]};
    border-radius: ${({borderRadius:e})=>e[3]};
    transition: background ${({durations:e})=>e.lg}
      ${({easings:e})=>e[`ease-out-power-2`]};
    will-change: background;
  }

  .details-container > wui-flex > button:hover {
    background: ${({tokens:e})=>e.theme.foregroundPrimary};
  }

  .details-content-container {
    padding: ${({spacing:e})=>e[2]};
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .details-content-container > wui-flex {
    width: 100%;
  }

  .details-row {
    width: 100%;
    padding: ${({spacing:e})=>e[3]} ${({spacing:e})=>e[5]};
    border-radius: ${({borderRadius:e})=>e[3]};
    background: ${({tokens:e})=>e.theme.foregroundPrimary};
  }
`,M=function(e,t,n,r){var i=arguments.length,a=i<3?t:r===null?r=Object.getOwnPropertyDescriptor(t,n):r,o;if(typeof Reflect==`object`&&typeof Reflect.decorate==`function`)a=Reflect.decorate(e,t,n,r);else for(var s=e.length-1;s>=0;s--)(o=e[s])&&(a=(i<3?o(a):i>3?o(t,n,a):o(t,n))||a);return i>3&&a&&Object.defineProperty(t,n,a),a},N=class extends u{subscribe({resetSwapState:e,initializeSwapState:n}){return()=>{t.subscribeKey(`activeCaipNetwork`,t=>this.onCaipNetworkChange({newCaipNetwork:t,resetSwapState:e,initializeSwapState:n})),t.subscribeChainProp(`accountState`,t=>{this.onCaipAddressChange({newCaipAddress:t?.caipAddress,resetSwapState:e,initializeSwapState:n})})}}constructor(){super(),this.unsubscribe=[],this.initialParams=p.state.data?.swap,this.detailsOpen=!1,this.caipAddress=t.getAccountData()?.caipAddress,this.caipNetworkId=t.state.activeCaipNetwork?.caipNetworkId,this.initialized=e.state.initialized,this.loadingQuote=e.state.loadingQuote,this.loadingPrices=e.state.loadingPrices,this.loadingTransaction=e.state.loadingTransaction,this.sourceToken=e.state.sourceToken,this.sourceTokenAmount=e.state.sourceTokenAmount,this.sourceTokenPriceInUSD=e.state.sourceTokenPriceInUSD,this.toToken=e.state.toToken,this.toTokenAmount=e.state.toTokenAmount,this.toTokenPriceInUSD=e.state.toTokenPriceInUSD,this.inputError=e.state.inputError,this.fetchError=e.state.fetchError,this.lastTokenPriceUpdate=0,this.minTokenPriceUpdateInterval=1e4,this.visibilityChangeHandler=()=>{document?.hidden?(clearInterval(this.interval),this.interval=void 0):this.startTokenPriceInterval()},this.startTokenPriceInterval=()=>{this.interval&&Date.now()-this.lastTokenPriceUpdate<this.minTokenPriceUpdateInterval||(this.lastTokenPriceUpdate&&Date.now()-this.lastTokenPriceUpdate>this.minTokenPriceUpdateInterval&&this.fetchTokensAndValues(),clearInterval(this.interval),this.interval=setInterval(()=>{this.fetchTokensAndValues()},this.minTokenPriceUpdateInterval))},this.watchTokensAndValues=()=>{!this.sourceToken||!this.toToken||(this.subscribeToVisibilityChange(),this.startTokenPriceInterval())},this.onDebouncedGetSwapCalldata=o.debounce(async()=>{await e.swapTokens()},200),this.subscribe({resetSwapState:!0,initializeSwapState:!1})(),this.unsubscribe.push(this.subscribe({resetSwapState:!1,initializeSwapState:!0}),r.subscribeKey(`open`,t=>{t||e.resetState()}),p.subscribeKey(`view`,t=>{t.includes(`Swap`)||e.resetValues()}),e.subscribe(e=>{this.initialized=e.initialized,this.loadingQuote=e.loadingQuote,this.loadingPrices=e.loadingPrices,this.loadingTransaction=e.loadingTransaction,this.sourceToken=e.sourceToken,this.sourceTokenAmount=e.sourceTokenAmount,this.sourceTokenPriceInUSD=e.sourceTokenPriceInUSD,this.toToken=e.toToken,this.toTokenAmount=e.toTokenAmount,this.toTokenPriceInUSD=e.toTokenPriceInUSD,this.inputError=e.inputError,this.fetchError=e.fetchError,e.sourceToken&&e.toToken&&this.watchTokensAndValues()}))}async firstUpdated(){e.initializeState(),this.watchTokensAndValues(),await this.handleSwapParameters()}disconnectedCallback(){this.unsubscribe.forEach(e=>e?.()),clearInterval(this.interval),document?.removeEventListener(`visibilitychange`,this.visibilityChangeHandler)}render(){return h`
      <wui-flex flexDirection="column" .padding=${[`0`,`4`,`4`,`4`]} gap="3">
        ${this.initialized?this.templateSwap():this.templateLoading()}
      </wui-flex>
    `}subscribeToVisibilityChange(){document?.removeEventListener(`visibilitychange`,this.visibilityChangeHandler),document?.addEventListener(`visibilitychange`,this.visibilityChangeHandler)}fetchTokensAndValues(){e.getNetworkTokenPrice(),e.getMyTokensWithBalance(),e.swapTokens(),this.lastTokenPriceUpdate=Date.now()}templateSwap(){return h`
      <wui-flex flexDirection="column" gap="3">
        <wui-flex flexDirection="column" alignItems="center" gap="2" class="swap-inputs-container">
          ${this.templateTokenInput(`sourceToken`,this.sourceToken)}
          ${this.templateTokenInput(`toToken`,this.toToken)} ${this.templateReplaceTokensButton()}
        </wui-flex>
        ${this.templateDetails()} ${this.templateActionButton()}
      </wui-flex>
    `}actionButtonLabel(){let e=!this.sourceTokenAmount||this.sourceTokenAmount===`0`;return this.fetchError?`Swap`:!this.sourceToken||!this.toToken?`Select token`:e?`Enter amount`:this.inputError?this.inputError:`Review swap`}templateReplaceTokensButton(){return h`
      <wui-flex class="replace-tokens-button-container">
        <wui-icon-box
          @click=${this.onSwitchTokens.bind(this)}
          icon="recycleHorizontal"
          size="md"
          variant="default"
        ></wui-icon-box>
      </wui-flex>
    `}templateLoading(){return h`
      <wui-flex flexDirection="column" gap="4">
        <wui-flex flexDirection="column" alignItems="center" gap="2" class="swap-inputs-container">
          <w3m-swap-input-skeleton target="sourceToken"></w3m-swap-input-skeleton>
          <w3m-swap-input-skeleton target="toToken"></w3m-swap-input-skeleton>
          ${this.templateReplaceTokensButton()}
        </wui-flex>
        ${this.templateActionButton()}
      </wui-flex>
    `}templateTokenInput(t,n){let r=e.state.myTokensWithBalance?.find(e=>e?.address===n?.address),a=t===`toToken`?this.toTokenAmount:this.sourceTokenAmount,o=t===`toToken`?this.toTokenPriceInUSD:this.sourceTokenPriceInUSD,s=i.parseLocalStringToNumber(a)*o;return h`<w3m-swap-input
      .value=${t===`toToken`?this.toTokenAmount:this.sourceTokenAmount}
      .disabled=${t===`toToken`}
      .onSetAmount=${this.handleChangeAmount.bind(this)}
      target=${t}
      .token=${n}
      .balance=${r?.quantity?.numeric}
      .price=${r?.price}
      .marketValue=${s}
      .onSetMaxValue=${this.onSetMaxValue.bind(this)}
    ></w3m-swap-input>`}onSetMaxValue(e,t){let n=i.bigNumber(t||`0`);this.handleChangeAmount(e,n.gt(0)?n.toFixed(20):`0`)}templateDetails(){return!this.sourceToken||!this.toToken||this.inputError?null:h`<w3m-swap-details .detailsOpen=${this.detailsOpen}></w3m-swap-details>`}handleChangeAmount(t,n){e.clearError(),t===`sourceToken`?e.setSourceTokenAmount(n):e.setToTokenAmount(n),this.onDebouncedGetSwapCalldata()}templateActionButton(){let e=!this.toToken||!this.sourceToken,t=!this.sourceTokenAmount||this.sourceTokenAmount===`0`,n=this.loadingQuote||this.loadingPrices||this.loadingTransaction,r=n||e||t||this.inputError;return h` <wui-flex gap="2">
      <wui-button
        data-testid="swap-action-button"
        class="action-button"
        fullWidth
        size="lg"
        borderRadius="xs"
        variant="accent-primary"
        ?loading=${!!n}
        ?disabled=${!!r}
        @click=${this.onSwapPreview.bind(this)}
      >
        ${this.actionButtonLabel()}
      </wui-button>
    </wui-flex>`}async onSwitchTokens(){await e.switchTokens()}async onSwapPreview(){this.fetchError&&await e.swapTokens(),a.sendEvent({type:`track`,event:`INITIATE_SWAP`,properties:{network:this.caipNetworkId||``,swapFromToken:this.sourceToken?.symbol||``,swapToToken:this.toToken?.symbol||``,swapFromAmount:this.sourceTokenAmount||``,swapToAmount:this.toTokenAmount||``,isSmartAccount:n(t.state.activeChain)===f.ACCOUNT_TYPES.SMART_ACCOUNT}}),p.push(`SwapPreview`)}async handleSwapParameters(){this.initialParams&&(e.state.initialized||await new Promise(t=>{let n=e.subscribeKey(`initialized`,e=>{e&&(n?.(),t())})}),await this.setSwapParameters(this.initialParams))}async setSwapParameters({amount:t,fromToken:n,toToken:r}){(!e.state.tokens||!e.state.myTokensWithBalance)&&await new Promise(t=>{let n=e.subscribeKey(`myTokensWithBalance`,e=>{e&&e.length>0&&(n?.(),t())});setTimeout(()=>{n?.(),t()},5e3)});let i=[...e.state.tokens||[],...e.state.myTokensWithBalance||[]];if(n){let t=i.find(e=>e.symbol.toLowerCase()===n.toLowerCase());t&&e.setSourceToken(t)}if(r){let t=i.find(e=>e.symbol.toLowerCase()===r.toLowerCase());t&&e.setToToken(t)}t&&!isNaN(Number(t))&&e.setSourceTokenAmount(t)}onCaipAddressChange({newCaipAddress:t,resetSwapState:n,initializeSwapState:r}){this.caipAddress!==t&&(this.caipAddress=t,n&&e.resetState(),r&&e.initializeState())}onCaipNetworkChange({newCaipNetwork:t,resetSwapState:n,initializeSwapState:r}){this.caipNetworkId!==t?.caipNetworkId&&(this.caipNetworkId=t?.caipNetworkId,n&&e.resetState(),r&&e.initializeState())}};N.styles=j,M([v({type:Object})],N.prototype,`initialParams`,void 0),M([_()],N.prototype,`interval`,void 0),M([_()],N.prototype,`detailsOpen`,void 0),M([_()],N.prototype,`caipAddress`,void 0),M([_()],N.prototype,`caipNetworkId`,void 0),M([_()],N.prototype,`initialized`,void 0),M([_()],N.prototype,`loadingQuote`,void 0),M([_()],N.prototype,`loadingPrices`,void 0),M([_()],N.prototype,`loadingTransaction`,void 0),M([_()],N.prototype,`sourceToken`,void 0),M([_()],N.prototype,`sourceTokenAmount`,void 0),M([_()],N.prototype,`sourceTokenPriceInUSD`,void 0),M([_()],N.prototype,`toToken`,void 0),M([_()],N.prototype,`toTokenAmount`,void 0),M([_()],N.prototype,`toTokenPriceInUSD`,void 0),M([_()],N.prototype,`inputError`,void 0),M([_()],N.prototype,`fetchError`,void 0),M([_()],N.prototype,`lastTokenPriceUpdate`,void 0),N=M([d(`w3m-swap-view`)],N);var P=c`
  :host > wui-flex:first-child {
    overflow-y: auto;
    overflow-x: hidden;
    scrollbar-width: none;
  }

  :host > wui-flex:first-child::-webkit-scrollbar {
    display: none;
  }

  .preview-container,
  .details-container {
    width: 100%;
  }

  .token-image {
    width: 24px;
    height: 24px;
    box-shadow: 0 0 0 2px ${({tokens:e})=>e.core.glass010};
    border-radius: 12px;
  }

  wui-loading-hexagon {
    position: absolute;
  }

  .token-item {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: ${({spacing:e})=>e[2]};
    padding: ${({spacing:e})=>e[2]};
    height: 40px;
    border: none;
    border-radius: 80px;
    background: ${({tokens:e})=>e.theme.foregroundPrimary};
    box-shadow: inset 0 0 0 1px ${({tokens:e})=>e.theme.foregroundPrimary};
    cursor: pointer;
    transition: background ${({durations:e})=>e.lg}
      ${({easings:e})=>e[`ease-out-power-2`]};
    will-change: background;
  }

  .token-item:hover {
    background: ${({tokens:e})=>e.core.glass010};
  }

  .preview-token-details-container {
    width: 100%;
  }

  .details-row {
    width: 100%;
    padding: ${({spacing:e})=>e[3]} ${({spacing:e})=>e[5]};
    border-radius: ${({borderRadius:e})=>e[3]};
    background: ${({tokens:e})=>e.theme.foregroundPrimary};
  }

  .action-buttons-container {
    width: 100%;
    gap: ${({spacing:e})=>e[2]};
  }

  .action-buttons-container > button {
    display: flex;
    align-items: center;
    justify-content: center;
    background: transparent;
    height: 48px;
    border-radius: ${({borderRadius:e})=>e[4]};
    border: none;
    box-shadow: inset 0 0 0 1px ${({tokens:e})=>e.core.glass010};
  }

  .action-buttons-container > button:disabled {
    opacity: 0.8;
    cursor: not-allowed;
  }

  .action-button > wui-loading-spinner {
    display: inline-block;
  }

  .cancel-button:hover,
  .action-button:hover {
    cursor: pointer;
  }

  .action-buttons-container > wui-button.cancel-button {
    flex: 2;
  }

  .action-buttons-container > wui-button.action-button {
    flex: 4;
  }

  .action-buttons-container > button.action-button > wui-text {
    color: white;
  }

  .details-container > wui-flex {
    background: ${({tokens:e})=>e.theme.foregroundPrimary};
    border-radius: ${({borderRadius:e})=>e[3]};
    width: 100%;
  }

  .details-container > wui-flex > button {
    border: none;
    background: none;
    padding: ${({spacing:e})=>e[3]};
    border-radius: ${({borderRadius:e})=>e[3]};
    transition: background ${({durations:e})=>e.lg}
      ${({easings:e})=>e[`ease-out-power-2`]};
    will-change: background;
  }

  .details-container > wui-flex > button:hover {
    background: ${({tokens:e})=>e.theme.foregroundPrimary};
  }

  .details-content-container {
    padding: ${({spacing:e})=>e[2]};
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .details-content-container > wui-flex {
    width: 100%;
  }

  .details-row {
    width: 100%;
    padding: ${({spacing:e})=>e[3]} ${({spacing:e})=>e[5]};
    border-radius: ${({borderRadius:e})=>e[3]};
    background: ${({tokens:e})=>e.theme.foregroundPrimary};
  }
`,F=function(e,t,n,r){var i=arguments.length,a=i<3?t:r===null?r=Object.getOwnPropertyDescriptor(t,n):r,o;if(typeof Reflect==`object`&&typeof Reflect.decorate==`function`)a=Reflect.decorate(e,t,n,r);else for(var s=e.length-1;s>=0;s--)(o=e[s])&&(a=(i<3?o(a):i>3?o(t,n,a):o(t,n))||a);return i>3&&a&&Object.defineProperty(t,n,a),a},I=class extends u{constructor(){super(),this.unsubscribe=[],this.detailsOpen=!0,this.approvalTransaction=e.state.approvalTransaction,this.swapTransaction=e.state.swapTransaction,this.sourceToken=e.state.sourceToken,this.sourceTokenAmount=e.state.sourceTokenAmount??``,this.sourceTokenPriceInUSD=e.state.sourceTokenPriceInUSD,this.balanceSymbol=t.getAccountData()?.balanceSymbol,this.toToken=e.state.toToken,this.toTokenAmount=e.state.toTokenAmount??``,this.toTokenPriceInUSD=e.state.toTokenPriceInUSD,this.caipNetwork=t.state.activeCaipNetwork,this.inputError=e.state.inputError,this.loadingQuote=e.state.loadingQuote,this.loadingApprovalTransaction=e.state.loadingApprovalTransaction,this.loadingBuildTransaction=e.state.loadingBuildTransaction,this.loadingTransaction=e.state.loadingTransaction,this.unsubscribe.push(t.subscribeChainProp(`accountState`,e=>{e?.balanceSymbol!==this.balanceSymbol&&p.goBack()}),t.subscribeKey(`activeCaipNetwork`,e=>{this.caipNetwork!==e&&(this.caipNetwork=e)}),e.subscribe(e=>{this.approvalTransaction=e.approvalTransaction,this.swapTransaction=e.swapTransaction,this.sourceToken=e.sourceToken,this.toToken=e.toToken,this.toTokenPriceInUSD=e.toTokenPriceInUSD,this.sourceTokenAmount=e.sourceTokenAmount??``,this.toTokenAmount=e.toTokenAmount??``,this.inputError=e.inputError,e.inputError&&p.goBack(),this.loadingQuote=e.loadingQuote,this.loadingApprovalTransaction=e.loadingApprovalTransaction,this.loadingBuildTransaction=e.loadingBuildTransaction,this.loadingTransaction=e.loadingTransaction}))}firstUpdated(){e.getTransaction(),this.refreshTransaction()}disconnectedCallback(){this.unsubscribe.forEach(e=>e?.()),clearInterval(this.interval)}render(){return h`
      <wui-flex flexDirection="column" .padding=${[`0`,`4`,`4`,`4`]} gap="3">
        ${this.templateSwap()}
      </wui-flex>
    `}refreshTransaction(){this.interval=setInterval(()=>{e.getApprovalLoadingState()||e.getTransaction()},1e4)}templateSwap(){let e=`${i.formatNumberToLocalString(parseFloat(this.sourceTokenAmount))} ${this.sourceToken?.symbol}`,t=`${i.formatNumberToLocalString(parseFloat(this.toTokenAmount))} ${this.toToken?.symbol}`,n=parseFloat(this.sourceTokenAmount)*this.sourceTokenPriceInUSD,r=parseFloat(this.toTokenAmount)*this.toTokenPriceInUSD,a=i.formatNumberToLocalString(n),o=i.formatNumberToLocalString(r),s=this.loadingQuote||this.loadingBuildTransaction||this.loadingTransaction||this.loadingApprovalTransaction;return h`
      <wui-flex flexDirection="column" alignItems="center" gap="4">
        <wui-flex class="preview-container" flexDirection="column" alignItems="flex-start" gap="4">
          <wui-flex
            class="preview-token-details-container"
            alignItems="center"
            justifyContent="space-between"
            gap="4"
          >
            <wui-flex flexDirection="column" alignItems="flex-start" gap="01">
              <wui-text variant="sm-regular" color="secondary">Send</wui-text>
              <wui-text variant="md-regular" color="primary">$${a}</wui-text>
            </wui-flex>
            <wui-token-button
              flexDirection="row-reverse"
              text=${e}
              imageSrc=${this.sourceToken?.logoUri}
            >
            </wui-token-button>
          </wui-flex>
          <wui-icon name="recycleHorizontal" color="default" size="md"></wui-icon>
          <wui-flex
            class="preview-token-details-container"
            alignItems="center"
            justifyContent="space-between"
            gap="4"
          >
            <wui-flex flexDirection="column" alignItems="flex-start" gap="01">
              <wui-text variant="sm-regular" color="secondary">Receive</wui-text>
              <wui-text variant="md-regular" color="primary">$${o}</wui-text>
            </wui-flex>
            <wui-token-button
              flexDirection="row-reverse"
              text=${t}
              imageSrc=${this.toToken?.logoUri}
            >
            </wui-token-button>
          </wui-flex>
        </wui-flex>

        ${this.templateDetails()}

        <wui-flex flexDirection="row" alignItems="center" justifyContent="center" gap="2">
          <wui-icon size="sm" color="default" name="info"></wui-icon>
          <wui-text variant="sm-regular" color="secondary">Review transaction carefully</wui-text>
        </wui-flex>

        <wui-flex
          class="action-buttons-container"
          flexDirection="row"
          alignItems="center"
          justifyContent="space-between"
          gap="2"
        >
          <wui-button
            class="cancel-button"
            fullWidth
            size="lg"
            borderRadius="xs"
            variant="neutral-secondary"
            @click=${this.onCancelTransaction.bind(this)}
          >
            <wui-text variant="md-medium" color="secondary">Cancel</wui-text>
          </wui-button>
          <wui-button
            class="action-button"
            fullWidth
            size="lg"
            borderRadius="xs"
            variant="accent-primary"
            ?loading=${s}
            ?disabled=${s}
            @click=${this.onSendTransaction.bind(this)}
          >
            <wui-text variant="md-medium" color="invert"> ${this.actionButtonLabel()} </wui-text>
          </wui-button>
        </wui-flex>
      </wui-flex>
    `}templateDetails(){return!this.sourceToken||!this.toToken||this.inputError?null:h`<w3m-swap-details .detailsOpen=${this.detailsOpen}></w3m-swap-details>`}actionButtonLabel(){return this.loadingApprovalTransaction?`Approving...`:this.approvalTransaction?`Approve`:`Swap`}onCancelTransaction(){p.goBack()}onSendTransaction(){this.approvalTransaction?e.sendTransactionForApproval(this.approvalTransaction):e.sendTransactionForSwap(this.swapTransaction)}};I.styles=P,F([_()],I.prototype,`interval`,void 0),F([_()],I.prototype,`detailsOpen`,void 0),F([_()],I.prototype,`approvalTransaction`,void 0),F([_()],I.prototype,`swapTransaction`,void 0),F([_()],I.prototype,`sourceToken`,void 0),F([_()],I.prototype,`sourceTokenAmount`,void 0),F([_()],I.prototype,`sourceTokenPriceInUSD`,void 0),F([_()],I.prototype,`balanceSymbol`,void 0),F([_()],I.prototype,`toToken`,void 0),F([_()],I.prototype,`toTokenAmount`,void 0),F([_()],I.prototype,`toTokenPriceInUSD`,void 0),F([_()],I.prototype,`caipNetwork`,void 0),F([_()],I.prototype,`inputError`,void 0),F([_()],I.prototype,`loadingQuote`,void 0),F([_()],I.prototype,`loadingApprovalTransaction`,void 0),F([_()],I.prototype,`loadingBuildTransaction`,void 0),F([_()],I.prototype,`loadingTransaction`,void 0),I=F([d(`w3m-swap-preview-view`)],I);var L=c`
  :host {
    width: 100%;
    height: 60px;
    min-height: 60px;
  }

  :host > wui-flex {
    cursor: pointer;
    height: 100%;
    display: flex;
    column-gap: ${({spacing:e})=>e[3]};
    padding: ${({spacing:e})=>e[2]};
    padding-right: ${({spacing:e})=>e[4]};
    width: 100%;
    background-color: transparent;
    border-radius: ${({borderRadius:e})=>e[4]};
    color: ${({tokens:e})=>e.theme.foregroundSecondary};
    transition:
      background-color ${({durations:e})=>e.lg}
        ${({easings:e})=>e[`ease-out-power-2`]},
      opacity ${({durations:e})=>e.lg} ${({easings:e})=>e[`ease-out-power-2`]};
    will-change: background-color, opacity;
  }

  @media (hover: hover) and (pointer: fine) {
    :host > wui-flex:hover {
      background-color: ${({tokens:e})=>e.theme.foregroundPrimary};
    }

    :host > wui-flex:active {
      background-color: ${({tokens:e})=>e.core.glass010};
    }
  }

  :host([disabled]) > wui-flex {
    opacity: 0.6;
  }

  :host([disabled]) > wui-flex:hover {
    background-color: transparent;
  }

  :host > wui-flex > wui-flex {
    flex: 1;
  }

  :host > wui-flex > wui-image,
  :host > wui-flex > .token-item-image-placeholder {
    width: 40px;
    max-width: 40px;
    height: 40px;
    border-radius: ${({borderRadius:e})=>e[20]};
    position: relative;
  }

  :host > wui-flex > .token-item-image-placeholder {
    display: flex;
    align-items: center;
    justify-content: center;
  }

  :host > wui-flex > wui-image::after,
  :host > wui-flex > .token-item-image-placeholder::after {
    position: absolute;
    content: '';
    inset: 0;
    box-shadow: inset 0 0 0 1px ${({tokens:e})=>e.core.glass010};
    border-radius: ${({borderRadius:e})=>e[8]};
  }

  button > wui-icon-box[data-variant='square-blue'] {
    border-radius: ${({borderRadius:e})=>e[2]};
    position: relative;
    border: none;
    width: 36px;
    height: 36px;
  }
`,R=function(e,t,n,r){var i=arguments.length,a=i<3?t:r===null?r=Object.getOwnPropertyDescriptor(t,n):r,o;if(typeof Reflect==`object`&&typeof Reflect.decorate==`function`)a=Reflect.decorate(e,t,n,r);else for(var s=e.length-1;s>=0;s--)(o=e[s])&&(a=(i<3?o(a):i>3?o(t,n,a):o(t,n))||a);return i>3&&a&&Object.defineProperty(t,n,a),a},z=class extends u{constructor(){super(),this.observer=new IntersectionObserver(()=>void 0),this.imageSrc=void 0,this.name=void 0,this.symbol=void 0,this.price=void 0,this.amount=void 0,this.visible=!1,this.imageError=!1,this.observer=new IntersectionObserver(e=>{e.forEach(e=>{e.isIntersecting?this.visible=!0:this.visible=!1})},{threshold:.1})}firstUpdated(){this.observer.observe(this)}disconnectedCallback(){this.observer.disconnect()}render(){if(!this.visible)return null;let e=this.amount&&this.price?i.multiply(this.price,this.amount)?.toFixed(3):null;return h`
      <wui-flex alignItems="center">
        ${this.visualTemplate()}
        <wui-flex flexDirection="column" gap="1">
          <wui-flex justifyContent="space-between">
            <wui-text variant="md-medium" color="primary" lineClamp="1">${this.name}</wui-text>
            ${e?h`
                  <wui-text variant="md-medium" color="primary">
                    $${i.formatNumberToLocalString(e,3)}
                  </wui-text>
                `:null}
          </wui-flex>
          <wui-flex justifyContent="space-between">
            <wui-text variant="sm-regular" color="secondary" lineClamp="1">${this.symbol}</wui-text>
            ${this.amount?h`<wui-text variant="sm-regular" color="secondary">
                  ${i.formatNumberToLocalString(this.amount,5)}
                </wui-text>`:null}
          </wui-flex>
        </wui-flex>
      </wui-flex>
    `}visualTemplate(){return this.imageError?h`<wui-flex class="token-item-image-placeholder">
        <wui-icon name="image" color="inherit"></wui-icon>
      </wui-flex>`:this.imageSrc?h`<wui-image
        width="40"
        height="40"
        src=${this.imageSrc}
        @onLoadError=${this.imageLoadError}
      ></wui-image>`:null}imageLoadError(){this.imageError=!0}};z.styles=[s,l,L],R([v()],z.prototype,`imageSrc`,void 0),R([v()],z.prototype,`name`,void 0),R([v()],z.prototype,`symbol`,void 0),R([v()],z.prototype,`price`,void 0),R([v()],z.prototype,`amount`,void 0),R([_()],z.prototype,`visible`,void 0),R([_()],z.prototype,`imageError`,void 0),z=R([d(`wui-token-list-item`)],z);var B=c`
  :host {
    width: 100%;
  }

  :host > wui-flex {
    cursor: pointer;
    height: 100%;
    width: 100%;
    display: flex;
    column-gap: ${({spacing:e})=>e[3]};
    padding: ${({spacing:e})=>e[2]};
    padding-right: ${({spacing:e})=>e[4]};
  }

  wui-flex {
    display: flex;
    flex: 1;
  }
`,V=function(e,t,n,r){var i=arguments.length,a=i<3?t:r===null?r=Object.getOwnPropertyDescriptor(t,n):r,o;if(typeof Reflect==`object`&&typeof Reflect.decorate==`function`)a=Reflect.decorate(e,t,n,r);else for(var s=e.length-1;s>=0;s--)(o=e[s])&&(a=(i<3?o(a):i>3?o(t,n,a):o(t,n))||a);return i>3&&a&&Object.defineProperty(t,n,a),a},H=class extends u{render(){return h`
      <wui-flex alignItems="center">
        <wui-shimmer width="40px" height="40px"></wui-shimmer>
        <wui-flex flexDirection="column" gap="1">
          <wui-shimmer width="72px" height="16px" borderRadius="4xs"></wui-shimmer>
          <wui-shimmer width="148px" height="14px" borderRadius="4xs"></wui-shimmer>
        </wui-flex>
        <wui-flex flexDirection="column" gap="1" alignItems="flex-end">
          <wui-shimmer width="24px" height="12px" borderRadius="4xs"></wui-shimmer>
          <wui-shimmer width="32px" height="12px" borderRadius="4xs"></wui-shimmer>
        </wui-flex>
      </wui-flex>
    `}};H.styles=[s,B],H=V([d(`wui-token-list-item-loader`)],H);var U=c`
  :host {
    --tokens-scroll--top-opacity: 0;
    --tokens-scroll--bottom-opacity: 1;
    --suggested-tokens-scroll--left-opacity: 0;
    --suggested-tokens-scroll--right-opacity: 1;
  }

  :host > wui-flex:first-child {
    overflow-y: hidden;
    overflow-x: hidden;
    scrollbar-width: none;
    scrollbar-height: none;
  }

  :host > wui-flex:first-child::-webkit-scrollbar {
    display: none;
  }

  wui-loading-hexagon {
    position: absolute;
  }

  .suggested-tokens-container {
    overflow-x: auto;
    mask-image: linear-gradient(
      to right,
      rgba(0, 0, 0, calc(1 - var(--suggested-tokens-scroll--left-opacity))) 0px,
      rgba(200, 200, 200, calc(1 - var(--suggested-tokens-scroll--left-opacity))) 1px,
      black 50px,
      black 90px,
      black calc(100% - 90px),
      black calc(100% - 50px),
      rgba(155, 155, 155, calc(1 - var(--suggested-tokens-scroll--right-opacity))) calc(100% - 1px),
      rgba(0, 0, 0, calc(1 - var(--suggested-tokens-scroll--right-opacity))) 100%
    );
  }

  .suggested-tokens-container::-webkit-scrollbar {
    display: none;
  }

  .tokens-container {
    border-top: 1px solid ${({tokens:e})=>e.core.glass010};
    height: 100%;
    max-height: 390px;
  }

  .tokens {
    width: 100%;
    overflow-y: auto;
    mask-image: linear-gradient(
      to bottom,
      rgba(0, 0, 0, calc(1 - var(--tokens-scroll--top-opacity))) 0px,
      rgba(200, 200, 200, calc(1 - var(--tokens-scroll--top-opacity))) 1px,
      black 50px,
      black 90px,
      black calc(100% - 90px),
      black calc(100% - 50px),
      rgba(155, 155, 155, calc(1 - var(--tokens-scroll--bottom-opacity))) calc(100% - 1px),
      rgba(0, 0, 0, calc(1 - var(--tokens-scroll--bottom-opacity))) 100%
    );
  }

  .network-search-input,
  .select-network-button {
    height: 40px;
  }

  .select-network-button {
    border: none;
    display: flex;
    flex-direction: row;
    align-items: center;
    justify-content: center;
    gap: ${({spacing:e})=>e[2]};
    box-shadow: inset 0 0 0 1px ${({tokens:e})=>e.core.glass010};
    background-color: transparent;
    border-radius: ${({borderRadius:e})=>e[3]};
    padding: ${({spacing:e})=>e[2]};
    align-items: center;
    transition: background-color ${({durations:e})=>e.lg}
      ${({easings:e})=>e[`ease-out-power-2`]};
    will-change: background-color;
  }

  .select-network-button:hover {
    background-color: ${({tokens:e})=>e.theme.foregroundPrimary};
  }

  .select-network-button > wui-image {
    width: 26px;
    height: 26px;
    border-radius: ${({borderRadius:e})=>e[4]};
    box-shadow: inset 0 0 0 1px ${({tokens:e})=>e.core.glass010};
  }
`,W=function(e,t,n,r){var i=arguments.length,a=i<3?t:r===null?r=Object.getOwnPropertyDescriptor(t,n):r,o;if(typeof Reflect==`object`&&typeof Reflect.decorate==`function`)a=Reflect.decorate(e,t,n,r);else for(var s=e.length-1;s>=0;s--)(o=e[s])&&(a=(i<3?o(a):i>3?o(t,n,a):o(t,n))||a);return i>3&&a&&Object.defineProperty(t,n,a),a},G=class extends u{constructor(){super(),this.unsubscribe=[],this.targetToken=p.state.data?.target,this.sourceToken=e.state.sourceToken,this.sourceTokenAmount=e.state.sourceTokenAmount,this.toToken=e.state.toToken,this.myTokensWithBalance=e.state.myTokensWithBalance,this.popularTokens=e.state.popularTokens,this.suggestedTokens=e.state.suggestedTokens,this.tokensLoading=e.state.tokensLoading,this.searchValue=``,this.unsubscribe.push(e.subscribe(e=>{this.sourceToken=e.sourceToken,this.toToken=e.toToken,this.myTokensWithBalance=e.myTokensWithBalance,this.popularTokens=e.popularTokens,this.suggestedTokens=e.suggestedTokens,this.tokensLoading=e.tokensLoading}))}async firstUpdated(){await e.getTokenList()}updated(){(this.renderRoot?.querySelector(`.suggested-tokens-container`))?.addEventListener(`scroll`,this.handleSuggestedTokensScroll.bind(this)),(this.renderRoot?.querySelector(`.tokens`))?.addEventListener(`scroll`,this.handleTokenListScroll.bind(this))}disconnectedCallback(){super.disconnectedCallback();let e=this.renderRoot?.querySelector(`.suggested-tokens-container`),t=this.renderRoot?.querySelector(`.tokens`);e?.removeEventListener(`scroll`,this.handleSuggestedTokensScroll.bind(this)),t?.removeEventListener(`scroll`,this.handleTokenListScroll.bind(this)),clearInterval(this.interval)}render(){return h`
      <wui-flex flexDirection="column" gap="3">
        ${this.templateSearchInput()} ${this.templateSuggestedTokens()} ${this.templateTokens()}
      </wui-flex>
    `}onSelectToken(t){this.targetToken===`sourceToken`?e.setSourceToken(t):(e.setToToken(t),this.sourceToken&&this.sourceTokenAmount&&e.swapTokens()),p.goBack()}templateSearchInput(){return h`
      <wui-flex .padding=${[`1`,`3`,`0`,`3`]} gap="2">
        <wui-input-text
          data-testid="swap-select-token-search-input"
          class="network-search-input"
          size="sm"
          placeholder="Search token"
          icon="search"
          .value=${this.searchValue}
          @inputChange=${this.onSearchInputChange.bind(this)}
        ></wui-input-text>
      </wui-flex>
    `}templateMyTokens(){let e=this.myTokensWithBalance?Object.values(this.myTokensWithBalance):[],t=this.filterTokensWithText(e,this.searchValue);return t?.length>0?h`<wui-flex justifyContent="flex-start" padding="2">
          <wui-text variant="md-medium" color="secondary">Your tokens</wui-text>
        </wui-flex>
        ${t.map(e=>{let t=e.symbol===this.sourceToken?.symbol||e.symbol===this.toToken?.symbol;return h`
            <wui-token-list-item
              data-testid="swap-select-token-item-${e.symbol}"
              name=${e.name}
              ?disabled=${t}
              symbol=${e.symbol}
              price=${e?.price}
              amount=${e?.quantity?.numeric}
              imageSrc=${e.logoUri}
              @click=${()=>{t||this.onSelectToken(e)}}
            >
            </wui-token-list-item>
          `})}`:null}templateAllTokens(){let e=this.popularTokens?this.popularTokens:[],t=this.filterTokensWithText(e,this.searchValue);return this.tokensLoading?h`
        <wui-token-list-item-loader></wui-token-list-item-loader>
        <wui-token-list-item-loader></wui-token-list-item-loader>
        <wui-token-list-item-loader></wui-token-list-item-loader>
        <wui-token-list-item-loader></wui-token-list-item-loader>
        <wui-token-list-item-loader></wui-token-list-item-loader>
      `:t?.length>0?h`
        ${t.map(e=>h`
            <wui-token-list-item
              data-testid="swap-select-token-item-${e.symbol}"
              name=${e.name}
              symbol=${e.symbol}
              imageSrc=${e.logoUri}
              @click=${()=>this.onSelectToken(e)}
            >
            </wui-token-list-item>
          `)}
      `:null}templateTokens(){return h`
      <wui-flex class="tokens-container">
        <wui-flex class="tokens" .padding=${[`0`,`2`,`2`,`2`]} flexDirection="column">
          ${this.templateMyTokens()}
          <wui-flex justifyContent="flex-start" padding="3">
            <wui-text variant="md-medium" color="secondary">Tokens</wui-text>
          </wui-flex>
          ${this.templateAllTokens()}
        </wui-flex>
      </wui-flex>
    `}templateSuggestedTokens(){let e=this.suggestedTokens?this.suggestedTokens.slice(0,8):null;return this.tokensLoading?h`
        <wui-flex
          class="suggested-tokens-container"
          .padding=${[`0`,`3`,`0`,`3`]}
          gap="2"
        >
          <wui-token-button loading></wui-token-button>
          <wui-token-button loading></wui-token-button>
          <wui-token-button loading></wui-token-button>
          <wui-token-button loading></wui-token-button>
          <wui-token-button loading></wui-token-button>
        </wui-flex>
      `:e?h`
      <wui-flex
        class="suggested-tokens-container"
        .padding=${[`0`,`3`,`0`,`3`]}
        gap="2"
      >
        ${e.map(e=>h`
            <wui-token-button
              text=${e.symbol}
              imageSrc=${e.logoUri}
              @click=${()=>this.onSelectToken(e)}
            >
            </wui-token-button>
          `)}
      </wui-flex>
    `:null}onSearchInputChange(e){this.searchValue=e.detail}handleSuggestedTokensScroll(){let e=this.renderRoot?.querySelector(`.suggested-tokens-container`);e&&(e.style.setProperty(`--suggested-tokens-scroll--left-opacity`,g.interpolate([0,100],[0,1],e.scrollLeft).toString()),e.style.setProperty(`--suggested-tokens-scroll--right-opacity`,g.interpolate([0,100],[0,1],e.scrollWidth-e.scrollLeft-e.offsetWidth).toString()))}handleTokenListScroll(){let e=this.renderRoot?.querySelector(`.tokens`);e&&(e.style.setProperty(`--tokens-scroll--top-opacity`,g.interpolate([0,100],[0,1],e.scrollTop).toString()),e.style.setProperty(`--tokens-scroll--bottom-opacity`,g.interpolate([0,100],[0,1],e.scrollHeight-e.scrollTop-e.offsetHeight).toString()))}filterTokensWithText(e,t){return e.filter(e=>`${e.symbol} ${e.name} ${e.address}`.toLowerCase().includes(t.toLowerCase())).sort((e,n)=>{let r=`${e.symbol} ${e.name} ${e.address}`.toLowerCase(),i=`${n.symbol} ${n.name} ${n.address}`.toLowerCase();return r.indexOf(t.toLowerCase())-i.indexOf(t.toLowerCase())})}};G.styles=U,W([_()],G.prototype,`interval`,void 0),W([_()],G.prototype,`targetToken`,void 0),W([_()],G.prototype,`sourceToken`,void 0),W([_()],G.prototype,`sourceTokenAmount`,void 0),W([_()],G.prototype,`toToken`,void 0),W([_()],G.prototype,`myTokensWithBalance`,void 0),W([_()],G.prototype,`popularTokens`,void 0),W([_()],G.prototype,`suggestedTokens`,void 0),W([_()],G.prototype,`tokensLoading`,void 0),W([_()],G.prototype,`searchValue`,void 0),G=W([d(`w3m-swap-select-token-view`)],G);export{I as W3mSwapPreviewView,G as W3mSwapSelectTokenView,N as W3mSwapView};
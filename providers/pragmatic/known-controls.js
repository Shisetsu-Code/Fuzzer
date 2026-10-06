/** Conservative discovery filter: known base UI only; feature context wins. */
export function knownControlKind(control){
 const events=(control.handlers||[]).flatMap(h=>[h.event,h.catEventPress,h.catEventRelease,h.catEventClick]).filter(Boolean).join(' ');
 const name=String(control.name||''),path=String(control.path||'').replace(/\/VisibleInSpecialFeature(?=\/|$)/ig,'');
 const text=name+' '+path+' '+events;
 if(/smart(?:increase|decrease)bet|Evt_DataToCode_(?:Increase|Decrease)Bet/i.test(events)||/^(?:BetUp_Button|BetDown_Button|BetPlus_Button|BetMinus_Button)$/i.test(name))return 'base_bet';
 if(/buy|purchase|ante|bonus|feature|free.?spins?|respins?|chance|booster|pick|choice|collect|continue|intro/i.test(text))return null;
 if(/autoplay/i.test(text))return 'autoplay';
 if(/paytable|pay.?table|playtable/i.test(text))return 'paytable';
 if(/smart(?:increase|decrease)bet|(?:increase|decrease)bet|bet(?:up|down|plus|minus)[_\s/]|\/BetButtons\//i.test(text))return 'base_bet';
 // Stop may appear only after a purchase response, before the picker. It is
 // base animation input, not a new branch; operation recovery owns its use.
 if(/Evt_DataToCode_Pressed_Stop\b/i.test(events)||/^StopSpin_Button$/i.test(name))return 'stop';
 if(/Evt_DataToCode_Pressed_Spin\b/i.test(events)||/^(?:StartSpin_Button|SpinButton|Spin_Button)$/i.test(name))return 'spin';
 if(/Pressed_SoundBtn|SoundButtons|SoundOn|SoundOff|MuteButton|VolumeButton/i.test(text))return 'sound';
 if(/\/(?:GameSpeed|HyperPlay)\/|\/Turbo(?:Buttons)?\//i.test(path)||/^(?:TurboButton|QuickSpinButton|HiperPlayDisabled)$/i.test(name))return 'speed';
 if(/\/(?:Settings|SettingsMenu|MenuButtons|MenuButton|MenuOpenClose|MainMenu)\//i.test(path)||/^(?:SettingsButton|MenuButton)$/i.test(name))return 'settings';
 if(/MoneyAndCoinsSwitcher|BalanceDisplay|CreditDisplay/i.test(text))return 'balance_display';
 return null;
}
/** Adjustment controls are configuration only, and only in an observed menu. */
export function wagerAdjustmentDirection(control){
 const text=[control.name,...(control.handlers||[]).flatMap(h=>[h.event,h.catEventPress,h.catEventRelease,h.catEventClick])].filter(Boolean).join(' ');
 if(/(?:smart)?increasebet|Bet(?:Up|Plus)_Button/i.test(text))return 'increase';
 if(/(?:smart)?decreasebet|Bet(?:Down|Minus)_Button/i.test(text))return 'decrease';
 return null;
}
export function filterKnownControls(controls,{requireHitRect=false,includeWagerAdjustments=false,menuOpen=false}={}){
 const keep=[],discarded=[],unresolved=[];
 for(const original of controls){
  const kind=knownControlKind(original),direction=kind==='base_bet'&&includeWagerAdjustments&&menuOpen?wagerAdjustmentDirection(original):null;
  const control=direction?{...original,role:'wager-adjustment',wagerDirection:direction}:original,rect=control.hit_rect;
  if(kind&&!direction)discarded.push({...control,discard_reason:kind});
  else if(requireHitRect&&(!rect||![rect.x,rect.y,rect.width,rect.height].every(Number.isFinite)||rect.width<=0||rect.height<=0))unresolved.push({...control,reason:'NO_PROJECTED_HIT_RECT'});
  else keep.push(control);
 }
 keep.sort((a,b)=>Number(a.role==='wager-adjustment')-Number(b.role==='wager-adjustment'));
 return {keep,discarded,unresolved};
}

/** Legacy and V2 menus differ in their runtime flags. Projected, enabled
 * purchase-window controls are direct evidence; the entry button is not. */
export function purchaseMenuContext(controls,reported={}){
 const modal=(controls||[]).some(c=>{
  const r=c.hit_rect;
  return c.enabled!==false&&r&&[r.x,r.y,r.width,r.height].every(Number.isFinite)&&r.width>0&&r.height>0&&
   (c.handlers||[]).length>0&&/\/FeaturePurchase\/(?:FSPurchaseWindow|FSPurchaseOptions)(?:\/|$)/i.test(String(c.path||''));
 });
 return {...reported,open:reported.open===true||modal,source:modal?'OBSERVED_PURCHASE_CONTROLS':reported.open===true?'RUNTIME_FLAG':'NOT_OBSERVED'};
}

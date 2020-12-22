const raf = window.requestAnimationFrame || (cb => window.setTimeout(cb, 1000 / 60))

export function bindEvents(){
  this.eventsRefs = this.eventsRefs || {
    change: e => {
      // only knobs' inputs have a "name" attribute
      if( !e.target.name ) return

      this.setKnobChangedFlag( this.getKnobElm(e.target.name) )
      this.onChange(e)
    },
    input: e => {
      try{
        let isSectionToggler = e.target.classList.contains('toggleSection'),
            groupElm,
            sectionHeight;

        // previously used "resizeObserver", but in Firefox the resize callback is called only after and not during every frame of the resize,
        // so this hacky-approach beflow is needed to adjust the offset of the iframe *before* the knobs group section is expanded
        if( isSectionToggler && e.target.checked ){
          groupElm = e.target.parentNode.querySelector('.fieldset__group')
          sectionHeight = groupElm.style.getPropertyValue('--height');
          this.setIframeProps({ heightOffset:sectionHeight })
        }
      }
      catch(err){}

      if( !e.target.name ) return

      this.onInput(e)
      this.onChange(e)
    },
    transitionend: e => {
      if( e.target.classList.contains('fieldset__group') ){
        this.setIframeProps()
      }
    },
    wheel: e => {
      // disable window scroll: https://stackoverflow.com/a/23606063/104380
      e.preventDefault()

      const { value, max, step } = e.target,
        delta = Math.sign(e.deltaY) * (+step||1) * -1 // normalize jump value to either -1 or 1

      if( value && max ){
        e.target.value = Math.min(Math.max(+value + delta, 0), +max)
        this.onInput(e)
        this.onChange(e)
  }
    },
    mainToggler: e => this.toggle(e.target.checked),
    reset : this.applyKnobs.bind(this, null, true),
    submit: this.onSubmit.bind(this),
    click : this.onClick.bind(this),
    focusin : this.onFocus.bind(this)
  };

  [
    ['form', 'change'],
    ['form', 'input'],
    ['form', 'reset'],
    ['form', 'submit'],
    ['form', 'focusin'],
    ['form', 'transitionend'],
    ['scope', 'click'],
    ['scope', 'wheel'],
    ['mainToggler', 'change', this.eventsRefs.mainToggler],
  ].forEach(([elm, event, cb]) =>
    this.DOM[elm].addEventListener(event,  cb || this.eventsRefs[event].bind(this), { passive:false })
  )

  // window.addEventListener('storage', this.eventsRefs.onStorage)
}

export function onFocus(e) {
  if( e.target.dataset.type == 'color' )
    setTimeout(_ => this.toggleColorPicker(e.target), 100)
}

export function onInput(e){
  const inputElm = e.target,
        value = inputElm.value,
        { label } = this.getKnobDataByName(e.target.name)

  inputElm.parentNode.style.setProperty('--value', value);
  inputElm.parentNode.style.setProperty('--text-value', JSON.stringify(value))

  if( value != undefined && label )
    this.getSetPersistedData({ [label]:inputElm.type == 'checkbox' ? [inputElm.checked, value]: value })
}

export function onChange(e){
  var knobData = this.getKnobDataByName(e.target.name),
      runOnInput = e.type == 'input' && knobData && knobData.type != 'range', // forgot why I wrote this
      isCheckbox = knobData && knobData.type == 'checkbox',
      updatedData;

  if( !knobData )
    return

  if( !isCheckbox && !this.settings.live )
    return

  if( e.type == 'input' && runOnInput )
    return

  updatedData = { ...knobData, value:e.target.value }

  raf(() => this.updateDOM(updatedData))

  typeof knobData.onChange == 'function' && knobData.onChange(e, updatedData)
}

/**
* Applys changes manually if `settings.live` is `false`
*/
export function onSubmit(e){
  e.preventDefault()

  var elements = e.target.querySelectorAll('input')
  this.settings.live = true
  elements.forEach(elm => this.onChange({ target:{value:elm.value, name:elm.name} }))
  this.settings.live = false
  return false
}

export function onClick(e){
  var target = e.target,
      is = n => target.classList.contains(n)

  if( is('knobs__knob__reset') )
    this.resetKnobByName(target.name)

  this.hideColorPickers()
}
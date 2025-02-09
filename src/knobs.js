import ColorPicker from '@yaireo/color-picker'
import mainStyles from './styles/styles.scss'
import hostStyles from './styles/host.scss'
import colorPickerStyles from '@yaireo/color-picker/dist/styles.css'
import isObject from './utils/isObject'
import parseHTML from './utils/parseHTML'
import { mergeDeep } from './utils/mergeDeep'
import isModernBrowser from './utils/isModernBrowser'
import position from './utils/position'
import cloneKnobs from './cloneKnobs'
import * as templates from './templates'
import * as events from './events'
import * as persist from './persist'
import DEFAULTS from './defaults'

function Knobs(settings){
  // since Knobs relies on CSS variables, no need to proceed if browser support is inadequate
  if ( !isModernBrowser())
    return this

  const { knobs = [], ...restOfSettings } = settings || {}

  // for the rest, deep cloining appear to work fine
  this.settings = mergeDeep({...DEFAULTS, appendTo:document.body}, restOfSettings)
  this.knobs = knobs
  this.DOM = {}
  this.state = {}
  this.build()
}

Knobs.prototype = {
  _types: ['range', 'color', 'checkbox', 'text'],

  ...events,
  ...persist,

  cloneKnobs,

  /**
   * "Knobs" property setter
   */
  set knobs(knobs){
    if( knobs && knobs instanceof Array ){
      // manual deep-clone the "knobs" setting, because for hours I couldn't find a single piece of code
      // on the internet which was able to correctly clone it
      this._knobs = this.cloneKnobs(knobs, this.getPersistedData())
      this.DOM && this.render()
    }
  },

  /**
   * "knobs" property getter
   */
  get knobs(){
    return this._knobs
  },

  /**
   * Generate styles for the iframe using the "theme" property in the settings
   * @param {Object} vars
   */
  getCSSVariables({ flow, styles, RTL, position, ...vars }){
    var output = '', p;

    // "knobsToggle" is not in the "theme" prop, and it's a special case where a variable is needed
    if( this.settings.knobsToggle )
      vars['knobs-toggle'] = 1

    for( p in vars )
      output += `--${p}:${vars[p]}; `

    return output
  },

  /**
   * Try to extract & parse CSS variables which would be used as default values
   * for knobs wgucg has no "value" property defined.
   * @param {Object} data Knobs data
   */
  getKnobValueFromCSSVar( data ){
    let value

    // when/if "value" property is unspecified in the knob's data, assume
    // there's a CSS variable already set, so try to get the value from it:
    if( !("value" in data) && data.cssVar && data.cssVar.length ){
      let CSSVarTarget = data.cssVar[2] || this.settings.CSSVarTarget

      if( CSSVarTarget.length )
        CSSVarTarget = CSSVarTarget[0]

      value = getComputedStyle(CSSVarTarget).getPropertyValue(`--${data.cssVar[0]}`).trim()

      // if type "range" - parse value as unitless
      if( data.type == 'range' )
        value = parseInt(value)

      // if type "color" - parse value as color
      if( data.type == 'color' && !value )
        value = 'transparent'

      // if type "checkbox" - if variable exists it means the value should be "true"

      // if( isNaN(value) )
      //   console.warn("@yaireo/knobs -", "Unable to parse variable value:", data.cssVar[0])

      return value
    }
  },

  templates,

  hideColorPickers( exceptNode ){
    document.querySelectorAll('.color-picker').forEach(elm => elm != exceptNode && elm.classList.add('hidden'))
  },

  toggleColorPicker( inputElm, pos ){
    const { value } = inputElm,
          // { position } = this.settings.theme,
          // totalHeight = this.DOM.scope.clientHeight,
          that = this

    let cPicker = inputElm.colorPicker

    // if already visible, hide
    if( cPicker && !cPicker.DOM.scope.classList.contains('hidden') ){
      cPicker.DOM.scope.classList.add('hidden')
      return
    }

    cPicker = cPicker || new ColorPicker({
      color: value,
      className: 'hidden',
      swatches: [],
      swatchesLocalStorage: true,

      // because the color-picker is outside the iframe, "onClickOutside" will not register
      // clicked within the iframe (knobs area).
      onClickOutside(e){
        if( !cPicker.DOM.scope.classList.contains('hidden')  )
        that.hideColorPickers( cPicker.DOM.scope )

        let action = 'add'

        // if clicked on the input element, toggle picker's visibility
        if( e.target == inputElm )
          action = 'toggle'

        // if "escape" key was pressed, add the "hidden" class
        if( e.key == 'Escape' )
          action = 'add'

        cPicker.DOM.scope.classList[action]('hidden')
      },

      onInput(color){
        inputElm.value = color
        that.onInput({ type:'input', target:inputElm })
        that.onChange({ type:'change', target:inputElm })
      },
    })

    // cPicker.setColor(value)

    if( !document.body.contains(cPicker.DOM.scope) ){
      inputElm.colorPicker = cPicker
      document.body.appendChild(cPicker.DOM.scope)
    }

    // small delay before the Node is safely in the DOM
    setTimeout(()=>{
      position(cPicker.DOM.scope, pos)
      cPicker.DOM.scope.classList.remove('hidden')
    }, 100)

    // adjust screen position offsets to the color picker
    // const colorPickerHeight = cPicker.DOM.scope.clientHeight
    // if( totalHeight >= colorPickerHeight ){
    //   if( position.includes('top') ){
    //     cPicker.DOM.scope.style.setProperty('--offset', colorPickerHeight + (totalHeight - colorPickerHeight)/2)
    //   }
    // }
  },

  /**
   *
   * @param {Object} data Knob input properties to be applied, excluding some
   * @returns String
   */
  knobAttrs(data){
    var attributes = `name="${data.__name}" is-knob-input`,
        blacklist = ['label', 'type', 'onchange', 'options', 'selected', 'cssvar', '__name', 'istoggled', 'defaultchecked', 'defaultvalue']

    for( var attr in data ){
      if( attr == 'checked' && !data[attr] ) continue
      if( !blacklist.includes(attr.toLowerCase()) )
        attributes += ` ${attr}="${data[attr]}"`
    }

    return attributes
  },

  getKnobDataByName( name ){
    return this._knobs.filter(Boolean).find(d => d.__name == name)
  },

  /**
   * Set (multiple) key/value properties for a certain Knob
   * @param {String} name knob's name
   * @param {Object} d Data to set (key/value)
   */
  setKnobDataByName( name, d){
    if( name && d && isObject(d) ){
      const knobData = this.getKnobDataByName(name)

      for( let key in d )
        // if type number, cast
        knobData[key] = +d[key] == d[key] ? +d[key] : d[key]
    }
  },

  getInputByName( name ){
    return this.DOM.scope.querySelector(`[name="${name}"`)
  },

  getKnobElm( name ){
    const node = this.getInputByName(name)
    return node ? node.closest('.knobs__knob') : undefined
  },

  /**
   * Get all other knobs which also affect the same CSS variables and change their value
   */
  getSimilarKnobs( toKnob ){
    return this.knobs.filter(knob =>
      knob?.cssVar?.[0] &&
      knob?.cssVar?.[0] == toKnob?.cssVar?.[0] && // affects same CSS variable
      knob.__name != toKnob.__name // exclude itself
    )
  },

  /**
   * sets the parent of an input element with some CSS variables
   * @param {HTMLElement} inputElm input element
   */
  setParentNodeValueVars( inputElm ){
    inputElm && [
      ['--value', inputElm.value],
      ['--text-value', JSON.stringify(inputElm.value)]
    ].forEach(([name, value]) => inputElm?.parentNode.style.setProperty(name, value))
  },

  /**
   * updates the relevant DOM node (if CSS variable is applied)
   * should fire from a knob's input's (onchange) event listener
   * @param {Object}
   */
  updateDOM({ cssVar, value, type, isToggled, __name:name }){
    if( !cssVar || !cssVar.length ) return

    var [cssVarName, cssVarUnit, CSSVarTarget] = cssVar,
        targetElms = CSSVarTarget || this.settings.CSSVarTarget,
        knobInput = this.getInputByName(name),
        action = 'setProperty';

    if( !isToggled || (type == 'checkbox' && knobInput && !knobInput.checked) )
      action = 'removeProperty';

    // units which are prefixed with '-' should not be used, and for presentational purposes only
    if( cssVarUnit && cssVarUnit[0] == '-' )
      cssVarUnit = '';

    // if is a refference to a single-node, place in an array.
    // cannot use instanceof to check if is an element because some elements might be in iframes:
    // https://stackoverflow.com/a/14391528/104380
    if( Object.prototype.toString.call(targetElms).includes("Element") )
      targetElms = [targetElms]

    if( targetElms && targetElms.length && value !== undefined && cssVarName )
      for( let elm of targetElms )
        elm.style[action](`--${cssVarName}`, value + (cssVarUnit||''));
  },

  /**
   * Apply all knobs (or a single knob) changes and fire all knobs' "onChange" callbacks
   * @param {Object} knobsData specific knobs to apply to
   * @param {Boolean} reset should the value reset before applying
   */
  applyKnobs( knobsData, reset ){
    (knobsData || this._knobs).forEach(d => {
      const isType = name => d.type == name

      var inputElm = this.getInputByName(d.__name),
      e = { target:inputElm },
      vKey = reset ? 'defaultValue' : 'value',
      checkedKey = reset ? 'defaultChecked' : 'checked',
      resetTitle;

      this.setParentNodeValueVars(inputElm)

      if( !d || !d.type || d.isToggled === false ) return

      if( isType('checkbox') ){
        resetTitle = inputElm.checked = !!d.checked
        inputElm.checked = d[checkedKey]
      }
      else
        resetTitle = inputElm.value = d[vKey]

      this.setResetKnobTitle(d.__name, resetTitle)

      // wrote this specifically for knobs of type "select" which other knobs might also affect the same CSS variable
      // so the select value won't take affect if the current value of the input is not one of the possible options.
      // This can happen if a range slider, which has more free-range, set the value to something else, which also affected
      // the "select" knob.
      if( inputElm.value !== '' || inputElm.value === d.value ){
        this.onInput(e)
        this.onChange(e, true)
      }

      // for some reason, if the form was reset through the "reset" input,
      // the range slider's thumb is not moved because the value has not been refistered by the browser..
      // so need to set the value again..
      // SEEMS THE BUG HAS BEEN FIXED IN LATEST CHROME
      setTimeout(() => {
        if( !isType('checkbox') )
          inputElm.value = d[vKey]

        if( isType('color') )
          inputElm.title = inputElm.value
      })

      this.setKnobChangedFlag(this.getKnobElm(d.__name), d.value != d.defaultValue)
    })
  },

  /**
   *
   * Sets the "title" attribute of the knob's "reset" button
   * @param {String} name [Knob name]
   * @param {String} title [text title, which is actually the default value of that knob]
   */
  setResetKnobTitle( name, title ){
    try{
      title = "Reset to " + title
      this.getKnobElm(name).querySelector('.knobs__knob__reset').title = title
    }
    catch(err){}
  },

  resetKnobByName( name ){
    this.setKnobChangedFlag(this.getKnobElm(name), false)
    this.applyKnobs([this.getKnobDataByName(name)], true)
  },

  calculateGroupsHeights(){
    var groupElms = this.DOM.form.querySelectorAll('.fieldset__group__wrap')

    groupElms.forEach(groupElm => {
      groupElm.style.setProperty('--height', groupElm.clientHeight)
    })
  },

  setIframeProps( opts ){
    var action = (this.state.visible == false ? 'remove' : 'set') + 'Property',
        // iframeBodyElm = this.DOM.iframe.contentWindow.document.body,
        style = this.DOM.iframe.style,
        { heightOffset = 0 } = opts || {};


    if( action == 'setProperty' ){
      style.setProperty(`--knobsWidth`, '2000px')
      style.setProperty(`--knobsHeight`, '10000px')
    }

    var { clientWidth, clientHeight } = this.DOM.scope

    style[action](`--knobsWidth`, clientWidth + 'px')
    style[action](`--knobsHeight`, (+clientHeight + +heightOffset) + 'px')
  },

  // show/hide Knobs (as a whole)
  toggle( state ){
    if( !this.DOM.mainToggler )
      return

    if( state === undefined )
      state = !this.DOM.mainToggler.checked

    this.state.visible = state;
    this.DOM.mainToggler.checked = state;

    // briefly set a big width/height for the iframe so it could be meassured correctly
    this.setIframeProps()
  },

  toggleKnob( name, isToggled ){
    let knobData = this.getKnobDataByName(name),
        key = knobData.type == 'checkbox' ? 'checked' : 'value',
        // knob can be either a chekbox or an input element with an actual value
        keyVal = isToggled
          ? key == 'checked' ? knobData.checked : knobData.value
          : key == 'checked' ? knobData.defaultChecked : knobData.value

    knobData.isToggled = isToggled
    knobData[key] = keyVal

    this.updateDOM(knobData)

    typeof knobData.onChange == 'function' && knobData.onChange(null, knobData)

    this.setPersistedData() // { [knobData.label]:knobData.type == 'checkbox' ? [inputElm.checked, knobData.value] : knobData.value }
  },

  /**
   * This flag marks a knobs as "dirty" (one that was changed by the user), so the "reset" icon would be highlighted
   * @param {*} knobElm
   * @param {*} action
   */
  setKnobChangedFlag( knobElm, action ){
    knobElm && knobElm[(action == false ? 'remove' : 'set') + 'Attribute']('data-changed', true)
  },

  build(){
    if( this.settings.standalone ){
      this.DOM.scope = parseHTML(this.templates.knobs.call(this, {withToggler:false}))
    }
    else{
      const iframeDoc = this.createIframe()
      this.DOM.scope = iframeDoc.body.querySelector('.knobs')
      this.DOM.groups = iframeDoc.body.querySelector('.knobs__groups')
      this.DOM.mainToggler = iframeDoc.getElementById('knobsToggle')
    }

    this.DOM.form = this.DOM.scope.querySelector('form')

    this.render()
    setTimeout(this.bindEvents.bind(this))
  },

  /**
   * all the knobs are encapsulated inside an iframe for complete
   * sandboxing against outside styles/js potential interference.
   *
   * Creates & appends the iframe to the DOM
   * Also appends all the styles to the iframe
   */
  createIframe(){
    var iframeDoc,
        theme = this.settings.theme,
        cssText;

    this.DOM.iframe = document.createElement('iframe')
    this.DOM.iframe.setAttribute('class', 'knobsIframe')
    this.DOM.iframe.style.cssText = `
        border: none;
        position: fixed;
        z-index: 999999;
        ${(theme.position+" ").split(" ").join(":0;")}
        width: var(--knobsWidth, 56px);
        height: clamp(56px, var(--knobsHeight, 56px), 100%);
    `

    // first append the iframe to the DOM
    this.settings.appendTo.appendChild(this.DOM.iframe)

    // now access is obtained to the iframe's document
    iframeDoc = this.DOM.iframe.contentWindow.document

    // inject HTML template to the iframe
    iframeDoc.open()

    // dump all the HTML & styles into the iframe
    iframeDoc.write(this.templates.scope.call(this))

    cssText = `.knobs{ ${this.getCSSVariables(theme)} }`
    cssText += mainStyles + theme.styles

    iframeDoc.head.insertAdjacentHTML("beforeend", `<style>${cssText}</style>`)

    // done manipulating the iframe's content
    iframeDoc.close()

    return iframeDoc
  },

  render(){
    // maps a flat knobs array into multiple groups, after each label (if label exists)
    // this step is needed so each group (after item in the knobs array after a "label" item) could be
    // expanded/collapsed individually.
    var knobsGroups = this._knobs.reduce((acc, knobData) => {
        if( !isObject(knobData ) && acc[acc.length - 1].length ) acc.push([])
        acc[acc.length - 1].push(knobData)
        return acc
      }, [[]])

    //create an HTML-string from the template
    var fieldsetElms = knobsGroups.map(this.templates.fieldset.bind(this)).join("")

    // cleanup & inject knobs into the <fieldset> element
    this.DOM.groups.innerHTML = fieldsetElms

    this.calculateGroupsHeights()

    // calculate iframe size
    this.DOM.mainToggler && this.toggle(this.DOM.mainToggler.checked)

    this.applyKnobs()

    // color picker CSS
    const hostCSSExists = [...document.styleSheets].some(s => s.title == '@yaireo/knobs')

    if( !hostCSSExists )
      document.head.insertAdjacentHTML('beforeend', `<style title='@yaireo/knobs'>
      ${colorPickerStyles}
      ${hostStyles}
      </style>`)
  }
}

export default Knobs
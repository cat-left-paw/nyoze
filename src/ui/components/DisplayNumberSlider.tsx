type DisplayNumberSliderProps = {
  label: string
  value: number
  min: number
  max: number
  step: number
  valueText: string
  description?: string
  disabled?: boolean
  itemClassName?: string
  onChange: (value: number) => void
}

export function DisplayNumberSlider({
  label,
  value,
  min,
  max,
  step,
  valueText,
  description,
  disabled,
  itemClassName,
  onChange,
}: DisplayNumberSliderProps) {
  return (
    <div className={itemClassName ?? 'setting-item'}>
      <div className='setting-item-info'>
        <div className='setting-item-name'>{label}</div>
        {description && <div className='setting-item-desc'>{description}</div>}
      </div>
      <div className='setting-item-control'>
        <div className='slider-control'>
          <input
            type='range'
            min={min}
            max={max}
            step={step}
            value={value}
            disabled={disabled}
            aria-label={label}
            onChange={(e) => onChange(Number(e.target.value))}
          />
          <span className='slider-value'>{valueText}</span>
        </div>
      </div>
    </div>
  )
}

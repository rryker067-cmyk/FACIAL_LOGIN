type FieldProps = {
  label: string
  value: string
  onChange: (value: string) => void
  placeholder: string
  type?: string
  wide?: boolean
}

export default function Field({ label, value, onChange, placeholder, type = 'text', wide = false }: FieldProps) {
  const isRequired = label !== 'Edad' && label !== 'Número de teléfono'

  return (
    <label className={`field ${wide ? 'field--wide' : ''}`}>
      <span>{label}{isRequired && <i>*</i>}</span>
      <input
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        required={isRequired}
      />
    </label>
  )
}

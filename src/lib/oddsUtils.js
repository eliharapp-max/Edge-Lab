const cleanOddsInput = (input) => {
  if (input === null || input === undefined) return ''
  return String(input).trim()
}

const normalizeFormat = (format) => {
  if (!format) return 'auto'
  const lower = String(format).toLowerCase()
  if (lower === 'american') return 'american'
  if (lower === 'decimal') return 'decimal'
  if (lower === 'fractional') return 'fractional'
  return 'auto'
}

const parseFractional = (input) => {
  const cleaned = cleanOddsInput(input)
  if (!cleaned) return null
  const parts = cleaned.split('/')
  if (parts.length !== 2) return null
  const numerator = parseFloat(parts[0])
  const denominator = parseFloat(parts[1])
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator === 0) return null
  if (numerator <= 0 || denominator <= 0) return null
  return 1 + numerator / denominator
}

const parseDecimal = (input) => {
  const cleaned = cleanOddsInput(input).replace(/[^\d.]/g, '')
  if (!cleaned) return null
  const num = parseFloat(cleaned)
  if (!Number.isFinite(num) || num <= 1) return null
  return num
}

const parseAmerican = (input) => {
  const cleaned = cleanOddsInput(input).replace(/[^\d\-+]/g, '')
  if (!cleaned) return null
  const num = parseFloat(cleaned)
  if (!Number.isFinite(num) || num === 0) return null
  if (num > 0) return 1 + (num / 100)
  return 1 + (100 / Math.abs(num))
}

const detectFormat = (input) => {
  const cleaned = cleanOddsInput(input)
  if (!cleaned) return 'auto'
  if (cleaned.includes('/')) return 'fractional'
  const num = parseFloat(cleaned.replace(/[^\d.\-+]/g, ''))
  if (!Number.isFinite(num)) return 'auto'
  if (num > 0 && num < 2.1) return 'decimal'
  return 'american'
}

// parseOdds returns decimal odds (standardized representation)
export const parseOdds = (input, format) => {
  const normalized = normalizeFormat(format)
  if (normalized === 'fractional') return parseFractional(input)
  if (normalized === 'decimal') return parseDecimal(input)
  if (normalized === 'american') return parseAmerican(input)

  const detected = detectFormat(input)
  if (detected === 'fractional') return parseFractional(input)
  if (detected === 'decimal') return parseDecimal(input)
  return parseAmerican(input)
}

export const oddsToImpliedProb = (odds, format) => {
  const decimal = parseOdds(odds, format)
  if (!decimal || decimal <= 0) return null
  return 1 / decimal
}

export const impliedProbToPercent = (probability) => {
  if (!Number.isFinite(probability)) return null
  return probability * 100
}

export const clampNumber = (value, min, max) => Math.max(min, Math.min(max, value))

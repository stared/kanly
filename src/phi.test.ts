import { expect, it } from 'vitest'
import { Phi, logPhi } from './levels'

it('Φ matches known values, and its log stays finite far out', () => {
  expect(Phi(0)).toBeCloseTo(0.5, 6)
  expect(Phi(1.2816)).toBeCloseTo(0.9, 4)
  expect(Phi(-1.96)).toBeCloseTo(0.025, 4)
  expect(logPhi(-10)).toBeCloseTo(-53.231, 2)
  expect(logPhi(8)).toBeCloseTo(-6.2e-16, 10)
})

// port/bcrypt.ts : mêmes empreintes que bcryptjs (la référence, elle-même vérifiée contre Spring dans
// spring-security/oracle.test.ts), calculées sur le pool de threads de libuv sans bloquer le thread JS.
import bcryptjs from 'bcryptjs'
import { randomBytes } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { compare, hash, hashSync } from '../../src/port/bcrypt.js'
import { BCryptPasswordEncoder, DaoAuthenticationProvider, UsernamePasswordAuthenticationToken, type UserDetails, UserDetailsService, UsernameNotFoundException } from '../../src/port/spring-security.js'

/** Mots de passe aléatoires : ASCII, NUL, caractères sur 2, 3 et 4 octets, moitiés de paires de substitution isolées */
function randomPassword(): string {
  const pool = ['a', 'Z', '0', ' ', '\u0000', 'é', '€', '漫', '😀', '\ud800', '\udc00']
  const len = randomBytes(1)[0] as number
  let s = ''
  for (let i = 0; i < len % 90; i++) s += pool[(randomBytes(1)[0] as number) % pool.length]
  return s
}

describe('bcrypt', () => {
  it('hashes like bcryptjs', async () => {
    for (let i = 0; i < 60; i++) {
      const password = randomPassword()
      const salt = bcryptjs.genSaltSync(4).replace(/^\$2b\$/, ['$2a$', '$2b$', '$2y$', '$2$'][i % 4] as string)
      const expected = bcryptjs.hashSync(password, salt)
      expect(await hash(password, salt), JSON.stringify([password, salt])).toBe(expected)
      expect(hashSync(password, salt)).toBe(expected)
    }
  })

  it('verifies like bcryptjs', async () => {
    const h = bcryptjs.hashSync('pâssé€😀', bcryptjs.genSaltSync(10).replace('$2b$', '$2a$'))
    for (const [p, v] of [
      ['pâssé€😀', h],
      ['pâssé€😀x', h],
      ['', h],
      ['a'.repeat(100), `${h}x`],
      ['x', h.substring(0, 59)],
    ] as const)
      expect(await compare(p, v)).toBe(bcryptjs.compareSync(p, v))
  })

  it('throws the errors of bcryptjs', async () => {
    for (const salt of ['$1$10$abcdefghijklmnopqrstuv', '$2c$10$abcdefghijklmnopqrstuv', '$2a$03$abcdefghijklmnopqrstuv', '$2a$10$abc'])
      await expect(hash('x', salt)).rejects.toThrow(((): string => {
        try {
          bcryptjs.hashSync('x', salt)
          return 'no error'
        } catch (e) {
          return (e as Error).message
        }
      })())
  })

  it('does not block the event loop during a check', async () => {
    const encoder = new BCryptPasswordEncoder()
    // force 12 : ~4 fois le coût par défaut
    const encoded = bcryptjs.hashSync('secret', bcryptjs.genSaltSync(12).replace('$2b$', '$2a$'))
    let ticks = 0
    let maxGap = 0
    let last = performance.now()
    const timer = setInterval(() => {
      const now = performance.now()
      maxGap = Math.max(maxGap, now - last)
      last = now
      ticks++
    }, 5)
    const start = performance.now()
    const ok = await encoder.matches('secret', encoded)
    const elapsed = performance.now() - start
    clearInterval(timer)
    expect(ok).toBe(true)
    // le thread JS a continué de tourner pendant tout le calcul
    expect(ticks).toBeGreaterThan(elapsed / 5 / 4)
    expect(maxGap).toBeLessThan(elapsed / 2)
  })

  it('DaoAuthenticationProvider checks the password without blocking the event loop', async () => {
    const encoder = new BCryptPasswordEncoder(12)
    const encoded = encoder.encode('secret')
    const user = { getUsername: () => 'user', getPassword: () => encoded, getAuthorities: () => [], isAccountNonExpired: () => true, isAccountNonLocked: () => true, isCredentialsNonExpired: () => true, isEnabled: () => true } as unknown as UserDetails
    const uds = new (class extends UserDetailsService {
      loadUserByUsername(username: string): UserDetails {
        if (username !== 'user') throw new UsernameNotFoundException('not found')
        return user
      }
    })()
    const provider = new DaoAuthenticationProvider(uds, encoder)
    let ticks = 0
    const timer = setInterval(() => ticks++, 5)
    const auth = await provider.authenticate(UsernamePasswordAuthenticationToken.unauthenticated('user', 'secret'))
    const ticksAfterSuccess = ticks
    await expect(provider.authenticate(UsernamePasswordAuthenticationToken.unauthenticated('user', 'wrong'))).rejects.toThrow('Bad credentials')
    await expect(provider.authenticate(UsernamePasswordAuthenticationToken.unauthenticated('nobody', 'secret'))).rejects.toThrow('Bad credentials')
    clearInterval(timer)
    expect(auth?.isAuthenticated).toBe(true)
    expect(ticksAfterSuccess).toBeGreaterThan(5)
  })
})

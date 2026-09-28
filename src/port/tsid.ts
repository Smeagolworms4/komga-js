// Support de portage : équivalent de com.github.f4b6a3.tsid.TsidCreator.getTsid256().
// TSID 64 bits = 42 bits de temps (ms depuis 2020-01-01T00:00:00Z) + 8 bits de nœud + 14 bits de compteur,
// encodé en Crockford base32 sur 13 caractères majuscules, comme Tsid.toString().
import { randomInt } from 'node:crypto'

const TSID_EPOCH = Date.UTC(2020, 0, 1)
const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'
const NODE_BITS = 8n
const COUNTER_BITS = 14n
const COUNTER_MASK = (1 << Number(COUNTER_BITS)) - 1

const node = BigInt(randomInt(1 << Number(NODE_BITS)))
let lastTime = -1
let counter = 0

export function toCrockford(n: bigint): string {
  let s = ''
  for (let i = 0; i < 13; i++) {
    s = ALPHABET[Number(n & 31n)] + s
    n >>= 5n
  }
  return s
}

export function fromCrockford(s: string): bigint {
  let n = 0n
  for (const c of s.toUpperCase()) {
    const i = ALPHABET.indexOf(c)
    if (i < 0) throw new Error(`Invalid TSID: ${s}`)
    n = (n << 5n) | BigInt(i)
  }
  return n
}

function nextNumber(): bigint {
  let time = Date.now() - TSID_EPOCH
  if (time <= lastTime) {
    // même milliseconde (ou horloge qui recule) : on incrémente le compteur, comme TsidFactory
    counter++
    if (counter > COUNTER_MASK) {
      counter = 0
      lastTime++
    }
    time = lastTime
  } else {
    counter = randomInt(COUNTER_MASK + 1)
    lastTime = time
  }
  return (BigInt(time) << (NODE_BITS + COUNTER_BITS)) | (node << COUNTER_BITS) | BigInt(counter)
}

export const TsidCreator = {
  getTsid256() {
    const n = nextNumber()
    return {
      toLong: () => n,
      toString: () => toCrockford(n),
    }
  },
}

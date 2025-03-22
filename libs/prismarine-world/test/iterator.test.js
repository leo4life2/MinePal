/* eslint-env mocha */

const { SpiralIterator2d, ManhattanIterator } = require('../src/iterators')
const { Vec3 } = require('vec3')
const expect = require('expect').default

describe('Spiral iterator', () => {
  it('simple function test', async () => {
    const startPos = new Vec3(0, 0, 0)
    const iter = new SpiralIterator2d(startPos, 2)
    const first = iter.next()
    const second = iter.next()

    expect(first.x === startPos.x && first.y === startPos.y && first.z === startPos.z).toBeTruthy()
    expect(second.x === startPos.x && second.y === startPos.y && second.z === startPos.z).toBeFalsy()
  })
})

describe('ManhattanIterator iterator', () => {
  it('First position is same as start', () => {
    const start = new Vec3(1, 2, 3)
    const iter = new ManhattanIterator(start.x, start.z, 5)
    const first = iter.next()
    expect(first.x === start.x && first.z === start.z).toBeTruthy()
  })

  it('Sample positions match', () => {
    const start = new Vec3(1, 2, 3)
    const iter = new ManhattanIterator(start.x, start.z, 5)
    const sample = [new Vec3(1, 0, 3), new Vec3(2, 0, 3), new Vec3(1, 0, 4), new Vec3(0, 0, 3)]
    let counter = 0
    let next = iter.next()
    while (next && counter < sample.length) {
      expect(next.x === sample[counter].x && next.z === sample[counter].z).toBeTruthy()
      next = iter.next()
      counter++
    }
  })
})

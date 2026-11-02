/** Cache only pure geometry reads before a navigation's first DOM write. */
export function createReadBatch<K, V>(read: (key: K) => V) {
  let values: Map<K, V> | null = null
  return {
    begin() { values = new Map() },
    end() { values = null },
    read(key: K): V {
      if (!values) return read(key)
      if (!values.has(key)) values.set(key, read(key))
      return values.get(key)!
    },
  }
}

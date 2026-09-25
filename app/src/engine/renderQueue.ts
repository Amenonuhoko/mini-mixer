/** Share a small render budget across all banks, leaving time for live playback and input. */
let active = 0
const waiting: Array<() => void> = []

export async function queuedRender<T>(render: () => Promise<T> | T): Promise<T> {
  await new Promise<void>((resolve) => {
    const start = () => {
      active++
      setTimeout(resolve, 0)
    }
    if (active < 2) start()
    else waiting.push(start)
  })
  try {
    return await render()
  } finally {
    active--
    waiting.shift()?.()
  }
}

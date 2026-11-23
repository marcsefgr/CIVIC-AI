export type ImageModelResult = {
  category: string | null
  score: number
  secondScore: number
  uncertain: boolean
}

type ImageModelArtifact = {
  metadata: {
    image_size: number
    confidence_threshold: number
    confidence_margin_threshold: number
    classes: string[]
  }
  coefficients: number[][]
  intercepts: number[]
}

let modelPromise: Promise<ImageModelArtifact> | null = null

function getModel() {
  if (!modelPromise) {
    modelPromise = fetch(`${import.meta.env.BASE_URL}models/civicai-image-model.json`, {
      credentials: "same-origin",
    }).then(async (response) => {
      if (!response.ok) throw new Error("Image model could not be loaded.")
      return (await response.json()) as ImageModelArtifact
    })
  }
  return modelPromise
}

function extractHog(pixels: Uint8ClampedArray, size: number) {
  const cellSize = 8
  const bins = 9
  const cells = size / cellSize
  const grayscale = new Float32Array(size * size)
  for (let i = 0; i < grayscale.length; i++) {
    const p = i * 4
    grayscale[i] =
      (pixels[p] * 0.2125 + pixels[p + 1] * 0.7154 + pixels[p + 2] * 0.0721) /
      255
  }

  const histograms = new Float32Array(cells * cells * bins)
  const at = (x: number, y: number) => grayscale[y * size + x]
  for (let y = 0; y < size; y++) {
    const up = y === 0 ? y : y - 1
    const down = y === size - 1 ? y : y + 1
    for (let x = 0; x < size; x++) {
      const left = x === 0 ? x : x - 1
      const right = x === size - 1 ? x : x + 1
      const gx = at(right, y) - at(left, y)
      const gy = at(x, down) - at(x, up)
      const magnitude = Math.hypot(gx, gy)
      if (magnitude === 0) continue
      let angle = Math.atan2(gy, gx)
      if (angle < 0) angle += Math.PI
      if (angle >= Math.PI) angle -= Math.PI
      const bin = Math.min(bins - 1, Math.floor((angle * bins) / Math.PI))
      const cellX = Math.floor(x / cellSize)
      const cellY = Math.floor(y / cellSize)
      histograms[(cellY * cells + cellX) * bins + bin] += magnitude
    }
  }

  const cellsPerBlock = 2
  const blocks = cells - cellsPerBlock + 1
  const features: number[] = []
  for (let blockY = 0; blockY < blocks; blockY++) {
    for (let blockX = 0; blockX < blocks; blockX++) {
      const block: number[] = []
      for (let cellY = 0; cellY < cellsPerBlock; cellY++) {
        for (let cellX = 0; cellX < cellsPerBlock; cellX++) {
          const start =
            ((blockY + cellY) * cells + blockX + cellX) * bins
          for (let bin = 0; bin < bins; bin++)
            block.push(histograms[start + bin])
        }
      }
      const normalize = () => {
        const norm = Math.sqrt(block.reduce((sum, value) => sum + value * value, 0) + 1e-5)
        for (let i = 0; i < block.length; i++) block[i] /= norm
      }
      normalize()
      for (let i = 0; i < block.length; i++) block[i] = Math.min(block[i], 0.2)
      normalize()
      features.push(...block)
    }
  }
  return features
}

async function imageFeatures(photoUrl: string, size: number) {
  const response = await fetch(photoUrl, { credentials: "same-origin" })
  if (!response.ok) throw new Error("Report photo could not be loaded for image analysis.")
  const bitmap = await createImageBitmap(await response.blob())
  try {
    const canvas = document.createElement("canvas")
    canvas.width = size
    canvas.height = size
    const context = canvas.getContext("2d", { willReadFrequently: true })
    if (!context) throw new Error("Image analysis is not supported in this browser.")
    context.imageSmoothingEnabled = true
    context.imageSmoothingQuality = "high"
    const scale = Math.max(size / bitmap.width, size / bitmap.height)
    const cropWidth = size / scale
    const cropHeight = size / scale
    const cropX = (bitmap.width - cropWidth) / 2
    const cropY = (bitmap.height - cropHeight) / 2
    context.drawImage(bitmap, cropX, cropY, cropWidth, cropHeight, 0, 0, size, size)
    return extractHog(context.getImageData(0, 0, size, size).data, size)
  } finally {
    bitmap.close()
  }
}

export async function classifyReportPhoto(photoUrl: string): Promise<ImageModelResult> {
  const model = await getModel()
  const features = await imageFeatures(photoUrl, model.metadata.image_size)
  const logits = model.coefficients.map((row, index) => {
    let value = model.intercepts[index]
    for (let i = 0; i < row.length; i++) value += row[i] * features[i]
    return value
  })
  const maxLogit = Math.max(...logits)
  const exponentials = logits.map((value) => Math.exp(value - maxLogit))
  const total = exponentials.reduce((sum, value) => sum + value, 0)
  const scores = exponentials.map((value) => value / total)
  const ranked = scores
    .map((score, index) => ({ score, category: model.metadata.classes[index] }))
    .sort((a, b) => b.score - a.score)
  const best = ranked[0]
  const second = ranked[1]?.score ?? 0
  const uncertain =
    best.score < model.metadata.confidence_threshold ||
    best.score - second < model.metadata.confidence_margin_threshold
  return {
    category: uncertain ? null : best.category,
    score: best.score,
    secondScore: second,
    uncertain,
  }
}

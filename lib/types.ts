export type PantryItem = {
  id: string
  household_id: string
  name: string
  quantity: number | null
  unit: string | null
  updated_at: string
}

export type RecipeCard = {
  id: number
  title: string
  image: string
  missedIngredients?: { name: string; amount?: number; unit?: string }[]
  usedIngredients?: { name: string }[]
}
